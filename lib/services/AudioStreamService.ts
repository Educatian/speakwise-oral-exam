import { createAudioProcessor, AudioProcessorResult, AudioProcessorCallbacks } from '../../utils/audioPipeline';
import { decodeAudioData, decode } from '../../utils/audioHelpers';

/* ────────────────────────────────────────────────────────────────────────────
   Mobile-safe AudioContext construction
   - Tolerates prefixed implementations (older iOS WebKit exposes
     webkitAudioContext only) and constructors that reject an options bag
     (fixed sampleRate is not supported everywhere).
   ──────────────────────────────────────────────────────────────────────────── */
type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as Window & { webkitAudioContext?: AudioContextCtor };
    if (typeof AudioContext !== 'undefined') return AudioContext;
    return w.webkitAudioContext ?? null;
}

function createContext(options?: AudioContextOptions): AudioContext | null {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    try {
        return new Ctor(options);
    } catch {
        // Some implementations reject options (e.g. a fixed sampleRate) —
        // fall back to a default-rate context. Playback still works because
        // decodeAudioData() builds buffers at the source rate and WebAudio
        // resamples on playback.
        try {
            return new Ctor();
        } catch {
            return null;
        }
    }
}

/**
 * Pro-Grade Audio Stream Service
 * ──────────────────────────────
 * - Advanced getUserMedia constraints (48 kHz target, low-latency)
 * - Interactive-latency AudioContext
 * - Gapless playback queue with crossfade scheduling
 * - Output gain node for smooth volume control
 *
 * Mobile hardening:
 * - unlock() creates/resumes BOTH AudioContexts and plays a silent buffer.
 *   It must be called synchronously inside a user gesture (the Start-button
 *   click) — iOS Safari refuses to start audio contexts, and to allow
 *   programmatic playback, outside a gesture.
 * - iOS 'interrupted' state (phone call / Siri) re-arms a one-shot
 *   touchend/click listener that resumes the contexts on the next gesture.
 * - Mic-track 'ended' + devicechange (headphones unplugged, incoming call
 *   stealing the mic) surface through onDeviceLost so the UI can recover
 *   calmly instead of recording a dead mic; restartCapture() re-acquires
 *   the mic on the SAME contexts (no new gesture needed).
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

    // Mobile-recovery state
    private storedCallbacks: AudioProcessorCallbacks | null = null;
    private onDeviceLost: (() => void) | null = null;
    private restarting = false;
    private gestureResumeHandler: (() => void) | null = null;
    private deviceChangeHandler: (() => void) | null = null;

    constructor() { }

    /**
     * GESTURE UNLOCK — must be called synchronously from a user-gesture
     * handler (no awaits before it). Creates both AudioContexts, kicks off
     * resume(), and plays a zero-length buffer so iOS Safari marks audio
     * playback as user-approved. Safe to call multiple times; never throws.
     */
    unlock(): void {
        try {
            this.ensureContexts();
            this.kickResume();

            // iOS playback unlock: start a silent buffer from inside the
            // gesture so later examiner-TTS playback (which arrives over the
            // network, outside any gesture) is allowed.
            if (this.outputCtx && this.outputCtx.state !== 'closed') {
                const silent = this.outputCtx.createBuffer(1, 1, this.outputCtx.sampleRate);
                const source = this.outputCtx.createBufferSource();
                source.buffer = silent;
                source.connect(this.outputCtx.destination);
                source.start(0);
            }
        } catch (err) {
            // Unlock is best-effort; initialize() retries resume() anyway.
            console.warn('[AudioStreamService] Gesture unlock failed (non-fatal):', err);
        }
    }

    /**
     * Re-kick suspended contexts (e.g. after returning from background).
     * If the browser refuses (iOS requires a gesture), the statechange
     * watcher keeps a one-shot gesture listener armed.
     */
    resumeContexts(): void {
        this.kickResume();
    }

    /** True once the mic stream + worklet pipeline are running. */
    isCaptureReady(): boolean {
        return !!(this.stream && this.audioProcessor);
    }

    private ensureContexts(): void {
        if (!this.inputCtx || this.inputCtx.state === 'closed') {
            // Input context: interactive-latency, native sample rate
            this.inputCtx = createContext({ latencyHint: 'interactive' });
            this.watchContext(this.inputCtx);
        }
        if (!this.outputCtx || this.outputCtx.state === 'closed') {
            // Output context: 24 kHz for Gemini audio playback
            this.outputCtx = createContext({ sampleRate: 24000, latencyHint: 'interactive' });
            this.watchContext(this.outputCtx);
        }
    }

    /** Fire-and-forget resume on both contexts (never awaited in a gesture). */
    private kickResume(): void {
        for (const ctx of [this.inputCtx, this.outputCtx]) {
            if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
                ctx.resume().catch(() => { /* retried on the next gesture */ });
            }
        }
    }

    /**
     * iOS sets a non-standard 'interrupted' state during phone calls / Siri.
     * resume() only succeeds from a user gesture there, so arm a one-shot
     * touchend/click listener whenever a context leaves 'running'.
     */
    private watchContext(ctx: AudioContext | null): void {
        if (!ctx || typeof ctx.addEventListener !== 'function') return;
        ctx.addEventListener('statechange', () => {
            const state = ctx.state as string;
            if (state === 'interrupted' || state === 'suspended') {
                this.armGestureResume();
            }
        });
    }

    private armGestureResume(): void {
        if (this.gestureResumeHandler || typeof document === 'undefined') return;
        const handler = () => {
            this.disarmGestureResume();
            this.kickResume();
        };
        this.gestureResumeHandler = handler;
        document.addEventListener('touchend', handler, { passive: true });
        document.addEventListener('click', handler);
    }

    private disarmGestureResume(): void {
        if (!this.gestureResumeHandler || typeof document === 'undefined') return;
        document.removeEventListener('touchend', this.gestureResumeHandler);
        document.removeEventListener('click', this.gestureResumeHandler);
        this.gestureResumeHandler = null;
    }

    async initialize(callbacks: AudioProcessorCallbacks, onDeviceLost?: () => void): Promise<void> {
        try {
            this.storedCallbacks = callbacks;
            this.onDeviceLost = onDeviceLost ?? null;

            // Reuse the contexts unlock() created inside the Start gesture;
            // only create fresh ones when unlock() never ran (desktop paths).
            this.ensureContexts();
            if (!this.inputCtx || !this.outputCtx) {
                throw new Error('Web Audio is not available in this browser.');
            }

            // Resume both contexts (unlock() already kicked this in the gesture)
            if (this.inputCtx.state === 'suspended') await this.inputCtx.resume();
            if (this.outputCtx.state === 'suspended') await this.outputCtx.resume();

            // ── Create output gain node for volume control ──
            if (!this.outputGain) {
                this.outputGain = this.outputCtx.createGain();
                this.outputGain.gain.setValueAtTime(1, this.outputCtx.currentTime);
                this.outputGain.connect(this.outputCtx.destination);
            }

            await this.acquireMicAndProcessor();
            this.watchDeviceChanges();
        } catch (error) {
            console.error('[AudioStreamService] Failed to initialize audio components', error);
            throw error;
        }
    }

    /**
     * getUserMedia + worklet pipeline. Split out so restartCapture() can
     * re-acquire the mic (headphone unplug, call interruption) without
     * touching the already-unlocked AudioContexts.
     */
    private async acquireMicAndProcessor(): Promise<void> {
        if (!this.inputCtx || !this.storedCallbacks) {
            throw new Error('Audio service is not initialized.');
        }

        // ── Request microphone with pro-grade, mobile-safe constraints ──
        // echoCancellation / noiseSuppression / autoGainControl are essential
        // on phone speakers+mics; everything else is `ideal` (never throws
        // OverconstrainedError on devices that can't honor it).
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

        // ── Log actual audio track settings + watch for device loss ──
        const track = this.stream.getAudioTracks()[0];
        if (track) {
            const settings = track.getSettings();
            console.log(`[AudioStreamService] Mic: "${track.label}"`);
            console.log(`[AudioStreamService] Settings: ${settings.sampleRate}Hz, ${settings.channelCount}ch, echo:${settings.echoCancellation}, noise:${settings.noiseSuppression}, agc:${settings.autoGainControl}`);
            // 'ended' fires when the OS takes the mic away (incoming call,
            // headset unplugged, permission revoked) — NOT when we stop() it.
            track.addEventListener('ended', () => this.handleTrackLost());
        }
        console.log(`[AudioStreamService] InputCtx sampleRate: ${this.inputCtx.sampleRate}Hz, baseLatency: ${(this.inputCtx.baseLatency * 1000).toFixed(1)}ms`);

        // ── Build audio processor (DSP chain + Worklet) ──
        this.audioProcessor = await createAudioProcessor(
            this.inputCtx,
            this.stream,
            this.storedCallbacks
        );
    }

    private handleTrackLost(): void {
        if (this.restarting) return;
        this.onDeviceLost?.();
    }

    private watchDeviceChanges(): void {
        const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
        if (!mediaDevices || typeof mediaDevices.addEventListener !== 'function' || this.deviceChangeHandler) {
            return;
        }
        this.deviceChangeHandler = () => {
            // Only react when the device change actually killed our track
            // (some platforms reroute audio without ending it).
            const track = this.stream?.getAudioTracks()[0];
            if (track && track.readyState !== 'live') {
                this.handleTrackLost();
            }
        };
        mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
    }

    /**
     * Re-acquire the microphone on the existing (already unlocked) contexts
     * after the OS killed the previous track. Throws if the mic can't be
     * re-acquired so the caller can surface a calm error.
     */
    async restartCapture(): Promise<void> {
        if (this.restarting) return;
        this.restarting = true;
        try {
            if (this.audioProcessor) {
                this.audioProcessor.cleanup();
                this.audioProcessor = null;
            }
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            this.kickResume();
            await this.acquireMicAndProcessor();
        } finally {
            this.restarting = false;
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

        this.disarmGestureResume();
        if (this.deviceChangeHandler && typeof navigator !== 'undefined'
            && navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
            navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
        }
        this.deviceChangeHandler = null;
        this.onDeviceLost = null;
        this.storedCallbacks = null;

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
