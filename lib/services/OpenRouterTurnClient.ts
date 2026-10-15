import { ChatMessage, chatComplete } from './aiClient';

interface OpenRouterTurnClientOptions {
    systemInstruction: string;
    voiceName?: string;
    onOpen: () => void | Promise<void>;
    onClose: (event: unknown) => void;
    onError: (error: unknown) => void;
    onMessage: (data: any) => void | Promise<void>;
}

const bufferToBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
};

/**
 * Auditable, turn-based OpenRouter interviewer.
 * Dialogue generation and speech synthesis stay server-proxied; only text
 * history and the returned audio file reach the browser.
 */
export class OpenRouterTurnClient {
    private options: OpenRouterTurnClientOptions;
    private history: ChatMessage[] = [];
    private connected = false;
    private generation = 0;

    constructor(options: OpenRouterTurnClientOptions) {
        this.options = options;
    }

    async connect(): Promise<void> {
        this.connected = true;
        await this.options.onOpen();
    }

    isLikelyAlive(): boolean { return this.connected; }

    sendText(text: string): void {
        if (!this.connected) return;
        const run = ++this.generation;
        this.history.push({ role: 'user', content: text });
        const boundedHistory = this.history.slice(-18);

        void chatComplete({
            model: 'openai/gpt-4.1-mini',
            temperature: 0.45,
            maxTokens: 160,
            timeoutMs: 20000,
            messages: [
                { role: 'system', content: this.options.systemInstruction + '\nVoice delivery: use at most two concise sentences per turn and ask only one question. The student is already ready; start with the first substantive course question. Follow the instructor\'s requested number of questions when specified. After the final answer, briefly thank the student and include [END_INTERVIEW].' },
                ...boundedHistory
            ]
        }).then(async (responseText) => {
            if (!this.connected || run !== this.generation) return;
            this.history.push({ role: 'assistant', content: responseText });

            const speech = await fetch('/api/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: responseText.replace('[END_INTERVIEW]', '') }),
                signal: AbortSignal.timeout(30000)
            });
            if (!speech.ok) throw new Error(`OpenRouter speech ${speech.status}: ${(await speech.text()).slice(0, 200)}`);
            const audioBase64 = bufferToBase64(await speech.arrayBuffer());
            if (!this.connected || run !== this.generation) return;

            await this.options.onMessage({
                serverContent: {
                    modelTurn: { parts: [{ inlineData: { data: audioBase64, mimeType: speech.headers.get('content-type') || 'audio/mpeg' } }] },
                    outputTranscription: { text: responseText },
                    turnComplete: true
                }
            });
        }).catch((error) => {
            if (this.connected && run === this.generation) this.options.onError(error);
        });
    }

    disconnect(): void {
        if (!this.connected) return;
        this.connected = false;
        this.generation += 1;
        // Local teardown is not a completed interview and must not submit it.
    }
}
