/**
 * Environment Variable Validation
 * Ensures all required environment variables are present before runtime
 */

interface EnvConfig {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
}

interface ValidationResult {
    isValid: boolean;
    missing: string[];
    warnings: string[];
}

/**
 * Validate required environment variables
 */
export function validateEnv(): ValidationResult {
    const env = import.meta.env as EnvConfig;
    const missing: string[] = [];
    const warnings: string[] = [];

    // Optional but recommended
    if (!env.VITE_SUPABASE_URL) {
        warnings.push('VITE_SUPABASE_URL is not set - using localStorage fallback');
    }
    if (!env.VITE_SUPABASE_ANON_KEY) {
        warnings.push('VITE_SUPABASE_ANON_KEY is not set - using localStorage fallback');
    }

    // Log warnings in development
    if (import.meta.env.DEV && warnings.length > 0) {
        console.warn('[Env] Configuration warnings:');
        warnings.forEach(w => console.warn(`  - ${w}`));
    }

    return {
        isValid: missing.length === 0,
        missing,
        warnings
    };
}

/**
 * Get environment variable with type safety
 */
export function getEnv<T extends keyof EnvConfig>(key: T): EnvConfig[T] {
    return import.meta.env[key];
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
    return import.meta.env.PROD;
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
    return import.meta.env.DEV;
}

export default validateEnv;
