import { AudioContexts } from '../../types';
import { createAudioProcessor, AudioProcessorResult, AudioProcessorCallbacks } from '../../utils/audioPipeline';
import { decodeAudioData, decode } from '../../utils/audioHelpers';

export class AudioStreamService {
    private inputCtx: AudioContext | null = null;
    private outputCtx: AudioContext | null = null;
    private stream: MediaStream | null = null;
    private audioProcessor: AudioProcessorResult | null = null;
    private sources: Set<AudioBufferSourceNode> = new Set();
    private nextStartTime: number = 0;

    constructor() { }

    async initialize(callbacks: AudioProcessorCallbacks): Promise<void> {
        try {
            this.inputCtx = new AudioContext();
            this.outputCtx = new AudioContext({ sampleRate: 24000 });

            if (this.inputCtx.state === 'suspended') {
                await this.inputCtx.resume();
            }
            if (this.outputCtx.state === 'suspended') {
                await this.outputCtx.resume();
            }

            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

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

    async playAudioChunk(base64Data: string): Promise<void> {
        if (!this.outputCtx) return;

        try {
            const audioData = await decodeAudioData(decode(base64Data), this.outputCtx, 24000, 1);
            const source = this.outputCtx.createBufferSource();
            source.buffer = audioData;
            source.connect(this.outputCtx.destination);

            this.sources.add(source);
            source.onended = () => {
                this.sources.delete(source);
                source.disconnect();
            };

            const currentTime = this.outputCtx.currentTime;
            this.nextStartTime = Math.max(currentTime, this.nextStartTime);
            source.start(this.nextStartTime);

            // Add slight overlap to prevent audio gaps
            this.nextStartTime += Math.max(0, audioData.duration - 0.05);
        } catch (err) {
            console.error('[AudioStreamService] Error decoding or playing audio data', err);
        }
    }

    stopAllAudio(): void {
        this.sources.forEach(source => {
            try {
                source.stop();
                source.disconnect();
            } catch (e) {
                // Source may already be stopped
            }
        });
        this.sources.clear();

        if (this.outputCtx) {
            this.nextStartTime = this.outputCtx.currentTime;
        } else {
            this.nextStartTime = 0;
        }
    }

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
    }
}
