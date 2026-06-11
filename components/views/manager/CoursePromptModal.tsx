import React, { useState } from 'react';
import { Course, Submission } from '../../../types';
import { GroupKnowledgeService } from '../../../lib/services/GroupKnowledgeService';
import { Button, Modal } from '../../ui';
import { getMasteryLevel } from '../../../lib/utils/scoreDisplay';

interface CoursePromptModalProps {
    viewingCourse: Course | null;
    setViewingCourse: React.Dispatch<React.SetStateAction<Course | null>>;
    onUpdateCourse?: (courseId: string, updates: Partial<Course>) => void;
    onSelectSubmission: (submission: Submission) => void;
    onDeleteSubmission: (courseId: string, submissionId: string) => void;
}

/**
 * Course detail modal: editable system prompt, per-course submission list, and
 * the Group Knowledge Network summary. Always mounted (visibility driven by
 * `viewingCourse`), so prompt-edit state persists exactly as before.
 */
export const CoursePromptModal: React.FC<CoursePromptModalProps> = ({
    viewingCourse,
    setViewingCourse,
    onUpdateCourse,
    onSelectSubmission,
    onDeleteSubmission
}) => {
    // Editing state for course prompt
    const [isEditingPrompt, setIsEditingPrompt] = useState(false);
    const [editedPrompt, setEditedPrompt] = useState('');

    return (
        <Modal
            isOpen={!!viewingCourse}
            onClose={() => setViewingCourse(null)}
            title={viewingCourse?.name || ''}
            subtitle={`Instructor: ${viewingCourse?.instructorName || 'Unknown'} | ${viewingCourse?.submissions?.length || 0} Submissions`}
            size="md"
            footer={
                <div className="flex justify-end">
                    <Button variant="ghost" onClick={() => setViewingCourse(null)}>
                        Close
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                {/* System Prompt - Editable */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase">System Prompt</h4>
                        {!isEditingPrompt ? (
                            <button
                                onClick={() => {
                                    setIsEditingPrompt(true);
                                    setEditedPrompt(viewingCourse?.prompt || '');
                                }}
                                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                            >
                                ✏️ Edit
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        if (viewingCourse && onUpdateCourse && editedPrompt !== viewingCourse.prompt) {
                                            onUpdateCourse(viewingCourse.id, { prompt: editedPrompt });
                                            setViewingCourse({ ...viewingCourse, prompt: editedPrompt });
                                        }
                                        setIsEditingPrompt(false);
                                    }}
                                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                                >
                                    ✓ Save
                                </button>
                                <button
                                    onClick={() => setIsEditingPrompt(false)}
                                    className="text-xs text-slate-500 hover:text-slate-400"
                                >
                                    ✕ Cancel
                                </button>
                            </div>
                        )}
                    </div>
                    {isEditingPrompt ? (
                        <textarea
                            value={editedPrompt}
                            onChange={(e) => setEditedPrompt(e.target.value)}
                            className="w-full p-4 bg-slate-950/50 border border-indigo-500/50 rounded-xl text-slate-300 text-sm leading-relaxed font-mono min-h-[30vh] max-h-[50vh] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                            placeholder="Enter system prompt..."
                        />
                    ) : (
                        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-mono max-h-[30vh] overflow-y-auto custom-scrollbar">
                            {viewingCourse?.prompt || <span className="text-slate-600 italic">No prompt set</span>}
                        </div>
                    )}
                </div>

                {/* Submissions List */}
                <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Student Submissions</h4>
                    {viewingCourse?.submissions?.length === 0 ? (
                        <p className="text-slate-600 text-sm italic">No submissions yet.</p>
                    ) : (
                        <div className="space-y-2 max-h-[30vh] overflow-y-auto custom-scrollbar">
                            {viewingCourse?.submissions?.map(sub => (
                                <div
                                    key={sub.id}
                                    className="w-full p-3 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center hover:border-indigo-500/50 transition-all"
                                >
                                    <button
                                        onClick={() => {
                                            onSelectSubmission(sub);
                                            setViewingCourse(null);
                                        }}
                                        className="flex-1 text-left"
                                    >
                                        <p className="text-white text-sm font-medium">{sub.studentName}</p>
                                        <p className="text-slate-500 text-xs">
                                            {new Date(sub.timestamp).toLocaleDateString()} • {getMasteryLevel(sub.score).emoji} {getMasteryLevel(sub.score).label}
                                        </p>
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Delete submission from ${sub.studentName}?`)) {
                                                    onDeleteSubmission(viewingCourse!.id, sub.id);
                                                }
                                            }}
                                            className="p-1 hover:bg-red-500/20 rounded-lg transition-colors"
                                            title="Delete submission"
                                        >
                                            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Group Knowledge Network */}
                <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">👥 Group Knowledge Network</h4>
                    {viewingCourse && GroupKnowledgeService.hasEnoughData(viewingCourse.submissions || []) ? (() => {
                        const network = GroupKnowledgeService.buildGroupNetwork(viewingCourse.submissions || []);
                        if (!network || network.nodes.length === 0) {
                            return <p className="text-slate-600 text-sm italic">Not enough concept data to build network.</p>;
                        }
                        const maxFreq = Math.max(...network.nodes.map(n => n.frequency), 1);
                        const typeColors: Record<string, string> = {
                            claim: 'bg-blue-500/30 text-blue-400',
                            evidence: 'bg-emerald-500/30 text-emerald-400',
                            counterargument: 'bg-red-500/30 text-red-400',
                            justification: 'bg-amber-500/30 text-amber-400'
                        };
                        return (
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500 mb-3">
                                    Aggregated from {network.totalStudents} students • {network.nodes.length} concepts
                                </p>
                                {network.nodes.slice(0, 12).map(node => (
                                    <div key={node.id} className="flex items-center gap-3 p-2 bg-slate-900/50 rounded-lg">
                                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                                            typeColors[node.type] || 'bg-slate-500/30 text-slate-400'
                                        }`}>
                                            {node.type}
                                        </span>
                                        <span className="text-sm text-slate-300 flex-1 truncate">{node.label}</span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <div className="w-20 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="h-full bg-indigo-500/60 rounded-full"
                                                    style={{ width: `${(node.frequency / maxFreq) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-slate-500 font-mono w-16 text-right">
                                                {node.frequency}/{node.studentCount}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })() : (
                        <div className="text-center py-4">
                            <p className="text-slate-600 text-sm">
                                Group network requires 3+ submissions with argument data.
                            </p>
                            <p className="text-slate-700 text-xs mt-1">
                                {viewingCourse?.submissions?.length || 0} submissions so far
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};
