import React from 'react';

export interface BarChartDatum {
    label: string;
    value: number;
    tone?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
}

interface BarChartProps {
    data: BarChartDatum[];
    max?: number;
    unit?: string;
    /** Compact mode shrinks vertical padding for use inside cards. */
    compact?: boolean;
    /** Width of the numeric column at the right edge, in Tailwind widths. */
    valueColWidth?: string;
}

const toneBar: Record<NonNullable<BarChartDatum['tone']>, string> = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    slate: 'bg-slate-500',
};

const toneText: Record<NonNullable<BarChartDatum['tone']>, string> = {
    indigo: 'text-indigo-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    slate: 'text-slate-300',
};

// Horizontal bar chart. One row per datum. Good for rubric dimensions where
// axis labels need to be readable and there are fewer than ~8 rows.
export const BarChart: React.FC<BarChartProps> = ({
    data,
    max,
    unit = '',
    compact = false,
    valueColWidth = 'w-16',
}) => {
    const effectiveMax = max ?? Math.max(1, ...data.map((d) => d.value));
    const gap = compact ? 'space-y-2' : 'space-y-3';
    return (
        <div className={gap} role="list">
            {data.map((d) => {
                const pct = Math.min(100, Math.max(0, (d.value / effectiveMax) * 100));
                const tone = d.tone ?? 'indigo';
                return (
                    <div key={d.label} className="flex items-center gap-3" role="listitem">
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-400 truncate">{d.label}</span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${toneBar[tone]} rounded-full transition-all`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                        <div
                            className={`${valueColWidth} text-right text-sm font-bold tabular-nums ${toneText[tone]}`}
                        >
                            {d.value.toFixed(d.value % 1 === 0 ? 0 : 1)}
                            {unit}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default BarChart;
