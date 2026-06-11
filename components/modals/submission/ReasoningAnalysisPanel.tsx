import React from 'react';
import { ReasoningRubric } from '../../../types';

interface ReasoningAnalysisPanelProps {
    reasoningRubric: ReasoningRubric;
}

/** Argumentative reasoning analysis: four reasoning sub-scores with bars. */
export const ReasoningAnalysisPanel: React.FC<ReasoningAnalysisPanelProps> = ({ reasoningRubric }) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
            <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                Argumentative reasoning analysis
            </h4>
            <span className="text-lg font-black text-indigo-400">
                {reasoningRubric.overallReasoningScore}%
            </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
                { label: 'Justification', score: reasoningRubric.explicitJustification.score, hint: `${reasoningRubric.explicitJustification.count} evidence-based statements` },
                { label: 'Causal reasoning', score: reasoningRubric.causalExplanation.score, hint: `${reasoningRubric.causalExplanation.patterns.length} causal markers found` },
                { label: 'Counter-argument handling', score: reasoningRubric.counterArgumentHandling.score, hint: `${reasoningRubric.counterArgumentHandling.attempts} rebuttal attempts` },
                { label: 'Abstraction', score: reasoningRubric.abstractionGeneralization.score, hint: `${reasoningRubric.abstractionGeneralization.instances.length} generalization attempts` }
            ].map((item) => (
                <div key={item.label} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-200">{item.label}</span>
                        <span className="text-sm font-black text-indigo-300">{item.score}/5</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5">
                        <div
                            className="h-1.5 rounded-full bg-indigo-400 transition-all duration-500"
                            style={{ width: `${(item.score / 5) * 100}%` }}
                        />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">{item.hint}</p>
                </div>
            ))}
        </div>
    </div>
);
