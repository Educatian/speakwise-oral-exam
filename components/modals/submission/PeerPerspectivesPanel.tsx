import React from 'react';
import { PeerClaimGroup } from '../../../types';

interface PeerPerspectivesPanelProps {
    peerData: { shared: PeerClaimGroup[]; unique: PeerClaimGroup[] };
}

/** Peer perspectives: claims shared with peers vs unique peer viewpoints. */
export const PeerPerspectivesPanel: React.FC<PeerPerspectivesPanelProps> = ({ peerData }) => (
    <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl">
        <h4 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-3">
            Peer perspectives
        </h4>
        {peerData.shared.length > 0 && (
            <div className="mb-4">
                <p className="text-xs text-emerald-500 font-medium mb-2">Shared ideas</p>
                <div className="space-y-2">
                    {peerData.shared.map((item, index) => (
                        <div key={index} className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 px-1.5 py-0.5 bg-emerald-500/20 rounded text-xs text-emerald-400">{item.count + 1}</span>
                            <span className="text-slate-400">"{item.claim}"</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
        {peerData.unique.length > 0 && (
            <div>
                <p className="text-xs text-indigo-500 font-medium mb-2">Different perspectives</p>
                <div className="space-y-2">
                    {peerData.unique.map((item, index) => (
                        <div key={index} className="flex items-start gap-2 text-sm">
                            <span className="flex-shrink-0 px-1.5 py-0.5 bg-indigo-500/20 rounded text-xs text-indigo-400">{item.count}</span>
                            <span className="text-slate-400">"{item.claim}"</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
);
