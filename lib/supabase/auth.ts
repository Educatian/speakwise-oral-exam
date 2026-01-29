/**
 * Supabase Authentication Module
 * Handles user sign up, sign in, password reset, and session management
 */

import { supabase, isSupabaseConfigured } from './client';
import type { User, Session, AuthError } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
    id: string;
    email: string;
    displayName: string;
    role: 'student' | 'instructor';
    schoolId?: string;
    schoolName?: string;
}

export interface AuthResult {
    success: boolean;
    user?: AuthUser;
    error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign up a new user
 */
export async function signUp(
    email: string,
    password: string,
    displayName: string,
    role: 'student' | 'instructor'
): Promise<AuthResult> {
    if (!isSupabaseConfigured()) {
        // Fallback for local development without Supabase
        const localUser: AuthUser = {
            id: `local_${Date.now()}`,
            email,
            displayName,
            role
        };
        localStorage.setItem('speakwise_user', JSON.stringify(localUser));
        return { success: true, user: localUser };
    }

    try {
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { display_name: displayName, role }
            }
        });

        if (authError) {
            return { success: false, error: authError.message };
        }

        if (!authData.user) {
            return { success: false, error: 'Failed to create user' };
        }

        // Create user profile
        const { error: profileError } = await supabase
            .from('user_profiles')
            .insert({
                id: authData.user.id,
                email,
                display_name: displayName,
                role
            });

        if (profileError) {
            console.error('Profile creation error:', profileError);
            // User was created but profile failed - still allow login
        }

        const user: AuthUser = {
            id: authData.user.id,
            email,
            displayName,
            role
        };

        return { success: true, user };
    } catch (error) {
        return { success: false, error: 'Sign up failed. Please try again.' };
    }
}

/**
 * Sign in existing user
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
    if (!isSupabaseConfigured()) {
        // Fallback for local development
        const stored = localStorage.getItem('speakwise_user');
        if (stored) {
            const user = JSON.parse(stored);
            if (user.email === email) {
                return { success: true, user };
            }
        }
        return { success: false, error: 'Invalid email or password' };
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return { success: false, error: error.message };
        }

        if (!data.user) {
            return { success: false, error: 'Sign in failed' };
        }

        // Get user profile
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        const user: AuthUser = {
            id: data.user.id,
            email: data.user.email || email,
            displayName: profile?.display_name || data.user.user_metadata?.display_name || email.split('@')[0],
            role: profile?.role || data.user.user_metadata?.role || 'student',
            schoolId: profile?.school_id,
            schoolName: profile?.school_name
        };

        return { success: true, user };
    } catch (error) {
        return { success: false, error: 'Sign in failed. Please try again.' };
    }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
    localStorage.removeItem('speakwise_user');
    localStorage.removeItem('speakwise_school');

    if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
    }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string): Promise<AuthResult> {
    if (!isSupabaseConfigured()) {
        return { success: false, error: 'Password reset requires Supabase configuration' };
    }

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
        });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to send reset email' };
    }
}

/**
 * Get current session user
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
    // Check local storage first
    const stored = localStorage.getItem('speakwise_user');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            localStorage.removeItem('speakwise_user');
        }
    }

    if (!isSupabaseConfigured()) {
        return null;
    }

    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
            return null;
        }

        const { data: profile } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        return {
            id: session.user.id,
            email: session.user.email || '',
            displayName: profile?.display_name || session.user.user_metadata?.display_name || '',
            role: profile?.role || 'student',
            schoolId: profile?.school_id,
            schoolName: profile?.school_name
        };
    } catch {
        return null;
    }
}

/**
 * Update user's school selection
 */
export async function updateUserSchool(userId: string, schoolId: string, schoolName: string): Promise<boolean> {
    // Always save to localStorage for persistence
    localStorage.setItem('speakwise_school', JSON.stringify({ schoolId, schoolName }));

    if (!isSupabaseConfigured()) {
        return true;
    }

    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({ school_id: schoolId, school_name: schoolName })
            .eq('id', userId);

        return !error;
    } catch {
        return false;
    }
}

/**
 * Get saved school from localStorage
 */
export function getSavedSchool(): { schoolId: string; schoolName: string } | null {
    const stored = localStorage.getItem('speakwise_school');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }
    return null;
}

export default {
    signUp,
    signIn,
    signOut,
    resetPassword,
    getCurrentUser,
    updateUserSchool,
    getSavedSchool
};
