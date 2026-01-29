import { supabase, isSupabaseConfigured } from './client';
import { Course, Submission } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════
// Course Service - Supabase Operations for Courses
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all courses with their submissions from Supabase
 */
export async function getAllCourses(): Promise<Course[]> {
    if (!isSupabaseConfigured()) {
        return getCoursesFromLocalStorage();
    }

    try {
        // Get courses
        const { data: courses, error: coursesError } = await supabase
            .from('courses')
            .select('*')
            .order('created_at', { ascending: false });

        if (coursesError) throw coursesError;

        // Get submissions for all courses
        const { data: submissions, error: submissionsError } = await supabase
            .from('submissions')
            .select('*')
            .order('timestamp', { ascending: false });

        if (submissionsError) throw submissionsError;

        // Map submissions to courses
        return (courses || []).map(course => ({
            id: course.id,
            name: course.name,
            instructorName: course.instructor_name || 'Instructor',
            instructorPinHash: course.instructor_pin_hash || '',
            password: course.password,
            prompt: course.prompt,
            createdAt: course.created_at ? new Date(course.created_at).getTime() : Date.now(),
            submissions: (submissions || [])
                .filter(s => s.course_id === course.id)
                .map(s => ({
                    id: s.id,
                    studentName: s.student_name,
                    courseName: s.course_name,
                    timestamp: s.timestamp,
                    transcript: s.transcript || [],
                    score: s.score,
                    feedback: s.feedback
                }))
        }));
    } catch (error) {
        console.error('Error fetching courses from Supabase:', error);
        return getCoursesFromLocalStorage();
    }
}

/**
 * Add a new course to Supabase
 */
export async function addCourse(course: Course): Promise<void> {
    if (!isSupabaseConfigured()) {
        addCourseToLocalStorage(course);
        return;
    }

    try {
        const { error } = await supabase.from('courses').insert({
            id: course.id,
            name: course.name,
            instructor_name: course.instructorName || 'Instructor',
            instructor_pin_hash: course.instructorPinHash || '',
            password: course.password,
            prompt: course.prompt
        });

        if (error) throw error;
    } catch (error) {
        console.error('Error adding course to Supabase:', error);
        addCourseToLocalStorage(course);
    }
}

/**
 * Delete a course from Supabase
 */
export async function deleteCourse(courseId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
        deleteCourseFromLocalStorage(courseId);
        return;
    }

    try {
        const { error } = await supabase
            .from('courses')
            .delete()
            .eq('id', courseId);

        if (error) throw error;
    } catch (error) {
        console.error('Error deleting course from Supabase:', error);
        deleteCourseFromLocalStorage(courseId);
    }
}

/**
 * Add a submission to a course in Supabase
 */
export async function addSubmissionToCourse(
    courseId: string,
    submission: Submission
): Promise<void> {
    if (!isSupabaseConfigured()) {
        addSubmissionToLocalStorage(courseId, submission);
        return;
    }

    try {
        const { error } = await supabase.from('submissions').insert({
            id: submission.id,
            course_id: courseId,
            student_name: submission.studentName,
            course_name: submission.courseName,
            timestamp: submission.timestamp,
            transcript: submission.transcript,
            score: submission.score,
            feedback: submission.feedback,
            // Learning Analytics
            latency_metrics: submission.latencyMetrics,
            barge_in_events: submission.bargeInEvents,
            // Advanced Reasoning Analytics
            dialogue_metrics: submission.dialogueMetrics,
            argument_graph: submission.argumentGraph,
            reasoning_rubric: submission.reasoningRubric,
            // AI Confidence
            confidence_score: submission.confidenceScore,
            rubric_breakdown: submission.rubricBreakdown
        });

        if (error) throw error;

        console.log('[Supabase] Submission saved with analytics:', {
            id: submission.id,
            hasArgumentGraph: !!submission.argumentGraph,
            argumentGraphNodes: submission.argumentGraph?.nodes?.length || 0
        });
    } catch (error) {
        console.error('Error adding submission to Supabase:', error);
        addSubmissionToLocalStorage(courseId, submission);
    }
}

/**
 * Delete a submission from Supabase
 */
export async function deleteSubmission(
    submissionId: string
): Promise<void> {
    if (!isSupabaseConfigured()) {
        deleteSubmissionFromLocalStorage(submissionId);
        return;
    }

    try {
        const { error } = await supabase
            .from('submissions')
            .delete()
            .eq('id', submissionId);

        if (error) throw error;
    } catch (error) {
        console.error('Error deleting submission from Supabase:', error);
        deleteSubmissionFromLocalStorage(submissionId);
    }
}

/**
 * Subscribe to real-time course updates
 */
export function subscribeToCoursesRealtime(
    onUpdate: (courses: Course[]) => void
): () => void {
    if (!isSupabaseConfigured()) {
        const courses = getCoursesFromLocalStorage();
        onUpdate(courses);
        return () => { };
    }

    // Initial load
    getAllCourses().then(onUpdate);

    // Subscribe to changes on courses table
    const coursesChannel = supabase
        .channel('courses-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'courses' },
            () => {
                getAllCourses().then(onUpdate);
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'submissions' },
            () => {
                getAllCourses().then(onUpdate);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(coursesChannel);
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Student History Service - Supabase Operations for Student History
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get student history from Supabase (by device ID)
 */
export async function getStudentHistory(): Promise<Submission[]> {
    if (!isSupabaseConfigured()) {
        return getHistoryFromLocalStorage();
    }

    try {
        const deviceId = getDeviceId();
        const { data, error } = await supabase
            .from('student_history')
            .select('*')
            .eq('device_id', deviceId)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        return (data || []).map(s => ({
            id: s.id,
            studentName: s.student_name,
            courseName: s.course_name,
            timestamp: s.timestamp,
            transcript: s.transcript || [],
            score: s.score,
            feedback: s.feedback
        }));
    } catch (error) {
        console.error('Error fetching student history from Supabase:', error);
        return getHistoryFromLocalStorage();
    }
}

/**
 * Add a submission to student history
 */
export async function addToStudentHistory(submission: Submission): Promise<void> {
    if (!isSupabaseConfigured()) {
        addToHistoryLocalStorage(submission);
        return;
    }

    try {
        const deviceId = getDeviceId();
        const { error } = await supabase.from('student_history').insert({
            id: submission.id,
            device_id: deviceId,
            student_name: submission.studentName,
            course_name: submission.courseName,
            timestamp: submission.timestamp,
            transcript: submission.transcript,
            score: submission.score,
            feedback: submission.feedback
        });

        if (error) throw error;
    } catch (error) {
        console.error('Error adding to student history in Supabase:', error);
        addToHistoryLocalStorage(submission);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Device ID Helper (for anonymous student history)
// ═══════════════════════════════════════════════════════════════════════════

function getDeviceId(): string {
    const DEVICE_ID_KEY = 'speakwise_device_id';
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);

    if (!deviceId) {
        deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
}

// ═══════════════════════════════════════════════════════════════════════════
// LocalStorage Fallback Functions
// ═══════════════════════════════════════════════════════════════════════════

const COURSES_KEY = 'speakwise_courses';
const HISTORY_KEY = 'speakwise_student_history';

function getCoursesFromLocalStorage(): Course[] {
    try {
        const saved = localStorage.getItem(COURSES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function addCourseToLocalStorage(course: Course): void {
    const courses = getCoursesFromLocalStorage();
    courses.unshift(course);
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

function deleteCourseFromLocalStorage(courseId: string): void {
    const courses = getCoursesFromLocalStorage().filter(c => c.id !== courseId);
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

function addSubmissionToLocalStorage(courseId: string, submission: Submission): void {
    const courses = getCoursesFromLocalStorage().map(c =>
        c.id === courseId
            ? { ...c, submissions: [submission, ...c.submissions] }
            : c
    );
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

function deleteSubmissionFromLocalStorage(submissionId: string): void {
    const courses = getCoursesFromLocalStorage().map(c => ({
        ...c,
        submissions: c.submissions.filter(s => s.id !== submissionId)
    }));
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));
}

function getHistoryFromLocalStorage(): Submission[] {
    try {
        const saved = localStorage.getItem(HISTORY_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function addToHistoryLocalStorage(submission: Submission): void {
    const history = getHistoryFromLocalStorage();
    history.unshift(submission);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export default {
    getAllCourses,
    addCourse,
    deleteCourse,
    addSubmissionToCourse,
    subscribeToCoursesRealtime,
    getStudentHistory,
    addToStudentHistory
};
