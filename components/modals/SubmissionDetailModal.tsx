import React, { useMemo } from 'react';
import { Submission, ArgumentGraph } from '../../types';
import { Modal, Button, ArgumentMapView } from '../ui';
import { ArgumentGraphBuilder } from '../../lib/reasoning';
import { GroupKnowledgeService } from '../../lib/services/GroupKnowledgeService';
import { getMasteryLevel } from '../../lib/utils/scoreDisplay';

interface SubmissionDetailModalProps {
    submission: Submission | null;
    peerSubmissions?: Submission[];
    onClose: () => void;
}

/**
 * Submission Detail Modal
 * Displays full interview details including transcript and feedback
 */
export const SubmissionDetailModal: React.FC<SubmissionDetailModalProps> = ({
    submission,
    peerSubmissions,
    onClose
}) => {
    // Generate argument graph from transcript if not already present
    const argumentGraph = useMemo<ArgumentGraph | null>(() => {
        if (!submission) return null;

        // Use existing argumentGraph if available
        if (submission.argumentGraph && submission.argumentGraph.nodes.length > 0) {
            return submission.argumentGraph;
        }

        // Generate from transcript for legacy submissions
        if (submission.transcript && submission.transcript.length > 0) {
            const builder = new ArgumentGraphBuilder();
            let lastQuestionId: string | undefined;

            submission.transcript.forEach(item => {
                if (item.speaker === 'interviewer') {
                    // AI questions
                    if (item.text.includes('?')) {
                        lastQuestionId = builder.addQuestion(item.text, item.timestamp);
                    }
                } else {
                    // User responses - process for argument classification
                    builder.processUserUtterance(item.text, item.timestamp, lastQuestionId);
                }
            });

            return builder.getGraph();
        }

        return null;
    }, [submission]);

    if (!submission) return null;

    const mastery = getMasteryLevel(submission.score);

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={submission.studentName}
            subtitle={submission.courseName || 'Classroom Interview'}
            size="lg"
        >
            <div className="space-y-6">
                {/* Score & Date Summary */}
                <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-900/50 p-6 rounded-2xl border border-slate-800 gap-4">
                    <div className="flex items-center gap-4">
                        <div className={`text-4xl font-black ${mastery.color}`}>
                            {mastery.emoji} {submission.score}%
                        </div>
                        <div className={`text-lg font-bold px-3 py-1 rounded-lg ${mastery.bgColor} ${mastery.color}`}>
                            {mastery.label}
                        </div>
                    </div>
                    <div className="text-center sm:text-right">
                        <h4 className="text-slate-500 font-bold text-xs uppercase tracking-widest mb-1">
                            Session Date
                        </h4>
                        <p className="text-slate-300 font-medium">
                            <time dateTime={new Date(submission.timestamp).toISOString()}>
                                {new Date(submission.timestamp).toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                })}
                            </time>
                        </p>
                    </div>
                </div>

                {/* AI Feedback */}
                <div className="bg-indigo-500/5 border border-indigo-500/20 p-6 rounded-2xl">
                    <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <h4 className="text-indigo-400 font-bold text-sm uppercase">AI Feedback</h4>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed italic">
                        "{submission.feedback}"
                    </p>
                </div>

                {/* Argument Map - Always visible with fallback */}
                <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                    {argumentGraph && argumentGraph.nodes.length > 0 ? (
                        <ArgumentMapView graph={argumentGraph} />
                    ) : (
                        <div className="text-center py-6 text-slate-500">
                            <span className="text-3xl mb-2 block">🗺️</span>
                            <h4 className="text-slate-400 font-bold text-sm mb-1">Argument Structure Map</h4>
                            <p className="text-xs">No argument data available for this session.</p>
                            <p className="text-xs mt-1 text-slate-600">
                                (Transcript too short or no recognizable argument patterns)
                            </p>
                        </div>
                    )}
                </div>

                {/* Toulmin Reasoning Rubric */}
                {submission.reasoningRubric && (
                    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                        <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
                            🧠 Argumentative Reasoning Analysis
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { key: 'claim', label: 'Claim', emoji: '💬', color: 'blue' },
                                { key: 'evidence', label: 'Evidence', emoji: '📊', color: 'emerald' },
                                { key: 'counterargument', label: 'Counter', emoji: '⚖️', color: 'rose' },
                                { key: 'justification', label: 'Justification', emoji: '🔗', color: 'amber' }
                            ].map(({ key, label, emoji, color }) => {
                                const item = (submission.reasoningRubric as any)?.[key];
                                if (!item) return null;
                                const score = typeof item === 'object' ? item.score : item;
                                const scoreNum = typeof score === 'number' ? score : 0;
                                return (
                                    <div key={key} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-slate-300">{emoji} {label}</span>
                                            <span className={`text-sm font-black text-${color}-400`}>{scoreNum}/5</span>
                                        </div>
                                        <div className="w-full bg-slate-700 rounded-full h-1.5">
                                            <div
                                                className={`bg-${color}-500 h-1.5 rounded-full transition-all duration-500`}
                                                style={{ width: `${(scoreNum / 5) * 100}%` }}
                                            />
                                        </div>
                                        {typeof item === 'object' && item.note && (
                                            <p className="text-[10px] text-slate-500 mt-1.5 leading-tight">{item.note}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Dialogue Metrics Summary */}
                        {submission.dialogueMetrics && (
                            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                                {submission.dialogueMetrics.totalTurns > 0 && (
                                    <span className="bg-slate-800 px-2 py-1 rounded-full text-slate-400">
                                        🔄 {submission.dialogueMetrics.totalTurns} turns
                                    </span>
                                )}
                                {(submission.dialogueMetrics as any).avgWordsPerTurn > 0 && (
                                    <span className="bg-slate-800 px-2 py-1 rounded-full text-slate-400">
                                        📝 {Math.round((submission.dialogueMetrics as any).avgWordsPerTurn)} avg words/turn
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Transcript */}
                <div className="space-y-4">
                    <h4 className="text-slate-500 font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        Full Conversation Transcript
                    </h4>

                    <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                        {submission.transcript.map((t, idx) => (
                            <div
                                key={idx}
                                className={`flex gap-3 ${t.speaker === 'user' ? 'flex-row-reverse' : ''}`}
                            >
                                <div
                                    className={`text-[10px] font-bold uppercase mt-1 flex-shrink-0 w-12 ${t.speaker === 'user' ? 'text-indigo-400 text-right' : 'text-emerald-400'
                                        }`}
                                >
                                    {t.speaker === 'user' ? 'Student' : 'AI'}
                                </div>
                                <div
                                    className={`flex-1 px-4 py-3 rounded-xl text-sm ${t.speaker === 'user'
                                        ? 'bg-indigo-600/20 text-indigo-100 rounded-tr-sm'
                                        : 'bg-slate-800 text-slate-300 rounded-tl-sm'
                                        }`}
                                >
                                    {t.text}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Peer Perspectives */}
                {(() => {
                    if (!peerSubmissions || peerSubmissions.length === 0) return null;
                    const allSubs = [submission, ...peerSubmissions];
                    const peerData = GroupKnowledgeService.getPeerClaims(allSubs, submission.studentName);
                    if (!peerData) return (
                        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl text-center">
                            <p className="text-slate-600 text-sm">👥 Peer perspectives will appear when 3+ classmates complete this interview.</p>
                        </div>
                    );
                    if (peerData.shared.length === 0 && peerData.unique.length === 0) return null;
                    return (
                        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
                            <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
                                👥 Peer Perspectives
                                <span className="text-slate-600 normal-case font-normal">• {peerData.totalPeers} anonymous peers</span>
                            </h4>
                            {peerData.shared.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-xs text-emerald-500 font-medium mb-2">🤝 Shared Ideas</p>
                                    <div className="space-y-1.5">
                                        {peerData.shared.map((item, i) => (
                                            <div key={i} className="flex items-start gap-2 text-sm">
                                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-emerald-500/20 rounded text-xs text-emerald-400">{item.count+1}</span>
                                                <span className="text-slate-400">"{item.claim}"</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {peerData.unique.length > 0 && (
                                <div>
                                    <p className="text-xs text-indigo-500 font-medium mb-2">💡 Different Perspectives</p>
                                    <div className="space-y-1.5">
                                        {peerData.unique.map((item, i) => (
                                            <div key={i} className="flex items-start gap-2 text-sm">
                                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-indigo-500/20 rounded text-xs text-indigo-400">{item.count}</span>
                                                <span className="text-slate-400">"{item.claim}"</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Actions */}
                <div className="flex justify-end pt-4 border-t border-slate-800">
                    <Button variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default SubmissionDetailModal;
