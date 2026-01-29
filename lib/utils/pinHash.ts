// PIN Hashing Utility for Instructor Authentication
// Uses SHA-256 with courseId as salt

/**
 * Hash a PIN using SHA-256 with salt
 * @param pin - The plain text PIN (4 digits)
 * @param salt - Salt value (courseId is recommended)
 * @returns Hex-encoded hash string
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + salt);

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
}

/**
 * Verify a PIN against a stored hash
 * @param pin - The plain text PIN to verify
 * @param salt - Salt value used during hashing
 * @param storedHash - The stored hash to compare against
 * @returns True if PIN matches
 */
export async function verifyPin(pin: string, salt: string, storedHash: string): Promise<boolean> {
    const computedHash = await hashPin(pin, salt);
    return computedHash === storedHash;
}

/**
 * Validate PIN format (4 digits)
 * @param pin - The PIN to validate
 * @returns True if valid format
 */
export function isValidPin(pin: string): boolean {
    return /^\d{4}$/.test(pin);
}

// Rate limiting for PIN verification (localStorage-based)
const RATE_LIMIT_KEY = 'speakwise_pin_attempts';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

interface RateLimitData {
    attempts: number;
    lastAttempt: number;
    lockedUntil: number | null;
}

/**
 * Check if user is rate limited
 * @param identifier - Unique identifier (courseId or IP)
 * @returns True if rate limited
 */
export function isRateLimited(identifier: string): boolean {
    const data = getRateLimitData(identifier);
    if (!data) return false;

    if (data.lockedUntil && Date.now() < data.lockedUntil) {
        return true;
    }

    // Reset if lockout expired
    if (data.lockedUntil && Date.now() >= data.lockedUntil) {
        clearRateLimit(identifier);
        return false;
    }

    return false;
}

/**
 * Record a failed PIN attempt
 * @param identifier - Unique identifier
 * @returns Remaining attempts before lockout
 */
export function recordFailedAttempt(identifier: string): number {
    const storageKey = `${RATE_LIMIT_KEY}_${identifier}`;
    let data = getRateLimitData(identifier) || {
        attempts: 0,
        lastAttempt: 0,
        lockedUntil: null
    };

    data.attempts += 1;
    data.lastAttempt = Date.now();

    if (data.attempts >= MAX_ATTEMPTS) {
        data.lockedUntil = Date.now() + LOCKOUT_DURATION;
    }

    localStorage.setItem(storageKey, JSON.stringify(data));
    return Math.max(0, MAX_ATTEMPTS - data.attempts);
}

/**
 * Clear rate limit for an identifier
 * @param identifier - Unique identifier
 */
export function clearRateLimit(identifier: string): void {
    localStorage.removeItem(`${RATE_LIMIT_KEY}_${identifier}`);
}

/**
 * Get remaining lockout time in seconds
 * @param identifier - Unique identifier
 * @returns Remaining seconds, or 0 if not locked
 */
export function getRemainingLockoutTime(identifier: string): number {
    const data = getRateLimitData(identifier);
    if (!data || !data.lockedUntil) return 0;

    const remaining = data.lockedUntil - Date.now();
    return Math.max(0, Math.ceil(remaining / 1000));
}

function getRateLimitData(identifier: string): RateLimitData | null {
    try {
        const stored = localStorage.getItem(`${RATE_LIMIT_KEY}_${identifier}`);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}
