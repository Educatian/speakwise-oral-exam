/**
 * Authentication module — backed by Supabase Auth.
 *
 * SpeakWise previously used app-managed auth (a custom `app_users` table +
 * client-supplied identity), which left `auth.uid()` null and meant the
 * institution-scoped RLS policies never fired. This module switches to real
 * Supabase Auth so `auth.uid()` / `auth.email()` are populated and the existing
 * scoped policies (see supabase/production_schema.sql) actually enforce
 * isolation.
 *
 * The exported surface (AuthUser, signUp/signIn/signOut/resetPassword,
 * getCurrentUser, updateUserSchool, getSavedSchool, getAuthEventName) is kept
 * identical so useAuth.ts and the views do not need to change.
 *
 * Authoritative role/school live in `public.user_profiles` (created by the
 * `handle_new_user` trigger on signup, with instructor role gated by the
 * `instructors` whitelist — a self-claimed role at signup is NOT trusted).
 */

import { supabase, isSupabaseConfigured } from './client';

const SCHOOL_STORAGE_KEY = 'speakwise_school';
const AUTH_EVENT_NAME = 'speakwise-auth-changed';

export interface AuthUser {
    id: string;
    email: string;
    displayName: string;
    /** UI-facing role bucket (admin/moderator collapse into 'instructor'). */
    role: 'student' | 'instructor';
    /** Raw, DB-backed user_profiles.role ('student' | 'instructor' |
     *  'moderator' | 'admin'). This — not any hardcoded email list — is the
     *  authority for admin gating when Supabase is configured. Undefined when
     *  the profile row was not readable (treat as non-admin). */
    profileRole?: string;
    schoolId?: string;
    schoolName?: string;
}

export interface AuthResult {
    success: boolean;
    user?: AuthUser;
    error?: string;
}

function emitAuthChanged(): void {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(AUTH_EVENT_NAME));
    }
}

export function getAuthEventName(): string {
    return AUTH_EVENT_NAME;
}

function normalizeRole(role: string | undefined | null): 'student' | 'instructor' {
    return role === 'instructor' || role === 'admin' || role === 'moderator'
        ? 'instructor'
        : 'student';
}

const NOT_CONFIGURED: AuthResult = {
    success: false,
    error: 'Authentication is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
};

interface ProfileRow {
    id: string;
    email: string;
    display_name: string;
    role: string;
    school_id: string | null;
    school_name: string | null;
}

/**
 * Build an AuthUser from the Supabase session user plus the authoritative
 * user_profiles row. Falls back to auth metadata if the profile row is not yet
 * readable (e.g. immediately after signup before the trigger commits).
 */
async function buildAuthUser(authUserId: string, email: string, metadata: Record<string, any>): Promise<AuthUser> {
    let profile: ProfileRow | null = null;
    try {
        const { data } = await supabase
            .from('user_profiles')
            .select('id,email,display_name,role,school_id,school_name')
            .eq('id', authUserId)
            .single();
        profile = (data as ProfileRow) || null;
    } catch {
        profile = null;
    }

    return {
        id: authUserId,
        email: profile?.email || email,
        displayName: profile?.display_name || metadata.display_name || metadata.displayName || email,
        role: normalizeRole(profile?.role ?? metadata.role),
        // Only the authoritative profile row may claim elevated roles —
        // signup metadata is self-supplied and must not grant admin.
        profileRole: profile?.role || undefined,
        schoolId: profile?.school_id || metadata.school_id || undefined,
        schoolName: profile?.school_name || metadata.school_name || undefined
    };
}

function persistSchool(schoolId?: string, schoolName?: string): void {
    if (schoolId && schoolName) {
        localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify({ schoolId, schoolName }));
    }
}

export async function signUp(
    email: string,
    password: string,
    displayName: string,
    role: 'student' | 'instructor',
    schoolId?: string,
    schoolName?: string
): Promise<AuthResult> {
    if (!isSupabaseConfigured()) return NOT_CONFIGURED;

    const normalizedEmail = email.trim().toLowerCase();
    try {
        // Role/displayName/school are passed as user metadata; the
        // handle_new_user trigger consumes them to create the user_profiles row
        // (and gates instructor role against the instructors whitelist).
        const { data, error } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
                data: {
                    display_name: displayName,
                    role,
                    school_id: schoolId || null,
                    school_name: schoolName || null
                }
            }
        });

        if (error) return { success: false, error: error.message };

        // If email confirmation is enabled there is no session yet.
        if (!data.session || !data.user) {
            return {
                success: false,
                error: 'Account created. Please check your email to confirm before signing in.'
            };
        }

        persistSchool(schoolId, schoolName);
        const user = await buildAuthUser(data.user.id, normalizedEmail, data.user.user_metadata || {});
        emitAuthChanged();
        return { success: true, user };
    } catch {
        return { success: false, error: 'Account creation failed. Please try again.' };
    }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
    if (!isSupabaseConfigured()) return NOT_CONFIGURED;

    const normalizedEmail = email.trim().toLowerCase();
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password
        });

        if (error) return { success: false, error: 'Invalid email or password' };
        if (!data.user) return { success: false, error: 'Invalid email or password' };

        const user = await buildAuthUser(data.user.id, normalizedEmail, data.user.user_metadata || {});
        persistSchool(user.schoolId, user.schoolName);
        emitAuthChanged();
        return { success: true, user };
    } catch {
        return { success: false, error: 'Sign in failed. Please try again.' };
    }
}

export async function signOut(): Promise<void> {
    localStorage.removeItem(SCHOOL_STORAGE_KEY);
    if (isSupabaseConfigured()) {
        try {
            await supabase.auth.signOut();
        } catch {
            // Ignore network errors on sign-out; local session is cleared below.
        }
    }
    emitAuthChanged();
}

export async function resetPassword(email: string): Promise<AuthResult> {
    if (!isSupabaseConfigured()) return NOT_CONFIGURED;
    try {
        const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}` : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
        if (error) return { success: false, error: error.message };
        return { success: true };
    } catch {
        return { success: false, error: 'Could not send the reset email. Please try again.' };
    }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
    if (!isSupabaseConfigured()) return null;
    try {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session?.user) return null;
        return await buildAuthUser(session.user.id, session.user.email || '', session.user.user_metadata || {});
    } catch {
        return null;
    }
}

export async function updateUserSchool(_userId: string, schoolId: string, schoolName: string): Promise<boolean> {
    persistSchool(schoolId, schoolName);
    if (!isSupabaseConfigured()) {
        emitAuthChanged();
        return true;
    }

    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user?.id;
        if (!uid) {
            emitAuthChanged();
            return false;
        }

        // Update the authoritative profile (RLS: users update own profile)…
        const { error } = await supabase
            .from('user_profiles')
            .update({ school_id: schoolId, school_name: schoolName })
            .eq('id', uid);

        // …and mirror onto auth metadata so a fresh session reflects it too.
        await supabase.auth.updateUser({ data: { school_id: schoolId, school_name: schoolName } });

        emitAuthChanged();
        return !error;
    } catch {
        emitAuthChanged();
        return false;
    }
}

export function getSavedSchool(): { schoolId: string; schoolName: string } | null {
    const stored = localStorage.getItem(SCHOOL_STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }
    return null;
}

// Re-emit the app's auth-changed event whenever Supabase's session changes
// (sign-in, sign-out, token refresh) so useAuth refreshes without polling.
if (isSupabaseConfigured()) {
    supabase.auth.onAuthStateChange(() => {
        emitAuthChanged();
    });
}

export default {
    signUp,
    signIn,
    signOut,
    resetPassword,
    getCurrentUser,
    updateUserSchool,
    getSavedSchool,
    getAuthEventName
};
