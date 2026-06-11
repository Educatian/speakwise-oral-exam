import { describe, it, expect, beforeEach } from 'vitest';
import {
    sanitizeInput,
    sanitizeStudentName,
    sanitizeTranscript,
    isValidCourseNumber,
    isValidPassword,
    RateLimiter,
    SecureStorage
} from '../lib/security/sanitize';

beforeEach(() => {
    localStorage.clear();
});

describe('sanitizeInput', () => {
    it('escapes HTML entities to prevent XSS', () => {
        expect(sanitizeInput('<script>alert("x")</script>')).toBe(
            '&lt;script&gt;alert(&quot;x&quot;)&lt;&#x2F;script&gt;'
        );
    });

    it('escapes ampersands, quotes, backticks, and equals', () => {
        expect(sanitizeInput("a&b='c'`")).toBe('a&amp;b&#x3D;&#39;c&#39;&#x60;');
    });

    it('returns an empty string for non-string input', () => {
        expect(sanitizeInput(123 as unknown as string)).toBe('');
        expect(sanitizeInput(null as unknown as string)).toBe('');
    });

    it('leaves safe text untouched', () => {
        expect(sanitizeInput('hello world 123')).toBe('hello world 123');
    });
});

describe('sanitizeStudentName', () => {
    it('strips HTML tags and disallowed characters', () => {
        expect(sanitizeStudentName('<b>John</b> Doe!!')).toBe('John Doe');
    });

    it('keeps common name characters', () => {
        expect(sanitizeStudentName("O'Brien-Smith Jr.")).toBe("O'Brien-Smith Jr.");
    });

    it('limits the name to 100 characters', () => {
        expect(sanitizeStudentName('a'.repeat(150))).toHaveLength(100);
    });
});

describe('isValidCourseNumber', () => {
    it('accepts exactly six digits', () => {
        expect(isValidCourseNumber('123456')).toBe(true);
    });

    it('rejects wrong lengths and non-digits', () => {
        expect(isValidCourseNumber('12345')).toBe(false);
        expect(isValidCourseNumber('1234567')).toBe(false);
        expect(isValidCourseNumber('12a456')).toBe(false);
        expect(isValidCourseNumber('')).toBe(false);
    });
});

describe('isValidPassword', () => {
    it('rejects passwords shorter than 4 characters', () => {
        const result = isValidPassword('abc');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('at least 4');
    });

    it('rejects passwords longer than 50 characters', () => {
        expect(isValidPassword('a'.repeat(51)).valid).toBe(false);
    });

    it('accepts a reasonable password', () => {
        const result = isValidPassword('secure-pass');
        expect(result.valid).toBe(true);
        expect(result.message).toBeUndefined();
    });
});

describe('sanitizeTranscript', () => {
    it('escapes and truncates to 10000 characters', () => {
        const long = 'a'.repeat(20000);
        expect(sanitizeTranscript(long)).toHaveLength(10000);
        expect(sanitizeTranscript('<hi>')).toBe('&lt;hi&gt;');
    });
});

describe('RateLimiter', () => {
    it('allows attempts under the limit and blocks past it', () => {
        const limiter = new RateLimiter('test-action', 2, 60000);
        expect(limiter.canProceed()).toBe(true);
        limiter.recordAttempt();
        expect(limiter.canProceed()).toBe(true);
        limiter.recordAttempt();
        expect(limiter.canProceed()).toBe(false);
    });

    it('reports remaining attempts and resets', () => {
        const limiter = new RateLimiter('test-action-2', 3, 60000);
        expect(limiter.getRemainingAttempts()).toBe(3);
        limiter.recordAttempt();
        expect(limiter.getRemainingAttempts()).toBe(2);
        limiter.reset();
        expect(limiter.getRemainingAttempts()).toBe(3);
        expect(limiter.canProceed()).toBe(true);
    });
});

describe('SecureStorage', () => {
    it('round-trips structured values', () => {
        SecureStorage.set('profile', { name: 'Kim', score: 92 });
        expect(SecureStorage.get('profile', null)).toEqual({ name: 'Kim', score: 92 });
    });

    it('returns the default for missing keys', () => {
        expect(SecureStorage.get('missing-key', 'fallback')).toBe('fallback');
    });

    it('stores values base64-obfuscated, not in plain text', () => {
        SecureStorage.set('secret', 'value123');
        expect(localStorage.getItem('_ss_secret')).not.toContain('value123');
    });

    it('removes values', () => {
        SecureStorage.set('temp', 1);
        SecureStorage.remove('temp');
        expect(SecureStorage.get('temp', 'gone')).toBe('gone');
    });
});
