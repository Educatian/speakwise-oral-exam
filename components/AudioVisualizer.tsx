import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  isLive: boolean;
  isActive: boolean;
  barCount?: number;
  color?: 'primary' | 'accent';
  /** Real normalized mic level (0–100). When provided, bars reflect actual
   *  input so a silent pause truthfully reads as flat — never fake activity. */
  audioLevel?: number;
}

const MIN_BAR = 8;
const MAX_EXTRA = 32;

/** Shape a normalized level (0–100) into per-bar heights with a center-peaked
 *  profile, so the visualizer looks like a spectrum but stays honest: at level
 *  0 every bar collapses to MIN_BAR. */
function levelToHeights(level: number, barCount: number): number[] {
  const clamped = Math.max(0, Math.min(100, level)) / 100;
  const center = (barCount - 1) / 2;
  return Array.from({ length: barCount }, (_, i) => {
    const dist = center === 0 ? 0 : Math.abs(i - center) / center; // 0 center → 1 edge
    const shape = 1 - 0.55 * dist; // edges shorter than center
    return MIN_BAR + clamped * MAX_EXTRA * shape;
  });
}

/**
 * Audio Visualizer Component
 * Displays animated bars representing audio levels.
 * When `audioLevel` is supplied the bars track the real mic signal; otherwise
 * it falls back to a gentle idle animation. Accessible via aria-live.
 */
export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isLive,
  isActive,
  barCount = 12,
  color = 'accent',
  audioLevel
}) => {
  const driveFromLevel = audioLevel != null;
  const [heights, setHeights] = useState<number[]>(Array(barCount).fill(MIN_BAR));
  const intervalRef = useRef<number | null>(null);

  const colorClass = color === 'primary' ? 'bg-emerald-500' : 'bg-indigo-500';

  useEffect(() => {
    // Only run the synthetic idle animation when we have no real level signal.
    if (isActive && isLive && !driveFromLevel) {
      intervalRef.current = window.setInterval(() => {
        setHeights(Array.from({ length: barCount }, () => Math.random() * MAX_EXTRA + MIN_BAR));
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (!driveFromLevel) setHeights(Array(barCount).fill(MIN_BAR));
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isLive, barCount, driveFromLevel]);

  const renderedHeights = driveFromLevel
    ? levelToHeights(isActive && isLive ? (audioLevel as number) : 0, barCount)
    : heights;

  const getStatusText = () => {
    if (!isLive) return 'Waiting to start';
    if (isActive) return 'Listening to student';
    return 'AI is speaking';
  };

  return (
    <div
      className="flex flex-col items-center gap-3"
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-center justify-center gap-1 h-12"
        aria-hidden="true"
      >
        {renderedHeights.map((height, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all duration-100 ${colorClass} ${isActive && isLive ? 'opacity-100' : 'opacity-30'
              }`}
            style={{
              height: `${height}px`,
              transitionDelay: `${i * 20}ms`
            }}
          />
        ))}
      </div>
      <span className="sr-only">{getStatusText()}</span>
    </div>
  );
};

export default AudioVisualizer;
