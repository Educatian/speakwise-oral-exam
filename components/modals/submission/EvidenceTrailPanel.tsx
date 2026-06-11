import React from 'react';
import { EvidenceTrailItem } from '../../../lib/utils/evidenceTrail';

interface EvidenceTrailPanelProps {
    evidenceTrail: EvidenceTrailItem[];
    onSelectTurn: (index: number) => void;
}

/** Evidence trail: quick links from scoring evidence back to transcript turns. */
export const EvidenceTrailPanel: React.FC<EvidenceTrailPanelProps> = ({ evidenceTrail, onSelectTurn }) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
            <div>
                <h4 className="text-slate-300 font-semibold">Evidence trail</h4>
                <p className="text-sm text-slate-500 mt-1">Quick links to transcript evidence that shaped the current scoring model.</p>
            </div>
            <span className="text-xs text-slate-600">{evidenceTrail.length} reference{evidenceTrail.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="space-y-2">
            {evidenceTrail.map((item, index) => (
                <button
                    key={`${item.snippet}-${index}`}
                    type="button"
                    onClick={() => {
                        if (item.matchingTurnIndex != null) {
                            onSelectTurn(item.matchingTurnIndex);
                        }
                    }}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-left hover:border-indigo-500/30 transition-colors"
                >
                    <p className="text-sm text-slate-200 leading-relaxed">{item.snippet}</p>
                    <p className="text-[11px] text-slate-500 mt-2">
                        {item.matchingTurnIndex != null ? `Jump to transcript turn ${item.matchingTurnIndex + 1}` : 'No exact transcript turn match was found'}
                    </p>
                </button>
            ))}
        </div>
    </div>
);
