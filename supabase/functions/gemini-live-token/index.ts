// POST /functions/v1/gemini-live-token
//
// Mints a short-lived Gemini Live auth token for the browser to use when
// opening the Gemini Live WebSocket. The long-lived GEMINI_API_KEY stays on
// the server. See:
//   https://ai.google.dev/gemini-api/docs/ephemeral-tokens
//
// Known gotcha: new-format Gemini API keys (prefix "AQ.") currently fail
// auth_tokens.create with INVALID_ARGUMENT. Use a legacy "AIzaSy…" key.

import {
  errorResponse,
  jsonResponse,
  preflight,
} from "../_shared/cors.ts";
import { getCaller } from "../_shared/auth.ts";
import { writeAudit } from "../_shared/audit.ts";
import { GoogleGenAI } from "npm:@google/genai@1.38.0";

const TOKEN_TTL_MINUTES = 30;
const SESSION_START_WINDOW_MINUTES = 1;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== "POST") return errorResponse(req, 405, "method not allowed");

  const caller = getCaller(req);
  if (!caller) return errorResponse(req, 401, "unauthenticated");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return errorResponse(req, 500, "server misconfigured");

  const now = new Date();
  const expireAt = new Date(now.getTime() + TOKEN_TTL_MINUTES * 60_000);
  const sessionStartDeadline = new Date(
    now.getTime() + SESSION_START_WINDOW_MINUTES * 60_000,
  );

  try {
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
    // deno-lint-ignore no-explicit-any
    const token = await (client as any).authTokens.create({
      config: {
        uses: 1,
        expireTime: expireAt.toISOString(),
        newSessionExpireTime: sessionStartDeadline.toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    const tokenName = typeof token?.name === "string" ? token.name : null;
    if (!tokenName) throw new Error("token.name missing from Gemini response");

    await writeAudit(req, caller, {
      action: "gemini_live_token.issue",
      resourceType: "gemini_live_token",
      details: { expireAt: expireAt.toISOString() },
    });

    return jsonResponse(req, {
      token: tokenName,
      expiresAt: expireAt.toISOString(),
      sessionStartDeadline: sessionStartDeadline.toISOString(),
    });
  } catch (e) {
    console.error("[gemini-live-token] error", e);
    await writeAudit(req, caller, {
      action: "gemini_live_token.error",
      resourceType: "gemini_live_token",
      details: { message: (e as Error).message },
    });
    return errorResponse(req, 502, "token service unavailable");
  }
});
