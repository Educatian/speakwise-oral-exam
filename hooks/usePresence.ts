import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface PresenceState {
    studentName: string;
    joinedAt: number;
}

interface UsePresenceReturn {
    /** Number of OTHER students currently in this course's interview */
    peerCount: number;
    /** Whether presence tracking is active */
    isTracking: boolean;
}

/**
 * usePresence Hook
 * Tracks how many students are currently in an interview session for the same course.
 * Uses Supabase Realtime Presence — no DB table needed.
 * 
 * Fail-safe: if Supabase isn't configured or channel fails, returns peerCount=0 silently.
 */
export function usePresence(courseId: string, studentName: string, isActive: boolean): UsePresenceReturn {
    const [peerCount, setPeerCount] = useState(0);
    const [isTracking, setIsTracking] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    useEffect(() => {
        // Guard: don't track if not active or not configured
        if (!isActive || !courseId || !isSupabaseConfigured()) {
            setPeerCount(0);
            setIsTracking(false);
            return;
        }

        const channelName = `presence:interview:${courseId}`;

        try {
            const channel = supabase.channel(channelName, {
                config: { presence: { key: studentName || 'anonymous' } }
            });

            channel
                .on('presence', { event: 'sync' }, () => {
                    const state = channel.presenceState<PresenceState>();
                    // Count unique keys (each student = one key), minus self
                    const allKeys = Object.keys(state);
                    const others = allKeys.filter(k => k !== (studentName || 'anonymous'));
                    setPeerCount(others.length);
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.track({
                            studentName: studentName || 'Anonymous',
                            joinedAt: Date.now()
                        });
                        setIsTracking(true);
                    }
                });

            channelRef.current = channel;
        } catch (err) {
            console.warn('[Presence] Failed to initialize:', err);
            setIsTracking(false);
        }

        return () => {
            if (channelRef.current) {
                try {
                    channelRef.current.untrack();
                    supabase.removeChannel(channelRef.current);
                } catch (e) { /* cleanup silently */ }
                channelRef.current = null;
            }
            setPeerCount(0);
            setIsTracking(false);
        };
    }, [courseId, studentName, isActive]);

    return { peerCount, isTracking };
}
