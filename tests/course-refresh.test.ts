import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRefreshController, listenForRefresh, upsertById } from '../utils/courseRefresh';
import { addSubmissionToCourse, getAllCourses, getStudentHistory } from '../lib/supabase/database';
import type { Submission } from '../types';
const backend = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../lib/supabase/client', () => ({ supabase: backend, isSupabaseConfigured: () => true }));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('course/history refresh ordering', () => {
    it('ignores old loads that resolve after the latest auth reload', async () => {
        const first = deferred<string[]>();
        const next = deferred<string[]>();
        const commit = vi.fn();
        const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
        const controller = createRefreshController(load, commit, vi.fn());
        const a = controller.refresh();
        controller.invalidate();
        const b = controller.refresh();
        next.resolve(['new user']);
        await b;
        first.resolve(['previous user']);
        await a;
        expect(commit.mock.calls).toEqual([[['new user']]]);
    });
    it('prevents a load begun before a confirmed submission from erasing it', async () => {
        const pending = deferred<string[]>();
        const commit = vi.fn();
        const controller = createRefreshController(() => pending.promise, commit, vi.fn());
        const loading = controller.refresh();
        controller.invalidate();
        pending.resolve([]);
        await loading;
        expect(commit).not.toHaveBeenCalled();
    });
    it('ignores both success and errors after unsubscribe', async () => {
        for (const fails of [false, true]) {
            const pending = deferred<string[]>();
            const commit = vi.fn();
            const error = vi.fn();
            const controller = createRefreshController(() => pending.promise, commit, error);
            const loading = controller.refresh();
            controller.dispose();
            if (fails) pending.reject(new Error('late failure'));
            else pending.resolve(['late']);
            await loading;
            expect(commit).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
        }
    });
    it('surfaces current errors without committing an empty result', async () => {
        const failure = new Error('network');
        const commit = vi.fn();
        const error = vi.fn();
        const controller = createRefreshController(async () => { throw failure; }, commit, error);
        await controller.refresh();
        expect(error).toHaveBeenCalledWith(failure);
        expect(commit).not.toHaveBeenCalled();
    });
    it('deduplicates repeated confirmed submissions and preserves others', () => {
        const existing = [{ id: 'a', score: 1 }, { id: 'b', score: 2 }];
        expect(upsertById(existing, { id: 'a', score: 3 })).toEqual([{ id: 'a', score: 3 }, { id: 'b', score: 2 }]);
        expect(existing[0].score).toBe(1);
    });
    it('reloads on auth, focus and becoming visible, and removes listeners', () => {
        const win = new EventTarget();
        const doc = Object.assign(new EventTarget(), { visibilityState: 'hidden' });
        vi.stubGlobal('window', win);
        vi.stubGlobal('document', doc);
        const refresh = vi.fn();
        const auth = vi.fn();
        const stop = listenForRefresh('auth', refresh, auth);
        win.dispatchEvent(new Event('auth'));
        win.dispatchEvent(new Event('focus'));
        doc.dispatchEvent(new Event('visibilitychange'));
        expect(auth).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(1);
        doc.visibilityState = 'visible';
        doc.dispatchEvent(new Event('visibilitychange'));
        expect(refresh).toHaveBeenCalledTimes(2);
        stop();
        win.dispatchEvent(new Event('auth'));
        win.dispatchEvent(new Event('focus'));
        doc.dispatchEvent(new Event('visibilitychange'));
        expect(auth).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});

describe('confirmed database writes and reads', () => {
    it('rejects a failed submission insert instead of saving an offline fallback', async () => {
        const failure = new Error('insert rejected');
        const storage = { getItem: vi.fn(), setItem: vi.fn() };
        vi.stubGlobal('localStorage', storage);
        backend.from.mockImplementation((table: string) => table === 'courses'
            ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { institution_id: 'school' } }) }) }) }
            : { insert: async () => ({ error: failure }) });
        await expect(addSubmissionToCourse('course', { id: 'submission' } as Submission)).rejects.toBe(failure);
        expect(storage.setItem).not.toHaveBeenCalled();
    });
    it('propagates read errors instead of returning an empty course list', async () => {
        const failure = new Error('read rejected');
        backend.from.mockReturnValue({ select: () => ({ order: async () => ({ error: failure }) }) });
        await expect(getAllCourses()).rejects.toBe(failure);
    });
    it('does not expose device history in a signed-out database session', async () => {
        vi.stubGlobal('localStorage', { getItem: vi.fn(() => null) });
        expect(await getStudentHistory()).toEqual([]);
        expect(backend.from).not.toHaveBeenCalled();
    });
});
