const routes = new Map([
  ['/api/llm', ['chat/completions', 'AZURE_OPENAI_CHAT_DEPLOYMENT']],
  ['/api/transcriptions', ['audio/transcriptions', 'AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT']],
  ['/api/speech', ['audio/speech', 'AZURE_OPENAI_SPEECH_DEPLOYMENT']],
]);

function errorResponse(message, status) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function transcriptionForm(clip, model, useSpeechTools) {
  if (!clip || !['wav', 'mp3'].includes(clip.format) || typeof clip.data !== 'string'
      || !clip.data.length || clip.data.length > Math.ceil(25_000_000 / 3) * 4) return null;
  let decoded;
  try { decoded = atob(clip.data); } catch { return null; }
  if (!decoded.length || decoded.length > 25_000_000) return null;
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  const form = new FormData();
  if (!useSpeechTools) {
    form.set('model', model);
    form.set('response_format', 'json');
  }
  form.set(useSpeechTools ? 'audio' : 'file', new Blob([bytes], { type: clip.format === 'wav' ? 'audio/wav' : 'audio/mpeg' }), 'answer.' + clip.format);
  return form;
}

function cueSpeech(input) {
  function phrase(text, style, degree, rate) {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<mstts:express-as style="${style}" styledegree="${degree}"><prosody rate="${rate}">${escaped}</prosody></mstts:express-as>`;
  }
  const opening = /^(take your time|there['\u2019]s no (?:rush|hurry)|no rush)\b/i;
  const callback = /^(you (?:mentioned|said|described|noted)|let['\u2019]s (?:look|explore))\b/i;
  const speak = text => {
    if (opening.test(text)) return phrase(text, 'empathetic', 1.15, '-5%');
    if (callback.test(text)) return phrase(text, 'chat', 1.2, '-2%');
    return phrase(text, 'friendly', 1.3, '-2%');
  };
  const text = input.trim();
  const lead = /^(.*?[.!])\s+([\s\S]+)$/.exec(text);
  const body = lead && (opening.test(lead[1]) || callback.test(lead[1]))
    ? speak(lead[1]) + '<break time="180ms"/>' + speak(lead[2])
    : speak(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="en-US-AriaNeural">${body}</voice></speak>`;
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
    const useSpeechTools = operation.startsWith('audio/') && Boolean(env.AZURE_SPEECH_ENDPOINT);
    if (!env.AZURE_OPENAI_ENDPOINT || !env.AZURE_OPENAI_API_KEY || (!model && !useSpeechTools)) {
      return errorResponse('Microsoft Foundry is not configured for this operation.', 503);
    }
    let root;
    try { root = new URL(env.AZURE_OPENAI_ENDPOINT); } catch { return errorResponse('Invalid Foundry endpoint.', 503); }
    if (root.protocol !== 'https:' || !['/', '/openai/v1', '/openai/v1/'].includes(root.pathname)) {
      return errorResponse('Configure the Foundry resource endpoint or its OpenAI v1 base URL.', 503);
    }
    let upstreamUrl = new URL('/openai/v1/' + operation, root.origin);
    let headers = { 'api-key': env.AZURE_OPENAI_API_KEY };
    if (useSpeechTools) {
      let speech;
      try { speech = new URL(env.AZURE_SPEECH_ENDPOINT); } catch { return errorResponse('Invalid Speech endpoint.', 503); }
      if (speech.protocol !== 'https:' || !speech.hostname.endsWith('.cognitiveservices.azure.com')) return errorResponse('Invalid Speech endpoint.', 503);
      const path = operation === 'audio/speech' ? '/tts/cognitiveservices/v1' : '/speechtotext/transcriptions:transcribe?api-version=2024-11-15';
      upstreamUrl = new URL(path, speech.origin);
      headers = { 'Ocp-Apim-Subscription-Key': env.AZURE_OPENAI_API_KEY };
    }
    let input;
    try { input = await request.json(); } catch { return errorResponse('Invalid JSON', 400); }
    if (!input || typeof input !== 'object') return errorResponse('Invalid request', 400);
    let body;
    if (operation === 'audio/transcriptions') {
      if (!useSpeechTools) upstreamUrl.searchParams.set('api-version', 'preview');
      body = transcriptionForm(input.input_audio, model, useSpeechTools);
      if (!body) return errorResponse('Invalid WAV or MP3 audio clip.', 400);
    } else {
      headers['Content-Type'] = 'application/json';
      if (operation === 'audio/speech') {
        if (typeof input.input !== 'string' || !input.input.trim() || input.input.length > 4096) return errorResponse('Invalid speech text', 400);
        if (useSpeechTools) {
          headers['Content-Type'] = 'application/ssml+xml';
          headers['User-Agent'] = 'SpeakWise';
          headers['X-Microsoft-OutputFormat'] = 'raw-24khz-16bit-mono-pcm';
          body = cueSpeech(input.input);
        } else {
          upstreamUrl.searchParams.set('api-version', 'preview');
          body = JSON.stringify({ model, input: input.input, voice: env.AZURE_OPENAI_VOICE || 'alloy', response_format: 'pcm' });
        }
      } else {
        if (!Array.isArray(input.messages) || !input.messages.length) return errorResponse('Messages required', 400);
        const { messages, response_format, modalities, max_tokens } = input;
        const chat = { model, messages, response_format, modalities, max_completion_tokens: max_tokens ?? 4096 };
        if (env.AZURE_OPENAI_REASONING_EFFORT) chat.reasoning_effort = env.AZURE_OPENAI_REASONING_EFFORT;
        else if (input.temperature != null) chat.temperature = input.temperature;
        body = JSON.stringify(chat);
      }
    }
    try {
      const options = { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(45000) };
      let upstream = await fetch(upstreamUrl, options);
      if (operation === 'chat/completions' && [429, 503].includes(upstream.status) && env.AZURE_OPENAI_FALLBACK_CHAT_DEPLOYMENT) {
        await upstream.body?.cancel();
        const retry = JSON.parse(body);
        retry.model = env.AZURE_OPENAI_FALLBACK_CHAT_DEPLOYMENT;
        retry.reasoning_effort = env.AZURE_OPENAI_FALLBACK_REASONING_EFFORT;
        if (retry.reasoning_effort) {
          delete retry.temperature;
          retry.max_completion_tokens = Math.max(512, retry.max_completion_tokens);
        }
        upstream = await fetch(upstreamUrl, { ...options, body: JSON.stringify(retry) });
      }
      if (upstream.status >= 300 && upstream.status < 400) return errorResponse('Unexpected Foundry redirect.', 502);
      if (useSpeechTools && operation === 'audio/transcriptions' && upstream.ok) {
        const data = await upstream.json();
        if (!Array.isArray(data.combinedPhrases)) return errorResponse('Invalid Speech transcription response.', 502);
        return Response.json({text: data.combinedPhrases.map(phrase => phrase.text).filter(Boolean).join(' ')}, {headers:{'Cache-Control':'no-store'}});
      }
      const type = operation === 'audio/speech' && upstream.ok ? 'audio/pcm' : upstream.headers.get('content-type') || 'application/json';
      return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
    } catch { return errorResponse('Foundry request failed or timed out. Please retry.', 502); }
  }
};
