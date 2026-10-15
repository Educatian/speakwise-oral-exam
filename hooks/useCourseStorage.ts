import { useState, useEffect, useCallback, useRef } from 'react';
import { Course, InstructorReview, Submission } from '../types';
import {
    addCourse as addCourseToSupabase,
    deleteCourse as deleteCourseFromSupabase,
    addSubmissionToCourse,
    deleteSubmission as deleteSubmissionFromSupabase,
    updateSubmissionReview as updateSubmissionReviewInDatabase,
    subscribeToCoursesRealtime,
    isSupabaseConfigured,
    supabase
} from '../lib/supabase';

import { getAuthEventName } from '../lib/supabase/auth';
import { listenForRefresh, upsertById } from '../utils/courseRefresh';

interface UseCourseStorageReturn {
    courses: Course[];
    loading: boolean;
    error: string | null;
    addCourse: (courseData: Omit<Course, 'id' | 'submissions'>) => Promise<void>;
    updateCourse: (courseId: string, updates: Partial<Course>) => Promise<void>;
    deleteCourse: (id: string) => Promise<void>;
    addSubmission: (courseId: string, submission: Submission) => Promise<void>;
    deleteSubmission: (courseId: string, submissionId: string) => Promise<void>;
    updateSubmissionReview: (courseId: string, submissionId: string, review: InstructorReview) => Promise<void>;
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

    const session = useRef(0);
    const subscription = useRef<ReturnType<typeof subscribeToCoursesRealtime> | null>(null);
    useEffect(() => {
        setLoading(true);
        setError(null);
        const unsubscribe = subscribeToCoursesRealtime(updatedCourses => {
            setCourses(updatedCourses);
            setLoading(false);
            setError(null);
        }, error => {
            console.error('Failed to refresh courses:', error);
            setError('Failed to refresh courses. Please try again.');
            setLoading(false);
        });
        subscription.current = unsubscribe;
        const unlisten = listenForRefresh(getAuthEventName(), () => {
            if (isSupabaseConfigured()) void unsubscribe.refresh();
        }, () => {
            ++session.current;
            unsubscribe.invalidate();
            setCourses([]);
            setLoading(true);
            setError(null);
            void unsubscribe.refresh();
        });
        return () => {
            ++session.current;
            unlisten();
            unsubscribe();
            subscription.current = null;
        };
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

        const mutationSession = session.current;
        subscription.current?.invalidate();
        // Optimistic update - add to UI immediately
        setCourses(prev => [newCourse, ...prev]);

        try {
            if (isSupabaseConfigured()) {
                await addCourseToSupabase(newCourse);
            }
        } catch (e) {
            if (mutationSession !== session.current) return;
            console.error('Failed to add course:', e);
            setError('Failed to add course. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                void subscription.current?.refresh();
            }
        }
    }, []);

    // Delete a course
    const deleteCourse = useCallback(async (id: string): Promise<void> => {
        const mutationSession = session.current;
        subscription.current?.invalidate();
        // Optimistic update - remove from UI immediately
        setCourses(prev => prev.filter(c => c.id !== id));

        try {
            if (isSupabaseConfigured()) {
                await deleteCourseFromSupabase(id);
            }
        } catch (e) {
            if (mutationSession !== session.current) return;
            console.error('Failed to delete course:', e);
            setError('Failed to delete course. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                void subscription.current?.refresh();
            }
        }
    }, []);

    // Update a course
    const updateCourse = useCallback(async (
        courseId: string,
        updates: Partial<Course>
    ): Promise<void> => {
        const mutationSession = session.current;
        subscription.current?.invalidate();
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
                if (updates.institutionId !== undefined) supabaseUpdates.institution_id = updates.institutionId;
                if (updates.institutionName !== undefined) supabaseUpdates.institution_name = updates.institutionName;
                if (updates.interviewSettings !== undefined) supabaseUpdates.interview_settings = updates.interviewSettings;

                const { error } = await supabase
                    .from('courses')
                    .update(supabaseUpdates)
                    .eq('id', courseId);

                if (error) throw error;
            }
        } catch (e) {
            if (mutationSession !== session.current) return;
            console.error('Failed to update course:', e);
            setError('Failed to update course. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                void subscription.current?.refresh();
            }
        }
    }, []);

    // Commit immediately after persistence, without depending on realtime.
    const addSubmission = useCallback(async (courseId: string, submission: Submission): Promise<void> => {
        const mutationSession = session.current;
        try {
            if (isSupabaseConfigured()) await addSubmissionToCourse(courseId, submission);
            if (mutationSession !== session.current) return;
            subscription.current?.invalidate();
            setLoading(false);
            setError(null);
            setCourses(prev => prev.map(course => course.id === courseId
                ? { ...course, submissions: upsertById(course.submissions, submission) }
                : course));
            // Also reconcile when the course was not yet present in the local list.
            if (isSupabaseConfigured()) void subscription.current?.refresh();
        } catch (error) {
            console.error('Failed to add submission:', error);
            if (mutationSession === session.current) setError('Failed to save submission. Please try again.');
            throw error;
        }
    }, []);

    // Delete a submission from a course
    const deleteSubmission = useCallback(async (
        courseId: string,
        submissionId: string
    ): Promise<void> => {
        const mutationSession = session.current;
        subscription.current?.invalidate();
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
            if (mutationSession !== session.current) return;
            console.error('Failed to delete submission:', e);
            setError('Failed to delete submission. Please try again.');
            // Revert by refetching
            if (isSupabaseConfigured()) {
                void subscription.current?.refresh();
            }
        }
    }, []);

    const updateSubmissionReview = useCallback(async (
        courseId: string,
        submissionId: string,
        review: InstructorReview
    ): Promise<void> => {
        const mutationSession = session.current;
        subscription.current?.invalidate();
        setCourses(prev => prev.map(course =>
            course.id === courseId
                ? {
                    ...course,
                    submissions: course.submissions.map(submission =>
                        submission.id === submissionId
                            ? { ...submission, instructorReview: review }
                            : submission
                    )
                }
                : course
        ));

        try {
            await updateSubmissionReviewInDatabase(submissionId, review);
        } catch (e) {
            if (mutationSession !== session.current) return;
            console.error('Failed to update submission review:', e);
            setError('Failed to save instructor review. Please try again.');
            if (isSupabaseConfigured()) {
                void subscription.current?.refresh();
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
        deleteSubmission,
        updateSubmissionReview
    };
}

export default useCourseStorage;
