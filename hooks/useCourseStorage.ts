import { useState, useEffect, useCallback } from 'react';
import { Course, Submission } from '../types';
import {
    getAllCourses,
    addCourse as addCourseToSupabase,
    deleteCourse as deleteCourseFromSupabase,
    addSubmissionToCourse,
    deleteSubmission as deleteSubmissionFromSupabase,
    subscribeToCoursesRealtime,
    isSupabaseConfigured
} from '../lib/supabase';

interface UseCourseStorageReturn {
    courses: Course[];
    loading: boolean;
    error: string | null;
    addCourse: (courseData: Omit<Course, 'id' | 'submissions'>) => Promise<void>;
    updateCourse: (courseId: string, updates: Partial<Course>) => Promise<void>;
    deleteCourse: (id: string) => Promise<void>;
    addSubmission: (courseId: string, submission: Submission) => Promise<void>;
    deleteSubmission: (courseId: string, submissionId: string) => Promise<void>;
}

const STORAGE_KEY = 'speakwise_courses';

/**
 * Generate a 6-digit course ID
 */
function generateCourseId(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Custom hook for managing course data with Supabase
 * Falls back to localStorage if Supabase is not configured
 */
export function useCourseStorage(): UseCourseStorageReturn {
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Initialize and subscribe to real-time updates
    useEffect(() => {
        setLoading(true);
        setError(null);

        if (isSupabaseConfigured()) {
            // Use real-time subscription for Supabase
            const unsubscribe = subscribeToCoursesRealtime((updatedCourses) => {
                setCourses(updatedCourses);
                setLoading(false);
            });

            return () => unsubscribe();
        } else {
            // Fallback to localStorage
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                setCourses(saved ? JSON.parse(saved) : []);
            } catch (e) {
                console.error('Failed to load courses from localStorage:', e);
                setCourses([]);
            }
            setLoading(false);
        }
    }, []);

    // Persist to localStorage when courses change (fallback mode)
    useEffect(() => {
        if (!isSupabaseConfigured() && !loading) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
            } catch (e) {
                console.error('Failed to save courses to localStorage:', e);
            }
        }
    }, [courses, loading]);

    // Add a new course
    const addCourse = useCallback(async (
        courseData: Omit<Course, 'id' | 'submissions'>
    ): Promise<void> => {
        const newCourse: Course = {
            id: generateCourseId(),
            ...courseData,
            submissions: []
        };

        // Optimistic update - add to UI immediately
        setCourses(prev => [newCourse, ...prev]);

        try {
            if (isSupabaseConfigured()) {
                await addCourseToSupabase(newCourse);
            }
        } catch (e) {
            console.error('Failed to add course:', e);
            setError('Failed to add course. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                getAllCourses().then(setCourses);
            }
        }
    }, []);

    // Delete a course
    const deleteCourse = useCallback(async (id: string): Promise<void> => {
        // Optimistic update - remove from UI immediately
        setCourses(prev => prev.filter(c => c.id !== id));

        try {
            if (isSupabaseConfigured()) {
                await deleteCourseFromSupabase(id);
            }
        } catch (e) {
            console.error('Failed to delete course:', e);
            setError('Failed to delete course. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                getAllCourses().then(setCourses);
            }
        }
    }, []);

    // Update a course
    const updateCourse = useCallback(async (
        courseId: string,
        updates: Partial<Course>
    ): Promise<void> => {
        // Optimistic update
        setCourses(prev => prev.map(c =>
            c.id === courseId ? { ...c, ...updates } : c
        ));

        try {
            if (isSupabaseConfigured()) {
                // Map Course fields to Supabase columns
                const supabaseUpdates: Record<string, unknown> = {};
                if (updates.prompt !== undefined) supabaseUpdates.prompt = updates.prompt;
                if (updates.name !== undefined) supabaseUpdates.name = updates.name;
                if (updates.instructorName !== undefined) supabaseUpdates.instructor_name = updates.instructorName;
                if (updates.password !== undefined) supabaseUpdates.password = updates.password;

                const { error } = await (await import('../lib/supabase')).supabase
                    .from('courses')
                    .update(supabaseUpdates)
                    .eq('id', courseId);

                if (error) throw error;
            }
        } catch (e) {
            console.error('Failed to update course:', e);
            setError('Failed to update course. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                getAllCourses().then(setCourses);
            }
        }
    }, []);

    // Add a submission to a course
    const addSubmission = useCallback(async (
        courseId: string,
        submission: Submission
    ): Promise<void> => {
        try {
            if (isSupabaseConfigured()) {
                await addSubmissionToCourse(courseId, submission);
                // Real-time subscription will update the state
            } else {
                setCourses(prev => prev.map(c =>
                    c.id === courseId
                        ? { ...c, submissions: [submission, ...c.submissions] }
                        : c
                ));
            }
        } catch (e) {
            console.error('Failed to add submission:', e);
            setError('Failed to save submission. Please try again.');
            // Still add locally as fallback
            setCourses(prev => prev.map(c =>
                c.id === courseId
                    ? { ...c, submissions: [submission, ...c.submissions] }
                    : c
            ));
        }
    }, []);

    // Delete a submission from a course
    const deleteSubmission = useCallback(async (
        courseId: string,
        submissionId: string
    ): Promise<void> => {
        // Optimistic update - remove from UI immediately
        setCourses(prev => prev.map(c =>
            c.id === courseId
                ? { ...c, submissions: c.submissions.filter(s => s.id !== submissionId) }
                : c
        ));

        try {
            if (isSupabaseConfigured()) {
                await deleteSubmissionFromSupabase(submissionId);
                // Real-time subscription will handle the update
            }
        } catch (e) {
            console.error('Failed to delete submission:', e);
            setError('Failed to delete submission. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                getAllCourses().then(setCourses);
            }
        }
    }, []);

    return {
        courses,
        loading,
        error,
        addCourse,
        updateCourse,
        deleteCourse,
        addSubmission,
        deleteSubmission
    };
}

export default useCourseStorage;
