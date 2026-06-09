import { Course, Submission } from '../../types';

/**
 * Shared peer-submission matching.
 *
 * A submission is matched to its course either by course name or by membership
 * (the submission id appears in the course's submissions). This logic was
 * previously duplicated in App.tsx and AppRouter.tsx; keeping one copy avoids
 * the two drifting apart.
 */
export function findCourseForSubmission(
  courses: Course[],
  submission: Submission,
): Course | undefined {
  return courses.find(
    (course) =>
      course.name === submission.courseName ||
      course.submissions.some((s) => s.id === submission.id),
  );
}

/** All submissions in `course` other than `submissionId` (the peer set). */
export function getPeerSubmissions(
  course: Course | undefined,
  submissionId: string,
): Submission[] {
  if (!course) return [];
  return course.submissions.filter((s) => s.id !== submissionId);
}
