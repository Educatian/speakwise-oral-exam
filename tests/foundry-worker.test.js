import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../public/_worker.js';

const env = {
  AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/openai/v1/',
  AZURE_OPENAI_API_KEY: 'mock-resource-key',
  AZURE_OPENAI_CHAT_DEPLOYMENT: 'education-dialogue',
  AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT: 'student-transcription',
  AZURE_OPENAI_SPEECH_DEPLOYMENT: 'cue-speech',
};
const post = (path, body, bindings = env) => worker.fetch(new Request('https://example.test/api/' + path, {
  method: 'POST', body: JSON.stringify(body)
}), bindings);
afterEach(() => vi.unstubAllGlobals());

describe('Microsoft Foundry proxy', () => {
  it('routes dialogue and JSON assessments to the configured deployment', async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({ choices: [] }));
    vi.stubGlobal('fetch', upstream);
    const result = await post('llm', { model:'old-provider/model', max_tokens:160, messages:[{role:'user',content:'Example'}],
      response_format:{type:'json_object'}, temperature:0.45 });
    expect(result.status).toBe(200);
    const [url, options] = upstream.mock.calls[0];
    expect(url.href).toBe('https://example.openai.azure.com/openai/v1/chat/completions');
    expect(options.headers['api-key']).toBe(env.AZURE_OPENAI_API_KEY);
    expect(JSON.parse(options.body)).toMatchObject({model:'education-dialogue',max_completion_tokens:160,response_format:{type:'json_object'}});
  });
  it('uploads decoded audio with a multipart file and deployment name', async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({text:'Example'}));
    vi.stubGlobal('fetch', upstream);
    expect(await (await post('transcriptions',{input_audio:{data:'AAEC', format:'wav'}})).json()).toEqual({text:'Example'});
    const [url, options] = upstream.mock.calls[0];
    expect(url.href).toBe('https://example.openai.azure.com/openai/v1/audio/transcriptions?api-version=preview');
    expect(options.body.get('model')).toBe('student-transcription');
    expect(options.body.get('file').name).toBe('answer.wav');
    expect([...new Uint8Array(await options.body.get('file').arrayBuffer())]).toEqual([0,1,2]);
    expect(options.headers['Content-Type']).toBeUndefined();
  });
  it('returns PCM bytes for the existing audio player', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2])));
    vi.stubGlobal('fetch', upstream);
    const res = await post('speech',{input:'Example'});
    const [url, options] = upstream.mock.calls[0];
    expect(url.href).toBe('https://example.openai.azure.com/openai/v1/audio/speech?api-version=preview');
    expect(JSON.parse(options.body)).toMatchObject({ model:'cue-speech', voice:'alloy', response_format:'pcm' });
    expect(res.headers.get('content-type')).toBe('audio/pcm');
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1,2]);
  });
  it('uses the shared resource for Speech synthesis and escapes spoken text', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 0])));
    vi.stubGlobal('fetch', upstream);
    const res = await post('speech', {input:'A < B & C'}, {...env, AZURE_SPEECH_ENDPOINT:'https://example.cognitiveservices.azure.com'});
    const [url, options] = upstream.mock.calls[0];
    expect(url.pathname).toBe('/tts/cognitiveservices/v1');
    expect(options.headers['User-Agent']).toBe('SpeakWise');
    expect(options.headers['X-Microsoft-OutputFormat']).toBe('raw-24khz-16bit-mono-pcm');
    expect(options.body).toContain('A &lt; B &amp; C');
    expect(res.headers.get('content-type')).toBe('audio/pcm');
  });
  it.each([
    ['What would you try first?', 'friendly', false],
    ['You mentioned the first step. Why start there?', 'chat', true],
    ['Take your time. Where would you begin?', 'empathetic', true]
  ])('voices the interviewer prompt with the intended delivery: %s', async (input, style, withPause) => {
    const upstream = vi.fn().mockResolvedValue(new Response(new Uint8Array([0, 0])));
    vi.stubGlobal('fetch', upstream);
    await post('speech', {input}, {...env, AZURE_SPEECH_ENDPOINT:'https://example.cognitiveservices.azure.com'});
    const ssml = upstream.mock.calls[0][1].body;
    expect(ssml).toContain('en-US-AriaNeural');
    expect(ssml).toContain(`style="${style}"`);
    expect(ssml.includes('<break')).toBe(withPause);
  });
  it('maps fast transcription phrases to the client text response', async () => {
    const upstream = vi.fn().mockResolvedValue(Response.json({combinedPhrases:[{text:'First.'},{text:'Second.'}]}));
    vi.stubGlobal('fetch', upstream);
    const res = await post('transcriptions', {input_audio:{format:'wav',data:'AAEC'}},
      {...env, AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT:undefined, AZURE_SPEECH_ENDPOINT:'https://example.cognitiveservices.azure.com'});
    const [url, options] = upstream.mock.calls[0];
    expect(url.pathname).toBe('/speechtotext/transcriptions:transcribe');
    expect(url.searchParams.get('api-version')).toBe('2024-11-15');
    expect(options.body.get('audio').name).toBe('answer.wav');
    expect(await res.json()).toEqual({text:'First. Second.'});
  });
  it('uses the secondary deployment once when the primary has no capacity', async () => {
    const upstream = vi.fn().mockResolvedValueOnce(new Response('busy', {status:429})).mockResolvedValueOnce(Response.json({choices:[]}));
    vi.stubGlobal('fetch', upstream);
    const res = await post('llm', {messages:[{role:'user',content:'Test'}],temperature:.4,max_tokens:160},
      {...env, AZURE_OPENAI_FALLBACK_CHAT_DEPLOYMENT:'secondary', AZURE_OPENAI_FALLBACK_REASONING_EFFORT:'low'});
    expect(res.status).toBe(200);
    const [url, options] = upstream.mock.calls[1];
    expect(url.hostname).toBe('example.openai.azure.com');
    expect(options.redirect).toBe('manual');
    const retry = JSON.parse(options.body);
    expect(retry).toMatchObject({model:'secondary',reasoning_effort:'low',max_completion_tokens:512});
    expect(retry.temperature).toBeUndefined();
  });
  it('fails without forwarding when configuration or audio is invalid', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    expect((await post('speech',{input:'Example'},{OPENROUTER_API_KEY:'legacy'})).status).toBe(503);
    expect((await post('transcriptions',{input_audio:{data:'!invalid!',format:'wav'}})).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
