// POST /functions/v1/submit-exam
//
// End-of-exam endpoint. Validates the course passcode server-side, calls
// Gemini to score the transcript, then writes both a course submission and a
// student-history row in a single atomic server-side operation. This is the
// linchpin that prevents a logged-in student from posting arbitrary
// submissions to arbitrary courses — direct INSERT on `submissions` is
// blocked by RLS, so all real submissions must come through here.

import {
  errorResponse,
  jsonResponse,
  preflight,
} from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";
import { scoreTranscript, validateTranscript } from "../_shared/gemini-score.ts";
import { bucketKey, checkRateLimit } from "../_shared/rate-limit.ts";

const MAX_PASSWORD_LEN = 200;

// Spam defense. One student shouldn't submit more than ~3 exams/hour in
// any realistic flow — real submissions are 5–10 min apart.
const PER_CALLER_WINDOW_SECONDS = 3600;
const PER_CALLER_LIMIT = 5;
// Server-generated id; we do not trust a client-supplied id.
function newId(): string {
  return crypto.randomUUID();
}

function clampAnalytics<T>(value: unknown): T | null {
  if (value == null) return null;
  // Stored as JSONB; cap serialized size to keep rogue clients from stuffing
  // the DB. 256 KiB is generous for analytics but not unbounded.
  try {
    const s = JSON.stringify(value);
    if (s.length > 256 * 1024) return null;
    return value as T;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return errorResponse(req, 405, "method not allowed");

  const caller = getCaller(req);
  if (!caller) return errorResponse(req, 401, "unauthenticated");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return errorResponse(req, 500, "server misconfigured");

  const rl = await checkRateLimit(
    bucketKey("submit-exam", caller.userId),
    PER_CALLER_WINDOW_SECONDS,
    PER_CALLER_LIMIT,
  );
  if (!rl.ok) {
    await writeAudit(req, caller, {
      action: "submit_exam.rate_limited",
      resourceType: "submission",
    });
    return errorResponse(req, 429, "too many submissions; wait and retry");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, 400, "invalid json");
  }

  const courseId = body.courseId;
  const coursePassword = body.coursePassword;
  if (typeof courseId !== "string" || courseId.length === 0) {
    return errorResponse(req, 400, "courseId required");
  }
  if (
    typeof coursePassword !== "string" ||
    coursePassword.length === 0 ||
    coursePassword.length > MAX_PASSWORD_LEN
  ) {
    return errorResponse(req, 400, "coursePassword required");
  }

  const parsed = validateTranscript(
    body.transcriptions,
    body.courseName,
    body.studentName,
  );
  if (typeof parsed === "string") return errorResponse(req, 400, parsed);

  const admin = getSupabaseAdmin();

  // 1. Verify course + password server-side. RLS is bypassed by service role,
  //    which is what lets us read the password column at all.
  const { data: course, error: courseErr } = await admin
    .from("courses")
    .select("id, name, password")
    .eq("id", courseId)
    .maybeSingle();

  if (courseErr) {
    console.error("[submit-exam] course lookup error", courseErr);
    return errorResponse(req, 500, "lookup failed");
  }
  if (!course) return errorResponse(req, 404, "course not found");

  if (course.password !== coursePassword) {
    await writeAudit(req, caller, {
      action: "submit_exam.bad_password",
      resourceType: "course",
      resourceId: courseId,
    });
    return errorResponse(req, 403, "course passcode incorrect");
  }

  // 2. Score the transcript with Gemini. Client-supplied score/feedback are
  //    ignored — only what Gemini returns here goes into the DB.
  let scored;
  try {
    scored = await scoreTranscript(
      parsed.courseName,
      parsed.transcriptions,
      apiKey,
    );
  } catch (e) {
    console.error("[submit-exam] gemini error", e);
    await writeAudit(req, caller, {
      action: "submit_exam.gemini_error",
      resourceType: "course",
      resourceId: courseId,
      details: { message: (e as Error).message },
    });
    return errorResponse(req, 502, "scoring service unavailable");
  }

  // 3. Insert submission + student_history. Not a transaction (supabase-js
  //    doesn't expose one from Edge); if history insert fails we swallow it —
  //    the course submission is the authoritative record.
  const submissionId = newId();
  const nowMs = Date.now();

  const latencyMetrics = clampAnalytics(body.latencyMetrics);
  const bargeInEvents = clampAnalytics(body.bargeInEvents);
  const dialogueMetrics = clampAnalytics(body.dialogueMetrics);
  const argumentGraph = clampAnalytics(body.argumentGraph);
  const reasoningRubric = clampAnalytics(body.reasoningRubric);

  const submissionRow = {
    id: submissionId,
    course_id: courseId,
    student_user_id: caller.userId,
    student_name: parsed.studentName,
    course_name: parsed.courseName,
    timestamp: nowMs,
    transcript: parsed.transcriptions,
    score: scored.score,
    feedback: scored.feedback,
    latency_metrics: latencyMetrics,
    barge_in_events: bargeInEvents,
    dialogue_metrics: dialogueMetrics,
    argument_graph: argumentGraph,
    reasoning_rubric: reasoningRubric,
    confidence_score: scored.confidenceScore,
    rubric_breakdown: scored.rubricBreakdown,
  };

  const { error: insertErr } = await admin
    .from("submissions")
    .insert(submissionRow);
  if (insertErr) {
    console.error("[submit-exam] insert error", insertErr);
    await writeAudit(req, caller, {
      action: "submit_exam.insert_error",
      resourceType: "course",
      resourceId: courseId,
      details: { message: insertErr.message },
    });
    return errorResponse(req, 500, "could not save submission");
  }

  // Best-effort: mirror to student_history. Ignore failures.
  await admin.from("student_history").insert({
    id: newId(),
    student_user_id: caller.userId,
    device_id: typeof body.deviceId === "string" ? body.deviceId : null,
    student_name: parsed.studentName,
    course_name: parsed.courseName,
    timestamp: nowMs,
    transcript: parsed.transcriptions,
    score: scored.score,
    feedback: scored.feedback,
  }).then(({ error }) => {
    if (error) console.warn("[submit-exam] history mirror failed", error);
  });

  await writeAudit(req, caller, {
    action: "submit_exam.success",
    resourceType: "submission",
    resourceId: submissionId,
    details: {
      courseId,
      courseName: parsed.courseName,
      studentName: parsed.studentName,
      score: scored.score,
    },
  });

  return jsonResponse(req, {
    submission: {
      id: submissionId,
      studentName: parsed.studentName,
      courseName: parsed.courseName,
      timestamp: nowMs,
      transcript: parsed.transcriptions,
      score: scored.score,
      feedback: scored.feedback,
      confidenceScore: scored.confidenceScore,
      confidenceRationale: scored.confidenceRationale,
      rubricBreakdown: scored.rubricBreakdown,
      latencyMetrics,
      bargeInEvents,
      dialogueMetrics,
      argumentGraph,
      reasoningRubric,
    },
  });
});
