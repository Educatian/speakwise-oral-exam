import React from 'react';
import { CoursePriority } from '../../../lib/utils/managerDashboard';

interface GuidancePanelProps {
    coursesWithoutSubmissions: number;
    flaggedForReview: number;
    totalSubmissions: number;
    instructorPriorities: CoursePriority[];
}

/**
 * Instructor guidance panel: deployment-readiness + needs-review cards and the
 * "Courses needing attention" triage list.
 */
export const GuidancePanel: React.FC<GuidancePanelProps> = ({
    coursesWithoutSubmissions,
    flaggedForReview,
    totalSubmissions,
    instructorPriorities
}) => (
    <div className="glass-panel rounded-3xl p-6">
        <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Instructor guidance</h3>
                <p className="text-sm text-slate-500 mt-1">
                    A lightweight operating layer so the dashboard supports review decisions, not just management tasks.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Deployment readiness</p>
                        <p className="text-sm text-white">{coursesWithoutSubmissions} course{coursesWithoutSubmissions !== 1 ? 's' : ''} need first submissions</p>
                        <p className="text-xs text-slate-500 mt-2">Prioritize prompt checks and student onboarding in these workspaces.</p>
                    </div>
                    <div className={`rounded-2xl border p-4 ${flaggedForReview > 0 ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-slate-800 bg-slate-900/40'}`}>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Needs review</p>
                        <p className={`text-sm ${flaggedForReview > 0 ? 'text-amber-200 font-semibold' : 'text-white'}`}>
                            {totalSubmissions === 0
                                ? 'No review data yet'
                                : flaggedForReview > 0
                                  ? `${flaggedForReview} submission${flaggedForReview === 1 ? '' : 's'} flagged for review`
                                  : 'No submissions need review'}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            {flaggedForReview > 0
                                ? 'Low confidence, score disagreement, or thin evidence — open these first. See the flagged list in Class Analytics.'
                                : 'Flagged attempts (low confidence or score disagreement) will surface here for a quick human check.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1">
                <h4 className="text-sm font-semibold text-white">Courses needing attention</h4>
                <div className="space-y-3 mt-4">
                    {instructorPriorities.length > 0 ? instructorPriorities.map((course) => (
                        <div key={course.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-medium text-white">{course.name}</p>
                                <span className="text-xs text-slate-500">{course.submissions} submission{course.submissions !== 1 ? 's' : ''}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                                {course.submissions === 0
                                    ? 'No student evidence yet. Check onboarding, passcodes, or course visibility.'
                                    : `Average score ${course.averageScore}% across current submissions.`}
                            </p>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <p className="text-sm text-slate-500">Guidance cards will populate once courses are available in this workspace.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
);
