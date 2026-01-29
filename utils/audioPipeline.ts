/**
 * Advanced Audio Pipeline Utilities
 * Supports AudioWorklet with ScriptProcessor fallback
 */

import { encode } from './audioHelpers';

// Check if AudioWorklet is supported
export const supportsAudioWorklet = (): boolean => {
    return typeof AudioWorkletNode !== 'undefined';
};

/**
 * Audio processor callback interface
 */
export interface AudioProcessorCallbacks {
    onAudioLevel: (level: number) => void;
    onVoiceActivity: (isSpeaking: boolean) => void;
    onPCMData: (blob: { data: string; mimeType: string }) => void;
    onCalibration?: (noiseFloor: number, threshold: number) => void;
}

/**
 * Audio processor result
 */
export interface AudioProcessorResult {
    cleanup: () => void;
}

/**
 * Create PCM blob from Int16 buffer
 */
function createPCMBlob(int16Buffer: ArrayBuffer): { data: string; mimeType: string } {
    const bytes = new Uint8Array(int16Buffer);
    return {
        data: encode(bytes),
        mimeType: 'audio/pcm;rate=16000'
    };
}

/**
 * Linear interpolation resampling (better than point sampling)
 */
function resampleLinear(inputData: Float32Array, ratio: number): Float32Array {
    const outputLength = Math.ceil(inputData.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
        const fraction = srcIndex - srcIndexFloor;

        // Linear interpolation for better quality
        output[i] = inputData[srcIndexFloor] * (1 - fraction) +
            inputData[srcIndexCeil] * fraction;
    }

    return output;
}

/**
 * Convert Float32 to Int16 PCM
 */
function float32ToInt16(buffer: Float32Array): Int16Array {
    const int16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        const clamped = Math.max(-1, Math.min(1, buffer[i]));
        int16[i] = clamped * 32767;
    }
    return int16;
}

/**
 * Setup audio processing using AudioWorklet (preferred)
 */
async function setupAudioWorklet(
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode,
    callbacks: AudioProcessorCallbacks
): Promise<AudioProcessorResult> {
    // Load the worklet module
    await audioContext.audioWorklet.addModule('/audio-processor.js');

    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

    workletNode.port.onmessage = (event) => {
        const { type, audioLevel, isSpeaking, pcmData, noiseFloor, threshold } = event.data;

        if (type === 'audio') {
            callbacks.onAudioLevel(audioLevel);
            callbacks.onVoiceActivity(isSpeaking);
            callbacks.onPCMData(createPCMBlob(pcmData));
        } else if (type === 'calibration' && callbacks.onCalibration) {
            callbacks.onCalibration(noiseFloor, threshold);
        }
    };

    source.connect(workletNode);
    // Don't connect to destination to avoid feedback

    return {
        cleanup: () => {
            workletNode.disconnect();
            source.disconnect();
        }
    };
}

/**
 * Setup audio processing using ScriptProcessor (fallback for older browsers)
 */
function setupScriptProcessor(
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode,
    callbacks: AudioProcessorCallbacks
): AudioProcessorResult {
    const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    const ratio = audioContext.sampleRate / 16000;

    // Adaptive threshold state
    let noiseFloor = 0;
    let calibrated = false;
    let calibrationFrames = 0;
    let calibrationSum = 0;
    let adaptiveThreshold = 0.02;

    scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        // Calibrate noise floor (~1 second)
        if (!calibrated) {
            calibrationSum += rms;
            calibrationFrames++;

            if (calibrationFrames >= 50) {
                noiseFloor = calibrationSum / calibrationFrames;
                adaptiveThreshold = Math.max(0.015, noiseFloor * 3);
                calibrated = true;
                callbacks.onCalibration?.(noiseFloor, adaptiveThreshold);
            }
        }

        // Normalize level
        const normalizedLevel = Math.min(100, Math.round(rms * 500));
        callbacks.onAudioLevel(normalizedLevel);

        // Voice activity with adaptive threshold
        const isSpeaking = rms > adaptiveThreshold;
        callbacks.onVoiceActivity(isSpeaking);

        // Resample with linear interpolation
        const resampled = resampleLinear(inputData, ratio);
        const int16 = float32ToInt16(resampled);

        callbacks.onPCMData(createPCMBlob(int16.buffer));
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    return {
        cleanup: () => {
            scriptProcessor.disconnect();
            source.disconnect();
        }
    };
}

/**
 * Create audio processor with best available method
 * Uses AudioWorklet if available, falls back to ScriptProcessor
 */
export async function createAudioProcessor(
    audioContext: AudioContext,
    stream: MediaStream,
    callbacks: AudioProcessorCallbacks
): Promise<AudioProcessorResult> {
    const source = audioContext.createMediaStreamSource(stream);

    // Resume audio context if needed (iOS/Safari requirement)
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Try AudioWorklet first, fall back to ScriptProcessor
    if (supportsAudioWorklet()) {
        try {
            console.log('[Audio] Using AudioWorklet (modern)');
            return await setupAudioWorklet(audioContext, source, callbacks);
        } catch (error) {
            console.warn('[Audio] AudioWorklet failed, falling back to ScriptProcessor:', error);
        }
    }

    console.log('[Audio] Using ScriptProcessor (fallback)');
    return setupScriptProcessor(audioContext, source, callbacks);
}

/**
 * Apply fadeout to audio source (for smooth barge-in)
 */
export function fadeOutAudioSource(
    source: AudioBufferSourceNode,
    audioContext: AudioContext,
    duration: number = 0.05
): GainNode {
    const gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Start fade out
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);

    return gainNode;
}

/**
 * Get available audio input devices
 */
export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
}
