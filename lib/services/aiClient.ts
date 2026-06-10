/**
 * OpenAI-compatible chat completion client routed through OpenRouter.
 *
 * Reads `VITE_OPENROUTER_API_KEY` at build time via Vite. Any model listed
 * at https://openrouter.ai/models can be used; default is
 * `google/gemini-3-flash-preview` to match the previous native-Gemini
 * behaviour of SpeakWise's scoring paths.
 *
 * Scope: text chat only. Gemini Live (real-time voice WebSocket) and
 * Gemini multimodal audio transcription remain on native `@google/genai`
 * because OpenRouter does not expose those interfaces.
 */

export const DEFAULT_MODEL = 'google/gemini-3-flash-preview';

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | ChatContentPart[];
}

export type ChatContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
    | { type: 'input_audio'; input_audio: { data: string; format: 'wav' | 'mp3' } };

export interface ChatCompleteOptions {
    messages: ChatMessage[];
    model?: string;
    /** Set to 'json_object' to force the model to return valid JSON. */
    responseFormat?: 'json_object' | null;
    temperature?: number;
    maxTokens?: number;
    /** Tell the provider which modalities the RESPONSE should include.
     *  Default omitted — most chat responses are text. Pass ['text'] when
     *  sending audio input so the provider doesn't try to also return audio. */
    modalities?: Array<'text' | 'audio'>;
    /** Abort the request after this many ms. Omitted = rely on the browser
     *  default (which can hang a student in "transcribing" for a minute+). */
    timeoutMs?: number;
}

// All LLM traffic goes through the same-origin proxy (Cloudflare Pages worker
// in prod, vite dev middleware locally). The OpenRouter key is injected
// server-side and never ships in the client bundle.
const ENDPOINT = '/api/llm';

/** Model used for audio transcription. gpt-4o-audio-preview accepts wav/mp3
 *  input and returns text. Tested to work through OpenRouter (unlike the
 *  Gemini-family audio inputs, which OpenRouter silently strips). */
export const AUDIO_TRANSCRIPTION_MODEL = 'openai/gpt-4o-audio-preview';

export async function chatComplete(options: ChatCompleteOptions): Promise<string> {
    const payload: Record<string, unknown> = {
        model: options.model || DEFAULT_MODEL,
        messages: options.messages
    };
    if (options.responseFormat === 'json_object') {
        payload.response_format = { type: 'json_object' };
    }
    if (options.temperature != null) payload.temperature = options.temperature;
    if (options.maxTokens != null) payload.max_tokens = options.maxTokens;
    if (options.modalities) payload.modalities = options.modalities;

    // Bound the WHOLE request — including the response-body read — so a slow or
    // stalled upstream can't hang the caller indefinitely (critical for the
    // live-interview transcription path). fetch() resolves on headers, so the
    // timer must stay armed through res.json()/res.text() too, or a "headers
    // fast, body dripping" upstream slips past the cap.
    const controller = new AbortController();
    const timer = options.timeoutMs
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : null;

    let data: any;
    try {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
        }

        data = await res.json();
    } catch (err) {
        if (controller.signal.aborted) {
            throw new Error(`Request timed out after ${options.timeoutMs}ms`);
        }
        throw err;
    } finally {
        if (timer) clearTimeout(timer);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error('OpenRouter returned no text content');
    }
    return content;
}

/**
 * Convenience wrapper: one-shot user message, JSON response parsed and
 * validated against a simple predicate.
 */
export async function chatCompleteJson<T>(
    userPrompt: string,
    options: Omit<ChatCompleteOptions, 'messages' | 'responseFormat'> = {}
): Promise<T> {
    const raw = await chatComplete({
        ...options,
        responseFormat: 'json_object',
        messages: [{ role: 'user', content: userPrompt }]
    });
    try {
        return JSON.parse(raw) as T;
    } catch {
        // Some models wrap JSON in ```json fences despite json_object mode.
        const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
        return JSON.parse(stripped) as T;
    }
}

/**
 * Transcribe a WAV or MP3 audio clip to text.
 *
 * Routes through OpenRouter to OpenAI's gpt-4o-audio-preview. The OpenRouter
 * gateway passes the audio content block through to OpenAI untouched, unlike
 * Gemini-family models on OpenRouter which drop audio silently.
 *
 * @param audioBase64 base64-encoded audio bytes (no data-url prefix)
 * @param format      'wav' (default) or 'mp3'
 * @param instruction optional system-like instruction. Default asks for a
 *                    verbatim transcription and an empty string on silence.
 */
export async function transcribeAudio(
    audioBase64: string,
    format: 'wav' | 'mp3' = 'wav',
    instruction = 'You are a transcription engine for an academic oral examination. Transcribe the student\'s spoken answer verbatim, in the language actually spoken. Preserve technical and domain-specific terminology, proper names, acronyms, and numbers exactly as said. Do NOT summarize, paraphrase, translate, correct grammar, or add any commentary, labels, or punctuation that was not spoken. Return ONLY the raw transcription text. If the audio contains no intelligible speech, return an empty string.'
): Promise<string> {
    const text = await chatComplete({
        model: AUDIO_TRANSCRIPTION_MODEL,
        modalities: ['text'],
        // A spoken turn should resolve quickly; cap it so a stalled upstream
        // surfaces as a retryable error instead of an indefinite hang.
        timeoutMs: 20000,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: instruction },
                    { type: 'input_audio', input_audio: { data: audioBase64, format } }
                ]
            }
        ]
    });
    return text.trim();
}

export default chatComplete;
