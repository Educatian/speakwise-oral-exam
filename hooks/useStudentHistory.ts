import { useState, useEffect, useCallback, useRef } from 'react';
import { createRefreshController, listenForRefresh, upsertById } from '../utils/courseRefresh';
import { Submission } from '../types';
import {
    getStudentHistory,
    addToStudentHistory,
    isSupabaseConfigured
} from '../lib/supabase';
import { getAuthEventName } from '../lib/supabase/auth';

interface UseStudentHistoryReturn {
    history: Submission[];
    loading: boolean;
    error: string | null;
    addToHistory: (submission: Submission) => Promise<void>;
    clearHistory: () => void;
}

const STORAGE_KEY = 'speakwise_student_history';

/**
 * Custom hook for managing student interview history with Supabase
 * Falls back to localStorage if Supabase is not configured
 */
export function useStudentHistory(): UseStudentHistoryReturn {
    const [history, setHistory] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);

    const [error, setError] = useState<string | null>(null);
    const session = useRef(0);
    const refresh = useRef<{ invalidate: () => void } | null>(null);
    useEffect(() => {
        const controller = createRefreshController(getStudentHistory, value => {
            setHistory(value);
            setLoading(false);
            setError(null);
        }, error => {
            console.error('Failed to refresh student history:', error);
            setError('Failed to refresh student history. Please try again.');
            setLoading(false);
        });
        refresh.current = controller;
        void controller.refresh();
        const unlisten = listenForRefresh(getAuthEventName(), () => {
            if (isSupabaseConfigured()) void controller.refresh();
        }, () => {
            ++session.current;
            controller.invalidate();
            setHistory([]);
            setError(null);
            setLoading(true);
            void controller.refresh();
        });
        return () => {
            ++session.current;
            unlisten();
            controller.dispose();
            refresh.current = null;
        };
    }, []);

    // Persist to localStorage when history changes (fallback mode)
    useEffect(() => {
        if (!isSupabaseConfigured() && !loading) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
            } catch (e) {
                console.error('Failed to save history to localStorage:', e);
            }
        }
    }, [history, loading]);

    // Add a submission to history
    const addToHistory = useCallback(async (submission: Submission): Promise<void> => {
        const mutationSession = session.current;
        try {
            if (isSupabaseConfigured()) await addToStudentHistory(submission);
            if (mutationSession !== session.current) return;
            refresh.current?.invalidate();
            setLoading(false);
            setError(null);
            setHistory(prev => upsertById(prev, submission));
        } catch (e) {
            console.error('Failed to add to history:', e);
            if (mutationSession === session.current) setError('Failed to save student history. Please try again.');
            throw e;
        }
    }, []);

    // Clear local history (localStorage only for privacy)
    const clearHistory = useCallback(() => {
        ++session.current;
        refresh.current?.invalidate();
        setLoading(false);
        setHistory([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return { history, loading, error, addToHistory, clearHistory };
}

export default useStudentHistory;
