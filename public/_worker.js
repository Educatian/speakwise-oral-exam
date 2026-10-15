const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json'}});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({error:'POST required'},405);
    const key = env.OPENROUTER_API_KEY || env.VITE_OPENROUTER_API_KEY;
    if (!key) return json({error:'Voice service is not configured'},503);
    let body;
    try { body = await request.json(); } catch { return json({error:'Invalid JSON'},400); }
    let endpoint;
    if (url.pathname === '/api/llm') endpoint = 'chat/completions';
    else if (url.pathname === '/api/transcriptions') endpoint = 'audio/transcriptions';
    else if (url.pathname === '/api/speech') {
      endpoint = 'audio/speech';
      if (typeof body.input !== 'string' || !body.input.trim() || body.input.length > 6000) return json({error:'Invalid speech text'},400);
      body = {model:'google/gemini-3.1-flash-tts-preview',input:body.input,voice:'Kore',response_format:'pcm'};
    } else return json({error:'Unknown endpoint'},404);
    try {
      const upstream = await fetch(`https://openrouter.ai/api/v1/${endpoint}`, {
        method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','HTTP-Referer':url.origin,'X-Title':'SpeakWise'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(45000)
      });
      return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':upstream.headers.get('content-type') || 'application/json','Cache-Control':'no-store'}});
    } catch { return json({error:'Voice service request timed out or failed. Please retry.'},502); }
  }
};
