import React, { useState } from 'react';
import { AppView } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface InstructorLoginViewProps {
    onLogin: () => void;
    onBack: () => void;
}

export const InstructorLoginView: React.FC<InstructorLoginViewProps> = ({ onLogin, onBack }) => {
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const INSTRUCTOR_CODE = import.meta.env.VITE_INSTRUCTOR_CODE || '1234';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validate email
        if (!email.trim() || !email.includes('@')) {
            setError('Please enter a valid email address.');
            return;
        }

        setIsLoading(true);

        // Simulate network delay for better UX
        await new Promise(resolve => setTimeout(resolve, 300));

        if (code === INSTRUCTOR_CODE) {
            // Store instructor session AND user email for course ownership
            sessionStorage.setItem('speakwise_instructor', 'true');
            localStorage.setItem('speakwise_user', JSON.stringify({
                id: 'instructor_' + Date.now(),
                email: email.trim().toLowerCase(),
                displayName: email.split('@')[0],
                role: 'instructor'
            }));
            onLogin();
        } else {
            setError('Invalid instructor code. Please try again.');
            setCode('');
        }

        setIsLoading(false);
    };

    return (
        <div className="glass-container min-h-screen flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-md animate-slide-in-up">
                {/* Back Button */}
                <button
                    onClick={onBack}
                    className="mb-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                    aria-label="Go back"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span>Back to Home</span>
                </button>

                {/* Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
                        <span className="text-3xl">👨‍🏫</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Instructor Portal</h1>
                    <p className="text-slate-400">Enter your instructor code to access the dashboard</p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-3xl space-y-6">
                    <div>
                        <label htmlFor="instructor-email" className="block text-sm font-medium text-slate-300 mb-2">
                            Your Email
                        </label>
                        <Input
                            id="instructor-email"
                            type="email"
                            placeholder="you@university.edu"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="text-center"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label htmlFor="instructor-code" className="block text-sm font-medium text-slate-300 mb-2">
                            Instructor Code
                        </label>
                        <Input
                            id="instructor-code"
                            type="password"
                            placeholder="Enter 4-digit code"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            maxLength={8}
                            className="text-center text-xl tracking-widest"
                            aria-describedby={error ? 'error-message' : undefined}
                        />
                    </div>

                    {error && (
                        <div
                            id="error-message"
                            className="text-red-400 text-sm text-center p-3 bg-red-500/10 rounded-xl border border-red-500/20 animate-shake"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="accent"
                        className="w-full"
                        disabled={!code.trim() || isLoading}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="spinner w-5 h-5" />
                                Verifying...
                            </span>
                        ) : (
                            'Access Dashboard'
                        )}
                    </Button>
                </form>

                {/* Help Text */}
                <p className="text-center text-slate-600 text-sm mt-6">
                    Contact your administrator if you've forgotten your code
                </p>
            </div>
        </div>
    );
};
