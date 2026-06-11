import { Course, Submission } from '../../types';

/**
 * Pure derivation helpers for the Manager Dashboard.
 *
 * Extracted verbatim from ManagerDashboardView so the visibility filtering,
 * aggregate stats, and triage ordering can be unit-tested without React.
 */

/** A submission row enriched with its course context for the dashboard feed. */
export type DashboardSubmission = Submission & { courseName: string; _courseId: string };

/** Per-course triage summary used by the "Courses needing attention" cards. */
export interface CoursePriority {
    id: string;
    name: string;
    submissions: number;
    averageScore: number | null;
}

/** Filter courses based on ownership (admin sees all, others see only their own). */
export function getVisibleCourses(
    courses: Course[],
    isAdmin: boolean,
    effectiveEmail: string | null | undefined,
    institutionId: string | undefined
): Course[] {
    return isAdmin
        ? courses
        : courses.filter(c => {
            const matchesOwner = c.ownerEmail?.toLowerCase() === effectiveEmail?.toLowerCase();
            const matchesInstitution = institutionId
                ? c.institutionId === institutionId || !c.institutionId
                : true;
            return matchesOwner || matchesInstitution;
        });
}

/** Get all submissions sorted by timestamp (only from visible courses). */
export function getAllSubmissions(visibleCourses: Course[]): DashboardSubmission[] {
    return visibleCourses
        .flatMap(c => c.submissions.map(s => ({ ...s, courseName: c.name, _courseId: c.id })))
        .sort((a, b) => b.timestamp - a.timestamp);
}

/** Cohort-level average score across submissions, or null when there are none. */
export function getAverageScore(allSubmissions: DashboardSubmission[]): number | null {
    return allSubmissions.length > 0
        ? Math.round(allSubmissions.reduce((sum, submission) => sum + submission.score, 0) / allSubmissions.length)
        : null;
}

/** Courses that have not yet collected any student evidence. */
export function countCoursesWithoutSubmissions(visibleCourses: Course[]): number {
    return visibleCourses.filter((course) => course.submissions.length === 0).length;
}

/**
 * Submissions the evaluation pipeline flagged for a human look and that no
 * instructor has reviewed yet — the actionable front of the review queue.
 */
export function countFlaggedForReview(allSubmissions: DashboardSubmission[]): number {
    return allSubmissions.filter((s) => s.needsReview && !s.instructorReview).length;
}

/**
 * Top-3 courses needing instructor attention: zero-submission courses first,
 * then ascending average score.
 */
export function getInstructorPriorities(visibleCourses: Course[]): CoursePriority[] {
    return visibleCourses
        .map((course) => {
            const courseAverage = course.submissions.length > 0
                ? Math.round(course.submissions.reduce((sum, submission) => sum + submission.score, 0) / course.submissions.length)
                : null;

            return {
                id: course.id,
                name: course.name,
                submissions: course.submissions.length,
                averageScore: courseAverage
            };
        })
        .sort((left, right) => {
            if (left.submissions === 0 && right.submissions > 0) return -1;
            if (right.submissions === 0 && left.submissions > 0) return 1;
            return (left.averageScore ?? 101) - (right.averageScore ?? 101);
        })
        .slice(0, 3);
}
