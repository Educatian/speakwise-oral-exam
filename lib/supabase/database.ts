import { supabase, isSupabaseConfigured } from './client';
import {
    AuditLogEntry,
    Course,
    CourseTemplate,
    Institution,
    InstructorReview,
    Submission,
    SubmissionAnnotation,
    SubmissionAnnotationCategory,
    UserProfile,
    UserRole
} from '../../types';

function normalizeInstructorReview(review: any): InstructorReview | undefined {
    if (!review) return undefined;

    return {
        status: review.status || 'pending',
        reviewerName: review.reviewer_name || review.reviewerName || 'Instructor',
        reviewerEmail: review.reviewer_email || review.reviewerEmail || undefined,
        reviewedAt: review.reviewed_at
            ? new Date(review.reviewed_at).getTime()
            : (review.reviewedAt || Date.now()),
        overrideScore: review.override_score ?? review.overrideScore ?? null,
        notes: review.notes || ''
    };
}

function mapSubmissionRecord(record: any, reviewMap: Record<string, InstructorReview>): Submission {
    return {
        id: record.id,
        studentName: record.student_name,
        courseName: record.course_name,
        timestamp: record.timestamp,
        transcript: record.transcript || [],
        score: record.score,
        feedback: record.feedback,
        latencyMetrics: record.latency_metrics,
        bargeInEvents: record.barge_in_events,
        dialogueMetrics: record.dialogue_metrics,
        argumentGraph: record.argument_graph,
        reasoningRubric: record.reasoning_rubric,
        confidenceScore: record.confidence_score,
        confidenceRationale: record.confidence_rationale,
        rubricBreakdown: record.rubric_breakdown,
        instructorReview: reviewMap[record.id]
    };
}

function normalizeCourseTemplate(record: any): CourseTemplate {
    return {
        id: record.id,
        name: record.name,
        prompt: record.prompt,
        instructorName: record.instructor_name || record.instructorName || 'Instructor',
        institutionId: record.institution_id || record.institutionId || '',
        institutionName: record.institution_name || record.institutionName || '',
        sourceCourseId: record.source_course_id || record.sourceCourseId || '',
        createdByEmail: record.created_by_email || record.createdByEmail || '',
        createdAt: record.created_at
            ? new Date(record.created_at).getTime()
            : (record.createdAt || Date.now())
    };
}

function normalizeSubmissionAnnotation(record: any): SubmissionAnnotation {
    return {
        id: record.id,
        submissionId: record.submission_id || record.submissionId,
        transcriptIndex: record.transcript_index ?? record.transcriptIndex ?? 0,
        category: (record.category || 'evidence') as SubmissionAnnotationCategory,
        note: record.note || '',
        authorName: record.author_name || record.authorName || 'Instructor',
        authorEmail: record.author_email || record.authorEmail || undefined,
        createdAt: record.created_at
            ? new Date(record.created_at).getTime()
            : (record.createdAt || Date.now())
    };
}

function normalizeAuditLog(record: any): AuditLogEntry {
    return {
        id: record.id,
        action: record.action,
        description: record.description,
        targetType: record.target_type || record.targetType,
        targetId: record.target_id || record.targetId,
        actorName: record.actor_name || record.actorName || undefined,
        actorEmail: record.actor_email || record.actorEmail || undefined,
        institutionId: record.institution_id || record.institutionId || undefined,
        createdAt: record.created_at
            ? new Date(record.created_at).getTime()
            : (record.createdAt || Date.now()),
        metadata: record.metadata || undefined
    };
}

function getPersistedAppUser(): { id?: string; email?: string; schoolId?: string; schoolName?: string; role?: string } | null {
    try {
        const stored = localStorage.getItem('speakwise_user');
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

function createClientId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
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
        const reviewMap = await getSubmissionReviewMap();

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
                .map(s => mapSubmissionRecord(s, reviewMap))
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
    } else {
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

    await logAuditEvent({
        action: 'course.created',
        description: `Created course "${course.name}" for ${course.institutionName || 'the active institution'}.`,
        targetType: 'course',
        targetId: course.id,
        actorEmail: course.ownerEmail,
        actorName: course.instructorName,
        institutionId: course.institutionId,
        metadata: { institutionName: course.institutionName }
    });
}

/**
 * Delete a course from Supabase
 */
export async function deleteCourse(courseId: string): Promise<void> {
    const localCourse = getCoursesFromLocalStorage().find((course) => course.id === courseId);

    if (!isSupabaseConfigured()) {
        deleteCourseFromLocalStorage(courseId);
    } else {
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

    const actor = getPersistedAppUser();
    await logAuditEvent({
        action: 'course.deleted',
        description: `Deleted course "${localCourse?.name || courseId}".`,
        targetType: 'course',
        targetId: courseId,
        actorEmail: actor?.email,
        actorName: actor?.email || 'Instructor',
        institutionId: localCourse?.institutionId || actor?.schoolId
    });
}

/**
 * Add a submission to a course in Supabase
 */
export async function addSubmissionToCourse(
    courseId: string,
    submission: Submission
): Promise<void> {
    let institutionId: string | null = null;

    if (!isSupabaseConfigured()) {
        addSubmissionToLocalStorage(courseId, submission);
        institutionId = getPersistedAppUser()?.schoolId || null;
    } else {
        try {
            const { data: courseData } = await supabase
                .from('courses')
                .select('institution_id')
                .eq('id', courseId)
                .maybeSingle();

            institutionId = courseData?.institution_id || null;

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
                confidence_rationale: submission.confidenceRationale,
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

    await logAuditEvent({
        action: 'submission.created',
        description: `${submission.studentName} completed an interview in ${submission.courseName || 'a course'}.`,
        targetType: 'submission',
        targetId: submission.id,
        actorName: submission.studentName,
        institutionId: institutionId || undefined,
        metadata: { courseId, score: submission.score }
    });
}

/**
 * Upsert an instructor review for a submission.
 */
export async function updateSubmissionReview(
    submissionId: string,
    review: InstructorReview
): Promise<void> {
    if (!isSupabaseConfigured()) {
        upsertSubmissionReviewInLocalStorage(submissionId, review);
    } else {
        try {
            const payload = {
                submission_id: submissionId,
                status: review.status,
                reviewer_name: review.reviewerName,
                reviewer_email: review.reviewerEmail || null,
                reviewed_at: new Date(review.reviewedAt).toISOString(),
                override_score: review.overrideScore ?? null,
                notes: review.notes || null
            };

            const { error } = await supabase
                .from('submission_reviews')
                .upsert(payload, { onConflict: 'submission_id' });

            if (error) throw error;
        } catch (error) {
            console.error('Error updating submission review in Supabase:', error);
            upsertSubmissionReviewInLocalStorage(submissionId, review);
        }
    }

    await logAuditEvent({
        action: review.status === 'overridden' ? 'review.overridden' : 'review.saved',
        description: `${review.reviewerName} ${review.status === 'overridden' ? 'overrode' : 'saved'} a submission review.`,
        targetType: 'review',
        targetId: submissionId,
        actorEmail: review.reviewerEmail,
        actorName: review.reviewerName,
        institutionId: getPersistedAppUser()?.schoolId,
        metadata: {
            status: review.status,
            overrideScore: review.overrideScore ?? null
        }
    });
}

/**
 * Delete a submission from Supabase
 */
export async function deleteSubmission(
    submissionId: string
): Promise<void> {
    if (!isSupabaseConfigured()) {
        deleteSubmissionFromLocalStorage(submissionId);
    } else {
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

    const actor = getPersistedAppUser();
    await logAuditEvent({
        action: 'submission.deleted',
        description: `Deleted a submission record.`,
        targetType: 'submission',
        targetId: submissionId,
        actorEmail: actor?.email,
        actorName: actor?.email || 'Instructor',
        institutionId: actor?.schoolId
    });
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
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'submission_reviews' },
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
        const currentUser = getPersistedAppUser();
        if (!currentUser?.id) {
            return getHistoryFromLocalStorage();
        }

        const { data, error } = await supabase
            .from('student_history')
            .select('*')
            .eq('app_user_id', currentUser.id)
            .order('timestamp', { ascending: false });

        if (error) throw error;
        const reviewMap = await getSubmissionReviewMap();

        return (data || []).map(s => mapSubmissionRecord(s, reviewMap));
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
        const currentUser = getPersistedAppUser();
        if (!currentUser?.id) {
            addToHistoryLocalStorage(submission);
            return;
        }

        const deviceId = getDeviceId();
        const savedSchoolRaw = localStorage.getItem('speakwise_school');
        const savedSchool = savedSchoolRaw ? JSON.parse(savedSchoolRaw) : null;
        const { error } = await supabase.from('student_history').insert({
            id: submission.id,
            app_user_id: currentUser.id,
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
            .from('app_users')
            .select('id, email, display_name, role, school_id, school_name, created_at')
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
        const actor = getPersistedAppUser();
        await logAuditEvent({
            action: 'user.role.updated',
            description: `${actor?.email || 'Admin'} changed a user role to ${role}.`,
            targetType: 'user',
            targetId: userId,
            actorEmail: actor?.email,
            actorName: actor?.email || 'Admin',
            institutionId: actor?.schoolId,
            metadata: { role }
        });
        return true;
    }

    try {
        const { error } = await supabase.rpc('set_app_user_role', {
            user_id_input: userId,
            role_input: role
        });

        if (error) throw error;
        const actor = getPersistedAppUser();
        await logAuditEvent({
            action: 'user.role.updated',
            description: `${actor?.email || 'Admin'} changed a user role to ${role}.`,
            targetType: 'user',
            targetId: userId,
            actorEmail: actor?.email,
            actorName: actor?.email || 'Admin',
            institutionId: actor?.schoolId,
            metadata: { role }
        });
        return true;
    } catch (error) {
        console.error('Error updating user role:', error);
        return false;
    }
}

export async function getCourseTemplates(institutionId?: string | null): Promise<CourseTemplate[]> {
    const localTemplates = getCourseTemplatesFromLocalStorage();
    const normalizedInstitutionId = institutionId || getPersistedAppUser()?.schoolId || '';

    if (!isSupabaseConfigured()) {
        return localTemplates.filter((template) => !normalizedInstitutionId || !template.institutionId || template.institutionId === normalizedInstitutionId);
    }

    try {
        let query = supabase
            .from('course_templates')
            .select('*')
            .order('created_at', { ascending: false });

        if (normalizedInstitutionId) {
            query = query.or(`institution_id.eq.${normalizedInstitutionId},institution_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data || []).map(normalizeCourseTemplate);
    } catch (error) {
        console.warn('Falling back to local course templates:', error);
        return localTemplates.filter((template) => !normalizedInstitutionId || !template.institutionId || template.institutionId === normalizedInstitutionId);
    }
}

export async function saveCourseTemplate(template: CourseTemplate): Promise<void> {
    if (!isSupabaseConfigured()) {
        upsertCourseTemplateInLocalStorage(template);
        return;
    }

    try {
        const { error } = await supabase.from('course_templates').upsert({
            id: template.id,
            name: template.name,
            prompt: template.prompt,
            instructor_name: template.instructorName,
            institution_id: template.institutionId || null,
            institution_name: template.institutionName || null,
            source_course_id: template.sourceCourseId || null,
            created_by_email: template.createdByEmail || null
        });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving course template:', error);
        upsertCourseTemplateInLocalStorage(template);
    }

    await logAuditEvent({
        action: 'template.saved',
        description: `Saved course template "${template.name}".`,
        targetType: 'template',
        targetId: template.id,
        actorEmail: template.createdByEmail,
        actorName: template.createdByEmail || 'Instructor',
        institutionId: template.institutionId,
        metadata: { sourceCourseId: template.sourceCourseId }
    });
}

export async function deleteCourseTemplate(templateId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
        deleteCourseTemplateFromLocalStorage(templateId);
        return;
    }

    try {
        const { error } = await supabase
            .from('course_templates')
            .delete()
            .eq('id', templateId);

        if (error) throw error;
    } catch (error) {
        console.error('Error deleting course template:', error);
        deleteCourseTemplateFromLocalStorage(templateId);
    }

    const actor = getPersistedAppUser();
    await logAuditEvent({
        action: 'template.deleted',
        description: `Deleted a course template.`,
        targetType: 'template',
        targetId: templateId,
        actorEmail: actor?.email,
        actorName: actor?.email || 'Instructor',
        institutionId: actor?.schoolId
    });
}

export async function getSubmissionAnnotations(submissionId: string): Promise<SubmissionAnnotation[]> {
    const localAnnotations = getSubmissionAnnotationsFromLocalStorage(submissionId);

    if (!isSupabaseConfigured()) {
        return localAnnotations;
    }

    try {
        const { data, error } = await supabase
            .from('submission_annotations')
            .select('*')
            .eq('submission_id', submissionId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return (data || []).map(normalizeSubmissionAnnotation);
    } catch (error) {
        console.warn('Falling back to local submission annotations:', error);
        return localAnnotations;
    }
}

export async function createSubmissionAnnotation(annotation: SubmissionAnnotation): Promise<void> {
    if (!isSupabaseConfigured()) {
        addSubmissionAnnotationToLocalStorage(annotation);
        return;
    }

    try {
        const { error } = await supabase
            .from('submission_annotations')
            .insert({
                id: annotation.id,
                submission_id: annotation.submissionId,
                transcript_index: annotation.transcriptIndex,
                category: annotation.category,
                note: annotation.note,
                author_name: annotation.authorName,
                author_email: annotation.authorEmail || null
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error saving submission annotation:', error);
        addSubmissionAnnotationToLocalStorage(annotation);
    }

    await logAuditEvent({
        action: 'submission.annotation.created',
        description: `${annotation.authorName} added a ${annotation.category} annotation.`,
        targetType: 'submission',
        targetId: annotation.submissionId,
        actorEmail: annotation.authorEmail,
        actorName: annotation.authorName,
        institutionId: getPersistedAppUser()?.schoolId,
        metadata: { transcriptIndex: annotation.transcriptIndex, category: annotation.category }
    });
}

export async function getAuditLogs(limit = 40): Promise<AuditLogEntry[]> {
    const localLogs = getAuditLogsFromLocalStorage().slice(0, limit);

    if (!isSupabaseConfigured()) {
        return localLogs;
    }

    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        return (data || []).map(normalizeAuditLog);
    } catch (error) {
        console.warn('Falling back to local audit logs:', error);
        return localLogs;
    }
}

export async function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): Promise<void> {
    const normalizedEntry: AuditLogEntry = {
        ...entry,
        id: entry.id || createClientId('audit'),
        createdAt: entry.createdAt || Date.now()
    };

    if (!isSupabaseConfigured()) {
        addAuditLogToLocalStorage(normalizedEntry);
        return;
    }

    try {
        const { error } = await supabase
            .from('audit_logs')
            .insert({
                id: normalizedEntry.id,
                action: normalizedEntry.action,
                description: normalizedEntry.description,
                target_type: normalizedEntry.targetType,
                target_id: normalizedEntry.targetId,
                actor_name: normalizedEntry.actorName || null,
                actor_email: normalizedEntry.actorEmail || null,
                institution_id: normalizedEntry.institutionId || null,
                created_at: new Date(normalizedEntry.createdAt).toISOString(),
                metadata: normalizedEntry.metadata || null
            });

        if (error) throw error;
    } catch (error) {
        console.error('Error logging audit event:', error);
        addAuditLogToLocalStorage(normalizedEntry);
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
const SUBMISSION_REVIEWS_KEY = 'speakwise_submission_reviews';
const COURSE_TEMPLATES_KEY = 'speakwise_course_templates';
const SUBMISSION_ANNOTATIONS_KEY = 'speakwise_submission_annotations';
const AUDIT_LOGS_KEY = 'speakwise_audit_logs';

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

async function getSubmissionReviewMap(): Promise<Record<string, InstructorReview>> {
    const localReviewMap = getSubmissionReviewsFromLocalStorage();

    if (!isSupabaseConfigured()) {
        return localReviewMap;
    }

    try {
        const { data, error } = await supabase
            .from('submission_reviews')
            .select('*');

        if (error) throw error;

        const reviewMap = (data || []).reduce<Record<string, InstructorReview>>((accumulator, review) => {
            accumulator[review.submission_id] = normalizeInstructorReview(review)!;
            return accumulator;
        }, {});

        return { ...localReviewMap, ...reviewMap };
    } catch (error) {
        console.warn('Falling back to local review storage:', error);
        return localReviewMap;
    }
}

function getCoursesFromLocalStorage(): Course[] {
    try {
        const saved = localStorage.getItem(COURSES_KEY);
        const courses = saved ? JSON.parse(saved) as Course[] : [];
        const reviewMap = getSubmissionReviewsFromLocalStorage();

        return courses.map((course) => ({
            ...course,
            submissions: (course.submissions || []).map((submission) => ({
                ...submission,
                instructorReview: submission.instructorReview || reviewMap[submission.id]
            }))
        }));
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
        const history = saved ? JSON.parse(saved) as Submission[] : [];
        const reviewMap = getSubmissionReviewsFromLocalStorage();
        return history.map((submission) => ({
            ...submission,
            instructorReview: submission.instructorReview || reviewMap[submission.id]
        }));
    } catch (e) {
        return [];
    }
}

function addToHistoryLocalStorage(submission: Submission): void {
    const history = getHistoryFromLocalStorage();
    history.unshift(submission);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function getSubmissionReviewsFromLocalStorage(): Record<string, InstructorReview> {
    try {
        const saved = localStorage.getItem(SUBMISSION_REVIEWS_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        return {};
    }
}

function upsertSubmissionReviewInLocalStorage(submissionId: string, review: InstructorReview): void {
    const reviewMap = getSubmissionReviewsFromLocalStorage();
    reviewMap[submissionId] = review;
    localStorage.setItem(SUBMISSION_REVIEWS_KEY, JSON.stringify(reviewMap));

    const courses = getCoursesFromLocalStorage().map((course) => ({
        ...course,
        submissions: course.submissions.map((submission) =>
            submission.id === submissionId
                ? { ...submission, instructorReview: review }
                : submission
        )
    }));
    localStorage.setItem(COURSES_KEY, JSON.stringify(courses));

    const history = getHistoryFromLocalStorage().map((submission) =>
        submission.id === submissionId
            ? { ...submission, instructorReview: review }
            : submission
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function getCourseTemplatesFromLocalStorage(): CourseTemplate[] {
    try {
        const saved = localStorage.getItem(COURSE_TEMPLATES_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function upsertCourseTemplateInLocalStorage(template: CourseTemplate): void {
    const templates = getCourseTemplatesFromLocalStorage();
    const existingIndex = templates.findIndex((item) => item.id === template.id);
    if (existingIndex >= 0) {
        templates[existingIndex] = template;
    } else {
        templates.unshift(template);
    }
    localStorage.setItem(COURSE_TEMPLATES_KEY, JSON.stringify(templates));
}

function deleteCourseTemplateFromLocalStorage(templateId: string): void {
    const templates = getCourseTemplatesFromLocalStorage().filter((template) => template.id !== templateId);
    localStorage.setItem(COURSE_TEMPLATES_KEY, JSON.stringify(templates));
}

function getSubmissionAnnotationsMapFromLocalStorage(): Record<string, SubmissionAnnotation[]> {
    try {
        const saved = localStorage.getItem(SUBMISSION_ANNOTATIONS_KEY);
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        return {};
    }
}

function getSubmissionAnnotationsFromLocalStorage(submissionId: string): SubmissionAnnotation[] {
    const map = getSubmissionAnnotationsMapFromLocalStorage();
    return map[submissionId] || [];
}

function addSubmissionAnnotationToLocalStorage(annotation: SubmissionAnnotation): void {
    const map = getSubmissionAnnotationsMapFromLocalStorage();
    const current = map[annotation.submissionId] || [];
    map[annotation.submissionId] = [...current, annotation];
    localStorage.setItem(SUBMISSION_ANNOTATIONS_KEY, JSON.stringify(map));
}

function getAuditLogsFromLocalStorage(): AuditLogEntry[] {
    try {
        const saved = localStorage.getItem(AUDIT_LOGS_KEY);
        const parsed = saved ? JSON.parse(saved) as AuditLogEntry[] : [];
        return parsed.sort((left, right) => right.createdAt - left.createdAt);
    } catch (e) {
        return [];
    }
}

function addAuditLogToLocalStorage(entry: AuditLogEntry): void {
    const logs = [entry, ...getAuditLogsFromLocalStorage()].slice(0, 200);
    localStorage.setItem(AUDIT_LOGS_KEY, JSON.stringify(logs));
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
            .from('app_users')
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
            .from('app_users')
            .select('id')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (!profileLookupError && existingProfile?.id) {
            const { error: profileError } = await supabase.rpc('set_app_user_role_by_email', {
                email_input: normalizedEmail,
                role_input: UserRole.INSTRUCTOR
            });

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
            .from('app_users')
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
    updateSubmissionReview,
    subscribeToCoursesRealtime,
    getStudentHistory,
    addToStudentHistory,
    getInstitutions,
    validateInstitutionAccessCode,
    getUserProfiles,
    updateUserRole,
    getCourseTemplates,
    saveCourseTemplate,
    deleteCourseTemplate,
    getSubmissionAnnotations,
    createSubmissionAnnotation,
    getAuditLogs,
    logAuditEvent,
    checkInstructorStatus,
    addInstructor,
    getAllInstructors
};
