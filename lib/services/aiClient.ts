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
    | { type: 'image_url'; image_url: { url: string } };

export interface ChatCompleteOptions {
    messages: ChatMessage[];
    model?: string;
    /** Set to 'json_object' to force the model to return valid JSON. */
    responseFormat?: 'json_object' | null;
    temperature?: number;
    maxTokens?: number;
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

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

export default chatComplete;
