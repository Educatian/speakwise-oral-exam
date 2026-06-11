import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * Measures the rendered width of a container element via ResizeObserver.
 *
 * Returns `[ref, width]`. `width` is `null` until the first measurement so
 * callers can fall back to their desktop default sizing on the initial
 * render (and in non-browser environments where ResizeObserver is absent).
 */
export function useContainerWidth<T extends HTMLElement>(): [
    React.RefObject<T | null>,
    number | null,
] {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState<number | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Initial synchronous measure so the first paint after mount is correct.
        setWidth(el.clientWidth);
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setWidth(entry.contentRect.width);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return [ref, width];
}

export default useContainerWidth;
