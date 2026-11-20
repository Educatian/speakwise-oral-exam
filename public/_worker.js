const routes = new Map([
  ['/api/llm', ['chat/completions', 'AZURE_OPENAI_CHAT_DEPLOYMENT']],
  ['/api/transcriptions', ['audio/transcriptions', 'AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT']],
  ['/api/speech', ['audio/speech', 'AZURE_OPENAI_SPEECH_DEPLOYMENT']],
]);

function errorResponse(message, status) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function transcriptionForm(clip, model) {
  if (!clip || !['wav', 'mp3'].includes(clip.format) || typeof clip.data !== 'string'
      || !clip.data.length || clip.data.length > Math.ceil(25_000_000 / 3) * 4) return null;
  let decoded;
  try { decoded = atob(clip.data); } catch { return null; }
  if (!decoded.length || decoded.length > 25_000_000) return null;
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  const form = new FormData();
  form.set('model', model);
  form.set('file', new Blob([bytes], { type: clip.format === 'wav' ? 'audio/wav' : 'audio/mpeg' }), 'answer.' + clip.format);
  form.set('response_format', 'json');
  return form;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const route = routes.get(pathname);
    if (!route) return errorResponse('Unknown endpoint', 404);
    if (request.method !== 'POST') return errorResponse('POST required', 405);

    const [operation, setting] = route;
    const model = env[setting];
    if (!env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_API_KEY || !model) {
      return errorResponse('Microsoft Foundry is not configured for this operation.', 503);
    }
    let root;
    try { root = new URL(env.AZURE_OPENAI_ENDPOINT); } catch { return errorResponse('Invalid Foundry endpoint.', 503); }
    if (root.protocol !== 'https:' || !['/', '/openai/v1', '/openai/v1/'].includes(root.pathname)) {
      return errorResponse('Configure the Foundry resource endpoint or its OpenAI v1 base URL.', 503);
    }
    const upstreamUrl = new URL('/openai/v1/' + operation, root.origin);
    const headers = { 'api-key': env.AZURE_OPENAI_API_KEY };
    let input;
    try { input = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
    if (!input || typeof input !== 'object') return errorResponse('Invalid request', 400);
    let body;
    if (operation === 'audio/transcriptions') {
      upstreamUrl.searchParams.set('api-version', 'preview');
      body = transcriptionForm(input.input_audio, model);
      if (!body) return errorResponse('Invalid WAV or MP3 audio clip.', 400);
    } else {
      headers['Content-Type'] = 'application/json';
      if (operation === 'audio/speech') {
        if (typeof input.input !== 'string' || !input.input.trim() || input.input.length > 4096) return errorResponse('Invalid speech text', 400);
        upstreamUrl.searchParams.set('api-version', 'preview');
        body = JSON.stringify({ model, input: input.input, voice: env.AZURE_OPENAI_VOICE || 'alloy', response_format: 'pcm' });
      } else {
        if (!Array.isArray(input.messages) || !input.messages.length) return errorResponse('Messages required', 400);
        const { messages, response_format, modalities, max_tokens } = input;
        const chat = { model, messages, response_format, modalities, max_completion_tokens: max_tokens };
        if (env.AZURE_OPENAI_REASONING_EFFORT) chat.reasoning_effort = env.AZURE_OPENAI_REASONING_EFFORT;
        else if (input.temperature != null) chat.temperature = input.temperature;
        body = JSON.stringify(chat);
      }
    }
    try {
      const upstream = await fetch(upstreamUrl, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(45000) });
      const type = operation === 'audio/speech' && upstream.ok ? 'audio/pcm' : upstream.headers.get('content-type') || 'application/json';
      return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
    } catch { return errorResponse('Foundry request failed or timed out. Please retry.', 502); }
  }
};
