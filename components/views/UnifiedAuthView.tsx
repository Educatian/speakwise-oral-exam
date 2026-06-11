import React, { useMemo, useState } from 'react';
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
    const [role, setRole] = useState<'student' | 'instructor'>(defaultRole);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const availableInstitutions = useMemo(
        () => institutions.filter((institution) => institution.id !== 'guest'),
        [institutions]
    );

    const selectedInstitution = availableInstitutions.find((institution) => institution.id === selectedInstitutionId);

    const getTitle = () => {
        if (mode === 'signup') return 'Create your student account';
        if (mode === 'forgot') return 'Reset your password';
        return role === 'instructor' ? 'Sign in to your instructor workspace' : 'Sign in to continue';
    };

    const getSubtitle = () => {
        if (mode === 'signup') return 'Join the correct institution workspace before entering your courses.';
        if (mode === 'forgot') return 'Password resets are handled by your institution or platform administrator in this deployment.';
        return role === 'instructor'
            ? 'Use your approved instructor account to manage courses and submissions.'
            : 'Access your institution, courses, and oral interview history.';
    };

    const resetMessages = () => {
        setError('');
        setSuccessMessage('');
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        resetMessages();
        setIsLoading(true);

        try {
            if (mode === 'forgot') {
                if (!email.trim()) {
                    setError('Enter the email address on your account so we know which reset to request.');
                    return;
                }

                const result = await resetPassword(email.trim());
                if (!result.success) {
                    setError(result.error || 'The reset request did not go through. Check the email address, or contact your institution administrator directly.');
                    return;
                }

                setSuccessMessage('Password reset requests are handled outside the app. Please contact your institution administrator.');
                return;
            }

            if (!email.trim() || !password) {
                setError('Enter both your email and password to continue.');
                return;
            }

            if (mode === 'signup') {
                if (!firstName.trim() || !lastName.trim()) {
                    setError('Add your first and last name — they become the display name your instructor sees.');
                    return;
                }

                if (!selectedInstitutionId) {
                    setError('Choose your institution from the list so your courses show up in the right workspace.');
                    return;
                }

                if (password.length < 6) {
                    setError('Use a password of at least 6 characters, then submit again.');
                    return;
                }

                if (password !== confirmPassword) {
                    setError('The two passwords do not match — re-enter the confirmation and try again.');
                    return;
                }

                const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
                const result = await signUp(
                    email.trim(),
                    password,
                    displayName,
                    'student',
                    selectedInstitution?.id,
                    selectedInstitution?.name
                );

                if (!result.success) {
                    setError(result.error || 'The account could not be created. Check your details and try again; if the email is already registered, sign in instead.');
                    return;
                }

                onAuthSuccess({
                    id: `signup_${Date.now()}`,
                    email: email.trim(),
                    displayName,
                    role: 'student'
                });
                return;
            }

            const result = await signIn(email.trim(), password);
            if (!result.success) {
                setError(result.error || 'That email and password did not match an account. Check both and try again; new students can create an account below.');
                return;
            }

            onAuthSuccess({
                id: `signin_${Date.now()}`,
                email: email.trim(),
                displayName: email.trim().split('@')[0],
                role
            });
        } catch (error) {
            console.error('[UnifiedAuth] request failed:', error);
            setError('Something interrupted the request before it finished. Check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 animate-fade-in">
            <section className="glass-panel rounded-3xl p-8 lg:p-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-800 bg-slate-900/60 mb-6">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-bold">
                        Access and onboarding
                    </span>
                </div>

                <h2 className="text-3xl font-bold text-white mb-3">{getTitle()}</h2>
                <p className="text-slate-400 text-sm leading-relaxed max-w-xl">{getSubtitle()}</p>

                <div className="mt-8">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-600 mb-3">
                        Workspace type
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setRole('student');
                                resetMessages();
                            }}
                            className={`rounded-2xl border p-4 text-left transition-all ${
                                role === 'student'
                                    ? 'border-emerald-500/40 bg-emerald-500/10'
                                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                            }`}
                        >
                            <p className="text-sm font-semibold text-white">Student</p>
                            <p className="text-xs text-slate-400 mt-1">Join an institution, access courses, complete interviews.</p>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setRole('instructor');
                                setMode('signin');
                                resetMessages();
                            }}
                            className={`rounded-2xl border p-4 text-left transition-all ${
                                role === 'instructor'
                                    ? 'border-indigo-500/40 bg-indigo-500/10'
                                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                            }`}
                        >
                            <p className="text-sm font-semibold text-white">Instructor</p>
                            <p className="text-xs text-slate-400 mt-1">Create institution-scoped courses and review submissions.</p>
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                    {mode === 'signup' && (
                        <>
                            <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                                <p className="text-sm text-emerald-300 font-medium">Student account setup</p>
                                <p className="text-xs text-emerald-100/70 mt-1">
                                    Instructor accounts should be provisioned by your institution or platform admin.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="firstName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        First name
                                    </label>
                                    <Input
                                        id="firstName"
                                        type="text"
                                        value={firstName}
                                        onChange={(event) => setFirstName(event.target.value)}
                                        placeholder="Jamie"
                                        autoComplete="given-name"
                                        disabled={isLoading}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="lastName" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Last name
                                    </label>
                                    <Input
                                        id="lastName"
                                        type="text"
                                        value={lastName}
                                        onChange={(event) => setLastName(event.target.value)}
                                        placeholder="Chen"
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
                                    onChange={(event) => setSelectedInstitutionId(event.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                                    disabled={isLoading}
                                >
                                    <option value="">Choose your institution</option>
                                    {availableInstitutions.map((institution) => (
                                        <option key={institution.id} value={institution.id}>
                                            {institution.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </>
                    )}

                    <div>
                        <label htmlFor="email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Email address
                        </label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="you@example.edu"
                            autoComplete="email"
                            disabled={isLoading}
                        />
                    </div>

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
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Enter your password"
                                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-xs"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>
                    )}

                    {mode === 'signup' && (
                        <div>
                            <label htmlFor="confirmPassword" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Confirm password
                            </label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                placeholder="Re-enter your password"
                                autoComplete="new-password"
                                disabled={isLoading}
                            />
                        </div>
                    )}

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm" role="alert">
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm" role="status">
                            {successMessage}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className="w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? 'Processing...' : (
                            mode === 'signin' ? 'Sign In' :
                            mode === 'signup' ? 'Create Account' :
                            'View Reset Guidance'
                        )}
                    </Button>

                    {mode === 'signin' && (
                        <button
                            type="button"
                            onClick={() => {
                                setMode('forgot');
                                resetMessages();
                            }}
                            className="w-full text-center text-sm text-slate-500 hover:text-emerald-400 transition-colors"
                        >
                            Forgot your password?
                        </button>
                    )}
                </form>

                <div className="mt-6 pt-6 border-t border-slate-800 text-center">
                    {mode === 'signin' && role === 'student' && (
                        <p className="text-slate-500 text-sm">
                            Need a student account?{' '}
                            <button
                                onClick={() => {
                                    setMode('signup');
                                    resetMessages();
                                }}
                                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                            >
                                Create one now
                            </button>
                        </p>
                    )}

                    {mode === 'signin' && role === 'instructor' && (
                        <p className="text-slate-500 text-sm">
                            Instructor access is managed by your institution. Use the account assigned to you.
                        </p>
                    )}

                    {mode === 'signup' && (
                        <p className="text-slate-500 text-sm">
                            Already have an account?{' '}
                            <button
                                onClick={() => {
                                    setMode('signin');
                                    resetMessages();
                                }}
                                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                            >
                                Sign in instead
                            </button>
                        </p>
                    )}

                    {mode === 'forgot' && (
                        <p className="text-slate-500 text-sm">
                            Remembered your password?{' '}
                            <button
                                onClick={() => {
                                    setMode('signin');
                                    resetMessages();
                                }}
                                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                            >
                                Back to sign in
                            </button>
                        </p>
                    )}
                </div>

                <div className="mt-6 text-center">
                    <button
                        onClick={onBack}
                        className="text-slate-600 hover:text-slate-400 text-sm transition-colors"
                    >
                        Back to home
                    </button>
                </div>
            </section>

            <aside className="glass-panel-light rounded-3xl p-8 lg:p-10">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-600 mb-4">
                    Deployment notes
                </p>
                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                        <p className="text-sm font-semibold text-white">Institution-aware access</p>
                        <p className="text-sm text-slate-400 mt-1">
                            Students join the correct workspace before courses become visible.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                        <p className="text-sm font-semibold text-white">Instructor-managed workspaces</p>
                        <p className="text-sm text-slate-400 mt-1">
                            Instructors sign in with approved accounts and manage institution-scoped courses.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                        <p className="text-sm font-semibold text-white">Cleaner rollout path</p>
                        <p className="text-sm text-slate-400 mt-1">
                            This setup supports campus-by-campus deployment without exposing the entire course catalog.
                        </p>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-600 mb-3">
                        Available institutions
                    </p>
                    {availableInstitutions.length > 0 ? (
                        <div className="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                            {availableInstitutions.map((institution) => (
                                <div
                                    key={institution.id}
                                    className={`rounded-2xl border px-4 py-3 transition-all ${
                                        selectedInstitutionId === institution.id
                                            ? 'border-emerald-500/40 bg-emerald-500/10'
                                            : 'border-slate-800 bg-slate-900/40'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-white">{institution.name}</p>
                                            {institution.domain && (
                                                <p className="text-xs text-slate-500 mt-1">{institution.domain}</p>
                                            )}
                                        </div>
                                        <span
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: institution.primaryColor || '#10b981' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <p className="text-sm font-semibold text-white">Institution list unavailable</p>
                            <p className="text-sm text-slate-400 mt-1">
                                Students can sign in once the institution directory is loaded from Supabase.
                            </p>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
};

export default UnifiedAuthView;
