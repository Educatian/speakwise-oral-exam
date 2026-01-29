/**
 * Security utilities for input sanitization and XSS prevention
 */

/**
 * Sanitizes user input to prevent XSS attacks
 * Escapes HTML entities in strings
 */
export function sanitizeInput(input: string): string {
    if (typeof input !== 'string') return '';

    const entityMap: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    return input.replace(/[&<>"'`=\/]/g, char => entityMap[char]);
}

/**
 * Validates and sanitizes student name
 */
export function sanitizeStudentName(name: string): string {
    // Remove any HTML tags
    const strippedName = name.replace(/<[^>]*>/g, '');
    // Allow only letters, numbers, spaces, and common name characters
    const sanitized = strippedName.replace(/[^a-zA-Z0-9\s\-'.]/g, '');
    // Trim and limit length
    return sanitized.trim().substring(0, 100);
}

/**
 * Validates course number format (6 digits)
 */
export function isValidCourseNumber(courseNumber: string): boolean {
    return /^\d{6}$/.test(courseNumber);
}

/**
 * Validates password strength for course passwords
 */
export function isValidPassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 4) {
        return { valid: false, message: 'Password must be at least 4 characters' };
    }
    if (password.length > 50) {
        return { valid: false, message: 'Password must be less than 50 characters' };
    }
    return { valid: true };
}

/**
 * Sanitizes transcript text for display
 */
export function sanitizeTranscript(text: string): string {
    return sanitizeInput(text).substring(0, 10000);
}

/**
 * Rate limiting helper using localStorage
 */
export class RateLimiter {
    private key: string;
    private maxAttempts: number;
    private windowMs: number;

    constructor(key: string, maxAttempts: number = 5, windowMs: number = 60000) {
        this.key = `ratelimit_${key}`;
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
    }

    canProceed(): boolean {
        try {
            const stored = localStorage.getItem(this.key);
            const attempts = stored ? JSON.parse(stored) : [];
            const now = Date.now();

            // Filter attempts within the window
            const recentAttempts = attempts.filter((t: number) => now - t < this.windowMs);

            return recentAttempts.length < this.maxAttempts;
        } catch (e) {
            return true; // Fail open if storage fails
        }
    }

    recordAttempt(): void {
        try {
            const stored = localStorage.getItem(this.key);
            const attempts = stored ? JSON.parse(stored) : [];
            const now = Date.now();

            // Filter and add new attempt
            const recentAttempts = attempts.filter((t: number) => now - t < this.windowMs);
            recentAttempts.push(now);

            localStorage.setItem(this.key, JSON.stringify(recentAttempts));
        } catch (e) {
            console.error('Rate limiter storage error:', e);
        }
    }

    getRemainingAttempts(): number {
        try {
            const stored = localStorage.getItem(this.key);
            const attempts = stored ? JSON.parse(stored) : [];
            const now = Date.now();

            const recentAttempts = attempts.filter((t: number) => now - t < this.windowMs);
            return Math.max(0, this.maxAttempts - recentAttempts.length);
        } catch (e) {
            return this.maxAttempts;
        }
    }

    reset(): void {
        localStorage.removeItem(this.key);
    }
}

/**
 * Secure storage wrapper with basic encryption (obfuscation)
 * Note: This is for basic protection, not cryptographic security
 */
export const SecureStorage = {
    set(key: string, value: any): void {
        try {
            const serialized = JSON.stringify(value);
            const encoded = btoa(serialized);
            localStorage.setItem(`_ss_${key}`, encoded);
        } catch (e) {
            console.error('Secure storage write error:', e);
        }
    },

    get<T>(key: string, defaultValue: T): T {
        try {
            const encoded = localStorage.getItem(`_ss_${key}`);
            if (!encoded) return defaultValue;

            const serialized = atob(encoded);
            return JSON.parse(serialized) as T;
        } catch (e) {
            console.error('Secure storage read error:', e);
            return defaultValue;
        }
    },

    remove(key: string): void {
        localStorage.removeItem(`_ss_${key}`);
    }
};

export default {
    sanitizeInput,
    sanitizeStudentName,
    sanitizeTranscript,
    isValidCourseNumber,
    isValidPassword,
    RateLimiter,
    SecureStorage
};
