// Mobile-viewport probe: screenshot key screens at iPhone size + report
// horizontal overflow (scrollWidth > innerWidth) per screen.
import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE_URL = 'https://speakwise-oral-exam.pages.dev';
const OUT = 'C:/Users/jewoo/Projects/speakwise-oral-exam/_mobile';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();

async function snap(name) {
  const overflow = await page.evaluate(() => ({
    innerW: window.innerWidth,
    scrollW: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 2
  }));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`${name}: viewport=${overflow.innerW} scrollW=${overflow.scrollW} H-OVERFLOW=${overflow.overflow}`);
}

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await snap('01-landing');

// student auth
await page.getByRole('button', { name: /student workspace|^student$/i }).first().click().catch(() => {});
await page.waitForTimeout(1200);
await snap('02-auth');

// sign in as demo student
await page.locator('input[type="email"]').first().fill('demo.student@speakwise-test.com').catch(() => {});
await page.locator('input[type="password"]').first().fill('Demo-Student-2026!').catch(() => {});
await page.getByRole('button', { name: /^sign in$/i }).first().click().catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(2500);
await snap('03-after-signin');

const code = page.getByPlaceholder(/access code/i).first();
if (await code.count()) {
  await code.fill('DEMO');
  await page.getByRole('button', { name: /^continue to courses$/i }).first().click().catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
}
await snap('04-courses');

const join = page.getByRole('button', { name: /^join /i }).first();
if (await join.count()) {
  await join.click().catch(() => {});
  await page.waitForTimeout(1500);
}
await snap('05-pre-interview');
await ctx.close();

// instructor dashboard at mobile size
const ctx2 = await browser.newContext({ ...devices['iPhone 14'] });
const p2 = await ctx2.newPage();
await p2.goto(BASE_URL, { waitUntil: 'networkidle' });
await p2.getByRole('button', { name: /instructor workspace|^instructor$/i }).first().click().catch(() => {});
await p2.waitForTimeout(1000);
await p2.locator('input[type="email"]').first().fill('demo.instructor@speakwise-test.com').catch(() => {});
await p2.locator('input[type="password"]').first().fill('Demo-Instructor-2026!').catch(() => {});
await p2.getByRole('button', { name: /^sign in$/i }).first().click().catch(() => {});
await p2.waitForLoadState('networkidle').catch(() => {});
await p2.waitForTimeout(3000);
const snap2 = async (name) => {
  const o = await p2.evaluate(() => ({ innerW: window.innerWidth, scrollW: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > window.innerWidth + 2 }));
  await p2.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}: viewport=${o.innerW} scrollW=${o.scrollW} H-OVERFLOW=${o.overflow}`);
};
await snap2('06-dashboard');
const row = p2.locator('table tbody tr, [data-submission-card]').first();
if (await row.count()) {
  await row.click().catch(() => {});
  await p2.waitForTimeout(1500);
  await snap2('07-submission-modal');
}
await browser.close();
console.log('done');
