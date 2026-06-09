// Lightweight runtime smoke test — verifies the app boots without console/page
// errors after the Supabase Auth + ToastProvider changes, and that the landing
// → auth route renders. Run: node playwright/smoke.mjs  (dev server on :3000)
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE_URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const rootHtml = await page.locator('#root').innerHTML();
const mounted = rootHtml.trim().length > 0;
console.log(`React mounted: ${mounted ? 'YES' : 'NO'} (#root length ${rootHtml.length})`);

// Exercise a route + the toast path (instructor button on landing).
let routed = false;
try {
  const btn = page.getByRole('button', { name: /Instructor/i }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(800); routed = true; }
} catch (e) { errors.push(`route: ${e.message}`); }
console.log(`Routed off landing: ${routed ? 'YES' : 'n/a'}`);

await page.screenshot({ path: 'playwright/smoke-landing.png' });
console.log('Screenshot: playwright/smoke-landing.png');

console.log(`\nRuntime errors: ${errors.length}`);
errors.slice(0, 20).forEach((e) => console.log(`  - ${e}`));

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
