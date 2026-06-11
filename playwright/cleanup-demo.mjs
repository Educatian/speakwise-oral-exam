// Demo-workspace cleanup: delete duplicate tutorial-created courses
// ("Cell Biology — Oral Exam 1", PIN 1234) so re-recordings start clean.
// Usage: node playwright/cleanup-demo.mjs
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://speakwise-oral-exam.pages.dev';
const TARGET = /^Delete Cell Biology — Oral Exam 1$/;
const PIN = '1234';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /instructor workspace|^instructor$/i }).first().click();
await page.waitForTimeout(800);
await page.locator('input[type="email"]').first().fill('demo.instructor@speakwise-test.com');
await page.locator('input[type="password"]').first().fill('Demo-Instructor-2026!');
await page.getByRole('button', { name: /^sign in$/i }).first().click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

for (let i = 0; i < 6; i++) {
  const del = page.getByRole('button', { name: TARGET }).first();
  if (!(await del.count())) break;
  await del.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await del.click();
  await page.waitForTimeout(700);
  const pinInput = page.getByPlaceholder(/enter 4-digit pin/i).first();
  if (!(await pinInput.count())) { console.log('no PIN modal — stopping'); break; }
  await pinInput.fill(PIN);
  await page.getByRole('button', { name: /verify|confirm|delete/i }).last().click();
  await page.waitForTimeout(2500);
  console.log(`deleted duplicate #${i + 1}`);
}
const remaining = await page.getByRole('button', { name: TARGET }).count();
console.log('remaining matching courses:', remaining);
await browser.close();
