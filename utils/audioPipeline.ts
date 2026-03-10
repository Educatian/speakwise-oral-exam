/**
 * Pro-Grade Audio Pipeline
 * ────────────────────────
 * WebAudio DSP chain: Mic → HighPass(80Hz) → Compressor → AudioWorklet
 * ScriptProcessor fallback with identical signal chain
 */

import { encode } from './audioHelpers';

/* ================================================================
   Feature detection
   ================================================================ */
export const supportsAudioWorklet = (): boolean => {
    return typeof AudioWorkletNode !== 'undefined';
};

/* ================================================================
   Callback interface
   ================================================================ */
export interface AudioProcessorCallbacks {
    onAudioLevel: (level: number) => void;
    onVoiceActivity: (isSpeaking: boolean) => void;
    onPCMData: (blob: { data: string; mimeType: string }) => void;
    onCalibration?: (noiseFloor: number, threshold: number) => void;
    onPeakDb?: (peakDb: number) => void;
}

export interface AudioProcessorResult {
    cleanup: () => void;
}

/* ================================================================
   Helper: Int16 → base64 PCM blob
   ================================================================ */
function createPCMBlob(int16Buffer: ArrayBuffer): { data: string; mimeType: string } {
    const bytes = new Uint8Array(int16Buffer);
    return {
        data: encode(bytes),
        mimeType: 'audio/pcm;rate=16000'
    };
}

/* ================================================================
   Build the WebAudio DSP chain
   Mic → BiquadFilter(highpass 80Hz) → DynamicsCompressor → destination
   Returns the final node to connect to the Worklet / ScriptProcessor
   ================================================================ */
function buildDSPChain(
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode
): AudioNode {
    // ── High-pass filter (80 Hz, 12 dB/oct) ──
    const highPass = audioContext.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(80, audioContext.currentTime);
    highPass.Q.setValueAtTime(0.707, audioContext.currentTime); // Butterworth

    // ── Dynamics Compressor ──
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, audioContext.currentTime);
    compressor.knee.setValueAtTime(12, audioContext.currentTime);
    compressor.ratio.setValueAtTime(4, audioContext.currentTime);
    compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
    compressor.release.setValueAtTime(0.25, audioContext.currentTime);

    // Connect chain
    source.connect(highPass);
    highPass.connect(compressor);

    console.log('[Audio DSP] Chain: Source → HighPass(80Hz) → Compressor(4:1, -24dB)');

    return compressor;
}

/* ================================================================
   AudioWorklet path (preferred)
   ================================================================ */
async function setupAudioWorklet(
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode,
    callbacks: AudioProcessorCallbacks
): Promise<AudioProcessorResult> {
    await audioContext.audioWorklet.addModule('/audio-processor.js');

    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

    // Build DSP chain and connect to worklet
    const dspOutput = buildDSPChain(audioContext, source);
    dspOutput.connect(workletNode);
    // Don't connect to destination — avoid feedback

    workletNode.port.onmessage = (event) => {
        const { type, audioLevel, isSpeaking, pcmData, noiseFloor, threshold, peakDb } = event.data;

        if (type === 'audio') {
            callbacks.onAudioLevel(audioLevel);
            callbacks.onVoiceActivity(isSpeaking);
            callbacks.onPCMData(createPCMBlob(pcmData));
            if (peakDb !== undefined && callbacks.onPeakDb) {
                callbacks.onPeakDb(peakDb);
            }
        } else if (type === 'calibration' && callbacks.onCalibration) {
            callbacks.onCalibration(noiseFloor, threshold);
        }
    };

    return {
        cleanup: () => {
            workletNode.disconnect();
            dspOutput.disconnect();
            source.disconnect();
        }
    };
}

/* ================================================================
   ScriptProcessor fallback (older browsers)
   ================================================================ */
function setupScriptProcessor(
    audioContext: AudioContext,
    source: MediaStreamAudioSourceNode,
    callbacks: AudioProcessorCallbacks
): AudioProcessorResult {
    const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    const ratio = audioContext.sampleRate / 16000;

    // Build DSP chain and connect to ScriptProcessor
    const dspOutput = buildDSPChain(audioContext, source);
    dspOutput.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    // Adaptive threshold state
    let noiseFloor = 0;
    let calibrated = false;
    let calibrationFrames = 0;
    let calibrationSum = 0;
    let adaptiveThreshold = 0.01;

    // VAD smoothing
    let speakingHangover = 0;
    let isSpeaking = false;

    // DC-blocking state
    let hpPrevIn = 0;
    let hpPrevOut = 0;
    const hpAlpha = 0.995;

    scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // DC-blocking high-pass
        const filtered = new Float32Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            hpPrevOut = hpAlpha * (hpPrevOut + inputData[i] - hpPrevIn);
            hpPrevIn = inputData[i];
            filtered[i] = hpPrevOut;
        }

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < filtered.length; i++) {
            sum += filtered[i] * filtered[i];
        }
        const rms = Math.sqrt(sum / filtered.length);

        // Calibrate noise floor (~1 s)
        if (!calibrated) {
            calibrationSum += rms;
            calibrationFrames++;
            if (calibrationFrames >= 50) {
                noiseFloor = calibrationSum / calibrationFrames;
                adaptiveThreshold = Math.max(0.008, noiseFloor * 2.5);
                calibrated = true;
                callbacks.onCalibration?.(noiseFloor, adaptiveThreshold);
            }
        }

        // Normalize level
        const normalizedLevel = Math.min(100, Math.round(rms * 500));
        callbacks.onAudioLevel(normalizedLevel);

        // VAD with adaptive threshold
        const isCurrentlySpeaking = rms > adaptiveThreshold;
        if (isCurrentlySpeaking) {
            speakingHangover = 60;
            isSpeaking = true;
        } else if (speakingHangover > 0) {
            speakingHangover--;
        } else {
            isSpeaking = false;
        }
        callbacks.onVoiceActivity(isSpeaking);

        // Resample with linear interpolation (fallback path)
        const outputLength = Math.ceil(filtered.length / ratio);
        const resampled = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * ratio;
            const srcFloor = Math.floor(srcIndex);
            const srcCeil = Math.min(srcFloor + 1, filtered.length - 1);
            const fraction = srcIndex - srcFloor;
            resampled[i] = filtered[srcFloor] * (1 - fraction) + filtered[srcCeil] * fraction;
        }

        // Float32 → Int16
        const int16 = new Int16Array(resampled.length);
        for (let i = 0; i < resampled.length; i++) {
            const clamped = Math.max(-1, Math.min(1, resampled[i]));
            int16[i] = clamped * 32767;
        }

        callbacks.onPCMData(createPCMBlob(int16.buffer));
    };

    return {
        cleanup: () => {
            scriptProcessor.disconnect();
            dspOutput.disconnect();
            source.disconnect();
        }
    };
}

/* ================================================================
   Factory: create audio processor with best available method
   ================================================================ */
export async function createAudioProcessor(
    audioContext: AudioContext,
    stream: MediaStream,
    callbacks: AudioProcessorCallbacks
): Promise<AudioProcessorResult> {
    const source = audioContext.createMediaStreamSource(stream);

    // Resume audio context (iOS / Safari requirement)
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Try AudioWorklet first, fall back to ScriptProcessor
    if (supportsAudioWorklet()) {
        try {
            console.log('[Audio] Using AudioWorklet (pro pipeline)');
            return await setupAudioWorklet(audioContext, source, callbacks);
        } catch (error) {
            console.warn('[Audio] AudioWorklet failed, falling back to ScriptProcessor:', error);
        }
    }

    console.log('[Audio] Using ScriptProcessor (fallback pipeline)');
    return setupScriptProcessor(audioContext, source, callbacks);
}

/* ================================================================
   Utility: fade-out for smooth barge-in
   ================================================================ */
export function fadeOutAudioSource(
    source: AudioBufferSourceNode,
    audioContext: AudioContext,
    duration: number = 0.05
): GainNode {
    const gainNode = audioContext.createGain();
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);

    return gainNode;
}

/* ================================================================
   Utility: enumerate audio input devices
   ================================================================ */
export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput');
}
