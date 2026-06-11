import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useAuth } from '../hooks';
import { AuthUser } from '../lib/supabase/auth';

/**
 * App-wide authentication state.
 *
 * Wraps the existing `useAuth` hook exactly ONCE at the app root so every
 * consumer shares the same session (the hook keeps its
 * `speakwise-auth-changed` event behavior untouched). Previously this state
 * was drilled App → AppRouter → views; now any view can read it directly.
 */

/** Shape handed to the auth-success flow after sign-in/sign-up. A subset of
 *  AuthUser: the auth views only know these fields at success time. */
export interface AuthSuccessUser {
    id: string;
    email: string;
    displayName: string;
    role: 'student' | 'instructor';
    profileRole?: string;
    schoolId?: string;
    schoolName?: string;
}

interface AuthContextValue {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    /** Session role bucket driving the auth flow UI (student vs instructor
     *  tab, post-login routing). Owned here so it is not drilled as a prop. */
    role: 'student' | 'instructor';
    setRole: (role: 'student' | 'instructor') => void;
    /** Raw, DB-backed user_profiles.role (e.g. 'admin'/'moderator') — the
     *  authority for admin gating (see lib/utils/adminAccess.ts). */
    profileRole: string | undefined;

    // Auth actions (pass-through from useAuth)
    signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signUp: (
        email: string,
        password: string,
        displayName: string,
        role: 'student' | 'instructor',
        schoolId?: string,
        schoolName?: string
    ) => Promise<{ success: boolean; error?: string }>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;

    // School management
    savedSchool: { schoolId: string; schoolName: string } | null;
    setSchool: (schoolId: string, schoolName: string) => Promise<void>;

    /**
     * Persist a successful sign-in/sign-up: resolves the freshest user record
     * (a persisted `speakwise_user` from the auth layer wins over the view's
     * snapshot), writes the session keys, and updates the session role.
     * Returns the resolved user so the caller can run navigation (which stays
     * in App — it is routing logic, not auth state).
     */
    completeAuthSuccess: (authUser: AuthSuccessUser) => AuthSuccessUser;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        user,
        isLoading,
        isAuthenticated,
        signUp,
        signIn,
        signOut,
        resetPassword,
        savedSchool,
        setSchool
    } = useAuth();

    const [role, setRole] = useState<'student' | 'instructor'>('student');

    const completeAuthSuccess = useCallback((authUser: AuthSuccessUser): AuthSuccessUser => {
        const storedUserRaw = localStorage.getItem('speakwise_user');
        const persistedUser = storedUserRaw ? (JSON.parse(storedUserRaw) as AuthSuccessUser) : null;
        const resolvedUser = persistedUser?.email ? persistedUser : authUser;

        setRole(resolvedUser.role);

        // Save user to localStorage for session persistence (critical for course ownership!)
        localStorage.setItem('speakwise_user', JSON.stringify({
            id: resolvedUser.id,
            email: resolvedUser.email.toLowerCase(),
            displayName: resolvedUser.displayName,
            role: resolvedUser.role,
            // Raw user_profiles.role (e.g. 'admin'/'moderator') — the DB-backed
            // authority that admin gating reads (see lib/utils/adminAccess.ts).
            profileRole: resolvedUser.profileRole,
            schoolId: resolvedUser.schoolId,
            schoolName: resolvedUser.schoolName
        }));

        // Instructor also gets session marker
        if (resolvedUser.role === 'instructor') {
            sessionStorage.setItem('speakwise_instructor', 'true');
        }

        return resolvedUser;
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        user,
        isAuthenticated,
        isLoading,
        role,
        setRole,
        profileRole: user?.profileRole,
        signIn,
        signUp,
        signOut,
        resetPassword,
        savedSchool,
        setSchool,
        completeAuthSuccess
    }), [
        user,
        isAuthenticated,
        isLoading,
        role,
        signIn,
        signUp,
        signOut,
        resetPassword,
        savedSchool,
        setSchool,
        completeAuthSuccess
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/** Access the app-wide auth state. Must be used inside <AuthProvider>. */
export function useAuthContext(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuthContext must be used within an <AuthProvider>. Wrap your component tree (see App.tsx).');
    }
    return ctx;
}

export default AuthContext;
