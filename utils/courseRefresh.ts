/** Latest-request wins, including invalidation after a confirmed local mutation. */
export function createRefreshController<T>(load: () => Promise<T>, commit: (value: T) => void, onError: (error: unknown) => void) {
    let revision = 0;
    let disposed = false;
    return {
        async refresh(): Promise<void> {
            const request = ++revision;
            try {
                const value = await load();
                if (!disposed && request === revision) commit(value);
            } catch (error) {
                if (!disposed && request === revision) onError(error);
            }
        },
        invalidate() { ++revision; },
        dispose() { disposed = true; ++revision; }
    };
}

export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
    return [item, ...items.filter(existing => existing.id !== item.id)];
}

/** D1 has no realtime transport. Refresh explicitly when returning to the app. */
export function listenForRefresh(authEvent: string, refresh: () => void, authChanged: () => void): () => void {
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener(authEvent, authChanged);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
        window.removeEventListener(authEvent, authChanged);
        window.removeEventListener('focus', refresh);
        document.removeEventListener('visibilitychange', visible);
    };
}
