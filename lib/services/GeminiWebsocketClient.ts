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

    constructor(options: GeminiLiveClientOptions) {
        this.options = options;
    }

    async connect(): Promise<void> {
        if (this.session) return;

        const ai = new GoogleGenAI({ apiKey: this.options.apiKey });

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
                onclose: (event: any) => this.options.onClose(event),
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
