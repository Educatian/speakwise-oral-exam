# SpeakWise — Instructor Guide

> **Audience**: Instructors and researchers running oral interviews in their own courses with SpeakWise, and scoring or analysing the resulting student responses.
> **Version**: Based on `master` as of 2026-04-24. Includes the Class Analytics panel, the Submission Analytics panels, and the Concept Map Toulmin mode.
>
> 🎬 **Narrated video tutorial** (≈3 min): [instructor-tutorial.mp4](https://speakwise-guide.pages.dev/videos/instructor-tutorial.mp4) — the full instructor loop (course creation → analytics → submission review → concept map) with voice guidance and an on-screen cursor.

---

## 1. Getting started — landing and sign-in

SpeakWise's entry page routes a visitor into either the student workspace or the instructor workspace from a single screen.

![Landing](screenshots/shared/01-landing.png)

**Steps**
1. Click the **Instructor Workspace** button.
2. The unified authentication view opens. Enter your email and password, then press **Sign in**.

![Sign in](screenshots/shared/02-auth-signin.png)

> **First time?** Use the mode toggle in the form to switch to sign-up, then register your email, role, and institution. If you sign up with the email set as `ADMIN_EMAIL` in the source, the account automatically gets admin privileges and can see every course in every institution.

Immediately after sign-in the app loads your courses and submissions from Supabase. During the fetch you may briefly see a "Loading from Supabase…" placeholder.

![Post sign-in](screenshots/instructor/10-after-signin.png)

---

## 2. Dashboard anatomy

The **Course Manager Dashboard** is the default view once you are signed in. The page has three major regions.

![Full dashboard](screenshots/instructor/21-class-analytics.png)

| Region | Purpose |
|---|---|
| **Top header** | Institution context, signed-in identity, Admin Panel entry button (admin-only). |
| **Summary cards + instructor guidance** | Institution scope, visible course count, total submissions, average score. |
| **Class Analytics** | Class-level metrics, charts, and a per-student sortable table. Collapsible (▾ caret). |
| **Bottom split** | Left: the *Build Course* / *Course Library* tabs. Right: the recent submissions list. |

> **Admin vs ordinary instructor**: admins see every institution's courses. Ordinary instructors only see courses where `owner_email` matches their own email. If a course you expect is missing, check its `owner_email`.

---

## 3. Class Analytics — the class-level lens

The Class Analytics panel is **open by default**. Click the ▾ caret on the left of its heading to collapse it. When open, it shows five visual layers in sequence.

### 3.1 Top-line metric cards

![Class Analytics](screenshots/instructor/21-class-analytics.png)

Four cards sit in a row (left to right):

| Card | Meaning | How to read it |
|---|---|---|
| **Submissions** | Total number of submissions across visible courses | Zero? Check that you have invited students and distributed passcodes. |
| **Avg Score** | Average AI score (0–100) | Low averages may indicate an overly strict rubric *or* under-prepared students — open a handful of submissions to triangulate. |
| **Avg Reasoning** | Mean of `reasoningRubric.overallReasoningScore` | Interpret independently of AI score. It measures Toulmin-element coverage. |
| **Avg Confidence** | How confident the AI is in its own evaluation (0–100%) | Low confidence often means transcripts were too short or ambiguous. |

### 3.2 Score distribution & time series

- **Score Distribution** — a 10-bin histogram across 0–100. A skew to one end suggests rubric calibration work.
- **Score over time** — oldest-to-newest sparkline. An upward trend is common as students become familiar with the format.

### 3.3 Reasoning Dimensions bar chart

Four horizontal bars: *Explicit Justification*, *Causal Explanation*, *Counter-Argument Handling*, and *Abstraction / Generalization*, each averaged on a 0–5 scale. The shortest bar is your class's most systematic gap.

### 3.4 Per-student breakdown table

- Columns: Student · Course · Score · Reasoning · Confidence · Turns · Barge-ins · When
- **Click any header to sort.** Sort by Score ascending to surface the lowest-performing submissions first.
- **Click any row to open the Submission Detail modal** (next section).

> **Research tip**: the table can be copied into Excel or R for further analysis. A dedicated CSV/JSON export is on the roadmap (Track R).

---

## 4. Submission Detail modal — walkthrough

Clicking a row in the per-student table, or any card in the recent submissions list, opens the **Submission Detail modal**. The modal scrolls vertically and is organized into several sections.

### 4.1 Top — score, AI feedback, confidence

![Submission detail top](screenshots/instructor/30-submission-detail-top.png)

- Student name, course, timestamp
- Mastery level (emoji and percentage)
- **AI Feedback** — a three-to-five-sentence summary written by Gemini
- **AI Confidence** — how confident Gemini is in its own scoring, with a one-line rationale. Anything below 0.3 is a flag to re-read the transcript yourself.

### 4.2 Rubric Breakdown radar

![Rubric radar](screenshots/instructor/31-submission-rubric-radar.png)

- Four-axis radar on the left: Conceptual Understanding / Communication Clarity / Critical Thinking / Engagement (each 0–25).
- Per-dimension cards on the right that expand (▸) to show **evidence quotes** the AI pulled from the transcript. You can immediately verify whether the AI's judgment is grounded.

### 4.3 Reasoning Quality + Session Timing

![Reasoning and timing](screenshots/instructor/32-submission-reasoning-timing.png)

**Reasoning Quality block**
- Four horizontal bars for the linguistic reasoning dimensions, plus an overall 0–100 reasoning score in the top-right.
- Raw counts below: "Justifications: 3, Causal patterns: 2, Counter attempts: 0, Generalizations: 1" — these come from rule-based pattern detection in `lib/reasoning/patterns.ts`.

**Session Timing block**
- Four metric cards: Turns · Avg Response · Max Delay · Turn-Taking.
- Per-turn response-latency sparkline — does the student speed up or slow down?
- Dialogue metrics: Initiatives, Rephrasing, Avg follow-up chars, Latency σ.

> **Barge-in Events panel** follows immediately below, but renders only if any barge-ins occurred. Each entry carries a colour-coded interpretation badge: **Confidence (green)** / **Hasty (amber)** / **Correction (blue)** / **Unclassified (grey)**.

### 4.4 Speech capture archive (upstream)

The `rawTranscriptTurns` + `failedTranscriptions` section lists every captured audio turn including the ones too short or too noisy to transcribe. Useful for debugging and for research reproducibility — every utterance is audit-able.

### 4.5 Integrated Analysis Workspace — the Concept Map

![Concept map (Toulmin mode)](screenshots/instructor/34-concept-map-toulmin-mode.png)

This is where you will spend the most time per submission. The next section details every mode and filter.

---

## 5. The Concept Map — complete reference

The **Integrated analysis workspace** in the middle of the Submission Detail modal shows a node–edge graph on the left and a transcript + annotation pane on the right.

### 5.1 Basic gestures

| Gesture | Result |
|---|---|
| Drag the background | Pan the entire canvas |
| Wheel scroll | Zoom around the cursor |
| Drag a node | Move that node only (position is persisted) |
| Click a node | Sidebar shows the concept, related edges, and transcript references |
| Click an edge | Filter the graph to that relation type |

### 5.2 Layout modes — Radial vs Force

![Force layout](screenshots/instructor/36-concept-map-force-layout.png)

- **Radial** (default) — the root node is centered and children fan out in concentric rings. Best for structured hierarchies.
- **Force** — d3-force continuous simulation. Better when the relations are dense and no hierarchy is obvious; the layout reveals clusters organically.

### 5.3 Colour modes — Concept vs Toulmin ⭐

Toggle with the **Color: Concept / Toulmin** button.

- **Concept mode** (default) — nodes coloured by the domain category the model inferred: THEORY (indigo) / PRINCIPLE (amber) / DOMAIN (violet) / TOOL (cyan) / EXAMPLE (teal).
- **Toulmin mode** — nodes coloured by the discourse role each utterance played:
    - 🔴 **Claim** (rose)
    - 🟢 **Evidence** (emerald)
    - 🟡 **Warrant** (amber) — the logical bridge
    - 🟣 **Rebuttal** (violet) — pushback
    - 🔵 **Question** (blue) — AI prompts

![Toulmin mode](screenshots/instructor/34-concept-map-toulmin-mode.png)

### 5.4 Toulmin filter chips

Only visible while Toulmin colour mode is active. Each chip has a colour dot that matches the node stroke — **the legend is the filter**.

![Claim filter active](screenshots/instructor/35-toulmin-claim-filter.png)

- **Click a chip** to isolate that role
- **Click again** to clear
- The top-level "Clear filter" button clears both relation and Toulmin filters simultaneously

**Research scenarios**
- *"Is this student heavy on Claim but light on Evidence?"* — isolate Claim, count; isolate Evidence, compare.
- *"Compare Warrant density across cohorts"* — capture Warrant-only screenshots of several submissions side by side.

### 5.5 Replay — timeline playback

![Replay midway](screenshots/instructor/37-replay-midway.png)

The Timeline playback card in the right sidebar:

- **Play / Pause** — auto-advances turn by turn (1.1-second default interval)
- **Full map** — resets to show every turn at once
- Slider — scrub to any turn
- **As time progresses the graph grows** — nodes fade-and-scale into place over 520 ms; the currently-mentioned node pulses green.

**Keyboard shortcuts** (when no input is focused):

| Key | Action |
|---|---|
| `←` | Previous turn |
| `→` | Next turn |
| `Home` | First turn |
| `End` | Last turn |
| `Space` | Toggle play/pause (auto-plays from turn 0 if stopped) |

### 5.6 Search, relation filter, cluster collapse

The **Search concepts** box matches node content, type, and conceptType case-insensitively. Non-matching nodes dim.

**Relation filter** chips (Defines / Requires / Exemplifies / Enables / Located in) narrow the edge set. These filters stack with the Toulmin filter.

**Cluster collapse** lets you hide all descendants of a level-1 hub in one click — helpful when the graph is dense and you want to focus on a single branch.

---

## 6. Instructor Review — validate or override

![Review panel](screenshots/instructor/24-submission-review-panel.png)

Near the bottom of the Submission Detail modal:

- **Validated** — accept the AI score as-is.
- **Override** — supply your own score (0–100).
- **Notes** — internal comment visible to other reviewers.

Review records go into `submission_reviews`. They feed inter-rater reliability analysis if multiple instructors review the same submission.

---

## 7. Annotation — per-turn notes

![Annotation editor](screenshots/instructor/25-annotation-editor.png)

Click **"Click to annotate"** next to any transcript turn, pick a category, write a note, save.

| Category | Colour | Use |
|---|---|---|
| 🟢 Strength | emerald | Something the student did well |
| 🔴 Concern | rose | A gap, error, or missed opportunity |
| 🔵 Evidence | indigo | Quoting this turn as support for a rubric score |
| 🟡 Follow up | amber | Something to check back on later |

Annotations persist in `submission_annotations` and are **shared in real time** with any other reviewer who has the modal open — useful for synchronous calibration sessions.

---

## 8. Building a course

![Build Course form](screenshots/instructor/22-build-course-form.png)

Required inputs (left panel, **Build Course** tab):

- **Course Name**
- **Instructor Name**
- **Instructor PIN (4 digits)** — self-identification before viewing submissions
- **Student Passcode** — what students type on the course login screen
- **Institution** — dropdown
- **Silence Threshold / Turn Duration** — voice-turn detection tuning (defaults 3000 ms / 700 ms)
- **Knowledge Source** (optional) — up to two PDF/DOCX/TXT uploads. Gemini extracts a knowledge base and draft question list.

**System Prompt** — the interviewer's instruction set. Write it yourself or click ✨ *Generate AI prompt* to have Gemini draft one. Prompt quality drives interview quality.

**Course Library** tab — reuse previously saved prompt templates.

---

## 9. Managing existing courses

Each course card in the right column has:

- **View** — open the course detail (prompt, submissions)
- **Delete** — cascade-delete including all submissions

Both actions require **Instructor PIN verification** (admins and the course's own owner bypass this).

Editing the **System Prompt** inside the course view takes effect immediately for future interviews; already-submitted sessions are not retroactively re-scored.

---

## 10. Admin Panel (admin-only)

Users whose email matches `ADMIN_EMAIL` see an **👑 Admin Panel** button in the top-right header.

![Admin panel](screenshots/instructor/23-admin-panel.png)

The panel exposes:

- Institution Operations Console — coverage counts, role mix
- User access search + role changes
- Recent audit activity (live stream of submission.created events written by the DB trigger added in migration 0002_lock_audit_logs)
- Institution management (create/edit/access code rotation)

> **Note**: under app-managed auth, some counts read zero even for the admin because the `is_admin_role()` SQL helper expects a Supabase-Auth JWT. The display gaps will close once session-token auth (P3) is introduced.

---

## 11. Exporting

- **Export JSON** (Concept Map toolbar) — graph data + current viewport + collapsed-cluster state as a single JSON file.
- **Export SVG** (Concept Map toolbar) — vector file suitable for posters or papers.
- **Print report** (Submission Detail footer) — the browser's Print to PDF produces an ink-friendly report. A dedicated print stylesheet flattens glass panels to white and enforces page breaks.

> **Not yet available (Track R)**: a whole-class CSV export and a tidy long-format JSON export for R/Python pipelines. For now, extract raw data from the Supabase SQL editor when you need it for manuscripts.

---

## 12. Operational notes

- **Gemini key management**: Vercel env var `GEMINI_API_KEY` must be enabled for Production *and* Preview *and* Development environments, because Vite's `define` replacement runs at build time. When the key expires, rotate it in AI Studio, update the Vercel env var, and redeploy.
- **`app_users.email` protection**: the email column is revoked from anon/authenticated. User listings now go through the `list_app_users_for_admin` RPC.
- **`audit_logs`**: a DB trigger writes a trusted row on every submission INSERT. Client-originated events (course deletion, role changes, annotations) funnel through the `log_audit_event` RPC.
- **Session-token authentication (P3)** is not yet deployed. Until it is, any holder of the publishable key can invoke RPCs — acceptable for a pilot, but recommended to close before IRB submission.

---

## Appendix — troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Dashboard stuck on "Loading from Supabase…" | Supabase project paused (free tier, 7 days of inactivity) | Click **Restore project** in the Supabase dashboard; DNS recovers within a minute. |
| Logged in, dashboard empty | Your email doesn't match `ADMIN_EMAIL` and no course has your email as `owner_email` | Ask an admin to reassign, or use the admin account. |
| Concept Map shows "No argument data" | Transcript too short, or no recognisable argument patterns | Strengthen the interviewer prompt so students articulate claims and evidence more explicitly. |
| Rubric radar or reasoning bars missing | That submission was written before the rubric-breakdown backfill | Run the `playwright/.backfill-rubric.mjs` script — it re-scores only the missing fields, non-destructively. |
| Toulmin chips don't appear | Colour mode is still on Concept | Click the **Color: Concept** toggle to flip to **Color: Toulmin**. |

---

*The screenshots in this document are re-generated by running `node playwright/capture.mjs` followed by `node playwright/capture-extra.mjs`. Keep the capture scripts in sync with the UI so the guide stays current.*
