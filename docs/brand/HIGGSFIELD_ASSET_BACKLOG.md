# SpeakWise — Higgsfield "Pro-Version" Asset Backlog

**Date:** 2026-06-09 · Method: 5-agent visual-surface audit (landing/onboarding · interview/persona · results/analytics · shell/empty-states · marketing/SEO/brand) → synthesis.

**Guiding principle:** *atmosphere behind, never in front of, the data.* Generated assets belong in brand chrome (share cards, headers, empty states, identity marks, low-opacity texture) and must never sit behind live numbers, transcripts, or as a literal human/robot examiner face. Every texture/video is accessibility-gated (capped opacity, WCAG-checked, `prefers-reduced-motion`). The biggest real gap is **trust-at-share-time** (zero `og:image`/SEO) and the **off-brand emoji** in analytics + placeholder letter/dot glyphs.

Credits available: ~1102 (Plus).

---

## Generate first (highest leverage)

| # | Asset | Type | Why first |
|---|---|---|---|
| **SW-01** | App **og:image / social card** + full meta block (`public/og.png` 1200×630) | og/social | Links unfurl blank today → table-stakes trust for "institution-ready" |
| **SW-02** | Crisp **favicon + app-icon set** (.ico/32/180/192/512) | icon-set | Current full-tile favicon mushes at 16–32px; constant credibility cue |
| **SW-03** | **Analytics line-icon set** (replaces 6 raw emoji + mastery emoji) | icon-set | Emoji are the most consumer-y element in the product |
| **SW-05** | Abstract **"Dr. SpeakWise" identity mark** (NOT a face) | icon-set | Persona is named/voiced but visually anonymous; abstract dodges anxiety/uncanny |
| **SW-07** | **Role-card icons** (Instructor / Student) replacing literal "I"/"S" | icon-set | Primary CTA reads as placeholder today |
| **SW-04** | Unified **empty-state illustration family** (courses/submissions/audit/history/peers/transcript) | illustration | First-run + fresh institutions hit zero-data screens constantly |
| **SW-06** | Master **ambient hero plate** (landing bg, reused in interview/guide) | texture/bg | Real optical depth gradients can't fake; high reuse |
| **SW-09** | **Guide-site og:image** matching the app card | og/social | The guide URL is the link most DM'd to prospective instructors |

---

## Full backlog (by phase)

### P0 — quick wins
- **SW-01** App og:image + SEO meta — `index.html <head>` + `public/og.png` (1200×630) · nano_banana_pro · **high/S**
- **SW-02** Favicon/app-icon set (+ footer mark) — `public/favicon.ico,icon-32,apple-touch-icon,icon-192,icon-512` · nano_banana_pro · **high/S**
- **SW-03** Analytics line-icons (rubric/reasoning/Toulmin/graph/timing/interruptions + mastery) — `SubmissionAnalyticsPanels.tsx` lines 47/94/148/206/242/327, `SubmissionDetailModal.tsx` 247 · nano_banana_pro · **high/M**

### P1 — core
- **SW-04** Empty-state illustration family — StudentCourses/ManagerDashboard/AdminPanel/StudentHistory/StudentResults · nano_banana_pro · **high/M**
- **SW-05** Examiner abstract identity mark — `InterviewSessionView.tsx` 340 + transcript chip · nano_banana_pro · **high/S**
- **SW-06** Master ambient scientific hero plate (16:9) — `LandingView.tsx` 75–84, reused behind interview + guide · nano_banana_pro · **medium/M**
- **SW-07** Role-card icons (Instructor/Student) — `LandingView.tsx` 155–185, `UnifiedAuthView` toggles · nano_banana_pro · **medium/S**
- **SW-08** Phase-state icons (Connect/Listen/Respond/Review) — `InterviewSessionView.tsx` 191–201 · nano_banana_pro · **medium/M**
- **SW-09** Guide-site og:image + meta — `docs/guidebooks/index.html` · nano_banana_pro · **medium/S**
- **SW-10** Neutral institution-crest placeholder (code-tintable) — `UnifiedAuthView` 470–491, `SchoolSelectView` 115–147 · nano_banana_pro · **medium/S**
- **SW-11** Sober mastery-band chips (Strong/Developing/Needs support, NOT trophies) — `scoreDisplay.ts` → History/Detail · nano_banana_pro · **medium/S**

### P2 — polish
- **SW-12** Default per-institution cover/banner strip (near-monochrome) — ManagerDashboard/AdminPanel headers · marketing_studio_image · **medium/M**
- **SW-13** Calm error-state illustration (not alarm-red) — `ErrorBoundary.tsx` 65–95 · nano_banana_pro · **medium/S**
- **SW-14** Auth side-panel abstract header band — `UnifiedAuthView` 439–462 · nano_banana_pro · **medium/M**
- **SW-15** Walkthrough-guide marketing hero — `docs/guidebooks/assets/hero.png` (1600×900) · marketing_studio_image · **medium/M**
- **SW-16** Depth-rich README repository banner (PNG hero alongside the SVG) — `docs/repository-banner.png` (1600×640) · marketing_studio_image · **medium/M**
- **SW-17** App-store-style framed screenshot mockups (composite REAL screenshots) — guide + README · marketing_studio_image · **medium/M**
- **SW-18** Branded cohort report print/PDF cover — `ClassAnalyticsView` export path · marketing_studio_image · **medium/M**
- **SW-19** Seamless film-grain texture for the dormant `.noise-overlay` — `public/noise.png` · nano_banana_pro · **low/S**
- **SW-20** PWA web manifest + maskable icons (+ optional splash) — `public/site.webmanifest` · nano_banana_pro · **low/S**
- **SW-21** Looping ambient hero motion video (opt-in, reduced-motion-gated) — `LandingView` ambient · image-to-video · **medium/M**
- **SW-22** Short ambient brand video loop for guide hero/social — `docs/guidebooks/assets/brand-ambient.webm` · image-to-video · **low/L**

---

## Declined (do NOT generate — they would hurt)
- **Literal human/robot face for Dr. SpeakWise** — a synthetic face staring at a nervous test-taker breaks the engineered anxiety-reduction + uncanny-valley risk. Keep the abstract mark (SW-05).
- **In-session listening/reacting video behind the AudioVisualizer** — perceptible motion competes with listening and reads as the AI "reacting" to answers; undermines the honest-visualizer principle.
- **Texture behind the score/label on the results hero** — highest WCAG-contrast risk on a high-stakes screen for marginal "certificate" flavor.
- **Warm "ready room" scene on the pre-interview IDLE panel** — drifts stock-y/consumer-warm and adds load on the peak-anxiety start path; reassurance is better via copy + SW-05.
