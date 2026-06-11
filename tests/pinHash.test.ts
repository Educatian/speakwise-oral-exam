import { describe, it, expect, beforeEach } from 'vitest';
import {
    hashPin,
    verifyPin,
    isValidPin,
    isRateLimited,
    recordFailedAttempt,
    clearRateLimit,
    getRemainingLockoutTime
} from '../lib/utils/pinHash';

describe('hashPin', () => {
    it('produces a 64-character hex SHA-256 digest', async () => {
        const hash = await hashPin('1234', 'course-abc');
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same pin and salt', async () => {
        const a = await hashPin('1234', 'course-abc');
        const b = await hashPin('1234', 'course-abc');
        expect(a).toBe(b);
    });

    it('changes when the salt changes', async () => {
        const a = await hashPin('1234', 'course-a');
        const b = await hashPin('1234', 'course-b');
        expect(a).not.toBe(b);
    });

    it('changes when the pin changes', async () => {
        const a = await hashPin('1234', 'course-a');
        const b = await hashPin('4321', 'course-a');
        expect(a).not.toBe(b);
    });
});

describe('verifyPin', () => {
    it('accepts the correct pin', async () => {
        const stored = await hashPin('9876', 'course-x');
        expect(await verifyPin('9876', 'course-x', stored)).toBe(true);
    });

    it('rejects a wrong pin or wrong salt', async () => {
        const stored = await hashPin('9876', 'course-x');
        expect(await verifyPin('1111', 'course-x', stored)).toBe(false);
        expect(await verifyPin('9876', 'course-y', stored)).toBe(false);
    });
});

describe('isValidPin', () => {
    it('accepts exactly four digits', () => {
        expect(isValidPin('0000')).toBe(true);
        expect(isValidPin('1234')).toBe(true);
    });

    it('rejects wrong lengths and non-digits', () => {
        expect(isValidPin('123')).toBe(false);
        expect(isValidPin('12345')).toBe(false);
        expect(isValidPin('12a4')).toBe(false);
        expect(isValidPin('')).toBe(false);
    });
});

describe('PIN rate limiting', () => {
    const id = 'course-rate-test';

    beforeEach(() => {
        localStorage.clear();
    });

    it('is not rate limited initially', () => {
        expect(isRateLimited(id)).toBe(false);
        expect(getRemainingLockoutTime(id)).toBe(0);
    });

    it('counts down remaining attempts on failures', () => {
        expect(recordFailedAttempt(id)).toBe(4);
        expect(recordFailedAttempt(id)).toBe(3);
        expect(recordFailedAttempt(id)).toBe(2);
    });

    it('locks out after five failed attempts', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(id);
        expect(isRateLimited(id)).toBe(true);
        const remaining = getRemainingLockoutTime(id);
        expect(remaining).toBeGreaterThan(0);
        expect(remaining).toBeLessThanOrEqual(15 * 60);
    });

    it('clears the lockout', () => {
        for (let i = 0; i < 5; i++) recordFailedAttempt(id);
        clearRateLimit(id);
        expect(isRateLimited(id)).toBe(false);
        expect(getRemainingLockoutTime(id)).toBe(0);
    });
});
