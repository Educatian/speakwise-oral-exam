import React, { useState } from 'react';
import { Course, Submission } from '../../../types';
import { ErrorBoundary } from '../../ui';
import { ClassAnalyticsView } from '../ClassAnalyticsView';

interface AnalyticsSectionProps {
    courses: Course[];
    totalSubmissions: number;
    onSelectSubmission: (submission: Submission) => void;
}

/**
 * Class Analytics — collapsible so the existing course roster
 * stays the default focus on first load once the section grows.
 *
 * This component stays mounted regardless of dashboard tab, so the
 * collapse state and per-course filter persist exactly as before.
 */
export const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
    courses,
    totalSubmissions,
    onSelectSubmission
}) => {
    // Class analytics collapsible + per-course filter.
    const [showAnalytics, setShowAnalytics] = useState(true);
    const [analyticsCourseFilter, setAnalyticsCourseFilter] = useState<string | null>(null);

    return (
        <div className="space-y-3">
            <button
                type="button"
                className="text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 flex items-center gap-2"
                onClick={() => setShowAnalytics((v) => !v)}
                aria-expanded={showAnalytics}
            >
                <span>{showAnalytics ? '▾' : '▸'}</span>
                Class Analytics
                <span className="text-slate-600 font-normal normal-case tracking-normal">
                    {totalSubmissions} submission{totalSubmissions === 1 ? '' : 's'}
                </span>
            </button>
            {showAnalytics && (
                <ErrorBoundary compact panelName="class analytics">
                    <ClassAnalyticsView
                        courses={courses}
                        selectedCourseId={analyticsCourseFilter}
                        onSelectCourse={setAnalyticsCourseFilter}
                        onSelectSubmission={onSelectSubmission}
                    />
                </ErrorBoundary>
            )}
        </div>
    );
};
