/**
 * Post-hoc Transcription Service
 * ────────────────────────────────
 * Accumulates PCM audio during the student's speaking turn, then transcribes
 * via a chat-completion call when the turn ends (AI starts responding).
 *
 * Previously used the native Gemini SDK; now routes through OpenRouter via
 * `aiClient.transcribeAudio`, which targets openai/gpt-4o-audio-preview.
 * The constructor still accepts an apiKey argument for backward compatibility
 * with call sites (e.g. useGeminiLive), but the value is ignored — the
 * OpenRouter key in VITE_OPENROUTER_API_KEY is what actually authenticates.
 */
import { transcribeAudio } from './aiClient';

const SAMPLE_RATE = 16000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// A turn whose loudest sample never rises above this (Int16 full-scale is
// 32767) is effectively silence/room-noise after AEC+NS. Real speech — even a
// soft talker — peaks well above this, so the floor rejects noise-only turns
// without dropping genuine answers. Tuned conservatively low to avoid false
// rejections.
const MIN_PEAK_AMPLITUDE = 500;

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

/** Wraps raw PCM Int16 data in a WAV container. */
function pcmToWav(pcmChunks: Int16Array[]): string {
    let totalSamples = 0;
    for (const chunk of pcmChunks) totalSamples += chunk.length;

    const dataSize = totalSamples * (BITS_PER_SAMPLE / 8);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, NUM_CHANNELS, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), true);
    view.setUint16(32, NUM_CHANNELS * (BITS_PER_SAMPLE / 8), true);
    view.setUint16(34, BITS_PER_SAMPLE, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = headerSize;
    for (const chunk of pcmChunks) {
        for (let i = 0; i < chunk.length; i++) {
            view.setInt16(offset, chunk[i], true);
            offset += 2;
        }
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export class TranscriptionService {
    private pcmChunks: Int16Array[] = [];
    private isAccumulating = false;

    // apiKey is accepted for backward compatibility with legacy callers that
    // passed `process.env.API_KEY`; it is no longer used. Leave undefined in
    // new call sites.
    constructor(_apiKey?: string) {
        void _apiKey;
    }

    startAccumulating(): void {
        this.pcmChunks = [];
        this.isAccumulating = true;
    }

    stopAccumulating(): void {
        this.isAccumulating = false;
    }

    addChunk(pcmData: ArrayBuffer): void {
        if (!this.isAccumulating) return;
        this.pcmChunks.push(new Int16Array(pcmData));
    }

    /** Loudest absolute sample across the accumulated PCM. */
    private peakAmplitude(): number {
        let peak = 0;
        for (const chunk of this.pcmChunks) {
            for (let i = 0; i < chunk.length; i++) {
                const a = chunk[i] < 0 ? -chunk[i] : chunk[i];
                if (a > peak) peak = a;
            }
        }
        return peak;
    }

    hasAudio(): boolean {
        let total = 0;
        for (const chunk of this.pcmChunks) total += chunk.length;
        if (total <= SAMPLE_RATE * 0.5) return false;
        // Reject near-silent / noise-only turns so we don't burn a transcription
        // call (and confuse the student with an empty result) on room noise.
        return this.peakAmplitude() >= MIN_PEAK_AMPLITUDE;
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
        if (!this.hasAudio()) return null;
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

    /** Transcribe a captured turn via OpenRouter → gpt-4o-audio-preview. */
    async transcribeCapturedTurn(
        turn: CapturedAudioTurn | null
    ): Promise<TranscriptionAttemptResult> {
        if (!turn) {
            return { text: null, error: 'No captured audio turn was available.' };
        }
        const durationSec = turn.durationMs / 1000;
        console.log(`[Transcription] Sending ${durationSec.toFixed(1)}s via OpenRouter → gpt-4o-audio`);

        try {
            const text = await transcribeAudio(turn.wavBase64, 'wav');
            console.log(`[Transcription] Result: "${(text || '').substring(0, 60)}..."`);
            return { text: text || null };
        } catch (firstErr) {
            // Transient upstream failures (timeout, 5xx, dropped fetch) are
            // common enough that one immediate retry recovers most of them
            // before the student notices.
            console.warn('[Transcription] First attempt failed, retrying once:', firstErr);
            try {
                const text = await transcribeAudio(turn.wavBase64, 'wav');
                console.log(`[Transcription] Retry result: "${(text || '').substring(0, 60)}..."`);
                return { text: text || null };
            } catch (retryErr) {
                console.error('[Transcription] Retry failed:', retryErr);
                const error = retryErr instanceof Error ? retryErr.message : 'Transcription request failed.';
                return { text: null, error };
            }
        }
    }
}
