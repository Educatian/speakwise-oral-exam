// POST /functions/v1/evaluate
//
// Scores a transcript via Gemini without persisting anything. Main use case
// is instructor re-grading of an existing submission; during a normal exam,
// /submit-exam is what the student's browser calls (it evaluates and inserts
// atomically so a student can't retry to cherry-pick a favorable score).
//
// Any authenticated user can call this today. Phase 2 will narrow it to
// (a) the student submitting their own transcript or (b) the course owner.

import {
  errorResponse,
  jsonResponse,
  preflight,
} from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { scoreTranscript, validateTranscript } from "../_shared/gemini-score.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return errorResponse(req, 405, "method not allowed");

  const caller = getCaller(req);
  if (!caller) return errorResponse(req, 401, "unauthenticated");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return errorResponse(req, 500, "server misconfigured");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, 400, "invalid json");
  }

  const parsed = validateTranscript(
    body.transcriptions,
    body.courseName,
    body.studentName,
  );
  if (typeof parsed === "string") return errorResponse(req, 400, parsed);

  try {
    const result = await scoreTranscript(
      parsed.courseName,
      parsed.transcriptions,
      apiKey,
    );
    await writeAudit(req, caller, {
      action: "evaluate.success",
      resourceType: "evaluation",
      details: {
        courseName: parsed.courseName,
        studentName: parsed.studentName,
        score: result.score,
        lines: parsed.transcriptions.length,
      },
    });
    return jsonResponse(req, {
      score: result.score,
      feedback: result.feedback,
      confidenceScore: result.confidenceScore,
      confidenceRationale: result.confidenceRationale,
      rubricBreakdown: result.rubricBreakdown,
    });
  } catch (e) {
    console.error("[evaluate] gemini error", e);
    await writeAudit(req, caller, {
      action: "evaluate.gemini_error",
      resourceType: "evaluation",
      details: { message: (e as Error).message },
    });
    return errorResponse(req, 502, "scoring service unavailable");
  }
});
