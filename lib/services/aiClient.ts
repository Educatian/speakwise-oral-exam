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
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Model used for audio transcription. gpt-4o-audio-preview accepts wav/mp3
 *  input and returns text. Tested to work through OpenRouter (unlike the
 *  Gemini-family audio inputs, which OpenRouter silently strips). */
export const AUDIO_TRANSCRIPTION_MODEL = 'openai/gpt-4o-audio-preview';

function getKey(): string {
    const key = import.meta.env.VITE_OPENROUTER_API_KEY;
    if (!key) {
        throw new Error(
            'VITE_OPENROUTER_API_KEY is not set. Add it to .env.local (local dev) and the Vercel project env vars (production build).'
        );
    }
    return key;
}

export async function chatComplete(options: ChatCompleteOptions): Promise<string> {
    const key = getKey();
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

    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            // OpenRouter uses these for attribution / ranking on openrouter.ai.
            'HTTP-Referer':
                typeof window !== 'undefined' ? window.location.origin : 'https://speakwise.local',
            'X-Title': 'SpeakWise'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = await res.json();
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
    instruction = 'Transcribe this audio exactly as spoken. Return ONLY the transcription text, nothing else. If the audio is silent or unintelligible, return an empty string.'
): Promise<string> {
    const text = await chatComplete({
        model: AUDIO_TRANSCRIPTION_MODEL,
        modalities: ['text'],
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
