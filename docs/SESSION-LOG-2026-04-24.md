# Session Log — 2026-04-24

> One-day sprint taking SpeakWise from "Gemini key expired, live app partially broken" to a research-grade educational-media platform with hardened privacy, a full instructor analytics dashboard, a D3-powered concept map, OpenRouter-backed text AI, and bilingual guidebooks. Two PRs merged to master, all production env vars live, deployment verified through the Vercel API.

**Machine / operator:** Dr. Jewoong Moon (UA) working from `C:\Users\jewoo\Desktop\DEV\speakwise-oral-exam`, Windows Git Bash, Node 24.
**Total commits landed on master today:** 14 (across 2 merges).
**Lines touched:** roughly `+5 000 / -700`, plus 26 screenshots and 4 guidebook HTML bundles.

---

## 1. Framing pivot

Started as a "commercial SaaS" audit with Tier-1 security planning (RLS, rate limits, audit triggers, backend API). Halfway through the first migration pass, the actual goal became clear: **research-grade educational media platform**, not a SaaS. That reframing collapsed a lot of Tier-2/3 work (LTI 1.3, billing, anti-cheat, SOC2-grade posture) and shifted the priority stack onto:

1. IRB-grade privacy (stop leaking participant emails and activity).
2. Publication-ready analytics (surface what the app already measures).
3. Reliability of the AI pipeline (cope with expired keys, multi-provider).
4. Guidebooks for instructors and students so the platform is usable by someone who wasn't on this call.

Memory `project_speakwise.md` was rewritten mid-session with the new framing so future sessions open with the right north star.

---

## 2. What was wrong when we started

- **Gemini API key** (`AIzaSyCnOy3pcE-…yYKKHY`) had been rotated on Google's side and was returning `API_KEY_INVALID / API key expired`. Every AI-dependent feature was broken in production.
- **RLS was theater.** Every user-data table had a `"public can manage X"` catch-all with `USING (true)` that overrode the scoped policies. `app_users.email` and `audit_logs` were scrape-able by anyone holding the publishable key.
- **`courses.password` column** was readable straight from the publishable key — students could compare locally-entered passcodes to the database value before RLS changes.
- **Instructor dashboard** showed only a CRUD list of submissions. No class-level analytics, no rubric visualization, even though the data was being collected.
- **Concept map layout** used a hand-rolled O(n²) Coulomb simulation that ran once and froze. Replay mode popped nodes in at their final positions with no animation.
- **No guidebook.** Nothing to hand to a new instructor or a new student participant.

---

## 3. Branch + merge timeline

```
master (pre-session)
   │
   ├──▶ feat/backend-security-phase1      (dead-end; mismatched architecture — see §4)
   │
   ├──▶ feat/instructor-analytics-dashboard   (stacked on Phase 1; inherited the architectural mismatch)
   │
   ├──▶ feat/security-hardening-track-a      (stacked; same mismatch)
   │
   ├──▶ feat/editorial-landing               (pushed + reverted — see §8)
   │
   ├──▶ feat/hide-app-users-email            (branched off upstream master; actual security fix)
   │      └── Phase 2B dashboard commits cherry-picked on top
   │      └── Merged as PR #2  → master 04ab971
   │
   └──▶ feat/replay-graph-overlay            (branched off master after PR #2)
          └── D3 migration + Toulmin + keyboard shortcuts
          └── Bilingual guidebooks + 26 Playwright screenshots
          └── OpenRouter migration for every text-AI path + Transcription
          └── Merged as PR #3  → master 45bc4f5
```

The three stacked branches in the middle (`phase1`, `analytics-dashboard`, `track-a`) are preserved on origin as archives but superseded. They were built against a stale base (I missed a `git fetch` at session start; `origin/master` had been ~37 commits ahead from earlier work by the user), so their Phase 1 RLS design assumed Supabase Auth while the actual production app already used app-managed authentication. Everything from those branches that survived was cherry-picked into `feat/hide-app-users-email` in a form that matched upstream's auth model.

---

## 4. Key architectural decisions

### App-managed authentication stays
Upstream replaced Supabase Auth with `app_users` + `app_user_credentials` + RPC helpers (`authenticate_app_user`, `register_app_user`) in commit `92408e8` on 2026-03-28. My original Phase 1 design — Edge Functions parsing a Supabase-Auth JWT, RLS keyed on `auth.uid()` — was fundamentally incompatible. Keeping app-managed auth meant the real privacy fix had to work without a trusted `auth.uid()`.

### Column-level grants + SECURITY DEFINER RPCs, not broad RLS rewrites
Because the publishable key authenticates the browser as the `anon` role (there is no `authenticated` session under app-managed auth), `REVOKE ... FROM anon` is the only real lever for table-level protection. The design pattern:

1. Identify a column that must not leak (email, password hash, audit descriptions).
2. `REVOKE SELECT (column)` from anon / authenticated.
3. Write a `SECURITY DEFINER` function that returns the same data when called through an intentional code path.
4. Update the frontend to call the RPC.
5. The catch-all policy can stay in place — column grants gate what rows the policy can actually return.

This is not full IRB-grade protection (a determined caller who knows a user id can still fetch that specific user's email through `get_app_user_by_id`), but it **stops bulk scraping**, which was the real leak vector, and leaves a clean seam to tighten later with a session-token auth layer (P3).

### OpenRouter as a text-AI abstraction
Instead of wiring each Gemini call site to its own client, `lib/services/aiClient.ts` became the single entry point. Default model `google/gemini-3-flash-preview` matched the legacy behaviour. The critical empirical discovery:

- **Gemini models on OpenRouter silently drop audio content blocks.** `prompt_tokens: 12` tells the story.
- **OpenAI models on OpenRouter forward audio correctly.** `openai/gpt-4o-audio-preview` returned real transcriptions with `audio_tokens > 0`.

That meant transcription could migrate too, but the real-time voice (Gemini Live WebSocket) still had to stay on native Gemini — OpenRouter is chat-completions-only, no WebSocket proxy.

### D3 instead of keeping the hand-rolled force sim
`d3-force` (40 KB gzipped) was worth the bundle cost: the layout quality is visibly better, and more importantly it opens the door for the continuous-simulation live replay we may want later. Level-aware tuning (pinned root, stronger repulsion for hubs, tighter collide radius for leaves) kept the visual identity close to the legacy radial layout.

---

## 5. Commits on master (chronological)

| # | SHA | Subject | Notes |
|---|---|---|---|
| 1 | `a188434` | hide app_users.email from anon publishable-key reads | Column grant + 5 SECURITY DEFINER RPCs: `get_app_user_by_id`, `list_app_users_for_admin`, `is_email_staff`, `get_app_user_id_by_email`, `list_staff_emails`. Frontend rewired in 5 sites. |
| 2 | `dcc7d17` | lock audit_logs against public read + forged writes | Drop catch-alls. Add `submissions` AFTER INSERT trigger for trusted server-side audit rows. Remaining domain events funnel through `log_audit_event()` RPC. `list_recent_audit_logs(limit)` for reads, capped at 500. |
| 3 | `3b0ca57` | SVG chart primitives | 5 hand-rolled components: `MetricCard`, `BarChart`, `RadarChart`, `Histogram`, `Sparkline`. Consistent tone palette. Zero dependencies. |
| 4 | `1eadba3` | rubric / reasoning / timing / barge-in panels in submission detail | Surfaces data that was already stored but never rendered. Rubric radar + reasoning bars + latency sparkline + barge-in list with interpretation badges. |
| 5 | `e9f5bf8` | Class Analytics section on instructor dashboard | Collapsible section with four metric cards, score-distribution histogram, score-over-time sparkline, class-level reasoning bar chart, per-student sortable table that click-throughs to the submission detail modal. |
| 6 | `4d54aff` | ignore one-off rubric backfill artefacts | Tracked because R1 couldn't run (Gemini key expired); script left on disk for the operator to re-run after key refresh. |
| 7 | `04ab971` | **Merge PR #2** | Lands security + dashboard. |
| 8 | `29da3ff` | swap hand-rolled force sim to d3-force + replay polish | Level-aware forces, node enter animation, active-turn pulse, keyboard shortcuts (← → Home End Space). |
| 9 | `9ebc1b5` | Toulmin-lens colouring + filter | `Color: Concept / Toulmin` toggle. Five-colour palette mapped to `ArgumentNode.type`. Chip row is the legend + filter. Minimap respects the mode. |
| 10 | `faa521c` | Playwright-driven instructor + student guidebooks | 19-screenshot capture; markdown guides in Korean. |
| 11 | `a63e505` | bilingual HTML build + supplementary captures | 7 more screenshots (admin panel, build form, annotation editor, review panel, student OU flow). `playwright/build-html.mjs` converts both-language markdown to styled HTML with sticky TOC + language switcher. |
| 12 | `01a7fce` | route text chat through OpenRouter | `aiClient.ts` lands. EvaluationService, conceptNetwork, both ManagerDashboard Gemini paths move to OpenRouter. PDF multimodal path collapses to text-only (TXT + DOCX via mammoth). |
| 13 | `cd16d75` | transcription also via OpenRouter | `transcribeAudio()` helper. TranscriptionService rewritten. Discovery: gpt-4o-audio-preview is the only OpenRouter-routable audio model that actually forwards audio to the underlying provider. |
| 14 | `45bc4f5` | **Merge PR #3** | Concept map upgrades + OpenRouter + guidebooks. |

---

## 6. Live database changes (already applied to `ysdobuhjzaaotglmgvqv`)

Migrations applied via the Supabase Management API, not the CLI. All are **idempotent and non-destructive** — no row was deleted, no column dropped.

1. `20260424000001_schema_hardening.sql` — adds `audit_logs`, `session_recordings` (stubbed from the archived Phase 3 branch), helper functions `is_instructor`, `is_admin`, `jwt_email`; ensures `user_profiles` + `instructors` shape.
2. `20260424000002_rls_policies.sql` — drops every `"Allow all"` policy on six tables, installs real scoped policies (owner-email for courses, student-or-course-owner for submissions). *Note: after the app-managed-auth mismatch was discovered these scoped policies are shadowed by the catch-alls that upstream already had; the real effective gate is the column grants in migrations 4 and 5 below.*
3. `20260424000003_backfill_ownership.sql` — seeds `instructors` table with `jewoong.moon@gmail.com` and `yongju017@gmail.com`, backfills `courses.owner_email` on legacy rows.
4. `20260424_hide_app_users_email.sql` — **the real email-leak fix**. Column-level revoke on `app_users.email`, five RPCs re-expose it through controlled paths.
5. `20260424_lock_audit_logs.sql` — drops `"public can read / create audit logs"`. Adds `list_recent_audit_logs(limit_input int)` and `log_audit_event(...)` RPCs. Adds `audit_submission_insert` trigger on `submissions` for server-side `submission.created` rows.

New `app_users` rows created for the session:

| email | role | institution | purpose |
|---|---|---|---|
| `jewoong.moon@gmail.com` | admin | UA | Dr. Moon's ongoing admin account. Password `Guidebook2026!` — change at leisure. |
| `guidebook-student@speakwise.test` | student | UA | UA student used for dashboard screenshots. |
| `guidebook-student-ou@speakwise.test` | student | OU | OU student used to exercise the real-course flow for the guidebook. |

One course record was temporarily reassigned (`institution_id` `ou → ua → ou`) to get a screenshot with a visible course list, then reverted to its original institution. Data state after the session is equivalent to before for that course.

---

## 7. Production deployment verification

| Property | Value |
|---|---|
| Vercel project | `prj_tfpi6CSUntkAEzRkKYy9xCq2gOJ6` (team `Jewoong Moon's projects`) |
| Production deployment | `dpl_H8PLyocwfhb5w62AT72Z7CvmuwKN` — commit `45bc4f5`, state `READY` |
| Aliases | `speakwise-oral-exam.vercel.app` + two team-scoped fallbacks |
| Env vars present | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OPENROUTER_API_KEY` (preview + production only), `VITE_INSTRUCTOR_CODE`, `GEMINI_API_KEY` |

Production bundle inspection (via cache-busted curl against the prod alias):

- `/assets/aiClient-CUuexTlq.js` — contains `openrouter.ai/api/v1/chat/completions` + the OpenRouter key as a string literal (expected — `VITE_*` vars are inlined at build time).
- `/assets/InterviewSessionView-D0lvhyjI.js` — contains the fresh Gemini key `AIzaSyDb8WaD1f96…`, different prefix than the expired one, confirming the env var was rotated before this build.

My earlier false alarm about "OpenRouter not in production bundle" was a check-methodology bug: I only looked at the eager entry chunks, missing the lazy-loaded `aiClient-*.js` and `ManagerDashboardView-*.js` chunks that actually carry the new code.

---

## 8. False starts, recorded for continuity

- **Editorial Technologist landing page** (`feat/editorial-landing`) — built and pushed; the operator asked to revert immediately, so the branch was deleted both locally and on origin. No trace remaining.
- **Phase 1 backend security with Supabase Edge Functions** — architecturally sound but incompatible with app-managed auth. Work on `feat/backend-security-phase1` is preserved on origin as reference material; none of it landed on master.
- **Stage 1b continuous simulation during replay** — operator explicitly deferred ("라이브는 트래킹이 어려워서"). The branch has the static-settle D3 layout; continuous live simulation remains a clean add-on if wanted later.
- **R1 rubric-breakdown backfill** — blocked mid-session by the expired Gemini key. Script (`playwright/.backfill-rubric.mjs`) is in place; five-minute task once the Gemini key is valid and the operator chooses to run it.

---

## 9. Credentials still active at session end

The operator should treat these as exposed and rotate / revoke as convenient:

| Token / key | Lives in | Action |
|---|---|---|
| Vercel token `vcp_7z8y…` | Chat history | Revoke at https://vercel.com/account/tokens |
| Supabase PAT `sbp_d93736…` | Chat history + used for migrations | Revoke at Supabase Dashboard → Account → Access Tokens |
| OpenRouter key `sk-or-v1-d14e…` | Production bundle (public) + chat history | Rotate at https://openrouter.ai/settings/keys. Set a spending limit either way. |
| Gemini key `AIzaSyDb8WaD…` | Production bundle + Vercel env | Set an AI Studio spending limit. Consider moving AI calls behind an Edge Function in a later phase to keep the key off the client. |
| Session accounts `Guidebook2026!` | Live Supabase | Change the admin password from inside the app at leisure; delete the two guidebook-student accounts from Supabase Studio if not needed for future captures. |

---

## 10. What remains

### Blocking for a production pilot
Nothing. The app is functional end-to-end.

### Recommended before an IRB study
- **P3 session-token auth** — add `app_sessions` (token, user_id, expires_at), issue on successful `authenticate_app_user`, validate on every sensitive RPC. Closes the "known user id → email lookup" path left open by migration 4. ~3–4 hours.
- **Audit-log tamper evidence** — currently `log_audit_event()` RPC is still callable by any anon client. Add signed/hashed rows or restrict the RPC to a session-token caller (dovetails with P3). ~1 hour after P3.
- **Move OpenRouter + Gemini keys behind an Edge Function** — keys currently ship in the client bundle. Acceptable for a named-institution pilot, not for a public release. Port of the Phase 1 Edge Function pattern, re-targeted at app-managed auth. ~4–6 hours.

### Nice to have
- **R1 rubric_breakdown backfill** for the four pre-existing submissions so the dashboard radar has data. Five minutes once a valid Gemini key is exported.
- **Live simulation during replay** (Stage 1b) — keeps existing nodes' positions stable while new ones animate into place during scrub. ~45–60 minutes.
- **PDF export of the Class Analytics view** — print stylesheet exists for individual submissions; extending it to the whole dashboard is ~2 hours.
- **Korean i18n of the app UI** (not just the guidebooks). ~4–6 hours.
- **OpenRouter key-rotation rehearsal** — document the exact steps including cache invalidation so a new operator can rotate without downtime.

### Research-product track, deliberately unscheduled
- Toulmin inter-rater reliability tooling (multiple instructors grade the same submission, kappa computed live).
- Cohort comparison slider (UA vs OU, prompt A vs prompt B).
- Longitudinal per-student trend view.
- A/B prompt infrastructure for classroom-scale research designs.

---

## 11. Credits / conventions for future sessions

- Memory file `MEMORY.md` and project memory `project_speakwise.md` are the source of truth for session-to-session continuity. If the framing changes again, update those first.
- When the operator asks to "record the journey", prefer a single dated log under `docs/` with commit SHAs rather than sprinkling notes across files.
- Keep `playwright/capture.mjs` + `playwright/capture-extra.mjs` + `playwright/build-html.mjs` runnable; they regenerate the guidebook artefacts end-to-end.
- Screenshots live under `docs/guidebooks/screenshots/{shared,instructor,student}/`. HTML builds to `docs/guidebooks/html/`. Both are committed; no LFS.

---

*Logged by Claude, reviewed by the commits above.*
