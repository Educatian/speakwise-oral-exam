/**
 * Post-hoc Transcription Service
 * ────────────────────────────────
 * Accumulates PCM audio during user's speaking turn,
 * then transcribes via a separate Gemini API call when
 * the turn ends (AI starts responding).
 */
import { GoogleGenAI } from '@google/genai';

const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

export interface CapturedAudioTurn {
    id: string;
    wavBase64: string;
    durationMs: number;
    sampleCount: number;
    createdAt: number;
}

export interface TranscriptionAttemptResult {
    text: string | null;
    error?: string;
}

/**
 * Wraps raw PCM Int16 data in a WAV container for Gemini API compatibility.
 */
function pcmToWav(pcmChunks: Int16Array[]): string {
    // Calculate total samples
    let totalSamples = 0;
    for (const chunk of pcmChunks) {
        totalSamples += chunk.length;
    }

    const dataSize = totalSamples * (BITS_PER_SAMPLE / 8);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);             // Subchunk1Size
    view.setUint16(20, 1, true);              // PCM format
    view.setUint16(22, NUM_CHANNELS, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), true);
    view.setUint16(32, NUM_CHANNELS * (BITS_PER_SAMPLE / 8), true);
    view.setUint16(34, BITS_PER_SAMPLE, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM data
    let offset = headerSize;
    for (const chunk of pcmChunks) {
        for (let i = 0; i < chunk.length; i++) {
            view.setInt16(offset, chunk[i], true);
            offset += 2;
        }
    }

    // Convert to base64
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export class TranscriptionService {
    private pcmChunks: Int16Array[] = [];
    private isAccumulating = false;
    private apiKey: string;
    private ai: GoogleGenAI;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.ai = new GoogleGenAI({ apiKey });
    }

    /** Start accumulating PCM chunks for the current user turn */
    startAccumulating(): void {
        this.pcmChunks = [];
        this.isAccumulating = true;
    }

    /** Stop accumulating (called when AI starts responding) */
    stopAccumulating(): void {
        this.isAccumulating = false;
    }

    /** Add a PCM chunk (called from onPCMData) */
    addChunk(pcmData: ArrayBuffer): void {
        if (!this.isAccumulating) return;
        this.pcmChunks.push(new Int16Array(pcmData));
    }

    /** Check if there's enough audio to transcribe (at least 0.5s) */
    hasAudio(): boolean {
        let totalSamples = 0;
        for (const chunk of this.pcmChunks) {
            totalSamples += chunk.length;
        }
        return totalSamples > SAMPLE_RATE * 0.5; // At least 0.5 seconds
    }

    getSampleCount(): number {
        return this.pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    }

    getDurationMs(): number {
        return Math.round((this.getSampleCount() / SAMPLE_RATE) * 1000);
    }

    clear(): void {
        this.pcmChunks = [];
    }

    getCurrentTurn(): CapturedAudioTurn | null {
        if (!this.hasAudio()) {
            return null;
        }

        return {
            id: `raw_turn_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
            wavBase64: pcmToWav(this.pcmChunks),
            durationMs: this.getDurationMs(),
            sampleCount: this.getSampleCount(),
            createdAt: Date.now()
        };
    }

    consumeCurrentTurn(): CapturedAudioTurn | null {
        const turn = this.getCurrentTurn();
        this.clear();
        return turn;
    }

    /**
     * Transcribe a captured turn via Gemini API.
     * Returns the transcription text, or null if failed.
     */
    async transcribeCapturedTurn(turn: CapturedAudioTurn | null): Promise<TranscriptionAttemptResult> {
        if (!turn) {
            console.log('[Transcription] Not enough audio to transcribe');
            return { text: null, error: 'No captured audio turn was available.' };
        }

        try {
            const durationSec = turn.durationMs / 1000;
            console.log(`[Transcription] Sending ${durationSec.toFixed(1)}s of audio for transcription`);

            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{
                    role: 'user',
                    parts: [
                        {
                            inlineData: {
                                mimeType: 'audio/wav',
                                data: turn.wavBase64,
                            },
                        },
                        {
                            text: 'Transcribe this audio exactly as spoken. Return ONLY the transcription text, nothing else. If the audio is silent or unintelligible, return an empty string.',
                        },
                    ],
                }],
            });

            const text = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
            console.log(`[Transcription] Result: "${text?.substring(0, 60)}..."`);
            return { text };
        } catch (err) {
            console.error('[Transcription] Failed:', err);
            const error = err instanceof Error ? err.message : 'Transcription request failed.';
            return { text: null, error };
        }
    }
}
