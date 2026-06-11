import React, { useMemo } from 'react';

interface HistogramProps {
    values: number[];
    /** Inclusive min of the domain, defaults to Math.min(values). */
    min?: number;
    /** Inclusive max of the domain, defaults to Math.max(values). */
    max?: number;
    /** Number of equal-width bins. */
    bins?: number;
    /** Tailwind height class, e.g. "h-32". */
    heightClass?: string;
    /** Unit suffix for axis labels, e.g. "%". */
    unit?: string;
}

interface Bin {
    start: number;
    end: number;
    count: number;
}

// Equal-width binning. Values on a bin boundary land in the lower bin
// (standard half-open [start, end)), except the final bin which is closed
// so Math.max(values) is always included.
export const Histogram: React.FC<HistogramProps> = ({
    values,
    min,
    max,
    bins = 10,
    heightClass = 'h-32',
    unit = '',
}) => {
    const { binned, domainMin, domainMax, peak } = useMemo(() => {
        const lo = min ?? (values.length ? Math.min(...values) : 0);
        const hi = max ?? (values.length ? Math.max(...values) : 1);
        const span = hi - lo || 1;
        const width = span / bins;
        const b: Bin[] = Array.from({ length: bins }, (_, i) => ({
            start: lo + i * width,
            end: lo + (i + 1) * width,
            count: 0,
        }));
        for (const v of values) {
            if (v >= hi) {
                b[b.length - 1].count += 1;
            } else if (v <= lo) {
                b[0].count += 1;
            } else {
                const idx = Math.min(bins - 1, Math.floor((v - lo) / width));
                b[idx].count += 1;
            }
        }
        return {
            binned: b,
            domainMin: lo,
            domainMax: hi,
            peak: Math.max(1, ...b.map((x) => x.count)),
        };
    }, [values, min, max, bins]);

    if (values.length === 0) {
        return (
            <div className={`${heightClass} flex items-center justify-center text-xs text-slate-500`}>
                No data.
            </div>
        );
    }

    const peakBin = binned.reduce((best, b) => (b.count > best.count ? b : best), binned[0]);

    return (
        <div
            className="w-full"
            role="img"
            aria-label={`Histogram of ${values.length} value${values.length === 1 ? '' : 's'} from ${domainMin.toFixed(0)}${unit} to ${domainMax.toFixed(0)}${unit}. Largest group: ${peakBin.count} between ${peakBin.start.toFixed(0)}${unit} and ${peakBin.end.toFixed(0)}${unit}.`}
        >
            <div className={`flex items-end gap-1 ${heightClass}`} aria-hidden="true">
                {binned.map((b, i) => {
                    const h = (b.count / peak) * 100;
                    return (
                        <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                            <div className="text-[10px] text-slate-500 tabular-nums">
                                {b.count > 0 ? b.count : ''}
                            </div>
                            <div
                                className="w-full bg-indigo-500/70 hover:bg-indigo-400 rounded-t transition-colors"
                                style={{ height: `${h}%`, minHeight: b.count > 0 ? 2 : 0 }}
                                title={`${b.start.toFixed(0)}${unit}–${b.end.toFixed(0)}${unit}: ${b.count}`}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 tabular-nums">
                <span>
                    {domainMin.toFixed(0)}
                    {unit}
                </span>
                <span>
                    {domainMax.toFixed(0)}
                    {unit}
                </span>
            </div>
        </div>
    );
};

export default Histogram;
