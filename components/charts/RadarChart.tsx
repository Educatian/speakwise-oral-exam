import React from 'react';

export interface RadarSeries {
    label: string;
    values: number[]; // one per axis; same order as axes prop
    tone?: 'indigo' | 'emerald' | 'amber' | 'rose';
}

interface RadarChartProps {
    axes: string[];
    series: RadarSeries[];
    /** Max value of any axis — used to scale the polygon. Defaults to 100. */
    max?: number;
    /** Outer SVG size in pixels. */
    size?: number;
}

const toneStroke: Record<NonNullable<RadarSeries['tone']>, string> = {
    indigo: '#818cf8',
    emerald: '#34d399',
    amber: '#fbbf24',
    rose: '#fb7185',
};

const toneFill: Record<NonNullable<RadarSeries['tone']>, string> = {
    indigo: 'rgba(129, 140, 248, 0.18)',
    emerald: 'rgba(52, 211, 153, 0.18)',
    amber: 'rgba(251, 191, 36, 0.18)',
    rose: 'rgba(251, 113, 133, 0.18)',
};

// N-axis radar chart. Renders 3 concentric grid rings + one polygon per
// series. No animation; SVG only.
export const RadarChart: React.FC<RadarChartProps> = ({
    axes,
    series,
    max = 100,
    size = 280,
}) => {
    const cx = size / 2;
    const cy = size / 2;
    const radius = (size / 2) * 0.72; // leave room for axis labels
    const n = axes.length;
    if (n < 3) {
        return <div className="text-xs text-slate-500">RadarChart needs at least 3 axes.</div>;
    }

    // Angles — start at top (-pi/2), go clockwise.
    const angles = Array.from({ length: n }, (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / n);

    const axisEnds = angles.map((a) => ({
        x: cx + radius * Math.cos(a),
        y: cy + radius * Math.sin(a),
    }));

    const gridRings = [0.33, 0.66, 1];

    // Screen-reader summary carrying the actual numbers, since the polygon
    // itself is purely visual.
    const ariaSummary = series
        .map((s) =>
            `${s.label}: ${axes
                .map((axis, i) => `${axis} ${Math.round((s.values[i] ?? 0) * 10) / 10} of ${max}`)
                .join(', ')}`
        )
        .join('. ');

    const polygonFor = (s: RadarSeries) => {
        const pts = angles.map((a, i) => {
            const v = Math.min(max, Math.max(0, s.values[i] ?? 0));
            const r = (v / max) * radius;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        });
        return pts.join(' ');
    };

    return (
        <div className="w-full flex flex-col items-center gap-3">
            <svg
                viewBox={`0 0 ${size} ${size}`}
                className="w-full max-w-xs"
                role="img"
                aria-label={`Radar chart with ${n} axes. ${ariaSummary}`}
            >
                {/* grid rings */}
                {gridRings.map((f) => (
                    <polygon
                        key={f}
                        points={angles
                            .map((a) => `${cx + radius * f * Math.cos(a)},${cy + radius * f * Math.sin(a)}`)
                            .join(' ')}
                        fill="none"
                        stroke="#1e293b"
                        strokeWidth={1}
                    />
                ))}
                {/* axis spokes */}
                {axisEnds.map((p, i) => (
                    <line
                        key={i}
                        x1={cx}
                        y1={cy}
                        x2={p.x}
                        y2={p.y}
                        stroke="#1e293b"
                        strokeWidth={1}
                    />
                ))}
                {/* polygons */}
                {series.map((s, idx) => {
                    const tone = s.tone ?? 'indigo';
                    return (
                        <polygon
                            key={idx}
                            points={polygonFor(s)}
                            fill={toneFill[tone]}
                            stroke={toneStroke[tone]}
                            strokeWidth={2}
                        />
                    );
                })}
                {/* axis labels */}
                {axisEnds.map((p, i) => {
                    const textAnchor =
                        Math.abs(p.x - cx) < 2 ? 'middle' : p.x > cx ? 'start' : 'end';
                    const dx = textAnchor === 'start' ? 6 : textAnchor === 'end' ? -6 : 0;
                    const dy = p.y < cy ? -6 : 14;
                    return (
                        <text
                            key={i}
                            x={p.x + dx}
                            y={p.y + dy}
                            fontSize={10}
                            fontWeight={600}
                            fill="#94a3b8"
                            textAnchor={textAnchor}
                        >
                            {axes[i]}
                        </text>
                    );
                })}
            </svg>
            {series.length > 1 && (
                <div className="flex flex-wrap gap-3 text-xs">
                    {series.map((s, idx) => {
                        const tone = s.tone ?? 'indigo';
                        return (
                            <div key={idx} className="flex items-center gap-1.5">
                                <span
                                    className="inline-block w-3 h-3 rounded-sm"
                                    style={{ backgroundColor: toneStroke[tone] }}
                                />
                                <span className="text-slate-400">{s.label}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default RadarChart;
