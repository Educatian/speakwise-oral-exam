# AI session configuration

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the Pages Worker runtime to the same project used by the frontend. Existing runtime `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` bindings are accepted as a fallback; build-time Vite substitution alone does not configure a Worker. Use the public/anon key, never the service-role key. Provider keys stay server-side.

Configure these bindings before deploying. The chat and live-token clients send the current Supabase bearer session; the Worker verifies it through Supabase Auth before processing either request. Missing configuration or unavailable Auth returns 503; missing or rejected sessions return 401. Static assets remain accessible.
