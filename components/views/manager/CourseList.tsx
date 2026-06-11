import React from 'react';
import { Course } from '../../../types';

interface CourseListProps {
    visibleCourses: Course[];
    verifiedCourses: Set<string>;
    onSaveAsTemplate: (course: Course) => void;
    onPinAction: (course: Course, action: 'view' | 'delete') => void;
}

/**
 * "Course Library" panel: live course roster with save-as-template and the
 * PIN-gated view/delete actions (PIN flow itself lives in useManagerDashboard).
 */
export const CourseList: React.FC<CourseListProps> = ({
    visibleCourses,
    verifiedCourses,
    onSaveAsTemplate,
    onPinAction
}) => (
    <div className="glass-panel p-6 rounded-3xl">
        <div className="flex items-center justify-between gap-3 mb-4">
            <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                    Live Courses
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                    Review or remove institution-scoped course workspaces.
                </p>
            </div>
            <span className="badge badge-accent">{visibleCourses.length}</span>
        </div>

        <div className="space-y-3">
            {visibleCourses.length === 0 ? (
                <p className="text-slate-600 text-xs italic">No courses created yet.</p>
            ) : (
                visibleCourses.map(c => (
                    <div
                        key={c.id}
                        className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center group"
                    >
                        <div className="flex-1 min-w-0 pr-2">
                            <p className="text-white font-medium text-sm truncate">{c.name}</p>
                            <p className="text-[10px] text-indigo-400 font-mono">
                                ID: {c.id} | by {c.instructorName || 'Unknown'}
                            </p>
                            {c.institutionName && (
                                <p className="text-[10px] text-slate-500 mt-1">
                                    Workspace: {c.institutionName}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                onClick={() => onSaveAsTemplate(c)}
                                className="p-1.5 bg-slate-800 hover:bg-emerald-950/40 text-slate-500 hover:text-emerald-300 rounded-lg transition-all"
                                title="Save as template"
                                aria-label={`Save ${c.name} as template`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5h14v14H5z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h6v6H9z" />
                                </svg>
                            </button>
                            {/* Verified indicator */}
                            {verifiedCourses.has(c.id) && (
                                <span className="text-emerald-400 text-xs" title="Verified this session">
                                    ✓
                                </span>
                            )}
                            <button
                                onClick={() => onPinAction(c, 'view')}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-lg transition-all"
                                title="View Submissions (PIN required)"
                                aria-label={`View submissions for ${c.name}`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => onPinAction(c, 'delete')}
                                className="p-1.5 bg-slate-800 hover:bg-red-950/40 text-slate-600 hover:text-red-400 rounded-lg transition-all"
                                title="Delete Course (PIN required)"
                                aria-label={`Delete ${c.name}`}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
);
