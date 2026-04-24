import React from 'react';

interface MetricCardProps {
    label: string;
    value: string | number;
    sublabel?: string;
    tone?: 'default' | 'indigo' | 'emerald' | 'amber' | 'rose';
    icon?: React.ReactNode;
}

const toneStyles: Record<NonNullable<MetricCardProps['tone']>, string> = {
    default: 'bg-slate-900/60 border-slate-800 text-slate-100',
    indigo: 'bg-indigo-500/5 border-indigo-500/20 text-indigo-100',
    emerald: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-100',
    amber: 'bg-amber-500/5 border-amber-500/20 text-amber-100',
    rose: 'bg-rose-500/5 border-rose-500/20 text-rose-100',
};

const accentColors: Record<NonNullable<MetricCardProps['tone']>, string> = {
    default: 'text-slate-400',
    indigo: 'text-indigo-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
};

export const MetricCard: React.FC<MetricCardProps> = ({
    label,
    value,
    sublabel,
    tone = 'default',
    icon,
}) => (
    <div className={`rounded-2xl border p-5 ${toneStyles[tone]}`}>
        <div className={`flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-widest ${accentColors[tone]}`}>
            {icon}
            <span>{label}</span>
        </div>
        <div className="text-3xl font-black tabular-nums">{value}</div>
        {sublabel && (
            <div className="text-xs text-slate-500 mt-1">{sublabel}</div>
        )}
    </div>
);

export default MetricCard;
