import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  isLive: boolean;
  isActive: boolean;
  barCount?: number;
  color?: 'primary' | 'accent';
}

/**
 * Audio Visualizer Component
 * Displays animated bars representing audio levels
 * Accessible: Uses aria-live for screen reader updates
 */
export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isLive,
  isActive,
  barCount = 12,
  color = 'accent'
}) => {
  const [heights, setHeights] = useState<number[]>(Array(barCount).fill(8));
  const intervalRef = useRef<number | null>(null);

  const colorClass = color === 'primary' ? 'bg-emerald-500' : 'bg-indigo-500';

  useEffect(() => {
    if (isActive && isLive) {
      // Animate bars when active
      intervalRef.current = window.setInterval(() => {
        setHeights(Array.from({ length: barCount }, () =>
          Math.random() * 32 + 8
        ));
      }, 100);
    } else {
      // Reset to idle state
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setHeights(Array(barCount).fill(8));
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, isLive, barCount]);

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
        {heights.map((height, i) => (
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
