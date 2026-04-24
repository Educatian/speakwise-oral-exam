import React from 'react';

interface SparklineProps {
    values: number[];
    /** Rendered width in px (defaults to 100% of container via viewBox). */
    width?: number;
    /** Rendered height in px. */
    height?: number;
    tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
    /** Show filled area under the line. */
    area?: boolean;
    /** Override y-axis bounds; otherwise derived from values. */
    min?: number;
    max?: number;
}

const toneStroke: Record<NonNullable<SparklineProps['tone']>, string> = {
    indigo: '#818cf8',
    emerald: '#34d399',
    amber: '#fbbf24',
    rose: '#fb7185',
};

const toneArea: Record<NonNullable<SparklineProps['tone']>, string> = {
    indigo: 'rgba(129, 140, 248, 0.18)',
    emerald: 'rgba(52, 211, 153, 0.18)',
    amber: 'rgba(251, 191, 36, 0.18)',
    rose: 'rgba(251, 113, 133, 0.18)',
};

// Tiny line chart for trends. Takes a flat array of numbers and draws a
// polyline scaled to the viewBox. `area` fills under the line.
export const Sparkline: React.FC<SparklineProps> = ({
    values,
    width = 320,
    height = 60,
    tone = 'indigo',
    area = true,
    min,
    max,
}) => {
    if (values.length === 0) {
        return (
            <div style={{ height }} className="flex items-center text-xs text-slate-500">
                No data.
            </div>
        );
    }

    const lo = min ?? Math.min(...values);
    const hi = max ?? Math.max(...values);
    const span = hi - lo || 1;
    const padY = 4;
    const usableH = height - padY * 2;

    const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);
    const y = (v: number) => padY + usableH - ((v - lo) / span) * usableH;

    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const areaPath = area
        ? `M ${x(0).toFixed(1)},${height} L ${points
              .split(' ')
              .map((p) => p.replace(',', ' '))
              .join(' L ')} L ${x(values.length - 1).toFixed(1)},${height} Z`
        : null;

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label="Trend sparkline"
        >
            {areaPath && <path d={areaPath} fill={toneArea[tone]} />}
            <polyline
                fill="none"
                stroke={toneStroke[tone]}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
            />
        </svg>
    );
};

export default Sparkline;
