// Extracts the authenticated caller from the request.
// Relies on `verify_jwt = true` in config.toml — the Supabase gateway has
// already validated the JWT signature and expiry before this runs. We only
// need to pull the user id + email out of the token.

export interface Caller {
  userId: string;
  email: string;
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}

export function getCaller(req: Request): Caller | null {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(b64urlDecode(parts[1]));
    const userId = payload.sub as string | undefined;
    const email = (payload.email as string | undefined) ??
      (payload.user_metadata?.email as string | undefined);
    if (!userId || !email) return null;
    return { userId, email: email.toLowerCase().trim() };
  } catch {
    return null;
  }
}
