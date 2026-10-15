// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIC_PERMISSION_TIMEOUT_MS, requestMicrophone } from '../utils/micPermission';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function mockStream() {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    return { stream: { getTracks: () => tracks } as unknown as MediaStream, tracks };
}

describe('requestMicrophone', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns an allowed stream, preserving constraints and clearing the deadline', async () => {
        const { stream, tracks } = mockStream();
        const getUserMedia = vi.fn().mockResolvedValue(stream);
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
        const constraints = { audio: { echoCancellation: true } };
        const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        await expect(requestMicrophone(constraints, { signal: controller.signal })).resolves.toBe(stream);
        expect(getUserMedia).toHaveBeenCalledWith(constraints);
        expect(vi.getTimerCount()).toBe(0);
        expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
        controller.abort();
        tracks.forEach(track => expect(track.stop).not.toHaveBeenCalled());
    });

    it('preserves permission rejection and clears its timer', async () => {
        const denied = new DOMException('Denied', 'NotAllowedError');
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(denied) } });
        await expect(requestMicrophone({ audio: true })).rejects.toBe(denied);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('times out at 20 seconds and stops every track of a late grant', async () => {
        const pending = deferred<MediaStream>();
        const { stream, tracks } = mockStream();
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => pending.promise) } });
        const controller = new AbortController();
        const remove = vi.spyOn(controller.signal, 'removeEventListener');
        const result = requestMicrophone({ audio: true }, { signal: controller.signal });
        const rejection = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
        await vi.advanceTimersByTimeAsync(MIC_PERMISSION_TIMEOUT_MS);
        await rejection;
        expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
        pending.resolve(stream);
        await Promise.resolve();
        tracks.forEach(track => expect(track.stop).toHaveBeenCalledTimes(1));
        expect(vi.getTimerCount()).toBe(0);
    });

    it('aborts an outstanding request and stops a late grant', async () => {
        const pending = deferred<MediaStream>();
        const { stream, tracks } = mockStream();
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => pending.promise) } });
        const controller = new AbortController();
        const result = requestMicrophone({ audio: true }, { signal: controller.signal });
        const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
        controller.abort();
        await rejection;
        expect(vi.getTimerCount()).toBe(0);
        pending.resolve(stream);
        await Promise.resolve();
        tracks.forEach(track => expect(track.stop).toHaveBeenCalledTimes(1));
    });

    it('does not ask for permission when already aborted', async () => {
        const getUserMedia = vi.fn();
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
        const controller = new AbortController();
        controller.abort();
        await expect(requestMicrophone({ audio: true }, { signal: controller.signal }))
            .rejects.toMatchObject({ name: 'AbortError' });
        expect(getUserMedia).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('handles a late rejection after timeout without another rejection', async () => {
        const pending = deferred<MediaStream>();
        vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => pending.promise) } });
        const result = requestMicrophone({ audio: true });
        const rejection = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
        await vi.advanceTimersByTimeAsync(MIC_PERMISSION_TIMEOUT_MS);
        await rejection;
        pending.reject(new DOMException('Denied later', 'NotAllowedError'));
        await Promise.resolve();
        expect(vi.getTimerCount()).toBe(0);
    });
});
