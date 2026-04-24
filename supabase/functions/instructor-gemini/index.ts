// POST /functions/v1/instructor-gemini
//
// Small server-side wrapper for the two instructor-side Gemini features
// (AI-generated course prompts and file-question extraction) that used to
// run in-browser with the long-lived API key. Both fit the same request
// shape — a prompt plus optional inlineData parts — so we funnel them here.
//
// Caller must be a known instructor (or admin). Anonymous/student callers
// can't reach this.

import {
  errorResponse,
  jsonResponse,
  preflight,
} from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_PROMPT_CHARS = 100_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 5;

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function isAllowedInstructor(email: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .rpc("is_instructor", { check_email: email });
  if (data === true) return true;
  // Belt + suspenders: admins always allowed.
  const { data: adminFlag } = await admin
    .rpc("is_admin", { check_email: email });
  return adminFlag === true;
}

function validateParts(input: unknown): Part[] | string {
  if (!Array.isArray(input) || input.length === 0) return "parts required";
  if (input.length > MAX_FILES + 1) return "too many parts"; // 1 text + N files
  let totalTextChars = 0;
  const parts: Part[] = [];
  for (const p of input) {
    if (!p || typeof p !== "object") return "malformed part";
    const q = p as Record<string, unknown>;
    if (typeof q.text === "string") {
      totalTextChars += q.text.length;
      if (totalTextChars > MAX_PROMPT_CHARS) return "prompt too large";
      parts.push({ text: q.text });
    } else if (
      q.inlineData && typeof q.inlineData === "object" &&
      typeof (q.inlineData as Record<string, unknown>).mimeType === "string" &&
      typeof (q.inlineData as Record<string, unknown>).data === "string"
    ) {
      const inline = q.inlineData as { mimeType: string; data: string };
      // base64 length * 0.75 ≈ bytes
      if (inline.data.length * 0.75 > MAX_FILE_BYTES) return "file too large";
      parts.push({ inlineData: inline });
    } else {
      return "unrecognized part";
    }
  }
  return parts;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return errorResponse(req, 405, "method not allowed");

  const caller = getCaller(req);
  if (!caller) return errorResponse(req, 401, "unauthenticated");

  if (!await isAllowedInstructor(caller.email)) {
    await writeAudit(req, caller, {
      action: "instructor_gemini.forbidden",
      resourceType: "instructor_gemini",
    });
    return errorResponse(req, 403, "not an instructor");
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return errorResponse(req, 500, "server misconfigured");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(req, 400, "invalid json");
  }

  const parts = validateParts(body.parts);
  if (typeof parts === "string") return errorResponse(req, 400, parts);

  const wantJson = body.responseMimeType === "application/json";
  const generationConfig: Record<string, unknown> = {};
  if (wantJson) generationConfig.responseMimeType = "application/json";

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig,
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    await writeAudit(req, caller, {
      action: "instructor_gemini.success",
      resourceType: "instructor_gemini",
      details: {
        kind: typeof body.kind === "string" ? body.kind : null,
        jsonMode: wantJson,
      },
    });
    return jsonResponse(req, { text: typeof text === "string" ? text : "" });
  } catch (e) {
    console.error("[instructor-gemini] error", e);
    await writeAudit(req, caller, {
      action: "instructor_gemini.error",
      resourceType: "instructor_gemini",
      details: { message: (e as Error).message },
    });
    return errorResponse(req, 502, "gemini service unavailable");
  }
});
