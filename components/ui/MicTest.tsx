import React, { useState, useRef, useEffect, useCallback } from 'react';

interface MicTestProps {
    className?: string;
}

/**
 * Microphone Test Component
 * Allows users to test their microphone setup before interviews
 */
export const MicTest: React.FC<MicTestProps> = ({ className = '' }) => {
    const [isTesting, setIsTesting] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [deviceName, setDeviceName] = useState<string>('');

    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const stopTest = useCallback(() => {
        // Stop animation frame
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        // Stop media stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        analyserRef.current = null;
        setAudioLevel(0);
        setIsTesting(false);
    }, []);

    const startTest = useCallback(async () => {
        setError(null);

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            streamRef.current = stream;

            // Get device name
            const audioTrack = stream.getAudioTracks()[0];
            setDeviceName(audioTrack.label || 'Unknown Microphone');

            // Set up audio analysis
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            setIsTesting(true);

            // Animation loop for audio level
            const updateLevel = () => {
                if (!analyserRef.current) return;

                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);

                // Calculate average volume
                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                const normalized = Math.min(100, Math.round(average * 1.5));
                setAudioLevel(normalized);

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
    }, []);

    // Cleanup on unmount
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

    // Get level color
    const getLevelColor = () => {
        if (audioLevel < 20) return 'bg-slate-600';
        if (audioLevel < 50) return 'bg-emerald-500';
        if (audioLevel < 80) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    const getLevelText = () => {
        if (!isTesting) return 'Click to test';
        if (audioLevel < 10) return '🔇 No sound detected';
        if (audioLevel < 30) return '🔈 Low - speak louder';
        if (audioLevel < 60) return '🔊 Good!';
        if (audioLevel < 80) return '🔊 Great!';
        return '📢 Too loud!';
    };

    return (
        <div className={`bg-slate-800/50 border border-slate-700 rounded-xl p-4 ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🎤</span>
                    <span className="text-slate-300 text-sm font-medium">Microphone Test</span>
                </div>
                <button
                    type="button"
                    onClick={handleToggle}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isTesting
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                            : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
                        }`}
                >
                    {isTesting ? 'Stop' : 'Test Mic'}
                </button>
            </div>

            {/* Audio Level Bar */}
            <div className="h-3 bg-slate-900 rounded-full overflow-hidden mb-2">
                <div
                    className={`h-full transition-all duration-75 ${getLevelColor()}`}
                    style={{ width: `${audioLevel}%` }}
                />
            </div>

            {/* Status Text */}
            <div className="flex items-center justify-between">
                <span className={`text-xs ${isTesting && audioLevel > 20 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {getLevelText()}
                </span>
                {isTesting && deviceName && (
                    <span className="text-xs text-slate-600 truncate max-w-[150px]" title={deviceName}>
                        {deviceName}
                    </span>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-red-400 text-xs">{error}</p>
                </div>
            )}
        </div>
    );
};

export default MicTest;
