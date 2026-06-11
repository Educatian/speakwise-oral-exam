import { describe, it, expect } from 'vitest';
import {
    countCoursesWithoutSubmissions,
    countFlaggedForReview,
    getAllSubmissions,
    getAverageScore,
    getInstructorPriorities,
    getVisibleCourses
} from '../lib/utils/managerDashboard';
import { Course, Submission } from '../types';

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
    return {
        id: `sub_${Math.random().toString(36).slice(2, 8)}`,
        studentName: 'Student',
        timestamp: 1000,
        transcript: [],
        score: 80,
        feedback: '',
        ...overrides
    };
}

function makeCourse(overrides: Partial<Course> = {}): Course {
    return {
        id: `course_${Math.random().toString(36).slice(2, 8)}`,
        name: 'Course',
        instructorName: 'Instructor',
        instructorPinHash: '',
        prompt: '',
        submissions: [],
        ...overrides
    };
}

describe('getVisibleCourses', () => {
    const owned = makeCourse({ id: 'c1', ownerEmail: 'Owner@Example.com' });
    const sameInstitution = makeCourse({ id: 'c2', ownerEmail: 'other@x.com', institutionId: 'inst1' });
    const otherInstitution = makeCourse({ id: 'c3', ownerEmail: 'other@x.com', institutionId: 'inst2' });
    const noInstitution = makeCourse({ id: 'c4', ownerEmail: 'other@x.com' });

    it('admin sees all courses', () => {
        const all = [owned, sameInstitution, otherInstitution, noInstitution];
        expect(getVisibleCourses(all, true, null, undefined)).toBe(all);
    });

    it('matches owner case-insensitively', () => {
        expect(getVisibleCourses([owned, otherInstitution], false, 'owner@example.com', 'inst9')).toEqual([owned]);
    });

    it('matches institution-scoped and institution-less courses when an institution is selected', () => {
        // `owned` (c1) has no institutionId, so it also passes the institution
        // check; only the course pinned to a different institution is hidden.
        const visible = getVisibleCourses(
            [owned, sameInstitution, otherInstitution, noInstitution],
            false,
            'nobody@x.com',
            'inst1'
        );
        expect(visible.map((c) => c.id)).toEqual(['c1', 'c2', 'c4']);
    });

    it('shows all courses when no institution is selected (matchesInstitution true)', () => {
        const visible = getVisibleCourses([sameInstitution, otherInstitution], false, 'nobody@x.com', undefined);
        expect(visible.map((c) => c.id)).toEqual(['c2', 'c3']);
    });
});

describe('getAllSubmissions', () => {
    it('flattens submissions with course context, sorted newest first', () => {
        const courses = [
            makeCourse({
                id: 'a',
                name: 'Course A',
                submissions: [makeSubmission({ id: 's1', timestamp: 100 })]
            }),
            makeCourse({
                id: 'b',
                name: 'Course B',
                submissions: [
                    makeSubmission({ id: 's2', timestamp: 300 }),
                    makeSubmission({ id: 's3', timestamp: 200 })
                ]
            })
        ];

        const subs = getAllSubmissions(courses);
        expect(subs.map((s) => s.id)).toEqual(['s2', 's3', 's1']);
        expect(subs[2].courseName).toBe('Course A');
        expect(subs[2]._courseId).toBe('a');
    });
});

describe('getAverageScore', () => {
    it('returns null when there are no submissions', () => {
        expect(getAverageScore([])).toBeNull();
    });

    it('rounds the mean score', () => {
        const courses = [
            makeCourse({
                submissions: [
                    makeSubmission({ score: 70 }),
                    makeSubmission({ score: 81 })
                ]
            })
        ];
        expect(getAverageScore(getAllSubmissions(courses))).toBe(76); // 75.5 → 76
    });
});

describe('countCoursesWithoutSubmissions', () => {
    it('counts only courses with zero submissions', () => {
        const courses = [
            makeCourse(),
            makeCourse({ submissions: [makeSubmission()] }),
            makeCourse()
        ];
        expect(countCoursesWithoutSubmissions(courses)).toBe(2);
    });
});

describe('countFlaggedForReview', () => {
    it('counts flagged submissions that have no instructor review yet', () => {
        const courses = [
            makeCourse({
                submissions: [
                    makeSubmission({ needsReview: true }),
                    makeSubmission({
                        needsReview: true,
                        instructorReview: {
                            status: 'validated',
                            reviewerName: 'inst',
                            reviewedAt: 1
                        }
                    }),
                    makeSubmission({ needsReview: false }),
                    makeSubmission()
                ]
            })
        ];
        expect(countFlaggedForReview(getAllSubmissions(courses))).toBe(1);
    });
});

describe('getInstructorPriorities', () => {
    it('puts zero-submission courses first, then ascending average score, capped at 3', () => {
        const courses = [
            makeCourse({ id: 'high', name: 'High', submissions: [makeSubmission({ score: 95 })] }),
            makeCourse({ id: 'empty', name: 'Empty' }),
            makeCourse({ id: 'low', name: 'Low', submissions: [makeSubmission({ score: 40 })] }),
            makeCourse({ id: 'mid', name: 'Mid', submissions: [makeSubmission({ score: 70 })] })
        ];

        const priorities = getInstructorPriorities(courses);
        expect(priorities).toHaveLength(3);
        expect(priorities.map((p) => p.id)).toEqual(['empty', 'low', 'mid']);
        expect(priorities[0].averageScore).toBeNull();
        expect(priorities[1].averageScore).toBe(40);
    });

    it('rounds per-course averages', () => {
        const courses = [
            makeCourse({
                id: 'avg',
                submissions: [
                    makeSubmission({ score: 70 }),
                    makeSubmission({ score: 81 })
                ]
            })
        ];
        expect(getInstructorPriorities(courses)[0].averageScore).toBe(76);
    });
});
