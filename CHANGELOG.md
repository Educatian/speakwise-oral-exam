# Changelog

All notable changes to the SpeakWise oral-exam platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [Semantic Versioning](https://semver.org/).

## [2.2.0] - 2026-06-11

### Added

- Engineering toolchain: ESLint 9 flat config (`eslint.config.js`), Prettier scripts, and Vitest
  with V8 coverage (`vitest.config.ts`).
- Unit test suite (`tests/`, 117 tests) covering the pure-logic core: reasoning pattern detection,
  Toulmin component analysis, speech normalization (fillers, self-repairs, stutters),
  argument graph building, score display, latency/barge-in analytics, peer-submission
  matching, input sanitization, PIN hashing/rate limiting, dashboard derivations,
  evidence-trail building, and transcript fallback graphs.
- GitHub Actions CI (`.github/workflows/ci.yml`): type-check, lint, test, and build on every
  push and pull request to `master`.
- `npm run smoke` script wired to the Playwright runtime smoke test.
- Narrated tutorial videos (Playwright cursor-following screencast + ElevenLabs narration)
  with a reproducible pipeline (`playwright/tutorial-scenes.mjs` → `narrate.mjs` →
  `tutorial.mjs` → `mux.mjs`), embedded in the walkthrough guide.
- Passcode brute-force rate limiting migration
  (`supabase/migrations/20260611_passcode_rate_limit.sql`, apply per `APPLY_RATE_LIMIT.md`).
- `PRO_UPGRADE_PLAN.md`: full audit checklist and enterprise roadmap.

### Changed

- **P0 reliability**: transcription timeout + retries with a calm student-facing notice;
  production fail-closed env validation; honest localStorage fallback (writes propagate
  errors, submissions keep a local recovery copy, reads flag degraded mode); DB-backed
  roles as the single authority (hardcoded allowlist removed).
- **P1 professionalization**: granular error boundaries around the concept map and
  analytics panels; empty states with next steps; actionable error copy; chart ARIA with
  real values and a screen-reader summary for the concept map.
- **Architecture**: `ManagerDashboardView` decomposed 1,387 → 205 lines
  (`components/views/manager/*` + `useManagerDashboard`); `SubmissionDetailModal`
  decomposed 916 → 246 lines (`components/modals/submission/*`); Auth / Course /
  Institution contexts replace prop drilling (AppRouter props 28 → 9), context values
  memoized.
- Guidebook upgrade: refreshed instructor and student walkthroughs with the new narrated
  tutorial videos; README gained badges, a screenshot gallery, an architecture diagram,
  and quality gates.

## [2.1.9] - 2026-06-10

### Security

- Server-side course passcode verification and prompt delivery via the `verify_course_entry`
  RPC; course passcodes and examiner briefs no longer reach unauthenticated clients (closes
  the last known exposure).
- Closed the remaining RLS isolation gaps and moved admin operations to RPCs over
  `user_profiles` (P0).

## [2.1.0] - 2026-06-09

### Added

- Real PDF-grounded question extraction for course materials.
- Higgsfield brand pass: OG card, favicon set, analytics icons, examiner mark, ambient hero,
  role icons, and empty states; new logo on the landing hero, header, and loading animation.
- Concept-map walkthrough video in the instructor and student guides.

### Changed

- Hardened live voice reliability (reconnect and stream recovery).

### Fixed

- Argument concept map now renders full-width in the submission modal (was squished to a
  ~45px sliver by nested grids).

### Security

- LLM and Gemini Live API keys moved server-side (Pages worker proxy + ephemeral tokens).

## [2.0.0] - 2026-06-09

### Added

- Class analytics, professional UI, student journey view, and concept-map upgrades.
- Self-contained HTML walkthrough guides (tabbed student/instructor with embedded video and
  screenshots) and Playwright-driven video guidebooks.

### Changed

- **Breaking:** migrated authentication to Supabase Auth with staged RLS isolation hardening.

### Fixed

- Courses re-fetch on auth change so institution courses load right after login.
- `current_user_role`/`current_user_school` helpers marked `SECURITY DEFINER` to break
  `user_profiles` RLS recursion.

## [1.2.0] - 2026-04-24

### Added

- Toulmin-lens colouring and claim filtering on the concept map.
- Replay graph overlay; concept-map force layout swapped to d3-force with replay polish.
- Bilingual (EN/KO) HTML guidebooks with supplementary captures.

### Changed

- Text chat routed through OpenRouter (Gemini retained for voice); transcription also via
  OpenRouter (gpt-4o-audio-preview).

## [1.1.0] - 2026-04-24

### Added

- Class analytics section on the instructor dashboard.

### Security

- App user emails hidden from non-privileged views.
