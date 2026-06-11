import { GoogleGenAI, Modality } from '@google/genai';

export interface GeminiLiveClientOptions {
    apiKey: string;
    systemInstruction: string;
    voiceName?: string;
    onOpen: () => void;
    onClose: (event: any) => void;
    onError: (error: any) => void;
    onMessage: (data: any) => void;
}

/**
 * Gemini Live WebSocket Client - Turn-Based Mode
 * 
 * No audio is sent TO Gemini — only text via sendText().
 * Gemini responds with audio (TTS) which we play locally.
 * Automatic activity detection is DISABLED (we manage turns ourselves).
 */
export class GeminiWebsocketClient {
    private session: any = null;
    private options: GeminiLiveClientOptions;
    private closed = false;

    constructor(options: GeminiLiveClientOptions) {
        this.options = options;
    }

    /**
     * Best-effort liveness probe for the visibility-return health check
     * (mobile browsers can kill a backgrounded socket without delivering the
     * close event until much later). Returns false when we KNOW the socket is
     * gone (close fired, or the underlying WebSocket reports CLOSING/CLOSED);
     * returns true when it can't tell, so the normal onClose-driven reconnect
     * path stays authoritative and we never double-trigger recovery.
     */
    isLikelyAlive(): boolean {
        if (!this.session || this.closed) return false;
        try {
            const conn = (this.session as { conn?: { readyState?: number } }).conn;
            if (conn && typeof conn.readyState === 'number') {
                // 0 = CONNECTING, 1 = OPEN
                return conn.readyState === 0 || conn.readyState === 1;
            }
        } catch {
            // SDK internals changed — fall through to "assume alive".
        }
        return true;
    }

    async connect(): Promise<void> {
        if (this.session) return;
        this.closed = false;

        // apiKey here is a short-lived ephemeral token minted server-side; the
        // Live API requires the v1alpha surface for ephemeral-token auth so the
        // long-lived Gemini key never reaches the browser.
        const ai = new GoogleGenAI({
            apiKey: this.options.apiKey,
            httpOptions: { apiVersion: 'v1alpha' }
        });

        this.session = await ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: this.options.voiceName || 'Kore' } }
                },
                // Enable transcription of AI's audio output
                outputAudioTranscription: {},
                systemInstruction: {
                    parts: [{ text: this.options.systemInstruction }]
                },
                // Turn-based: disable automatic activity detection entirely
                // We send text only — no audio goes to Gemini
                realtimeInputConfig: {
                    automaticActivityDetection: {
                        disabled: true
                    }
                }
            },
            callbacks: {
                onopen: () => this.options.onOpen(),
                onclose: (event: any) => {
                    this.closed = true;
                    this.options.onClose(event);
                },
                onerror: (error: any) => this.options.onError(error),
                onmessage: (data: any) => this.options.onMessage(data)
            }
        });
    }

    sendText(text: string): void {
        if (!this.session) return;
        try {
            this.session.sendClientContent({
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                turnComplete: true
            });
        } catch (error) {
            console.error('[GeminiWebsocketClient] Error sending text:', error);
        }
    }

    disconnect(): void {
        this.closed = true;
        if (this.session) {
            try {
                this.session.close();
            } catch (e) {
                // Ignore close errors
            }
            this.session = null;
        }
    }
}
