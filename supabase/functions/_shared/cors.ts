// Single source of truth for CORS response headers.
// Keep this narrow: we only expose the frontend origin(s) we expect.
// Supabase Edge Functions run behind the Supabase gateway, which also applies
// its own auth checks, so CORS here is the final client-side gate.

const devOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function allowedOrigins(): string[] {
  const configured = Deno.env.get("SPEAKWISE_ALLOWED_ORIGINS");
  if (!configured) return devOrigins;
  return configured.split(",").map((o) => o.trim()).filter(Boolean);
}

export function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") ?? "";
  const allowList = allowedOrigins();
  const allow = allowList.includes(origin) ? origin : allowList[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "3600",
    "Vary": "Origin",
  };
}

export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function jsonResponse(
  req: Request,
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(req),
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(
  req: Request,
  status: number,
  message: string,
  details?: unknown,
): Response {
  return jsonResponse(req, { error: message, details }, { status });
}
