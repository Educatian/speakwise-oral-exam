import React from 'react';

interface DashboardStatsProps {
    currentInstitutionName: string;
    visibleCourseCount: number;
    totalSubmissions: number;
    averageScore: number | null;
}

/** The four headline stat cards at the top of the Manager Dashboard. */
export const DashboardStats: React.FC<DashboardStatsProps> = ({
    currentInstitutionName,
    visibleCourseCount,
    totalSubmissions,
    averageScore
}) => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel-light rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Institution scope</p>
            <p className="text-lg font-semibold text-white">{currentInstitutionName}</p>
            <p className="text-xs text-slate-500 mt-2">Courses and access stay aligned with the selected deployment workspace.</p>
        </div>
        <div className="glass-panel-light rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Visible courses</p>
            <p className="text-lg font-semibold text-white">{visibleCourseCount}</p>
            <p className="text-xs text-slate-500 mt-2">Live workspaces you can manage right now.</p>
        </div>
        <div className="glass-panel-light rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Total submissions</p>
            <p className="text-lg font-semibold text-white">{totalSubmissions}</p>
            <p className="text-xs text-slate-500 mt-2">Interview attempts collected across your visible courses.</p>
        </div>
        <div className="glass-panel-light rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold mb-2">Average score</p>
            <p className="text-lg font-semibold text-white">{averageScore != null ? `${averageScore}%` : 'N/A'}</p>
            <p className="text-xs text-slate-500 mt-2">A quick cohort-level signal across submitted interviews.</p>
        </div>
    </div>
);
