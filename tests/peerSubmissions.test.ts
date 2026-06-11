import { describe, it, expect } from 'vitest';
import { findCourseForSubmission, getPeerSubmissions } from '../lib/utils/peerSubmissions';
import type { Course, Submission } from '../types';

const makeSubmission = (id: string, courseName?: string): Submission =>
    ({
        id,
        studentName: `student-${id}`,
        timestamp: 0,
        transcript: [],
        score: 80,
        feedback: '',
        courseName
    }) as Submission;

const makeCourse = (name: string, submissions: Submission[]): Course =>
    ({ id: `course-${name}`, name, submissions }) as Course;

describe('findCourseForSubmission', () => {
    const bio = makeCourse('Biology', [
        makeSubmission('s1', 'Biology'),
        makeSubmission('s2', 'Biology')
    ]);
    const chem = makeCourse('Chemistry', [makeSubmission('s3', 'Chemistry')]);
    const courses = [bio, chem];

    it('matches by course name', () => {
        const sub = makeSubmission('s99', 'Chemistry');
        expect(findCourseForSubmission(courses, sub)?.name).toBe('Chemistry');
    });

    it('matches by membership when the course name differs', () => {
        const sub = makeSubmission('s2', 'Renamed Course');
        expect(findCourseForSubmission(courses, sub)?.name).toBe('Biology');
    });

    it('returns undefined when no course matches', () => {
        const sub = makeSubmission('s99', 'Physics');
        expect(findCourseForSubmission(courses, sub)).toBeUndefined();
    });
});

describe('getPeerSubmissions', () => {
    it('returns all submissions except the given one', () => {
        const course = makeCourse('Biology', [
            makeSubmission('s1'),
            makeSubmission('s2'),
            makeSubmission('s3')
        ]);
        const peers = getPeerSubmissions(course, 's2');
        expect(peers).toHaveLength(2);
        expect(peers.map(p => p.id)).toEqual(['s1', 's3']);
    });

    it('returns an empty array for an undefined course', () => {
        expect(getPeerSubmissions(undefined, 's1')).toEqual([]);
    });

    it('returns an empty array when the only submission is the student themself', () => {
        const course = makeCourse('Solo', [makeSubmission('only')]);
        expect(getPeerSubmissions(course, 'only')).toEqual([]);
    });
});
