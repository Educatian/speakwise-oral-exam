// Records the radial concept-map (SubmissionDetailModal → ArgumentMapView) for
// the guidebook, using the seeded demo submission. Output: videos/concept-map.webm
import { chromium } from '@playwright/test';
import { mkdir, rename, readdir } from 'node:fs/promises';

const BASE = process.env.BASE_URL || 'https://speakwise-oral-exam.pages.dev';
const VP = { width: 1440, height: 900 };
const SHOTS = 'docs/guidebooks/screenshots/instructor';
const VID = 'docs/guidebooks/videos';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: VP, recordVideo: { dir: `${VID}/_raw_cm`, size: VP } });
const p = await ctx.newPage();
const log = (m) => console.log('  ' + m);
async function shot(n, name){ await mkdir(SHOTS,{recursive:true}); await p.screenshot({path:`${SHOTS}/${n}-${name}.png`}); log('📸 '+n+'-'+name); }

await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.getByRole('button', { name: /instructor/i }).first().click();
await p.waitForTimeout(700);
await p.locator('#email').fill('demo.instructor@speakwise-test.com');
await p.locator('#password').fill('Demo-Instructor-2026!');
await p.getByRole('button', { name: /sign in/i }).click();
await p.waitForTimeout(3200);

// Class Analytics is open by default; click the student row to open the modal.
const row = p.getByText('Jamie Chen').first();
await row.scrollIntoViewIfNeeded().catch(()=>{});
await p.waitForTimeout(500);
await row.click().catch(()=>{});
await p.waitForTimeout(1800);
await shot(40, 'submission-detail-open');

// The argument map now spans full width inline. Bring the SVG canvas into view.
const radialBtn = p.getByRole('button', { name: /^Radial$/ }).first();
await radialBtn.scrollIntoViewIfNeeded().catch(()=>{});
await p.waitForTimeout(600);
await p.mouse.move(700, 480);
await p.mouse.wheel(0, 300);
await p.waitForTimeout(1300);
await shot(41, 'concept-map-radial');

// Toggle colour mode to Toulmin (node colours by argument role).
const colorToggle = p.getByRole('button', { name: /^Color:/ }).first();
if (await colorToggle.count()) { await colorToggle.click().catch(()=>{}); await p.waitForTimeout(1500); await shot(42, 'concept-map-toulmin'); }

// Switch to force layout, then back to radial — shows the layout settling.
const force = p.getByRole('button', { name: /^Force$/ }).first();
const radial = p.getByRole('button', { name: /^Radial$/ }).first();
if (await force.count()) { await force.click().catch(()=>{}); await p.waitForTimeout(1900); await shot(43, 'concept-map-force'); }
if (await radial.count()) { await radial.click().catch(()=>{}); await p.waitForTimeout(1700); }

// Replay the interview timeline for motion.
const play = p.getByRole('button', { name: /^Play$/i }).first();
if (await play.count()) { await play.click().catch(()=>{}); await p.waitForTimeout(3000); }
await p.waitForTimeout(1200);

console.log('done recording concept map');
await ctx.close();
try {
  const dir = `${VID}/_raw_cm`;
  const f = (await readdir(dir)).find(x => x.endsWith('.webm'));
  if (f) { await rename(`${dir}/${f}`, `${VID}/concept-map.webm`); log('🎬 videos/concept-map.webm'); }
} catch(e){ log('video note: '+e.message); }
await b.close();
