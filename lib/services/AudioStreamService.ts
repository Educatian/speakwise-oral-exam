import { AudioContexts } from '../../types';
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

    constructor() { }

    async initialize(callbacks: AudioProcessorCallbacks): Promise<void> {
        try {
            // ── Input context: interactive-latency, native sample rate ──
            this.inputCtx = new AudioContext({
                latencyHint: 'interactive',
            });

            // ── Output context: 24 kHz for Gemini audio playback ──
            this.outputCtx = new AudioContext({
                sampleRate: 24000,
                latencyHint: 'interactive',
            });

            // Resume both contexts
            if (this.inputCtx.state === 'suspended') await this.inputCtx.resume();
            if (this.outputCtx.state === 'suspended') await this.outputCtx.resume();

            // ── Create output gain node for volume control ──
            this.outputGain = this.outputCtx.createGain();
            this.outputGain.gain.setValueAtTime(1, this.outputCtx.currentTime);
            this.outputGain.connect(this.outputCtx.destination);

            // ── Request microphone with pro-grade constraints ──
            this.stream = await navigator.mediaDevices.getUserMedia({
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
            });

            // ── Log actual audio track settings ──
            const track = this.stream.getAudioTracks()[0];
            const settings = track.getSettings();
            console.log(`[AudioStreamService] Mic: "${track.label}"`);
            console.log(`[AudioStreamService] Settings: ${settings.sampleRate}Hz, ${settings.channelCount}ch, echo:${settings.echoCancellation}, noise:${settings.noiseSuppression}, agc:${settings.autoGainControl}`);
            console.log(`[AudioStreamService] InputCtx sampleRate: ${this.inputCtx.sampleRate}Hz, baseLatency: ${(this.inputCtx.baseLatency * 1000).toFixed(1)}ms`);

            // ── Build audio processor (DSP chain + Worklet) ──
            this.audioProcessor = await createAudioProcessor(
                this.inputCtx,
                this.stream,
                callbacks
            );
        } catch (error) {
            console.error('[AudioStreamService] Failed to initialize audio components', error);
            throw error;
        }
    }

    /**
     * Gapless audio playback with pre-scheduling and crossfade
     */
    async playAudioChunk(base64Data: string): Promise<void> {
        if (!this.outputCtx || !this.outputGain) return;

        try {
            const audioData = await decodeAudioData(decode(base64Data), this.outputCtx, 24000, 1);
            const source = this.outputCtx.createBufferSource();
            source.buffer = audioData;

            // Connect through gain node
            source.connect(this.outputGain);

            this.sources.add(source);
            source.onended = () => {
                this.sources.delete(source);
                source.disconnect();
            };

            // Pre-schedule for gapless playback
            const currentTime = this.outputCtx.currentTime;
            this.nextStartTime = Math.max(currentTime, this.nextStartTime);
            source.start(this.nextStartTime);

            // Overlap by 30ms for seamless crossfade (prevents clicks/pops)
            this.nextStartTime += Math.max(0, audioData.duration - 0.03);
        } catch (err) {
            console.error('[AudioStreamService] Error decoding or playing audio data', err);
        }
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
