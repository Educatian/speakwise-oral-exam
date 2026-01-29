import React, { useState, useEffect, useRef } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import { verifyPin, isRateLimited, recordFailedAttempt, getRemainingLockoutTime, clearRateLimit } from '../../lib/utils/pinHash';

interface PinVerifyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerified: () => void;
    courseId: string;
    courseName: string;
    instructorPinHash: string;
    title?: string;
    description?: string;
}

export const PinVerifyModal: React.FC<PinVerifyModalProps> = ({
    isOpen,
    onClose,
    onVerified,
    courseId,
    courseName,
    instructorPinHash,
    title = 'Instructor PIN Required',
    description = 'Enter your 4-digit PIN to access this course\'s data.'
}) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [lockoutSeconds, setLockoutSeconds] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Check for rate limiting on mount
    useEffect(() => {
        if (isOpen) {
            const remaining = getRemainingLockoutTime(courseId);
            setLockoutSeconds(remaining);
            setPin('');
            setError('');
        }
    }, [isOpen, courseId]);

    // Countdown timer for lockout
    useEffect(() => {
        if (lockoutSeconds > 0) {
            const timer = setTimeout(() => setLockoutSeconds(lockoutSeconds - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [lockoutSeconds]);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen && !lockoutSeconds && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen, lockoutSeconds]);

    const handleVerify = async () => {
        if (isRateLimited(courseId)) {
            setLockoutSeconds(getRemainingLockoutTime(courseId));
            return;
        }

        setError('');
        setIsVerifying(true);

        try {
            const isValid = await verifyPin(pin, courseId, instructorPinHash);

            if (isValid) {
                clearRateLimit(courseId);
                onVerified();
                onClose();
            } else {
                const remaining = recordFailedAttempt(courseId);
                if (remaining === 0) {
                    setLockoutSeconds(getRemainingLockoutTime(courseId));
                    setError('Too many failed attempts. Please wait.');
                } else {
                    setError(`Incorrect PIN. ${remaining} attempts remaining.`);
                }
                setPin('');
            }
        } catch (e) {
            setError('Verification failed. Please try again.');
        } finally {
            setIsVerifying(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && pin.length === 4) {
            handleVerify();
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="text-center space-y-6">
                {/* Icon */}
                <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>

                {/* Title */}
                <div>
                    <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                    <p className="text-slate-400 text-sm">{description}</p>
                    <p className="text-indigo-400 text-sm mt-1 font-medium">{courseName}</p>
                </div>

                {/* Lockout Message */}
                {lockoutSeconds > 0 ? (
                    <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
                        <p className="text-red-400 text-sm">
                            Too many failed attempts. Try again in{' '}
                            <span className="font-mono font-bold">{formatTime(lockoutSeconds)}</span>
                        </p>
                    </div>
                ) : (
                    <>
                        {/* PIN Input */}
                        <div className="space-y-4">
                            <Input
                                ref={inputRef}
                                type="password"
                                placeholder="Enter 4-digit PIN"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                onKeyDown={handleKeyDown}
                                maxLength={4}
                                className="text-center text-2xl tracking-[0.5em] font-mono"
                                aria-label="Instructor PIN"
                                disabled={isVerifying}
                            />

                            {error && (
                                <div
                                    role="alert"
                                    aria-live="assertive"
                                    className="text-red-400 text-sm p-3 bg-red-500/10 rounded-xl animate-shake"
                                >
                                    {error}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button variant="ghost" onClick={onClose} className="flex-1">
                                Cancel
                            </Button>
                            <Button
                                variant="accent"
                                onClick={handleVerify}
                                disabled={pin.length !== 4 || isVerifying}
                                className="flex-1"
                            >
                                {isVerifying ? (
                                    <span className="flex items-center gap-2">
                                        <span className="spinner w-4 h-4" />
                                        Verifying...
                                    </span>
                                ) : (
                                    'Verify PIN'
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};
