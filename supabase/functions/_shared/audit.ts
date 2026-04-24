// Append-only audit log writer. Failures here must NEVER break the parent
// request — log and move on.

import { getSupabaseAdmin } from "./supabase-admin.ts";
import type { Caller } from "./auth.ts";

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export async function writeAudit(
  req: Request,
  caller: Caller | null,
  entry: AuditEntry,
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("cf-connecting-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;
    await admin.from("audit_logs").insert({
      actor_user_id: caller?.userId ?? null,
      actor_email: caller?.email ?? null,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      ip_address: ip,
      user_agent: ua,
      details: entry.details ?? null,
    });
  } catch (e) {
    console.error("[audit] write failed", e);
  }
}
