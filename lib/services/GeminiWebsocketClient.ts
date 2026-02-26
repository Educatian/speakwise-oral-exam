import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity, ActivityHandling } from '@google/genai';

export interface GeminiLiveClientOptions {
    apiKey: string;
    systemInstruction: string;
    voiceName?: string;
    onOpen: () => void;
    onClose: (event: any) => void;
    onError: (error: any) => void;
    onMessage: (data: any) => void;
}

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
                // Enable transcription 
                outputAudioTranscription: {},
                inputAudioTranscription: {},
                systemInstruction: {
                    parts: [{ text: this.options.systemInstruction }]
                },
                realtimeInputConfig: {
                    automaticActivityDetection: {
                        disabled: false,
                        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
                        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                        prefixPaddingMs: 800,
                        silenceDurationMs: 1500
                    },
                    activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS
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

    sendAudio(mimeType: string, data: string): void {
        if (!this.session) return;
        try {
            this.session.send({
                realtimeInput: {
                    mediaChunks: [{ mimeType, data }]
                }
            });
        } catch (error) {
            console.error('[GeminiWebsocketClient] Error sending audio:', error);
        }
    }

    sendText(text: string): void {
        if (!this.session) return;
        try {
            this.session.send({
                clientContent: {
                    turns: [{
                        role: 'user',
                        parts: [{ text }]
                    }],
                    turnComplete: true
                }
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
