# SpeakWise — Situation Assessment & Enhancement Roadmap

**Date:** 2026-06-09
**Method:** 5-agent parallel subsystem audit (analytics, UI/UX, architecture, data/security, voice/AI) + synthesis.
**Baseline health:** `npm install` ✅ · `tsc --noEmit` ✅ · `vite build` ✅ (2.9s) · `npm run lint`/`format` ❌ (eslint/prettier not installed — quality gate is non-functional).

---

## 1. Status verdict

SpeakWise is a **strong, build-healthy prototype** of an institution-ready AI oral-examination platform (React 19 + TS + Vite + Supabase + Gemini Live / OpenRouter). The product philosophy (Calm before clever · Evidence over mystery · Academic atmosphere · Institution-ready · Human review matters) is visibly designed for, and the analytics intent is genuinely research-grade.

Three classes of issue separate it from "production-ready":

1. **Analytics validity** — pattern-matching reasoning scores are surface-marker counts; the LLM score and the pattern score were never reconciled; a coherence value was rendered ×100 (e.g. "4500%"); the Toulmin analysis was computed but never shown.
2. **UI fidelity drift** — a built Toast system is unused (app uses `alert()`), emoji grades and a partly-Korean off-design-system MicTest undercut the academic tone, a loader leaked "Loading from Supabase/localStorage", and the audio visualizer faked activity with `Math.random()`.
3. **Deeper structure/security debt** — god components (ManagerDashboardView 1346 lines, SubmissionDetailModal 888), no React Context (≈30 props drilled), TS strict off, no tests; and on the backend, **catch-all anon RLS policies mean institution isolation is not actually enforced**, a silent localStorage fallback can split-brain data, course passwords are plaintext, and a hardcoded instructor/admin allowlist acts as an unconditional superuser.

**Biggest risk:** the data-isolation gap (RLS) — it is a real confidentiality issue for institutional deployment and should lead the next track.

---

## 2. Implemented this session (build verified green)

### Analytics 고도화 (professional / research-grade)
- **LLM ↔ pattern agreement + confidence calibration + review triage** (`lib/services/EvaluationService.ts`, `types.ts`): every submission now carries `scoreAgreement`, `needsReview`, `reviewReasons`, and provenance stamps (`analysisVersion`, `promptVersion`, `evalModel`). The LLM's self-reported confidence is capped when responses were dropped or the session was too short.
- **Coherence display bug fixed** (`StudentResultsView.tsx`): `coherenceScore * 100` → `coherenceScore` (no more 4500%).
- **Instructor cohort statistics** (`ClassAnalyticsView.tsx`): standard deviation + median for score/reasoning, a small-n caveat (n < 5), a **"Flagged for review"** triage list, **CSV/JSON export** with full provenance, and review/needs-review status dots in the per-student table.
- **Toulmin completeness now surfaced** (`SubmissionAnalyticsPanels.tsx`): a 6-cell Claim/Data/Warrant/Backing/Qualifier/Rebuttal strip with a "to strengthen" guidance line, plus an Argument-Structure panel (coherence/complexity/nodes/links).

### Journey restructure (both core flows)
- **Student — one calm step to start** (`StudentLoginView.tsx`, `AppRouter.tsx`): the signed-in student's name is prefilled from auth (no re-entry); the pre-interview screen is now "You're about to start <course>" + entry code + MicTest + Start, instead of a redundant name+code form.
- **Instructor — review queue in the primary loop** (`ManagerDashboardView.tsx`): the guidance panel's "Needs review" card now shows the live count of `needsReview` submissions (amber when > 0) and points to the flagged list; Class Analytics (with that flagged list) stays open by default.

### Professional UI & journey 고도화
- **Provisional-result notice** for students when a result is flagged for review (calm, reassuring; `StudentResultsView.tsx`).
- **Honest audio visualizer** (`AudioVisualizer.tsx` + `InterviewSessionView.tsx`): bars now track the real mic level, so a silent pause reads as flat instead of faking activity.
- **Assertive screen-reader announcements** of interview phase transitions (`InterviewSessionView.tsx`) — closes the WCAG gap claimed in the technical reference.
- **MicTest** (`MicTest.tsx`): Korean error strings translated to English, emoji status text replaced with restrained labels ("Microphone ready", "Level low — speak up"), header emoji → inline SVG.
- **Neutral loader copy** (`AppRouter.tsx`): "Loading from Supabase/localStorage…" → "Loading your workspace…".
- **Emoji grades removed** (`scoreDisplay.ts`, `StudentHistoryView.tsx`): mastery now reads as restrained academic band labels.

---

## 3. Prioritized remaining backlog

### P0 — Security & data integrity (lead the next track; needs Supabase + app-run verification)
- **Make institution isolation real**: drop the catch-all `public can manage/read` RLS policies; establish a verified server-side session (Supabase Auth `signInWithPassword`, or an `app_sessions` token) so the scoped policies can evaluate. *(data/security audit, `production_schema.sql`, `auth.ts`, `database.ts`)*
- **Stop the silent localStorage fallback** from diverging server/client; distinguish "not configured" from "call failed", surface errors, queue+reconcile.
- **Single source of truth for roles**: retire `INSTRUCTOR_EMAILS`/`ADMIN_EMAIL` + `FALLBACK_INSTRUCTORS`; seed bootstrap admins as DB rows.
- **Hash course passwords** (pgcrypto) and stop selecting them into the client; remove bundled access codes.
- **Fail closed** on missing Supabase config in production (`validateEnv.ts`).

### P0 — Voice reliability (student-facing; needs API keys + app-run verification)
- **Reconnect-with-backoff + connection watchdog** for the live session — today a transient WS drop ends the exam with no resume (`GeminiWebsocketClient.ts`, `useGeminiLive.ts`).
- **Transcription retry/timeout + visible "we didn't catch that" path** — today a single OpenRouter failure silently drops the turn (`aiClient.ts`, `TranscriptionService.ts`).
- **Wire silence/scaffolding signals into the interviewer turn** so the 3-level hint ladder actually fires; track `hintLevel` as a real analytic.

### P1 — Structure (safe refactors)
- Decompose **ManagerDashboardView** (create-form / template-library / docx-import / course-list + a `useManagerDashboard` hook) and **SubmissionDetailModal** (transcript / annotations / review panels).
- Introduce **Auth/Session + Course Contexts** to remove ~25 drilled props; type `AppRouter` `user: any` → `UserProfile`.
- Delete dead/drifted prop interfaces in `types.ts` and the Legacy `MANAGER_DASHBOARD` alias; extract a shared peer-matching util.
- Add **eslint/prettier** to devDependencies (the configs already exist); enable **TS strict** incrementally; add **Playwright smoke tests** (dep already installed) + Vitest for `lib/reasoning`.

### P1 — Journey intuitiveness (the two core flows; needs app-run verification)
- **Student:** collapse the duplicate entry path — when a course is pre-selected, skip the second name+code form; show one calm "You're about to start <course>" screen + MicTest + Start. Reserve the full code form for the guest/legacy path.
- **Instructor:** tighten the create-test → manage-students → analytics loop in ManagerDashboard (clear primary action, surfacing the new "flagged for review" list at the top of the cohort view).
- **Adopt the existing Toast system app-wide**; remove `alert()`.

### P2 — Analytics depth (research strengthening)
- Precision-tagged reasoning patterns + a calibration harness (annotated transcript corpus → per-dimension precision/recall) so scores can cite a reliability figure.
- Implement the barge-in interpretation classifier (or honestly collapse the taxonomy).
- Per-rubric-dimension distributions (small-multiples histograms) at class level.
- Fix `speechNormalizer` self-repair handling to keep the corrected clause and count repairs.

---

*Generated by a multi-agent assessment workflow; full per-subsystem findings retained in the session transcript.*
