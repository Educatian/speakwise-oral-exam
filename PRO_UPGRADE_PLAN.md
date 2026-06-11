# SpeakWise — Professional Upgrade Plan

**Date:** 2026-06-11 · **Method:** full-repo audit (architecture, features, security, UX, docs, build/test/deploy) synthesized with the 2026-06-09 five-agent assessment.

This document is the single checklist for taking SpeakWise from "strong, build-healthy prototype" to a professional, institution-deployable product. Items marked ✅ were implemented in the 2026-06-11 session; ⏳ items are queued; 🔲 items are open.

---

## 1. Where the product stands

- **Healthy:** build green (Vite 6 / React 19 / TS), chunked bundle, server-side LLM keys (Pages worker proxy + ephemeral Gemini tokens), Supabase Auth + RLS migrations authored, research-grade analytics (Toulmin rubric, score-agreement, confidence calibration, review triage), bilingual guidebook with videos.
- **Gap classes:** (a) security runbooks authored but **not yet applied to the live database**, (b) reliability edges in the voice/transcription path, (c) structural debt (god components, no tests, no CI), (d) enterprise features (LTI, exports API, observability) not started.

## 2. P0 — Security & data integrity

| # | Item | Status |
|---|------|--------|
| P0.1 | **Apply RLS isolation SQL to live Supabase** (drop catch-all anon policies; verified session required) — per `APPLY_RLS.md` | 🔲 **USER ACTION: run the SQL in Supabase SQL Editor** |
| P0.2 | Server-side course passcode check + prompt delivery (§5) | ✅ shipped 2026-06-10 (verify SQL applied) |
| P0.3 | Passcode brute-force rate limiting (throttle table + RPC guard) | ✅ migration authored 2026-06-11 — user applies SQL |
| P0.4 | Fail closed on missing Supabase config in production (config-error screen, no silent localStorage boot) | ✅ 2026-06-11 |
| P0.5 | Stop silent localStorage fallback divergence: writes propagate errors; reads warn + set degraded-mode flag | ✅ 2026-06-11 |
| P0.6 | Single source of truth for roles (DB `user_profiles.role`); hardcoded allowlist demoted to local/demo bootstrap only | ✅ 2026-06-11 |
| P0.7 | Hash course passcodes at rest (pgcrypto) so staff RPC never returns plaintext | 🔲 follow-up migration |

## 3. P0 — Voice & evaluation reliability

| # | Item | Status |
|---|------|--------|
| P0.8 | Live-session reconnect with exponential backoff + watchdog (transient WS drop must not end an exam) | ✅ hardened in voice-rag track (verify in field) |
| P0.9 | Transcription retry (timeout + backoff) + calm "we didn't catch that" student notice + dropped-turn provenance | ✅ 2026-06-11 |
| P0.10 | Wire silence/scaffolding signals into the examiner turn so the 3-level hint ladder actually fires; log `hintLevel` | 🔲 |

## 4. P1 — Professional engineering baseline

| # | Item | Status |
|---|------|--------|
| P1.1 | ESLint + Prettier installed and enforced (configs existed; tools didn't) | ✅ 2026-06-11 |
| P1.2 | Unit tests (Vitest) for reasoning/analytics/utils pure logic | ✅ 2026-06-11 |
| P1.3 | CI pipeline (GitHub Actions: type-check → lint → test → build) | ✅ 2026-06-11 |
| P1.4 | CHANGELOG.md + semantic versioning | ✅ 2026-06-11 |
| P1.5 | Decompose god components: `ManagerDashboardView` (1,358 ln) → create-form / template-library / course-list + hook; `SubmissionDetailModal` (888 ln) → transcript / annotations / review panels | 🔲 next (tests now exist as a safety net) |
| P1.6 | Auth + Course React Contexts to retire ~30 drilled props; type `AppRouter user: any` | 🔲 next |
| P1.7 | TypeScript `strict: true` (incremental) + remove remaining `any` (16 sites) | ⏳ partial |
| P1.8 | Adopt the built Toast system app-wide; remove `alert()` | ⏳ partial |
| P1.9 | Granular error boundaries around D3/concept-map and analytics panels | ⏳ partial |
| P1.10 | Audit-log every privileged mutation (role change, course CRUD, score override) with server-resolved actor | 🔲 |

## 5. P2 — Product polish

- 🔲 Empty states with next-step CTAs (courses, history, admin, analytics)
- 🔲 Actionable error copy everywhere (what happened + what to do)
- 🔲 Keyboard/ARIA access for the concept map and charts (tabular fallback)
- 🔲 Mobile layouts for InterviewSession + SubmissionDetail (<640px)
- 🔲 Theme toggle (light / high-contrast) honoring `prefers-color-scheme`
- 🔲 Loading skeletons for export / template / question-extraction operations

## 6. P2 — Analytics depth (research-grade differentiators)

- 🔲 Calibration harness: annotated transcript corpus → per-dimension precision/recall so reasoning scores ship with a reliability figure
- 🔲 Replace surface-marker pattern counts with precision-tagged classifiers
- 🔲 Barge-in interpretation classifier (or honestly collapse the taxonomy)
- 🔲 Per-rubric-dimension small-multiple histograms at class level
- 🔲 `speechNormalizer` self-repair: keep corrected clause + count repairs as a fluency signal

## 7. Professional / enterprise version — feature ideas

1. **LTI 1.3** launch + grade passback (Canvas/Blackboard/Moodle) — the single biggest adoption unlock for institutions.
2. **Institution admin suite**: bulk CSV user/course import, batch role assignment, term rollover from templates.
3. **Exports API** (staff-token-gated REST: submissions, scores, provenance) for institutional BI pipelines.
4. **Observability**: Sentry error tracking, uptime/health endpoint, admin ops dashboard (sessions today, failure rate, token spend).
5. **Proctoring-lite trust signals**: session integrity report (tab focus loss, long mutes, device changes) presented as evidence, never auto-penalty.
6. **Accommodation profiles**: extended pauses, slower examiner speech rate, captioned examiner audio (WCAG + disability services).
7. **Question-bank mode**: versioned item banks per course with coverage tracking across a cohort (which concepts went unprobed).
8. **Multi-language examiner** (the stack already supports it; gate per course).
9. **Longitudinal student view**: reasoning-skill growth across courses/terms — pairs naturally with the existing concept-map analytics.
10. **White-label theming** per institution (logo, palette, domain).

## 8. Documentation & distribution (this session)

- ✅ Narrated tutorial videos: Playwright cursor-following screencasts + ElevenLabs narration (`playwright/narrate.mjs` → `tutorial.mjs` → `mux.mjs`), embedded in the guidebook.
- ✅ Guidebook refresh with current screenshots and the new videos (deployed to speakwise-guide.pages.dev).
- ✅ README upgrade: screenshots, architecture diagram, badges, video links.

---

**Operational note:** the highest-leverage single action remains **applying the RLS SQL to the live database** (`APPLY_RLS.md`, plus the new rate-limit migration). Everything client-side assumes that server posture.
