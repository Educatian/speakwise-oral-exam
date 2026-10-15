import { requestMicrophone } from '../../utils/micPermission';
import { createAudioProcessor, AudioProcessorResult, AudioProcessorCallbacks } from '../../utils/audioPipeline';
import { decodeAudioData, decode } from '../../utils/audioHelpers';

/**
 * Pro-Grade Audio Stream Service
 * ──────────────────────────────
 * - Advanced getUserMedia constraints (48 kHz target, low-latency)
 * - Interactive-latency AudioContext
 * - Gapless playback queue with crossfade scheduling
 * - Output gain node for smooth volume control
 */
export class AudioStreamService {
    private inputCtx: AudioContext | null = null;
    private outputCtx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private audioProcessor: AudioProcessorResult | null = null;

    // Playback state
    private sources: Set<AudioBufferSourceNode> = new Set();
    private nextStartTime: number = 0;
    private outputGain: GainNode | null = null;

    private initialization: AbortController | null = null;
    private detachAbort: (() => void) | null = null;

    constructor() { }

    async initialize(callbacks: AudioProcessorCallbacks, signal?: AbortSignal): Promise<void> {
        this.cleanup();
        const controller = new AbortController();
        this.initialization = controller;
        const ensureCurrent = () => {
            if (controller.signal.aborted || this.initialization !== controller) {
                throw new DOMException('Audio initialization cancelled.', 'AbortError');
            }
        };
        const abort = () => {
            if (this.initialization === controller) this.cleanup();
        };
        signal?.addEventListener('abort', abort, { once: true });
        this.detachAbort = () => signal?.removeEventListener('abort', abort);
        if (signal?.aborted) abort();

        try {
            ensureCurrent();
            // Start WebAudio inside the user's click, before waiting on permission.
            const inputCtx = new AudioContext({ latencyHint: 'interactive' });
            this.inputCtx = inputCtx;
            const outputCtx = new AudioContext({ sampleRate: 24000, latencyHint: 'interactive' });
            this.outputCtx = outputCtx;
            const streamPromise = requestMicrophone({
                audio: {
                    sampleRate: { ideal: 48000 },
                    channelCount: { ideal: 1 },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    // @ts-ignore — advanced constraints not in all TS defs
                    latency: { ideal: 0.01 },
                    sampleSize: { ideal: 16 },
                }
            }, { signal: controller.signal }).then(stream => {
                if (controller.signal.aborted || this.initialization !== controller) {
                    stream.getTracks().forEach(track => track.stop());
                    ensureCurrent();
                }
                this.stream = stream;
                return stream;
            });
            const [stream] = await Promise.all([
                streamPromise,
                inputCtx.state === 'suspended' ? inputCtx.resume() : Promise.resolve(),
                outputCtx.state === 'suspended' ? outputCtx.resume() : Promise.resolve()
            ]);
            ensureCurrent();

            this.outputGain = outputCtx.createGain();
            this.outputGain.gain.setValueAtTime(1, outputCtx.currentTime);
            this.outputGain.connect(outputCtx.destination);

            const track = stream.getAudioTracks()[0];
            const settings = track.getSettings();
            console.log('[AudioStreamService] Mic:', track.label, settings);

            const processor = await createAudioProcessor(inputCtx, stream, callbacks);
            if (controller.signal.aborted || this.initialization !== controller) {
                processor.cleanup();
                ensureCurrent();
            }
            this.audioProcessor = processor;
        } catch (error) {
            if (this.initialization === controller) this.cleanup();
            throw error;
        }
    }

    /**
     * Gapless audio playback with micro-fade at chunk boundaries
     */
    async playAudioChunk(base64Data: string): Promise<void> {
        if (!this.outputCtx || !this.outputGain) return;

        try {
            const audioData = await decodeAudioData(decode(base64Data), this.outputCtx, 24000, 1);

            // Apply micro fade-in/fade-out (2ms) to raw samples to smooth chunk boundaries
            const channelData = audioData.getChannelData(0);
            const fadeSamples = Math.min(48, Math.floor(channelData.length / 4)); // 2ms at 24kHz = 48 samples
            for (let i = 0; i < fadeSamples; i++) {
                const gain = i / fadeSamples;
                channelData[i] *= gain;                                    // fade-in
                channelData[channelData.length - 1 - i] *= gain;           // fade-out
            }

            const source = this.outputCtx.createBufferSource();
            source.buffer = audioData;

            // Connect through gain node
            source.connect(this.outputGain);

            this.sources.add(source);
            source.onended = () => {
                this.sources.delete(source);
                source.disconnect();
            };

            // Schedule back-to-back (no overlap, no gap)
            const currentTime = this.outputCtx.currentTime;
            this.nextStartTime = Math.max(currentTime, this.nextStartTime);
            source.start(this.nextStartTime);
            this.nextStartTime += audioData.duration;
        } catch (err) {
            console.error('[AudioStreamService] Error decoding or playing audio data', err);
        }
    }

    getPendingPlaybackMs(): number {
        return this.outputCtx ? Math.max(0, (this.nextStartTime - this.outputCtx.currentTime) * 1000) : 0;
    }

    /**
     * Stop all audio with smooth fade-out
     */
    stopAllAudio(): void {
        // Smooth fade-out over 50ms
        if (this.outputGain && this.outputCtx) {
            const now = this.outputCtx.currentTime;
            this.outputGain.gain.setValueAtTime(this.outputGain.gain.value, now);
            this.outputGain.gain.linearRampToValueAtTime(0, now + 0.05);

            // After fade, stop and reset
            setTimeout(() => {
                this.sources.forEach(source => {
                    try {
                        source.stop();
                        source.disconnect();
                    } catch (e) {
                        // Source may already be stopped
                    }
                });
                this.sources.clear();

                // Reset gain for next playback
                if (this.outputGain && this.outputCtx) {
                    this.outputGain.gain.setValueAtTime(1, this.outputCtx.currentTime);
                    this.nextStartTime = this.outputCtx.currentTime;
                }
            }, 60);
        } else {
            this.sources.forEach(source => {
                try {
                    source.stop();
                    source.disconnect();
                } catch (e) { }
            });
            this.sources.clear();
            this.nextStartTime = 0;
        }
    }

    /**
     * Full cleanup
     */
    cleanup(): void {
        this.initialization?.abort();
        this.initialization = null;
        this.detachAbort?.();
        this.detachAbort = null;
        this.stopAllAudio();

        if (this.audioProcessor) {
            this.audioProcessor.cleanup();
            this.audioProcessor = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.inputCtx) {
            this.inputCtx.close().catch(() => { });
            this.inputCtx = null;
        }

        if (this.outputCtx) {
            this.outputCtx.close().catch(() => { });
            this.outputCtx = null;
        }

        this.outputGain = null;
    }
}
