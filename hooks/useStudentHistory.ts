import { useState, useEffect, useCallback } from 'react';
import { Submission } from '../types';
import {
    getStudentHistory,
    addToStudentHistory,
    isSupabaseConfigured
} from '../lib/supabase';

interface UseStudentHistoryReturn {
    history: Submission[];
    loading: boolean;
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

    // Load initial history
    useEffect(() => {
        async function loadHistory() {
            setLoading(true);

            if (isSupabaseConfigured()) {
                try {
                    const supabaseHistory = await getStudentHistory();
                    setHistory(supabaseHistory);
                } catch (e) {
                    console.error('Failed to load history from Supabase:', e);
                    loadFromLocalStorage();
                }
            } else {
                loadFromLocalStorage();
            }

            setLoading(false);
        }

        function loadFromLocalStorage() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                setHistory(saved ? JSON.parse(saved) : []);
            } catch (e) {
                console.error('Failed to load history from localStorage:', e);
                setHistory([]);
            }
        }

        loadHistory();
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
        try {
            if (isSupabaseConfigured()) {
                await addToStudentHistory(submission);
            }
            // Always update local state for immediate UI feedback
            setHistory(prev => [submission, ...prev]);
        } catch (e) {
            console.error('Failed to add to history:', e);
            // Still add locally as fallback
            setHistory(prev => [submission, ...prev]);
        }
    }, []);

    // Clear local history (localStorage only for privacy)
    const clearHistory = useCallback(() => {
        setHistory([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return { history, loading, addToHistory, clearHistory };
}

export default useStudentHistory;
