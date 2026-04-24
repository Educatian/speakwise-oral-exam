// POST /functions/v1/recording-upload-url
//
// Phase 3 scaffold. Returns a short-lived signed URL the browser can use
// to PUT a recording into the session-recordings Storage bucket, then
// writes a row into public.session_recordings binding the object path to
// the submission.
//
// Caller must own the submission being recorded (student_user_id match) OR
// be the course owner. The Edge Function holds the service-role key so
// direct INSERT to session_recordings is blocked by RLS.
//
// Not wired into the frontend yet — client audio capture + chunked upload
// is tracked as its own feature and is not part of this scaffold.

import {
  errorResponse,
  jsonResponse,
  preflight,
} from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const BUCKET = "session-recordings";
const MAX_SECONDS_FROM_SUBMIT = 2 * 60 * 60; // 2h grace after submission

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

  const submissionId = body.submissionId;
  if (typeof submissionId !== "string" || submissionId.length === 0) {
    return errorResponse(req, 400, "submissionId required");
  }

  const admin = getSupabaseAdmin();

  // Authorise: caller must be student_user_id on the submission, or the
  // course owner. We check with service_role to avoid fighting RLS on a
  // legitimate path.
  const { data: sub, error: subErr } = await admin
    .from("submissions")
    .select("id, course_id, student_user_id, timestamp")
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr) {
    console.error("[recording-upload-url] lookup error", subErr);
    return errorResponse(req, 500, "lookup failed");
  }
  if (!sub) return errorResponse(req, 404, "submission not found");

  const isStudent = sub.student_user_id === caller.userId;
  let isOwner = false;
  if (!isStudent) {
    const { data: course } = await admin
      .from("courses")
      .select("owner_email")
      .eq("id", sub.course_id)
      .maybeSingle();
    isOwner = !!course && course.owner_email?.toLowerCase() === caller.email;
  }
  if (!isStudent && !isOwner) {
    await writeAudit(req, caller, {
      action: "recording_upload_url.forbidden",
      resourceType: "submission",
      resourceId: submissionId,
    });
    return errorResponse(req, 403, "not your submission");
  }

  // Recordings can only be uploaded within the grace window. Prevents a
  // later malicious upload replacing the audio artifact long after the fact.
  const ageSeconds = (Date.now() - (sub.timestamp ?? 0)) / 1000;
  if (ageSeconds > MAX_SECONDS_FROM_SUBMIT) {
    await writeAudit(req, caller, {
      action: "recording_upload_url.grace_expired",
      resourceType: "submission",
      resourceId: submissionId,
    });
    return errorResponse(req, 403, "upload window has closed");
  }

  const objectPath = `${sub.course_id}/${submissionId}/${crypto.randomUUID()}.webm`;

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(objectPath);
  if (signErr || !signed) {
    console.error("[recording-upload-url] sign error", signErr);
    return errorResponse(req, 500, "could not sign url");
  }

  // Pre-create the row so the object path is auditable even if the client
  // disconnects before finishing the upload. byte_size/duration get filled
  // in by a later "recording-finalize" call.
  const { error: insErr } = await admin.from("session_recordings").insert({
    submission_id: submissionId,
    object_path: objectPath,
  });
  if (insErr) {
    console.error("[recording-upload-url] insert error", insErr);
    return errorResponse(req, 500, "could not bind recording");
  }

  await writeAudit(req, caller, {
    action: "recording_upload_url.issued",
    resourceType: "submission",
    resourceId: submissionId,
    details: { objectPath },
  });

  return jsonResponse(req, {
    bucket: BUCKET,
    objectPath,
    uploadUrl: signed.signedUrl,
    token: signed.token,
  });
});
