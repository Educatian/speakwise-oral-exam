/**
 * useAuth Hook
 * Manages authentication state and provides auth functions
 */

import { useState, useEffect, useCallback } from 'react';
import {
    AuthUser,
    signUp as authSignUp,
    signIn as authSignIn,
    signOut as authSignOut,
    resetPassword as authResetPassword,
    getCurrentUser,
    updateUserSchool,
    getSavedSchool
} from '../lib/supabase/auth';

interface UseAuthReturn {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    // Auth actions
    signUp: (email: string, password: string, displayName: string, role: 'student' | 'instructor') => Promise<{ success: boolean; error?: string }>;
    signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;

    // School management
    savedSchool: { schoolId: string; schoolName: string } | null;
    setSchool: (schoolId: string, schoolName: string) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [savedSchool, setSavedSchool] = useState<{ schoolId: string; schoolName: string } | null>(null);

    // Load current user on mount
    useEffect(() => {
        async function loadUser() {
            setIsLoading(true);
            try {
                const currentUser = await getCurrentUser();
                setUser(currentUser);

                // Load saved school
                const school = getSavedSchool();
                setSavedSchool(school);
            } catch (error) {
                console.error('Failed to load user:', error);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        }

        loadUser();
    }, []);

    const signUp = useCallback(async (
        email: string,
        password: string,
        displayName: string,
        role: 'student' | 'instructor'
    ) => {
        setIsLoading(true);
        try {
            const result = await authSignUp(email, password, displayName, role);
            if (result.success && result.user) {
                setUser(result.user);
                // Save to localStorage for session persistence
                localStorage.setItem('speakwise_user', JSON.stringify(result.user));
            }
            return { success: result.success, error: result.error };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        setIsLoading(true);
        try {
            const result = await authSignIn(email, password);
            if (result.success && result.user) {
                setUser(result.user);
                localStorage.setItem('speakwise_user', JSON.stringify(result.user));

                // Load saved school
                const school = getSavedSchool();
                setSavedSchool(school);
            }
            return { success: result.success, error: result.error };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const signOut = useCallback(async () => {
        await authSignOut();
        setUser(null);
        setSavedSchool(null);
    }, []);

    const resetPassword = useCallback(async (email: string) => {
        const result = await authResetPassword(email);
        return { success: result.success, error: result.error };
    }, []);

    const setSchool = useCallback(async (schoolId: string, schoolName: string) => {
        if (user) {
            await updateUserSchool(user.id, schoolId, schoolName);
            setSavedSchool({ schoolId, schoolName });

            // Update user object with school info
            const updatedUser = { ...user, schoolId, schoolName };
            setUser(updatedUser);
            localStorage.setItem('speakwise_user', JSON.stringify(updatedUser));
        } else {
            // Save even without user for guest access
            localStorage.setItem('speakwise_school', JSON.stringify({ schoolId, schoolName }));
            setSavedSchool({ schoolId, schoolName });
        }
    }, [user]);

    return {
        user,
        isLoading,
        isAuthenticated: !!user,
        signUp,
        signIn,
        signOut,
        resetPassword,
        savedSchool,
        setSchool
    };
}

export default useAuth;
