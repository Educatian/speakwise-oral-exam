// SpeakWise walkthrough recorder — produces narrated step screenshots + a video
// for the STUDENT and INSTRUCTOR journeys, used to build the guidebooks.
//
// Env:
//   BASE_URL              (default https://speakwise-oral-exam.pages.dev)
//   STUDENT_EMAIL/PASSWORD  reused demo student (default demo.student@speakwise-test.com)
//   STUDENT_INSTITUTION     institution id to join (default 'demo')
//   INSTRUCTOR_EMAIL/PASSWORD  existing instructor login (instructor flow skipped if unset)
//   FLOW                  'student' | 'instructor' | 'both' (default both)
import { chromium } from '@playwright/test';
import { mkdir, rename, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'https://speakwise-oral-exam.pages.dev';
const FLOW = process.env.FLOW || 'both';
const VIEWPORT = { width: 1440, height: 900 };
const ROOT = 'C:/Users/jewoo/Projects/speakwise-oral-exam';
const SHOTS = `${ROOT}/docs/guidebooks/screenshots`;
const VIDEOS = `${ROOT}/docs/guidebooks/videos`;

const S = {
  // Unique by default so the signup path always renders cleanly for the video.
  email: process.env.STUDENT_EMAIL || `demo.student.${Date.now()}@speakwise-test.com`,
  password: process.env.STUDENT_PASSWORD || 'Demo-Student-2026!',
  institution: process.env.STUDENT_INSTITUTION || 'demo'
};
const I = { email: process.env.INSTRUCTOR_EMAIL, password: process.env.INSTRUCTOR_PASSWORD };

const browser = await chromium.launch();
const log = (m) => console.log(`  ${m}`);

async function shot(page, bucket, n, name) {
  await mkdir(`${SHOTS}/${bucket}`, { recursive: true });
  const f = `${SHOTS}/${bucket}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f });
  log(`📸 ${bucket}/${path.basename(f)}`);
}
async function saveVideo(context, bucket, finalName) {
  await mkdir(`${VIDEOS}`, { recursive: true });
  // video is finalized on context.close(); find the newest .webm in the dir
  await context.close();
  const dir = `${VIDEOS}/_raw_${bucket}`;
  try {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.webm'));
    if (files.length) {
      await rename(`${dir}/${files[0]}`, `${VIDEOS}/${finalName}`);
      log(`🎬 videos/${finalName}`);
    }
  } catch (e) { log(`video save note: ${e.message}`); }
}

async function studentFlow() {
  console.log('\n▸ STUDENT journey');
  const ctx = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: `${VIDEOS}/_raw_student`, size: VIEWPORT } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'student', 1, 'landing');

  // Enter as student
  await page.getByRole('button', { name: /student/i }).first().click();
  await page.waitForTimeout(900);
  await shot(page, 'student', 2, 'auth-signin');

  // Switch to create-account
  const createLink = page.getByRole('button', { name: /create one now|create account/i }).first();
  if (await createLink.count()) { await createLink.click(); await page.waitForTimeout(500); }

  // Try sign up; if the email already exists we fall back to sign in.
  await page.locator('#firstName').fill('Jamie');
  await page.locator('#lastName').fill('Chen');
  await page.locator('#institution').selectOption(S.institution).catch(() => {});
  await page.locator('#email').fill(S.email);
  await page.locator('#password').fill(S.password);
  await page.locator('#confirmPassword').fill(S.password);
  await shot(page, 'student', 3, 'signup-filled');
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForTimeout(2500);

  // If signup failed (already registered), do a clean sign-in instead.
  if (await page.locator('text=/already|registered|invalid|failed|exists/i').count()) {
    log('signup says exists → signing in');
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /student/i }).first().click();
    await page.waitForTimeout(700);
    await page.locator('#email').fill(S.email);
    await page.locator('#password').fill(S.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(2500);
  }
  await shot(page, 'student', 4, 'school-select');

  // Institution access step: enter the access code and continue to courses.
  const codeField = page.getByPlaceholder(/access code/i).first();
  if (await codeField.count()) {
    const codes = { demo: 'DEMO', ua: 'ROLL2025', ou: 'BOOMER2025' };
    await codeField.fill(codes[S.institution] || 'DEMO');
    await page.waitForTimeout(500);
    const cont = page.getByRole('button', { name: /^Continue to Courses$/i });
    if (await cont.count()) { await cont.click(); }
    else { await page.getByRole('button', { name: /use this workspace/i }).first().click().catch(() => {}); }
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
  }

  // Courses list (institution-scoped)
  await shot(page, 'student', 5, 'courses');

  // Open the course → calm pre-interview screen (name prefilled, mic test).
  const courseByName = page.getByText(/Demo Oral Exam/i).first();
  const anyCourse = page.getByRole('button', { name: /start|enter|begin|open|interview/i }).first();
  let opened = false;
  if (await courseByName.count()) { await courseByName.click().catch(() => {}); opened = true; }
  else if (await anyCourse.count()) { await anyCourse.click().catch(() => {}); opened = true; }
  if (opened) {
    await page.waitForTimeout(1600);
    await shot(page, 'student', 6, 'pre-interview');
  }

  console.log(`  student pageerrors: ${errors.length}`);
  await saveVideo(ctx, 'student', 'student-journey.webm');
}

async function instructorFlow() {
  console.log('\n▸ INSTRUCTOR journey');
  if (!I.email || !I.password) {
    console.log('  ⚠ INSTRUCTOR_EMAIL/PASSWORD not set — recording only the sign-in screen.');
  }
  const ctx = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: `${VIDEOS}/_raw_instructor`, size: VIEWPORT } });
  const page = await ctx.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'instructor', 1, 'landing');
  await page.getByRole('button', { name: /instructor/i }).first().click();
  await page.waitForTimeout(900);
  await shot(page, 'instructor', 2, 'signin');

  if (I.email && I.password) {
    await page.locator('#email').fill(I.email);
    await page.locator('#password').fill(I.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
    await shot(page, 'instructor', 3, 'dashboard-overview');

    // Scroll to the "Add New Course" form and create a course.
    await page.mouse.wheel(0, 700); await page.waitForTimeout(800);
    try {
      await page.getByPlaceholder(/Course Name/i).fill('Demo Oral Exam — Cell Biology');
      await page.getByPlaceholder(/Your Name \(Instructor\)/i).fill('Dr. Demo Instructor').catch(() => {});
      await page.getByPlaceholder(/Instructor PIN/i).fill('1234').catch(() => {});
      await page.getByPlaceholder(/Student Passcode/i).fill('JOIN2026').catch(() => {});
      await page.getByPlaceholder(/System Instruction|system prompt/i).first()
        .fill('You are an oral examiner for an introductory cell biology course. Ask the student to explain the structure and function of mitochondria, then probe their reasoning with follow-up questions about cellular respiration.').catch(() => {});
      await shot(page, 'instructor', 4, 'create-course-filled');
      await page.getByRole('button', { name: /^Create Course$/i }).click({ timeout: 4000 });
      await page.waitForTimeout(2500);
      await shot(page, 'instructor', 5, 'course-created');
    } catch (e) { log(`create-course note: ${e.message}`); }

    // Open Class Analytics (top of dashboard) and screenshot.
    await page.mouse.wheel(0, -2000); await page.waitForTimeout(600);
    const analyticsToggle = page.getByRole('button', { name: /class analytics/i }).first();
    if (await analyticsToggle.count()) { await analyticsToggle.click().catch(() => {}); await page.waitForTimeout(900); }
    await shot(page, 'instructor', 6, 'class-analytics');
    await page.mouse.wheel(0, 1400); await page.waitForTimeout(600);
    await shot(page, 'instructor', 7, 'course-list');
  }
  await saveVideo(ctx, 'instructor', 'instructor-journey.webm');
}

if (FLOW === 'student' || FLOW === 'both') await studentFlow();
if (FLOW === 'instructor' || FLOW === 'both') await instructorFlow();
await browser.close();
console.log('\nDONE.');
