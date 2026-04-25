// Supplementary screenshots — runs after capture.mjs. Covers scenes the
// first pass missed: admin panel, course creation form, annotation UI,
// student-at-OU (real course visibility), mic test, interview-start state.

import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOT_DIR = path.join(ROOT, 'docs', 'guidebooks', 'screenshots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const VIEWPORT = { width: 1440, height: 900 };

async function ensureDir(p) { await mkdir(p, { recursive: true }); }

async function snap(page, bucket, name, opt = {}) {
  const out = path.join(SHOT_DIR, bucket, `${name}.png`);
  await page.screenshot({ path: out, fullPage: opt.fullPage ?? false, ...opt });
  console.log(`  ✓ ${bucket}/${name}.png`);
}

async function waitForDashboardLoad(page) {
  try {
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Loading from Supabase'),
      { timeout: 15000 }
    );
  } catch {}
  await page.waitForTimeout(1200);
}

async function signIn(ctx, email, password, role = 'instructor') {
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const label = role === 'instructor' ? /Instructor Workspace/i : /Student Workspace/i;
  const btn = page.getByRole('button', { name: label });
  if (await btn.count()) await btn.first().click();
  await page.waitForTimeout(600);
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).first().click();
  await page.waitForLoadState('networkidle');
  await waitForDashboardLoad(page);
  return page;
}

async function captureInstructorExtras(browser) {
  console.log('▸ Instructor extras');
  await ensureDir(path.join(SHOT_DIR, 'instructor'));
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await signIn(ctx, 'jewoong.moon@gmail.com', 'Guidebook2026!', 'instructor');

  // 22 — Build Course form (left panel), with a few fields partially filled.
  const nameInput = page.getByPlaceholder(/Course Name/i).first();
  if (await nameInput.count()) {
    await nameInput.scrollIntoViewIfNeeded();
    await nameInput.fill('Sample Course — Socratic Method');
    const instrName = page.getByPlaceholder(/Your Name.*Instructor/i).first();
    if (await instrName.count()) await instrName.fill('Dr. Jewoong Moon');
    const pin = page.getByPlaceholder(/Instructor PIN/i).first();
    if (await pin.count()) await pin.fill('1234');
    const passcode = page.getByPlaceholder(/Student Passcode/i).first();
    if (await passcode.count()) await passcode.fill('SPEAK2026');
    await page.waitForTimeout(400);
    // Snap just the left column of the dashboard — the Build Course form.
    await snap(page, 'instructor', '22-build-course-form', { fullPage: true });
  }

  // 23 — Admin panel (if admin button visible)
  await page.evaluate(() => window.scrollTo(0, 0));
  const adminBtn = page.getByRole('button', { name: /Admin Panel/i });
  if (await adminBtn.count()) {
    await adminBtn.first().click();
    await page.waitForTimeout(1200);
    await snap(page, 'instructor', '23-admin-panel', { fullPage: true });
    // back
    const backBtn = page.getByRole('button', { name: /Back to Dashboard|Back|Manager/i }).first();
    if (await backBtn.count()) await backBtn.click();
    await page.waitForTimeout(600);
  }

  // 24 — Open a submission and show the Submission Review / Annotation area
  await waitForDashboardLoad(page);
  const firstRow = page.locator('table tbody tr').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(1200);
    const modal = page.locator('[role="dialog"]').first();

    // Scroll to the review/annotation bottom area of the modal
    await modal.evaluate((el) => { el.scrollTop = 2200; });
    await page.waitForTimeout(400);
    await snap(page, 'instructor', '24-submission-review-panel');

    // Try opening annotation editor on a transcript turn
    const annotateBtn = page.getByRole('button', { name: /Click to annotate|Add annotation/i }).first();
    if (await annotateBtn.count()) {
      await annotateBtn.click();
      await page.waitForTimeout(600);
      await snap(page, 'instructor', '25-annotation-editor');
    }

    const closeBtn = page.getByRole('button', { name: /Close/i }).first();
    if (await closeBtn.count()) await closeBtn.click();
  }

  await ctx.close();
}

async function captureStudentFullFlow(browser) {
  console.log('▸ Student (OU) full flow');
  await ensureDir(path.join(SHOT_DIR, 'student'));
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // Sign in as OU student so the real course is visible
  const stuBtn = page.getByRole('button', { name: /Student Workspace/i });
  if (await stuBtn.count()) await stuBtn.first().click();
  await page.waitForTimeout(800);
  await page.locator('input[type="email"]').first().fill('guidebook-student-ou@speakwise.test');
  await page.locator('input[type="password"]').first().fill('Guidebook2026!');
  await page.getByRole('button', { name: /^sign in$/i }).first().click();
  await page.waitForLoadState('networkidle');
  await waitForDashboardLoad(page);

  // Institution access (OU code)
  const codeInput = page.locator('input[placeholder*="ACCESS CODE" i], input[placeholder*="access code" i]').first();
  if (await codeInput.count()) {
    await codeInput.fill('BOOMER2025');
    const continueBtn = page.getByRole('button', { name: /Continue to Courses/i }).first();
    if (await continueBtn.count()) {
      await continueBtn.click();
      await page.waitForLoadState('networkidle');
      await waitForDashboardLoad(page);
    }
  }

  await snap(page, 'student', '46-available-courses', { fullPage: true });

  // Click the one real course (by text)
  const courseCard = page.locator(':has-text("Learning with Technology")').locator('..').locator('..').locator('button, [role="button"]').first();
  const altSelector = page.getByText(/Learning with Technology/i).first();
  if (await courseCard.count()) {
    await courseCard.click();
  } else if (await altSelector.count()) {
    await altSelector.click();
  }
  await page.waitForTimeout(1200);
  await snap(page, 'student', '47-join-interview-form');

  // Fill in name + passcode (we don't know the actual passcode — grab anyway, will show passcode prompt either way)
  const nameField = page.getByPlaceholder(/Your Full Name/i).first();
  if (await nameField.count()) await nameField.fill('Guidebook Demo Student');
  await page.waitForTimeout(400);
  await snap(page, 'student', '48-name-filled-mic-test');

  await ctx.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    await captureInstructorExtras(browser);
    await captureStudentFullFlow(browser);
  } finally {
    await browser.close();
  }
  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
