/**
 * App-managed authentication module.
 * Supabase is used as a database only; session state is stored locally.
 */

import { supabase, isSupabaseConfigured } from './client';

const USER_STORAGE_KEY = 'speakwise_user';
const SCHOOL_STORAGE_KEY = 'speakwise_school';
const AUTH_EVENT_NAME = 'speakwise-auth-changed';

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

async function hashCredential(email: string, password: string): Promise<string> {
    const encoder = new TextEncoder();
    const payload = encoder.encode(`${email.trim().toLowerCase()}::${password}`);
    const digest = await crypto.subtle.digest('SHA-256', payload);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function persistUser(user: AuthUser, shouldEmit = true): void {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    if (user.schoolId && user.schoolName) {
        localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify({
            schoolId: user.schoolId,
            schoolName: user.schoolName
        }));
    }
    if (shouldEmit) {
        emitAuthChanged();
    }
}

function mapAppUser(record: any): AuthUser {
    return {
        id: record.id,
        email: record.email,
        displayName: record.display_name || record.displayName || record.email,
        role: normalizeRole(record.role),
        schoolId: record.school_id || record.schoolId || undefined,
        schoolName: record.school_name || record.schoolName || undefined
    };
}

async function fetchAppUserById(userId: string): Promise<AuthUser | null> {
    if (!isSupabaseConfigured()) {
        return null;
    }

    // app_users.email is column-grant-revoked from anon/authenticated, so
    // direct SELECT on email would fail. Go through the SECURITY DEFINER RPC.
    const { data, error } = await supabase.rpc('get_app_user_by_id', {
        user_id_input: userId
    });

    if (error) {
        return null;
    }
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) {
        return null;
    }
    return mapAppUser(record);
}

export async function signUp(
    email: string,
    password: string,
    displayName: string,
    role: 'student' | 'instructor',
    schoolId?: string,
    schoolName?: string
): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured()) {
        const localUser: AuthUser = {
            id: `local_${Date.now()}`,
            email: normalizedEmail,
            displayName,
            role,
            schoolId,
            schoolName
        };
        persistUser(localUser);
        return { success: true, user: localUser };
    }

    try {
        const id = crypto.randomUUID();
        const passwordHash = await hashCredential(normalizedEmail, password);

        const { data, error } = await supabase.rpc('register_app_user', {
            user_id_input: id,
            email_input: normalizedEmail,
            password_hash_input: passwordHash,
            display_name_input: displayName,
            role_input: role,
            school_id_input: schoolId || null,
            school_name_input: schoolName || null
        });

        if (error) {
            return { success: false, error: error.message };
        }

        const created = Array.isArray(data) ? data[0] : data;
        const user = mapAppUser(created || {
            id,
            email: normalizedEmail,
            display_name: displayName,
            role,
            school_id: schoolId,
            school_name: schoolName
        });

        persistUser(user);
        return { success: true, user };
    } catch (error) {
        return { success: false, error: 'Account creation failed. Please try again.' };
    }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured()) {
        const stored = localStorage.getItem(USER_STORAGE_KEY);
        if (stored) {
            const user = JSON.parse(stored);
            if (user.email === normalizedEmail) {
                return { success: true, user };
            }
        }
        return { success: false, error: 'Invalid email or password' };
    }

    try {
        const passwordHash = await hashCredential(normalizedEmail, password);
        const { data, error } = await supabase.rpc('authenticate_app_user', {
            email_input: normalizedEmail,
            password_hash_input: passwordHash
        });

        if (error) {
            return { success: false, error: error.message };
        }

        const matchedUser = Array.isArray(data) ? data[0] : data;
        if (!matchedUser?.id) {
            return { success: false, error: 'Invalid email or password' };
        }

        const user = mapAppUser(matchedUser);
        persistUser(user);
        return { success: true, user };
    } catch (error) {
        return { success: false, error: 'Sign in failed. Please try again.' };
    }
}

export async function signOut(): Promise<void> {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(SCHOOL_STORAGE_KEY);
    emitAuthChanged();
}

export async function resetPassword(_email: string): Promise<AuthResult> {
    return {
        success: true
    };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (!stored) {
        return null;
    }

    try {
        const parsed = JSON.parse(stored) as AuthUser;
        if (!parsed.id) {
            localStorage.removeItem(USER_STORAGE_KEY);
            return null;
        }

        const freshUser = await fetchAppUserById(parsed.id);
        if (freshUser) {
            persistUser(freshUser, false);
            return freshUser;
        }

        return parsed;
    } catch {
        localStorage.removeItem(USER_STORAGE_KEY);
        return null;
    }
}

export async function updateUserSchool(userId: string, schoolId: string, schoolName: string): Promise<boolean> {
    localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify({ schoolId, schoolName }));

    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored) as AuthUser;
            if (parsed.id === userId) {
                localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({
                    ...parsed,
                    schoolId,
                    schoolName
                }));
            }
        } catch {
            // Ignore corrupted local session and continue with persistence below.
        }
    }

    if (!isSupabaseConfigured()) {
        emitAuthChanged();
        return true;
    }

    try {
        const { error } = await supabase.rpc('update_app_user_school', {
            user_id_input: userId,
            school_id_input: schoolId,
            school_name_input: schoolName
        });

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
