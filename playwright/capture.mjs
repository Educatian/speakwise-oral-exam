// Guidebook screenshot capture script.
// Run with: node playwright/capture.mjs
// Env vars:
//   BASE_URL (default http://localhost:3001)
//   INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD
//   STUDENT_EMAIL, STUDENT_PASSWORD
//   SKIP_AUTH=1 to only capture the unauthenticated screens.

import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'docs', 'guidebooks', 'screenshots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

function shotPath(bucket, name) {
  return path.join(SHOT_DIR, bucket, `${name}.png`);
}

async function snap(page, bucket, name, options = {}) {
  const out = shotPath(bucket, name);
  await page.screenshot({ path: out, fullPage: options.fullPage ?? false, ...options });
  console.log(`  ✓ ${bucket}/${name}.png`);
}

async function captureUnauth(browser) {
  console.log('▸ Unauthenticated views');
  await ensureDir(path.join(SHOT_DIR, 'shared'));
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // let ambient animation settle
  await snap(page, 'shared', '01-landing');

  // Click Instructor route → unified auth should appear
  await page.getByRole('button', { name: /Instructor Workspace/i }).click();
  await page.waitForTimeout(500);
  await snap(page, 'shared', '02-auth-signin');

  // Switch to sign-up tab if present
  const signUpToggle = page.getByRole('button', { name: /Create account|Sign up|New account/i });
  if (await signUpToggle.count()) {
    await signUpToggle.first().click();
    await page.waitForTimeout(400);
    await snap(page, 'shared', '03-auth-signup');
  }

  await ctx.close();
}

async function signIn(page, email, password, role = 'instructor') {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  // Landing has role buttons; click the matching route → Unified auth
  const roleLabel = role === 'instructor' ? /Instructor Workspace/i : /Student Workspace/i;
  const roleBtn = page.getByRole('button', { name: roleLabel });
  if (await roleBtn.count()) await roleBtn.first().click();
  await page.waitForTimeout(800);

  // Placeholder is "you@example.edu" / "Enter your password" — use type selectors.
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  // Button text in signin mode is typically "Sign in" — match case-insensitively.
  const submit = page.getByRole('button', { name: /^sign in$/i }).first();
  await submit.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function captureInstructor(browser) {
  const email = process.env.INSTRUCTOR_EMAIL;
  const password = process.env.INSTRUCTOR_PASSWORD;
  if (!email || !password) {
    console.log('▸ Instructor flow: skipped (no INSTRUCTOR_EMAIL/PASSWORD)');
    return;
  }
  console.log(`▸ Instructor flow (${email})`);
  await ensureDir(path.join(SHOT_DIR, 'instructor'));
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await signIn(page, email, password);
  await snap(page, 'instructor', '10-after-signin');

  // Wait for Supabase data fetch to complete — the dashboard renders
  // "Loading from Supabase…" until courses resolve. Wait for that to
  // disappear (or for the course heading to appear).
  try {
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Loading from Supabase'),
      { timeout: 15000 }
    );
  } catch {
    console.log('  ! still loading after 15s, continuing anyway');
  }
  await page.waitForTimeout(1500);

  // Full-page dashboard snapshot
  await snap(page, 'instructor', '20-dashboard-overview', { fullPage: true });

  // Class Analytics section (scroll into view, collapsible should be open)
  await page.evaluate(() => window.scrollTo(0, 0));
  const analyticsToggle = page.getByRole('button', { name: /Class Analytics/i });
  if (await analyticsToggle.count()) {
    // Ensure open
    const expanded = await analyticsToggle.first().getAttribute('aria-expanded');
    if (expanded === 'false') await analyticsToggle.first().click();
    await page.waitForTimeout(600);
    await analyticsToggle.first().scrollIntoViewIfNeeded();
    await snap(page, 'instructor', '21-class-analytics', { fullPage: true });
  }

  // Click into first submission card to open detail modal
  const firstSubmissionRow = page.locator('table tbody tr, [data-submission-card]').first();
  if (await firstSubmissionRow.count()) {
    await firstSubmissionRow.click();
    await page.waitForTimeout(1000);
    await snap(page, 'instructor', '30-submission-detail-top');
    // Scroll down through the modal
    const modal = page.locator('[role="dialog"]').first();
    await modal.evaluate((el) => { el.scrollTop = 400; });
    await page.waitForTimeout(400);
    await snap(page, 'instructor', '31-submission-rubric-radar');
    await modal.evaluate((el) => { el.scrollTop = 800; });
    await page.waitForTimeout(400);
    await snap(page, 'instructor', '32-submission-reasoning-timing');
    await modal.evaluate((el) => { el.scrollTop = 1400; });
    await page.waitForTimeout(400);
    await snap(page, 'instructor', '33-submission-argument-map');

    // Toulmin color mode toggle
    const toulminBtn = page.getByRole('button', { name: /Color:\s*Concept|Color:\s*Toulmin/i });
    if (await toulminBtn.count()) {
      await toulminBtn.first().click();
      await page.waitForTimeout(400);
      await snap(page, 'instructor', '34-concept-map-toulmin-mode');

      // Click the Claim chip
      const claimChip = page.getByRole('button', { name: /^Claim$/ });
      if (await claimChip.count()) {
        await claimChip.first().click();
        await page.waitForTimeout(400);
        await snap(page, 'instructor', '35-toulmin-claim-filter');
        await claimChip.first().click(); // clear
      }
      await toulminBtn.first().click(); // back to concept mode
    }

    // Layout: Force
    const forceBtn = page.getByRole('button', { name: /^Force$/ });
    if (await forceBtn.count()) {
      await forceBtn.first().click();
      await page.waitForTimeout(800);
      await snap(page, 'instructor', '36-concept-map-force-layout');
    }

    // Replay: click Play
    const playBtn = page.getByRole('button', { name: /^Play$/ });
    if (await playBtn.count()) {
      await playBtn.first().click();
      await page.waitForTimeout(2000); // let a few turns advance
      await snap(page, 'instructor', '37-replay-midway');
      const pauseBtn = page.getByRole('button', { name: /^Pause$/ });
      if (await pauseBtn.count()) await pauseBtn.first().click();
    }

    // Close modal
    const closeBtn = page.getByRole('button', { name: /Close/i }).first();
    if (await closeBtn.count()) await closeBtn.click();
  }

  await ctx.close();
}

async function captureStudent(browser) {
  const email = process.env.STUDENT_EMAIL;
  const password = process.env.STUDENT_PASSWORD;
  if (!email || !password) {
    console.log('▸ Student flow: skipped (no STUDENT_EMAIL/PASSWORD)');
    return;
  }
  console.log(`▸ Student flow (${email})`);
  await ensureDir(path.join(SHOT_DIR, 'student'));
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const stuBtn = page.getByRole('button', { name: /Student Workspace/i });
  if (await stuBtn.count()) await stuBtn.first().click();
  await page.waitForTimeout(800);
  await snap(page, 'student', '40-auth');

  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).first().click();
  await page.waitForLoadState('networkidle');
  try {
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Loading from Supabase'),
      { timeout: 15000 }
    );
  } catch {
    console.log('  ! still loading after 15s, continuing anyway');
  }
  await page.waitForTimeout(1500);

  await snap(page, 'student', '41-after-signin');

  // Institution select if shown
  const instEnter = page.getByRole('button', { name: /Continue|Skip|Enter/i });
  if (await instEnter.count()) {
    await snap(page, 'student', '42-institution');
    await instEnter.first().click();
    await page.waitForTimeout(800);
  }

  await snap(page, 'student', '43-institution-access');

  // Enter the UA access code. Code is known to the student; in production
  // the instructor hands it out. For the guidebook capture we use ROLL2025.
  const codeInput = page.locator('input[placeholder*="ACCESS CODE" i], input[placeholder*="access code" i]').first();
  if (await codeInput.count()) {
    await codeInput.fill('ROLL2025');
    const continueBtn = page.getByRole('button', { name: /Continue to Courses/i }).first();
    if (await continueBtn.count()) {
      await continueBtn.click();
      await page.waitForLoadState('networkidle');
      try {
        await page.waitForFunction(
          () => !document.body.textContent?.includes('Loading from Supabase'),
          { timeout: 15000 }
        );
      } catch {}
      await page.waitForTimeout(1200);
      await snap(page, 'student', '44-course-list');

      // Click the first course tile
      const firstCourseCard = page
        .locator('button:has-text("Join"), button:has-text("Enter"), [data-course-card], article, div[role="button"]')
        .filter({ hasText: /Learning with Technology|Library|Museum|Course/i })
        .first();
      if (await firstCourseCard.count()) {
        await firstCourseCard.click();
        await page.waitForTimeout(800);
        await snap(page, 'student', '45-course-passcode');
      }
    }
  }

  await ctx.close();
}

async function main() {
  await ensureDir(path.join(SHOT_DIR, 'shared'));
  await ensureDir(path.join(SHOT_DIR, 'instructor'));
  await ensureDir(path.join(SHOT_DIR, 'student'));

  const browser = await chromium.launch({ headless: true });
  try {
    await captureUnauth(browser);
    if (process.env.SKIP_AUTH !== '1') {
      await captureInstructor(browser);
      await captureStudent(browser);
    }
  } finally {
    await browser.close();
  }
  console.log('\nDone. Screenshots in', SHOT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
