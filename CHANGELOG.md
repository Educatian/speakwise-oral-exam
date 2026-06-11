# Changelog

All notable changes to the SpeakWise oral-exam platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Engineering toolchain: ESLint 9 flat config (`eslint.config.js`), Prettier scripts, and Vitest
  with V8 coverage (`vitest.config.ts`).
- Unit test suite (`tests/`) covering the pure-logic core: reasoning pattern detection,
  Toulmin component analysis, speech normalization (fillers, self-repairs, stutters),
  argument graph building, score display, latency/barge-in analytics, peer-submission
  matching, input sanitization, and PIN hashing/rate limiting.
- GitHub Actions CI (`.github/workflows/ci.yml`): type-check, lint, test, and build on every
  push and pull request to `master`.
- `npm run smoke` script wired to the Playwright runtime smoke test.

### Changed

- P0 reliability fixes across services, Supabase integration, and hooks (session hardening
  pass).
- Guidebook upgrade: refreshed instructor and student walkthroughs with new tutorial videos.

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
