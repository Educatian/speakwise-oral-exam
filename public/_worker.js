// Cloudflare Pages advanced-mode worker: keeps API keys server-side.
// Static assets are served via env.ASSETS; /api/* routes inject secrets that
// are NEVER shipped in the client bundle (set as Pages env vars, not VITE_*).
//
// Required Pages environment variables (Settings → Environment variables):
//   OPENROUTER_API_KEY  — OpenRouter key (transcription + scoring + concept graph)
//   GEMINI_API_KEY      — Gemini key (mints short-lived Live ephemeral tokens)

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/llm' || url.pathname === '/api/gemini-token') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      const denied = await requireUser(request, env);
      if (denied) return denied;
    }

    // ── OpenRouter chat-completions proxy (chat + audio transcription) ──
    if (url.pathname === '/api/llm') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      if (!env.OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY not configured' }, 500);
      const body = await request.text();
      const upstream = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': url.origin,
          'X-Title': 'SpeakWise'
        },
        body
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── Gemini Live ephemeral token (short-lived, single-use, model-locked) ──
    if (url.pathname === '/api/gemini-token') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY not configured' }, 500);
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uses: 1 })
        }
      );
      const data = await upstream.json();
      if (!upstream.ok) return json({ error: 'token mint failed', detail: data }, upstream.status);
      return json({ token: data.name });
    }

    // ── Everything else: static assets ──
    return env.ASSETS.fetch(request);
  }
};

async function requireUser(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'Sign in required' }, 401);
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return json({ error: 'Session verification is not configured' }, 503);
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: key },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok || !(await response.json())?.id) return json({ error: 'Sign in required' }, 401);
  } catch {
    return json({ error: 'Session verification unavailable' }, 503);
  }
  return null;
}
