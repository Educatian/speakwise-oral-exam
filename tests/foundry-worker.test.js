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
  it('fails without forwarding when configuration or audio is invalid', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    expect((await post('speech',{input:'Example'},{OPENROUTER_API_KEY:'legacy'})).status).toBe(503);
    expect((await post('transcriptions',{input_audio:{data:'!invalid!',format:'wav'}})).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
