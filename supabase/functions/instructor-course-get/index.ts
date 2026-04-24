// POST /functions/v1/instructor-course-get
//
// Returns a single course row (including the system prompt) to its
// owner or an admin. Called by the instructor dashboard when opening
// the edit/view modal, now that public.courses.prompt is revoked from
// anon/authenticated SELECT grants.
//
// Request:  { courseId: string }
// Response: { course: Course }  where Course mirrors the frontend type.

import {
  errorResponse,
  jsonResponse,
  preflight,
} from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

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
  if (typeof courseId !== "string" || courseId.length === 0) {
    return errorResponse(req, 400, "courseId required");
  }

  const admin = getSupabaseAdmin();

  const { data: course, error } = await admin
    .from("courses")
    .select(
      "id, name, instructor_name, instructor_pin_hash, password, prompt, owner_email, created_at",
    )
    .eq("id", courseId)
    .maybeSingle();

  if (error) {
    console.error("[instructor-course-get] lookup error", error);
    return errorResponse(req, 500, "lookup failed");
  }
  if (!course) return errorResponse(req, 404, "course not found");

  // Ownership check: caller email matches owner_email, OR caller is admin.
  // Admin bypass uses the same is_admin() SQL helper installed in 0001.
  const isOwner = (course.owner_email ?? "").toLowerCase() === caller.email;
  let isAdmin = false;
  if (!isOwner) {
    const { data: adminFlag } = await admin.rpc("is_admin", {
      check_email: caller.email,
    });
    isAdmin = adminFlag === true;
  }
  if (!isOwner && !isAdmin) {
    await writeAudit(req, caller, {
      action: "instructor_course_get.forbidden",
      resourceType: "course",
      resourceId: courseId,
    });
    return errorResponse(req, 403, "not your course");
  }

  await writeAudit(req, caller, {
    action: "instructor_course_get.success",
    resourceType: "course",
    resourceId: courseId,
  });

  return jsonResponse(req, {
    course: {
      id: course.id,
      name: course.name,
      instructorName: course.instructor_name ?? "Instructor",
      instructorPinHash: course.instructor_pin_hash ?? "",
      password: course.password,
      prompt: course.prompt,
      ownerEmail: course.owner_email ?? "",
      createdAt: course.created_at
        ? new Date(course.created_at as string).getTime()
        : Date.now(),
    },
  });
});
