import React, { useState, useEffect } from 'react';
import { Button, Input } from '../ui';
import { Institution } from '../../types';

interface UnifiedAuthViewProps {
    onAuthSuccess: (user: { id: string; email: string; displayName: string; role: 'student' | 'instructor' }) => void;
    onBack: () => void;
    defaultRole?: 'student' | 'instructor';
    institutions: Institution[];
    signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signUp: (
        email: string,
        password: string,
        displayName: string,
        role: 'student' | 'instructor',
        schoolId?: string,
        schoolName?: string
    ) => Promise<{ success: boolean; error?: string }>;
    resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

/**
 * Unified Auth View
 * Single screen for Sign In, Sign Up, and Password Reset
 * Optimized 3-step flow following UX best practices
 */
export const UnifiedAuthView: React.FC<UnifiedAuthViewProps> = ({
    onAuthSuccess,
    onBack,
    defaultRole = 'student',
    institutions,
    signIn,
    signUp,
    resetPassword
}) => {
    const [mode, setMode] = useState<AuthMode>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
    const [role, setRole] = useState<'student' | 'instructor'>(defaultRole);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    // Clear messages when mode changes
    useEffect(() => {
        setError('');
        setSuccessMessage('');
    }, [mode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsLoading(true);

        try {
            if (mode === 'forgot') {
                if (!email) {
                    setError('Please enter your email address');
                    return;
                }
                const result = await resetPassword(email);
                if (!result.success) {
                    setError(result.error || 'Failed to send reset email');
                    return;
                }
                setSuccessMessage('Check your email for reset instructions. Don\'t forget to check spam folder!');
                return;
            }

            if (mode === 'signup') {
                if (!firstName.trim()) {
                    setError('Please enter your first name');
                    return;
                }
                if (!lastName.trim()) {
                    setError('Please enter your last name');
                    return;
                }
                if (!selectedInstitutionId) {
                    setError('Please select your institution');
                    return;
                }
                if (password.length < 6) {
                    setError('Password must be at least 6 characters');
                    return;
                }
                if (password !== confirmPassword) {
                    setError('Passwords do not match');
                    return;
                }
            }

            if (!email || !password) {
                setError('Please enter email and password');
                return;
            }

            if (mode === 'signup') {
                const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
                const selectedInstitution = institutions.find((institution) => institution.id === selectedInstitutionId);
                const result = await signUp(
                    email,
                    password,
                    displayName,
                    'student',
                    selectedInstitution?.id,
                    selectedInstitution?.name
                );

                if (!result.success) {
                    setError(result.error || 'Account creation failed. Please try again.');
                    return;
                }

                onAuthSuccess({
                    id: `signup_${Date.now()}`,
                    email,
                    displayName,
                    role: 'student'
                });
                return;
            }

            const signInResult = await signIn(email, password);
            if (!signInResult.success) {
                setError(signInResult.error || 'Authentication failed. Please try again.');
                return;
            }

            onAuthSuccess({
                id: `signin_${Date.now()}`,
                email,
                displayName: email.split('@')[0],
                role
            });

        } catch (err) {
            setError('Authentication failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const getTitle = () => {
        switch (mode) {
            case 'signup': return 'Create Account';
            case 'forgot': return 'Reset Password';
            default: return 'Welcome Back';
        }
    };

    const getSubtitle = () => {
        switch (mode) {
            case 'signup': return 'Join SpeakWise to start your oral exam practice';
            case 'forgot': return 'Enter your email to receive reset instructions';
            default: return 'Sign in to continue your learning journey';
        }
    };

    return (
        <div className="w-full max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-400 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20">
                    <span className="text-white text-2xl font-black italic">W</span>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">{getTitle()}</h2>
                <p className="text-slate-400 text-sm">{getSubtitle()}</p>
            </div>

            {/* Auth Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Info: Sign Up is for students only */}
                {mode === 'signup' && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm mb-4">
                        🎓 Student Registration
                        <p className="text-xs text-emerald-300/70 mt-1">
                            Instructors: Please use Sign In with your provided credentials.
                        </p>
                    </div>
                )}

                {/* Name Fields (Sign Up only) */}
                {mode === 'signup' && (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="firstName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    First Name
                                </label>
                                <Input
                                    id="firstName"
                                    type="text"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    placeholder="John"
                                    autoComplete="given-name"
                                    disabled={isLoading}
                                />
                            </div>
                            <div>
                                <label htmlFor="lastName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    Last Name
                                </label>
                                <Input
                                    id="lastName"
                                    type="text"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    placeholder="Doe"
                                    autoComplete="family-name"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <div>
                            <label htmlFor="institution" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Institution
                            </label>
                            <select
                                id="institution"
                                value={selectedInstitutionId}
                                onChange={(e) => setSelectedInstitutionId(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                                disabled={isLoading}
                            >
                                <option value="">Select your institution</option>
                                {institutions
                                    .filter((institution) => institution.id !== 'guest')
                                    .map((institution) => (
                                        <option key={institution.id} value={institution.id}>
                                            {institution.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </>
                )}

                {/* Email Field */}
                <div>
                    <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Email Address
                    </label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        disabled={isLoading}
                    />
                </div>

                {/* Password Field (not for forgot) */}
                {mode !== 'forgot' && (
                    <div>
                        <label htmlFor="password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Password
                        </label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? '👁️' : '👁️‍🗨️'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Confirm Password (Sign Up only) */}
                {mode === 'signup' && (
                    <div>
                        <label htmlFor="confirmPassword" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Confirm Password
                        </label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            disabled={isLoading}
                        />
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
                        ⚠️ {error}
                    </div>
                )}

                {/* Success Message */}
                {successMessage && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm" role="status">
                        ✅ {successMessage}
                    </div>
                )}

                {/* Submit Button */}
                <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Processing...
                        </span>
                    ) : (
                        mode === 'signin' ? 'Sign In' :
                            mode === 'signup' ? 'Create Account' :
                                'Send Reset Link'
                    )}
                </Button>

                {/* Forgot Password Link (Sign In only) */}
                {mode === 'signin' && (
                    <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="w-full text-center text-sm text-slate-500 hover:text-emerald-400 transition-colors"
                    >
                        Forgot your password?
                    </button>
                )}
            </form>

            {/* Mode Switch */}
            <div className="mt-6 pt-6 border-t border-slate-800 text-center">
                {mode === 'signin' && (
                    <p className="text-slate-500 text-sm">
                        Don't have an account?{' '}
                        <button
                            onClick={() => setMode('signup')}
                            className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                        >
                            Sign Up →
                        </button>
                    </p>
                )}
                {mode === 'signup' && (
                    <p className="text-slate-500 text-sm">
                        Already have an account?{' '}
                        <button
                            onClick={() => setMode('signin')}
                            className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                        >
                            Sign In →
                        </button>
                    </p>
                )}
                {mode === 'forgot' && (
                    <p className="text-slate-500 text-sm">
                        Remember your password?{' '}
                        <button
                            onClick={() => setMode('signin')}
                            className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                        >
                            Back to Sign In →
                        </button>
                    </p>
                )}
            </div>

            {/* Back Button */}
            <div className="mt-6 text-center">
                <button
                    onClick={onBack}
                    className="text-slate-600 hover:text-slate-400 text-sm transition-colors"
                >
                    ← Back to Home
                </button>
            </div>
        </div>
    );
};

export default UnifiedAuthView;
