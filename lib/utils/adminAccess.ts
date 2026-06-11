/**
 * Admin gating with a single source of truth.
 *
 * When Supabase IS configured, the DB-backed `user_profiles.role` (mirrored
 * onto the session as `profileRole` by lib/supabase/auth.ts and persisted in
 * the `speakwise_user` cache) is the ONLY authority: an account is admin iff
 * its profile role is 'admin'. The hardcoded ADMIN_EMAIL constant is never
 * consulted in that mode, so revoking the role in the DB actually revokes
 * access.
 *
 * When Supabase is NOT configured (local/demo mode there is no profile
 * table), ADMIN_EMAIL acts as the bootstrap fallback so the demo stays
 * usable.
 *
 * NOTE: this is a UI gate only. Real enforcement lives server-side (RLS +
 * SECURITY DEFINER RPCs that re-check is_admin_role()).
 */

import { isSupabaseConfigured } from '../supabase/client';
import { ADMIN_EMAIL, UserRole } from '../../types';

export interface AdminIdentity {
    email?: string | null;
    /** Raw user_profiles.role when known (AuthUser.profileRole). */
    profileRole?: string | null;
}

function readPersistedIdentity(): AdminIdentity | null {
    try {
        const stored = localStorage.getItem('speakwise_user');
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        return { email: parsed?.email ?? null, profileRole: parsed?.profileRole ?? null };
    } catch {
        return null;
    }
}

/**
 * Whether the current identity may see admin-only UI.
 * Pass what you have (email and/or profileRole); missing fields are filled
 * from the persisted session cache.
 */
export function isAdminIdentity(identity?: AdminIdentity | null): boolean {
    const persisted = readPersistedIdentity();
    const email = identity?.email ?? persisted?.email ?? null;
    const profileRole = identity?.profileRole ?? persisted?.profileRole ?? null;

    if (isSupabaseConfigured()) {
        // DB-backed role is the single source of truth. No email fallback:
        // a missing/foreign role means not admin, full stop.
        return profileRole === UserRole.ADMIN;
    }

    // Local/demo mode (no Supabase): bootstrap allowlist keeps the demo usable.
    return !!email && email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase();
}

export default isAdminIdentity;
