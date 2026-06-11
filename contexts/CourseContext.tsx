import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Course, InstructorReview, Submission } from '../types';
import { useCourseStorage } from '../hooks';

/**
 * App-wide course data + session selection state.
 *
 * Wraps the existing `useCourseStorage` hook exactly ONCE at the app root
 * (Supabase realtime subscription / localStorage fallback included), and also
 * owns the cross-view selection state that used to be drilled through
 * App → AppRouter → views:
 *
 * - `activeCourse`        — the course a student is entering / interviewing in
 * - `selectedSubmission`  — drives the SubmissionDetailModal in the app shell
 * - `lastSubmission`      — the just-completed interview, shown on the results view
 *
 * Storage failures still surface via `error`/`clearError`, consumed by the
 * StorageErrorNotifier toast in App.tsx (same UX as before).
 */
interface CourseContextValue {
    courses: Course[];
    loading: boolean;
    /** Last storage failure (write rejected by Supabase, etc.). Surfaced by the
     *  app shell as a toast; cleared via clearError so repeats re-notify. */
    error: string | null;
    clearError: () => void;
    addCourse: (courseData: Omit<Course, 'id' | 'submissions'>) => Promise<void>;
    updateCourse: (courseId: string, updates: Partial<Course>) => Promise<void>;
    deleteCourse: (id: string) => Promise<void>;
    addSubmission: (courseId: string, submission: Submission) => Promise<void>;
    deleteSubmission: (courseId: string, submissionId: string) => Promise<void>;
    /** Persists the review AND syncs the in-session copies (selected/last
     *  submission) so open views reflect the new review immediately. */
    updateSubmissionReview: (courseId: string, submissionId: string, review: InstructorReview) => Promise<void>;

    // Session selection state
    activeCourse: Course | null;
    setActiveCourse: React.Dispatch<React.SetStateAction<Course | null>>;
    selectedSubmission: Submission | null;
    setSelectedSubmission: React.Dispatch<React.SetStateAction<Submission | null>>;
    lastSubmission: Submission | null;
    setLastSubmission: React.Dispatch<React.SetStateAction<Submission | null>>;
}

const CourseContext = createContext<CourseContextValue | null>(null);

export const CourseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const {
        courses,
        loading,
        error,
        clearError,
        addCourse,
        updateCourse,
        deleteCourse,
        addSubmission,
        deleteSubmission,
        updateSubmissionReview: persistSubmissionReview
    } = useCourseStorage();

    const [activeCourse, setActiveCourse] = useState<Course | null>(null);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [lastSubmission, setLastSubmission] = useState<Submission | null>(null);

    const updateSubmissionReview = useCallback(async (
        courseId: string,
        submissionId: string,
        review: InstructorReview
    ): Promise<void> => {
        await persistSubmissionReview(courseId, submissionId, review);

        setSelectedSubmission((current) =>
            current?.id === submissionId
                ? { ...current, instructorReview: review }
                : current
        );

        setLastSubmission((current) =>
            current?.id === submissionId
                ? { ...current, instructorReview: review }
                : current
        );
    }, [persistSubmissionReview]);

    const value = useMemo<CourseContextValue>(() => ({
        courses,
        loading,
        error,
        clearError,
        addCourse,
        updateCourse,
        deleteCourse,
        addSubmission,
        deleteSubmission,
        updateSubmissionReview,
        activeCourse,
        setActiveCourse,
        selectedSubmission,
        setSelectedSubmission,
        lastSubmission,
        setLastSubmission
    }), [
        courses,
        loading,
        error,
        clearError,
        addCourse,
        updateCourse,
        deleteCourse,
        addSubmission,
        deleteSubmission,
        updateSubmissionReview,
        activeCourse,
        selectedSubmission,
        lastSubmission
    ]);

    return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
};

/** Access the app-wide course store. Must be used inside <CourseProvider>. */
export function useCourseContext(): CourseContextValue {
    const ctx = useContext(CourseContext);
    if (!ctx) {
        throw new Error('useCourseContext must be used within a <CourseProvider>. Wrap your component tree (see App.tsx).');
    }
    return ctx;
}

export default CourseContext;
