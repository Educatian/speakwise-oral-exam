import React, { useState, useRef, useEffect, useCallback } from 'react';

interface MicTestProps {
    className?: string;
    onDeviceSelect?: (deviceId: string) => void;
}

/**
 * Pro-Grade Microphone Test Component
 * ────────────────────────────────────
 * - Real-time 8-band frequency spectrum
 * - Peak / clipping indicator (> -3 dBFS)
 * - Noise floor dB readout
 * - Audio latency display
 * - Device selection
 */
export const MicTest: React.FC<MicTestProps> = ({ className = '', onDeviceSelect }) => {
    const [isTesting, setIsTesting] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [deviceName, setDeviceName] = useState<string>('');

    // Pro features
    const [spectrumBands, setSpectrumBands] = useState<number[]>(Array(8).fill(0));
    const [peakDb, setPeakDb] = useState<number>(-60);
    const [isClipping, setIsClipping] = useState(false);
    const [noiseFloorDb, setNoiseFloorDb] = useState<number | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);

    // Device selection
    const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const clippingTimeoutRef = useRef<number | null>(null);

    // Enumerate audio devices on mount
    useEffect(() => {
        const enumerateDevices = async () => {
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => stream.getTracks().forEach(t => t.stop()));

                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(d => d.kind === 'audioinput');
                setAvailableDevices(audioInputs);

                if (audioInputs.length > 0 && !selectedDeviceId) {
                    setSelectedDeviceId(audioInputs[0].deviceId);
                }
            } catch (err) {
                console.error('Failed to enumerate devices:', err);
            }
        };

        enumerateDevices();
    }, []);

    const stopTest = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        analyserRef.current = null;
        setAudioLevel(0);
        setSpectrumBands(Array(8).fill(0));
        setPeakDb(-60);
        setIsClipping(false);
        setIsTesting(false);
    }, []);

    const startTest = useCallback(async () => {
        setError(null);

        try {
            const constraints: MediaStreamConstraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    // @ts-ignore
                    sampleRate: { ideal: 48000 },
                    ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {})
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            const audioTrack = stream.getAudioTracks()[0];
            setDeviceName(audioTrack.label || 'Unknown Microphone');

            const audioContext = new AudioContext({ latencyHint: 'interactive' });
            audioContextRef.current = audioContext;

            // Display latency
            const baseLatency = (audioContext.baseLatency || 0) * 1000;
            const outputLatency = ((audioContext as any).outputLatency || 0) * 1000;
            setLatencyMs(Math.round(baseLatency + outputLatency));

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.7;
            analyserRef.current = analyser;

            const source = audioContext.createMediaStreamSource(stream);

            // Add high-pass to mic test too
            const highPass = audioContext.createBiquadFilter();
            highPass.type = 'highpass';
            highPass.frequency.setValueAtTime(80, audioContext.currentTime);
            highPass.Q.setValueAtTime(0.707, audioContext.currentTime);

            source.connect(highPass);
            highPass.connect(analyser);

            setIsTesting(true);

            // Noise floor calibration (first 1 second)
            let calibrationFrames = 0;
            let calibrationSum = 0;

            const updateLevel = () => {
                if (!analyserRef.current) return;

                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyserRef.current.getByteFrequencyData(dataArray);

                // ── 8-band spectrum ──
                const bandSize = Math.floor(bufferLength / 8);
                const bands: number[] = [];
                for (let b = 0; b < 8; b++) {
                    let bandSum = 0;
                    const start = b * bandSize;
                    const end = Math.min(start + bandSize, bufferLength);
                    for (let i = start; i < end; i++) {
                        bandSum += dataArray[i];
                    }
                    bands.push(Math.min(100, Math.round((bandSum / bandSize) * 1.2)));
                }
                setSpectrumBands(bands);

                // ── Overall level ──
                const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
                const normalized = Math.min(100, Math.round(average * 1.5));
                setAudioLevel(normalized);

                // ── Peak detection (time-domain) ──
                const timeData = new Float32Array(bufferLength);
                analyserRef.current.getFloatTimeDomainData(timeData);
                let peak = 0;
                for (let i = 0; i < timeData.length; i++) {
                    const abs = Math.abs(timeData[i]);
                    if (abs > peak) peak = abs;
                }
                const currentPeakDb = peak > 0 ? 20 * Math.log10(peak) : -60;
                setPeakDb(Math.round(currentPeakDb * 10) / 10);

                // Clipping: peak > -3 dBFS
                if (currentPeakDb > -3) {
                    setIsClipping(true);
                    if (clippingTimeoutRef.current) clearTimeout(clippingTimeoutRef.current);
                    clippingTimeoutRef.current = window.setTimeout(() => setIsClipping(false), 800);
                }

                // ── Noise floor calibration ──
                if (calibrationFrames < 60) {
                    calibrationSum += peak > 0 ? currentPeakDb : -60;
                    calibrationFrames++;
                    if (calibrationFrames === 60) {
                        setNoiseFloorDb(Math.round(calibrationSum / calibrationFrames));
                    }
                }

                animationFrameRef.current = requestAnimationFrame(updateLevel);
            };

            updateLevel();

        } catch (err: any) {
            if (err.name === 'NotAllowedError') {
                setError('마이크 접근이 거부되었습니다. 브라우저 설정에서 허용해주세요.');
            } else if (err.name === 'NotFoundError') {
                setError('마이크를 찾을 수 없습니다. 연결 상태를 확인해주세요.');
            } else {
                setError('마이크 테스트 실패. 다시 시도해주세요.');
            }
            console.error('Mic test error:', err);
        }
    }, [selectedDeviceId]);

    useEffect(() => {
        return () => {
            stopTest();
        };
    }, [stopTest]);

    const handleToggle = () => {
        if (isTesting) {
            stopTest();
        } else {
            startTest();
        }
    };

    // Level color
    const getLevelColor = () => {
        if (isClipping) return 'var(--mic-clip, #ef4444)';
        if (audioLevel < 20) return 'var(--mic-low, #475569)';
        if (audioLevel < 50) return 'var(--mic-good, #10b981)';
        if (audioLevel < 80) return 'var(--mic-warm, #f59e0b)';
        return 'var(--mic-hot, #ef4444)';
    };

    const getLevelText = () => {
        if (!isTesting) return 'Click to test';
        if (isClipping) return '⚠️ Clipping! Move back';
        if (audioLevel < 10) return '🔇 No sound detected';
        if (audioLevel < 30) return '🔈 Low — speak louder';
        if (audioLevel < 60) return '🔊 Good!';
        if (audioLevel < 80) return '🔊 Great!';
        return '📢 Too loud!';
    };

    const getBandColor = (value: number) => {
        if (value < 30) return '#334155';
        if (value < 60) return '#10b981';
        if (value < 85) return '#f59e0b';
        return '#ef4444';
    };

    return (
        <div className={`mic-test-container ${className}`} style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            borderRadius: '12px',
            padding: '16px',
            backdropFilter: 'blur(8px)',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🎤</span>
                    <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 600 }}>Microphone Test</span>
                    {isTesting && (
                        <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: isClipping ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: isClipping ? '#f87171' : '#34d399',
                            fontWeight: 600,
                        }}>
                            {isClipping ? 'CLIP' : 'LIVE'}
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleToggle}
                    style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        background: isTesting ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                        color: isTesting ? '#f87171' : '#818cf8',
                    }}
                >
                    {isTesting ? 'Stop' : 'Test Mic'}
                </button>
            </div>

            {/* Device Selector */}
            {availableDevices.length > 1 && (
                <div style={{ marginBottom: '12px' }}>
                    <select
                        value={selectedDeviceId}
                        onChange={(e) => {
                            setSelectedDeviceId(e.target.value);
                            onDeviceSelect?.(e.target.value);
                            if (isTesting) stopTest();
                        }}
                        disabled={isTesting}
                        style={{
                            width: '100%',
                            background: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            color: '#cbd5e1',
                            outline: 'none',
                            opacity: isTesting ? 0.5 : 1,
                        }}
                    >
                        {availableDevices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${availableDevices.indexOf(device) + 1}`}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* 8-Band Spectrum Visualizer */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: '3px',
                height: '48px',
                marginBottom: '8px',
                padding: '4px 8px',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '8px',
            }}>
                {spectrumBands.map((value, i) => (
                    <div
                        key={i}
                        style={{
                            width: '10%',
                            maxWidth: '24px',
                            height: `${Math.max(4, value * 0.44)}px`,
                            borderRadius: '2px',
                            background: isTesting ? getBandColor(value) : '#1e293b',
                            transition: 'height 80ms ease-out, background 150ms',
                        }}
                    />
                ))}
            </div>

            {/* Overall Level Bar */}
            <div style={{
                height: '6px',
                background: '#0f172a',
                borderRadius: '3px',
                overflow: 'hidden',
                marginBottom: '8px',
            }}>
                <div
                    style={{
                        height: '100%',
                        width: `${audioLevel}%`,
                        background: getLevelColor(),
                        borderRadius: '3px',
                        transition: 'width 75ms ease-out',
                    }}
                />
            </div>

            {/* Status + Info Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                    fontSize: '11px',
                    color: isTesting && audioLevel > 20 ? '#34d399' : '#64748b',
                    fontWeight: 500,
                }}>
                    {getLevelText()}
                </span>

                {isTesting && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Peak dB */}
                        <span style={{
                            fontSize: '10px',
                            fontFamily: 'monospace',
                            color: peakDb > -3 ? '#f87171' : '#64748b',
                            fontWeight: peakDb > -3 ? 700 : 400,
                        }}>
                            {peakDb > -60 ? `${peakDb.toFixed(1)} dB` : '—'}
                        </span>

                        {/* Noise Floor */}
                        {noiseFloorDb !== null && (
                            <span style={{
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                color: '#475569',
                            }}>
                                NF:{noiseFloorDb}dB
                            </span>
                        )}

                        {/* Latency */}
                        {latencyMs !== null && (
                            <span style={{
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                color: '#475569',
                            }}>
                                {latencyMs}ms
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Device Name */}
            {isTesting && deviceName && (
                <div style={{
                    marginTop: '4px',
                    fontSize: '10px',
                    color: '#334155',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {deviceName}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '8px',
                }}>
                    <p style={{ color: '#f87171', fontSize: '11px', margin: 0 }}>{error}</p>
                </div>
            )}
        </div>
    );
};

export default MicTest;
