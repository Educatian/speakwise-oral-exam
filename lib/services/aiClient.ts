/** Same-origin client for the server-configured Microsoft Foundry deployments. */

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

const ENDPOINT = '/api/llm';
const TRANSCRIPTION_ENDPOINT = '/api/transcriptions';

export async function chatComplete(options: ChatCompleteOptions): Promise<string> {
    const payload: Record<string, unknown> = {
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
            throw new Error(`Microsoft Foundry ${res.status}: ${text.slice(0, 500)}`);
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
        throw new Error('Microsoft Foundry returned no text content');
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
 * Routes through the same-origin proxy to Microsoft Foundry's dedicated
 * `/openai/v1/audio/transcriptions` endpoint.
 *
 * @param audioBase64 base64-encoded audio bytes (no data-url prefix)
 * @param format      'wav' (default) or 'mp3'
 */
export async function transcribeAudio(
    audioBase64: string,
    format: 'wav' | 'mp3' = 'wav'
): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(TRANSCRIPTION_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input_audio: { data: audioBase64, format }
            }),
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`Microsoft Foundry transcription ${response.status}: ${(await response.text()).slice(0, 500)}`);
        }
        const data = await response.json();
        if (typeof data?.text !== 'string') throw new Error('Microsoft Foundry transcription returned no text');
        return data.text.trim();
    } catch (error) {
        if (controller.signal.aborted) throw new Error('Transcription timed out after 15000ms');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export default chatComplete;
