// Thin wrapper over the public.increment_rate_limit() SQL function.
// Returns { ok: true } when the caller is under the limit; { ok: false,
// retryAfterSeconds } when blocked. Failures to reach the rate-limit
// service are treated as "allow" — a tripped RL service should never
// break the main flow.

import { getSupabaseAdmin } from "./supabase-admin.ts";

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

export async function checkRateLimit(
  bucketKey: string,
  windowSeconds: number,
  limit: number,
): Promise<RateLimitResult> {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("increment_rate_limit", {
      p_bucket_key: bucketKey,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    });
    if (error) {
      console.warn("[rate-limit] rpc error, allowing:", error);
      return { ok: true };
    }
    if (data === false) {
      // Worst-case wait: the full window. Caller can halve it if they want.
      return { ok: false, retryAfterSeconds: windowSeconds };
    }
    return { ok: true };
  } catch (e) {
    console.warn("[rate-limit] unexpected error, allowing:", e);
    return { ok: true };
  }
}

// Compose a bucket key from identifier components. Keep them short —
// stored as TEXT in the bucket table.
export function bucketKey(scope: string, ...parts: (string | null | undefined)[]): string {
  const safe = parts.map((p) => (p ?? "").slice(0, 64));
  return `${scope}:${safe.join("|")}`;
}

// Extract a coarse IP from the request for anonymous (unauthenticated) RL
// fallbacks. Gateway strips spoofed headers for us.
export function clientIp(req: Request): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim() || null;
  return req.headers.get("cf-connecting-ip") ?? null;
}
