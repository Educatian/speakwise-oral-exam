import { supabase, isSupabaseConfigured } from './client';
import { Course, Institution, Submission, UserProfile, UserRole } from '../../types';

async function getCurrentSessionUserId(): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;

    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
}

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
        const currentUserId = await getCurrentSessionUserId();
        if (!currentUserId) {
            return [];
        }

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
            ownerEmail: course.owner_email || '',
            institutionId: course.institution_id || '',
            institutionName: course.institution_name || '',
            submissions: (submissions || [])
                .filter(s => s.course_id === course.id)
                .map(s => ({
                    id: s.id,
                    studentName: s.student_name,
                    courseName: s.course_name,
                    timestamp: s.timestamp,
                    transcript: s.transcript || [],
                    score: s.score,
                    feedback: s.feedback,
                    // Learning Analytics
                    latencyMetrics: s.latency_metrics,
                    bargeInEvents: s.barge_in_events,
                    // Advanced Reasoning Analytics
                    dialogueMetrics: s.dialogue_metrics,
                    argumentGraph: s.argument_graph,
                    reasoningRubric: s.reasoning_rubric,
                    // AI Confidence
                    confidenceScore: s.confidence_score,
                    rubricBreakdown: s.rubric_breakdown
                }))
        }));
    } catch (error) {
        console.error('Error fetching courses from Supabase:', error);
        return [];
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
            prompt: course.prompt,
            owner_email: course.ownerEmail || '',
            institution_id: course.institutionId || null,
            institution_name: course.institutionName || null
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
        const { data: courseData } = await supabase
            .from('courses')
            .select('institution_id')
            .eq('id', courseId)
            .maybeSingle();

        const { error } = await supabase.from('submissions').insert({
            id: submission.id,
            course_id: courseId,
            institution_id: courseData?.institution_id || null,
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

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
        getAllCourses().then(onUpdate);
    });

    return () => {
        supabase.removeChannel(coursesChannel);
        authListener.subscription.unsubscribe();
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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            return getHistoryFromLocalStorage();
        }

        const deviceId = getDeviceId();
        const { data, error } = await supabase
            .from('student_history')
            .select('*')
            .eq('user_id', session.user.id)
            .order('timestamp', { ascending: false });

        if (error) throw error;

        return (data || []).map(s => ({
            id: s.id,
            studentName: s.student_name,
            courseName: s.course_name,
            timestamp: s.timestamp,
            transcript: s.transcript || [],
            score: s.score,
            feedback: s.feedback,
            // Learning Analytics
            latencyMetrics: s.latency_metrics,
            bargeInEvents: s.barge_in_events,
            // Advanced Reasoning Analytics
            dialogueMetrics: s.dialogue_metrics,
            argumentGraph: s.argument_graph,
            reasoningRubric: s.reasoning_rubric,
            // AI Confidence
            confidenceScore: s.confidence_score,
            rubricBreakdown: s.rubric_breakdown
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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            addToHistoryLocalStorage(submission);
            return;
        }

        const deviceId = getDeviceId();
        const savedSchoolRaw = localStorage.getItem('speakwise_school');
        const savedSchool = savedSchoolRaw ? JSON.parse(savedSchoolRaw) : null;
        const { error } = await supabase.from('student_history').insert({
            id: submission.id,
            user_id: session.user.id,
            device_id: deviceId,
            institution_id: savedSchool?.schoolId || null,
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
    } catch (error) {
        console.error('Error adding to student history in Supabase:', error);
        addToHistoryLocalStorage(submission);
    }
}

/**
 * Get available institutions.
 * Uses Supabase when configured and falls back to local seeded workspaces.
 */
export async function getInstitutions(): Promise<Institution[]> {
    if (!isSupabaseConfigured()) {
        return getInstitutionsFromLocalStorage();
    }

    try {
        const { data, error } = await supabase.rpc('list_active_institutions');

        if (error) throw error;

        if (!data || data.length === 0) {
            return getInstitutionsFromLocalStorage();
        }

        return data.map((institution) => ({
            id: institution.id,
            name: institution.name,
            domain: institution.domain || '',
            logoUrl: institution.logo_url || '',
            primaryColor: institution.primary_color || '',
            isActive: institution.is_active ?? true
        }));
    } catch (error) {
        console.error('Error fetching institutions:', error);
        return getInstitutionsFromLocalStorage();
    }
}

/**
 * Validate an institution access code and return the matched institution.
 */
export async function validateInstitutionAccessCode(
    institutionId: string,
    accessCode: string
): Promise<Institution | null> {
    const normalizedInstitutionId = institutionId?.trim();
    const normalizedCode = accessCode?.trim().toUpperCase();

    if (!normalizedInstitutionId) return null;

    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase.rpc('validate_institution_access_code', {
                institution_id_input: normalizedInstitutionId,
                access_code_input: normalizedCode
            });

            if (error) throw error;

            const match = Array.isArray(data) ? data[0] : data;
            if (match?.id) {
                return {
                    id: match.id,
                    name: match.name,
                    domain: match.domain || '',
                    logoUrl: match.logo_url || '',
                    primaryColor: match.primary_color || '',
                    isActive: true
                };
            }
            return null;
        } catch (error) {
            console.error('Error validating institution access code:', error);
        }
    }

    const institutions = getInstitutionsFromLocalStorage();
    const match = institutions.find((institution) => institution.id === normalizedInstitutionId);
    if (!match) return null;

    if (match.id === 'guest') {
        return match;
    }

    if ((match.accessCode || '').toUpperCase() === normalizedCode) {
        return match;
    }

    return null;
}

/**
 * Get all user profiles for admin management.
 */
export async function getUserProfiles(): Promise<UserProfile[]> {
    if (!isSupabaseConfigured()) {
        return getUserProfilesFromLocalStorage();
    }

    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((profile) => ({
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name || profile.email,
            role: (profile.role || UserRole.STUDENT) as UserRole,
            schoolId: profile.school_id || '',
            schoolName: profile.school_name || '',
            createdAt: profile.created_at
        }));
    } catch (error) {
        console.error('Error fetching user profiles:', error);
        return getUserProfilesFromLocalStorage();
    }
}

/**
 * Update a user's role.
 */
export async function updateUserRole(userId: string, role: UserRole): Promise<boolean> {
    if (!isSupabaseConfigured()) {
        const profiles = getUserProfilesFromLocalStorage().map((profile) =>
            profile.id === userId ? { ...profile, role } : profile
        );
        localStorage.setItem(USER_PROFILES_KEY, JSON.stringify(profiles));
        return true;
    }

    try {
        const { error } = await supabase
            .from('user_profiles')
            .update({ role })
            .eq('id', userId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error updating user role:', error);
        return false;
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
const INSTITUTIONS_KEY = 'speakwise_institutions';
const USER_PROFILES_KEY = 'speakwise_user_profiles';

const FALLBACK_INSTITUTIONS: Institution[] = [
    {
        id: 'ua',
        name: 'University of Alabama',
        accessCode: 'ROLL2025',
        domain: 'ua.edu',
        primaryColor: '#9d2235',
        isActive: true
    },
    {
        id: 'ou',
        name: 'University of Oklahoma',
        accessCode: 'BOOMER2025',
        domain: 'ou.edu',
        primaryColor: '#841617',
        isActive: true
    },
    {
        id: 'demo',
        name: 'Demo Institution',
        accessCode: 'DEMO',
        primaryColor: '#10b981',
        isActive: true
    },
    {
        id: 'guest',
        name: 'Guest Access',
        accessCode: '',
        isActive: true
    }
];

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

function getInstitutionsFromLocalStorage(): Institution[] {
    try {
        const saved = localStorage.getItem(INSTITUTIONS_KEY);
        if (!saved) {
            localStorage.setItem(INSTITUTIONS_KEY, JSON.stringify(FALLBACK_INSTITUTIONS));
            return FALLBACK_INSTITUTIONS;
        }

        const parsed = JSON.parse(saved) as Institution[];
        return parsed.length > 0 ? parsed : FALLBACK_INSTITUTIONS;
    } catch (e) {
        return FALLBACK_INSTITUTIONS;
    }
}

function getUserProfilesFromLocalStorage(): UserProfile[] {
    try {
        const saved = localStorage.getItem(USER_PROFILES_KEY);
        if (saved) {
            return JSON.parse(saved);
        }

        const currentUserRaw = localStorage.getItem('speakwise_user');
        if (!currentUserRaw) {
            return [];
        }

        const currentUser = JSON.parse(currentUserRaw);
        const seededProfile: UserProfile = {
            id: currentUser.id,
            email: currentUser.email,
            displayName: currentUser.displayName || currentUser.email,
            role: (currentUser.role || UserRole.STUDENT) as UserRole,
            schoolId: currentUser.schoolId || '',
            schoolName: currentUser.schoolName || '',
            createdAt: new Date().toISOString()
        };
        localStorage.setItem(USER_PROFILES_KEY, JSON.stringify([seededProfile]));
        return [seededProfile];
    } catch (e) {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Instructor Management - Database-driven role checking
// ═══════════════════════════════════════════════════════════════════════════

// Fallback instructors (used if database is unavailable)
const FALLBACK_INSTRUCTORS = [
    'jewoong.moon@gmail.com',
    'yongju017@gmail.com',
];

/**
 * Check if an email has instructor privileges (from database)
 * Falls back to hardcoded list if Supabase unavailable
 */
export async function checkInstructorStatus(email: string): Promise<boolean> {
    if (!email) return false;
    const normalizedEmail = email.toLowerCase().trim();

    // Check fallback list first (for known admins/instructors)
    if (FALLBACK_INSTRUCTORS.some(e => e.toLowerCase() === normalizedEmail)) {
        return true;
    }

    if (!isSupabaseConfigured()) {
        return false;
    }

    try {
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('email', normalizedEmail)
            .single();

        if (!profileError && profile && ['instructor', 'moderator', 'admin'].includes(profile.role)) {
            return true;
        }

        // Check instructors table
        const { data, error } = await supabase
            .from('instructors')
            .select('email')
            .eq('email', normalizedEmail)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
            console.warn('Error checking instructor status:', error);
            return false;
        }

        return !!data;
    } catch (error) {
        console.error('Error checking instructor status:', error);
        return false;
    }
}

/**
 * Add a new instructor to the database
 */
export async function addInstructor(email: string, addedBy: string): Promise<boolean> {
    if (!isSupabaseConfigured()) {
        console.warn('Supabase not configured, cannot add instructor');
        return false;
    }

    try {
        const normalizedEmail = email.toLowerCase().trim();
        const { data: existingProfile, error: profileLookupError } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (!profileLookupError && existingProfile?.id) {
            const { error: profileError } = await supabase
            .from('user_profiles')
            .update({ role: UserRole.INSTRUCTOR })
            .eq('email', normalizedEmail);

            if (!profileError) {
                return true;
            }
        }

        const { error } = await supabase.from('instructors').insert({
            email: normalizedEmail,
            added_by: addedBy,
            added_at: new Date().toISOString()
        });

        if (error) {
            console.error('Error adding instructor:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error adding instructor:', error);
        return false;
    }
}

/**
 * Get all instructors from database
 */
export async function getAllInstructors(): Promise<string[]> {
    if (!isSupabaseConfigured()) {
        return FALLBACK_INSTRUCTORS;
    }

    try {
        const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('email, role')
            .in('role', ['instructor', 'moderator', 'admin']);

        if (!profilesError && profiles && profiles.length > 0) {
            const emailsFromProfiles = profiles.map((profile) => profile.email);
            return [...new Set([...FALLBACK_INSTRUCTORS, ...emailsFromProfiles])];
        }

        const { data, error } = await supabase
            .from('instructors')
            .select('email')
            .order('added_at', { ascending: false });

        if (error) {
            console.error('Error fetching instructors:', error);
            return FALLBACK_INSTRUCTORS;
        }

        const dbEmails = (data || []).map(d => d.email);
        // Combine with fallback list (remove duplicates)
        const allEmails = [...new Set([...FALLBACK_INSTRUCTORS, ...dbEmails])];
        return allEmails;
    } catch (error) {
        console.error('Error fetching instructors:', error);
        return FALLBACK_INSTRUCTORS;
    }
}

export default {
    getAllCourses,
    addCourse,
    deleteCourse,
    addSubmissionToCourse,
    subscribeToCoursesRealtime,
    getStudentHistory,
    addToStudentHistory,
    getInstitutions,
    validateInstitutionAccessCode,
    getUserProfiles,
    updateUserRole,
    checkInstructorStatus,
    addInstructor,
    getAllInstructors
};
