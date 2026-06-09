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

    // In PRODUCTION a missing Supabase config is a hard failure: silently
    // running in localStorage-only mode means submissions "persist" on one
    // device and are never centralized — a confidentiality + data-loss risk
    // dressed up as success. In DEV it is only a warning (local-only is a
    // legitimate offline workflow). isValid reflects this so a boot guard can
    // refuse to start a misconfigured production build.
    const inProd = import.meta.env.PROD;
    const noteMissing = (name: string) => {
        if (inProd) missing.push(name);
        else warnings.push(`${name} is not set - using localStorage fallback`);
    };

    if (!env.VITE_SUPABASE_URL) noteMissing('VITE_SUPABASE_URL');
    if (!env.VITE_SUPABASE_ANON_KEY) noteMissing('VITE_SUPABASE_ANON_KEY');

    if (import.meta.env.DEV && warnings.length > 0) {
        console.warn('[Env] Configuration warnings:');
        warnings.forEach(w => console.warn(`  - ${w}`));
    }
    if (inProd && missing.length > 0) {
        console.error(
            `[Env] FATAL: required environment variables are missing in production: ${missing.join(', ')}. ` +
            'The app would otherwise run in insecure localStorage-only mode (data is not centralized). ' +
            'Set these in your deployment environment.'
        );
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
