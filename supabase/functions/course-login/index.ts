// POST /functions/v1/course-login
//
// Validates a course passcode server-side. After RLS lands, the `password`
// column on `public.courses` is revoked from the anon/authenticated roles,
// so the client can no longer compare passwords locally. This endpoint is
// the only way a student's browser can confirm that a passcode is correct.
//
// On success returns the public-facing course metadata the interview needs
// (name, instructor prompt). The passcode itself is not echoed back.

import {
  errorResponse,
  jsonResponse,
  preflight,
} from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import {
  bucketKey,
  checkRateLimit,
  clientIp,
} from "../_shared/rate-limit.ts";

const MAX_PASSCODE_LEN = 200;

// Rate-limit tuning. A 6-digit numeric passcode has 1M possibilities, so
// 10/min per (user, course) makes an online exhaust take ~69 days.
// Paired with per-IP 60/min to bound cross-user attempts.
const PER_CALLER_WINDOW_SECONDS = 60;
const PER_CALLER_LIMIT = 10;
const PER_IP_WINDOW_SECONDS = 60;
const PER_IP_LIMIT = 60;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return errorResponse(req, 405, "method not allowed");

  const caller = getCaller(req);
  if (!caller) return errorResponse(req, 401, "unauthenticated");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, 400, "invalid json");
  }

  const courseId = body.courseId;
  const passcode = body.passcode;

  // Rate-limit before hitting the database so brute-force attempts are
  // cheap for us and expensive for the caller.
  const perCaller = await checkRateLimit(
    bucketKey("course-login", caller.userId, typeof courseId === "string" ? courseId : ""),
    PER_CALLER_WINDOW_SECONDS,
    PER_CALLER_LIMIT,
  );
  if (!perCaller.ok) {
    await writeAudit(req, caller, {
      action: "course_login.rate_limited",
      resourceType: "course",
      resourceId: typeof courseId === "string" ? courseId : null,
      details: { scope: "caller" },
    });
    return errorResponse(req, 429, "too many attempts; try later");
  }
  const ip = clientIp(req);
  if (ip) {
    const perIp = await checkRateLimit(
      bucketKey("course-login-ip", ip),
      PER_IP_WINDOW_SECONDS,
      PER_IP_LIMIT,
    );
    if (!perIp.ok) {
      await writeAudit(req, caller, {
        action: "course_login.rate_limited",
        resourceType: "course",
        resourceId: typeof courseId === "string" ? courseId : null,
        details: { scope: "ip" },
      });
      return errorResponse(req, 429, "too many attempts; try later");
    }
  }
  if (typeof courseId !== "string" || courseId.length === 0) {
    return errorResponse(req, 400, "courseId required");
  }
  if (
    typeof passcode !== "string" ||
    passcode.length === 0 ||
    passcode.length > MAX_PASSCODE_LEN
  ) {
    return errorResponse(req, 400, "passcode required");
  }

  const admin = getSupabaseAdmin();
  const { data: course, error } = await admin
    .from("courses")
    .select("id, name, prompt, instructor_name, password, owner_email")
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    console.error("[course-login] lookup error", error);
    return errorResponse(req, 500, "lookup failed");
  }
  if (!course) {
    await writeAudit(req, caller, {
      action: "course_login.not_found",
      resourceType: "course",
      resourceId: courseId,
    });
    return errorResponse(req, 404, "course not found");
  }

  // Case-sensitive comparison (matches legacy client-side behavior). If the
  // instructor set it as 6-digit numeric, case doesn't matter either way.
  if (course.password !== passcode) {
    await writeAudit(req, caller, {
      action: "course_login.bad_passcode",
      resourceType: "course",
      resourceId: courseId,
    });
    // Constant-ish response time would be ideal; Postgres row lookup already
    // did the bulk of the work, so the timing side-channel is small.
    return errorResponse(req, 403, "incorrect passcode");
  }

  await writeAudit(req, caller, {
    action: "course_login.success",
    resourceType: "course",
    resourceId: courseId,
  });

  return jsonResponse(req, {
    course: {
      id: course.id,
      name: course.name,
      prompt: course.prompt,
      instructorName: course.instructor_name,
      ownerEmail: course.owner_email,
    },
  });
});
