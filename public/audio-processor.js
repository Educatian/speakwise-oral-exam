/**
 * Audio Processor Worklet
 * High-performance audio processing using AudioWorklet API
 * Replaces deprecated ScriptProcessorNode
 */
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Noise floor calibration
        this.noiseFloor = 0;
        this.noiseCalibrated = false;
        this.calibrationFrames = 0;
        this.calibrationSum = 0;
        this.calibrationSamples = 50; // ~1 second at 128 samples per frame

        // Adaptive threshold
        this.adaptiveThreshold = 0.02; // Will be adjusted based on noise floor

        // Resampling state for linear interpolation
        this.resampleRatio = sampleRate / 16000;
        this.lastSample = 0;
        this.fractionalIndex = 0;
    }

    /**
     * Calculate RMS of audio buffer
     */
    calculateRMS(buffer) {
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / buffer.length);
    }

    /**
     * Linear interpolation resampling (better quality than point sampling)
     */
    resampleLinear(inputBuffer) {
        const outputLength = Math.ceil(inputBuffer.length / this.resampleRatio);
        const output = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const srcIndex = i * this.resampleRatio;
            const srcIndexFloor = Math.floor(srcIndex);
            const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
            const fraction = srcIndex - srcIndexFloor;

            // Linear interpolation
            output[i] = inputBuffer[srcIndexFloor] * (1 - fraction) +
                inputBuffer[srcIndexCeil] * fraction;
        }

        return output;
    }

    /**
     * Convert Float32Array to Int16 PCM
     */
    float32ToInt16(buffer) {
        const int16 = new Int16Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            // Clamp to prevent overflow
            const clamped = Math.max(-1, Math.min(1, buffer[i]));
            int16[i] = clamped * 32767;
        }
        return int16;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const channelData = input[0];
        const rms = this.calculateRMS(channelData);

        // Calibrate noise floor during first ~1 second
        if (!this.noiseCalibrated) {
            this.calibrationSum += rms;
            this.calibrationFrames++;

            if (this.calibrationFrames >= this.calibrationSamples) {
                this.noiseFloor = this.calibrationSum / this.calibrationFrames;
                // Set threshold to 3x noise floor (with minimum)
                this.adaptiveThreshold = Math.max(0.015, this.noiseFloor * 3);
                this.noiseCalibrated = true;

                this.port.postMessage({
                    type: 'calibration',
                    noiseFloor: this.noiseFloor,
                    threshold: this.adaptiveThreshold
                });
            }
        }

        // Calculate normalized audio level (0-100)
        const normalizedLevel = Math.min(100, Math.round(rms * 500));

        // Detect voice activity using adaptive threshold
        const isSpeaking = rms > this.adaptiveThreshold;

        // Resample using linear interpolation
        const resampled = this.resampleLinear(channelData);
        const pcmInt16 = this.float32ToInt16(resampled);

        // Send data to main thread
        this.port.postMessage({
            type: 'audio',
            audioLevel: normalizedLevel,
            isSpeaking: isSpeaking,
            pcmData: pcmInt16.buffer
        }, [pcmInt16.buffer]); // Transfer buffer ownership

        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
