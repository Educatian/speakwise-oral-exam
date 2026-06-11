// SpeakWise tutorial recorder — narrated, cursor-following screencast.
//
// Records one webm per flow (student / instructor) with a visible animated
// cursor that travels to every click target, paced so each scene lasts at
// least as long as its ElevenLabs narration (see narrate.mjs). Scene start
// times are written to a timing manifest so mux.mjs can align audio exactly.
//
// Usage:
//   node playwright/narrate.mjs                 # 1) generate narration + durations
//   node playwright/tutorial.mjs                # 2) record screencasts
//   node playwright/mux.mjs                     # 3) mux audio → mp4
//
// Env: BASE_URL (default https://speakwise-oral-exam.pages.dev)
//      FLOW = student | instructor | both (default both)

import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { FLOWS } from './tutorial-scenes.mjs';

const BASE_URL = process.env.BASE_URL || 'https://speakwise-oral-exam.pages.dev';
const FLOW = process.env.FLOW || 'both';
const VIEWPORT = { width: 1440, height: 900 };
const ROOT = 'C:/Users/jewoo/Projects/speakwise-oral-exam';
const VIDEOS = `${ROOT}/docs/guidebooks/videos`;
const AUDIO_ROOT = `${VIDEOS}/_audio`;
const PAD_SEC = 1.0; // breathing room after each narration ends

const manifest = JSON.parse(await readFile(`${AUDIO_ROOT}/narration-manifest.json`, 'utf8'));

// ---------------------------------------------------------------- cursor ---
// Injected on every page: a software cursor that follows the real mouse and
// ripples on click. pointer-events:none so it never interferes.
const CURSOR_INIT = `
(() => {
  if (window.__swCursorInstalled) return;
  window.__swCursorInstalled = true;
  const ensure = () => {
    if (!document.body) return requestAnimationFrame(ensure);
    const c = document.createElement('div');
    c.id = '__sw_cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-4px,-3px);transition:none;';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 5px rgba(0,0,0,.55))"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 0 0-.85.36Z" fill="#fff" stroke="#1e293b" stroke-width="1.4"/></svg>';
    document.body.appendChild(c);
    document.addEventListener('mousemove', (e) => {
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
    }, { capture: true, passive: true });
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;border-radius:50%;border:3px solid #60a5fa;left:' + (e.clientX - 10) + 'px;top:' + (e.clientY - 10) + 'px;opacity:.9;transition:transform .55s ease-out,opacity .55s ease-out;';
      document.body.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(3.2)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 700);
    }, { capture: true, passive: true });
  };
  ensure();
})();
`;

// --------------------------------------------------------------- helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mousePos = { x: 720, y: 450 };

function makeHelpers(page) {
  const moveTo = async (x, y) => {
    const dist = Math.hypot(x - mousePos.x, y - mousePos.y);
    const steps = Math.max(14, Math.min(60, Math.round(dist / 14)));
    await page.mouse.move(x, y, { steps });
    mousePos = { x, y };
  };
  return {
    settle: (ms) => sleep(ms),
    wheel: async (p, dy, ticks = 4) => {
      for (let i = 0; i < ticks; i++) {
        await p.mouse.wheel(0, dy / ticks);
        await sleep(130);
      }
    },
    moveClick: async (p, locator) => {
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        let box = await locator.boundingBox({ timeout: 4000 });
        if (!box) return false;
        // Inside scrollable modals scrollIntoViewIfNeeded can fail on unstable
        // (D3-animated) content; force a DOM scrollIntoView if still off-screen.
        if (box.y < 50 || box.y > VIEWPORT.height - 80 || box.x < 0 || box.x > VIEWPORT.width - 40) {
          await locator.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
          await sleep(450);
          box = await locator.boundingBox({ timeout: 2000 });
          if (!box) return false;
        }
        await moveTo(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40));
        await sleep(280);
        await p.mouse.down(); await sleep(90); await p.mouse.up();
        await sleep(350);
        return true;
      } catch { return false; }
    },
    type: async (p, locator, text) => {
      try {
        await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        const box = await locator.boundingBox({ timeout: 4000 });
        if (box) {
          await moveTo(box.x + Math.min(box.width / 2, 120), box.y + box.height / 2);
          await sleep(220);
          await p.mouse.down(); await sleep(70); await p.mouse.up();
          await sleep(180);
        } else {
          await locator.click({ timeout: 2000 }).catch(() => {});
        }
        await p.keyboard.type(text, { delay: 38 });
        await sleep(250);
        return true;
      } catch { return false; }
    }
  };
}

// ---------------------------------------------------------------- runner ---
async function recordFlow(browser, flow) {
  const scenes = FLOWS[flow];
  console.log(`\n▸ Recording ${flow} tutorial (${scenes.length} scenes)`);
  const rawDir = `${VIDEOS}/_raw_tut_${flow}`;
  await rm(rawDir, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: rawDir, size: VIEWPORT },
    permissions: ['microphone']
  });
  await ctx.addInitScript(CURSOR_INIT);
  const page = await ctx.newPage();
  const t0 = Date.now();
  mousePos = { x: 720, y: 450 };

  await page.goto(BASE_URL, { waitUntil: 'networkidle' }).catch(() => {});
  // Nudge the mouse so the software cursor becomes visible from frame one.
  await page.mouse.move(720, 450, { steps: 5 });

  const h = makeHelpers(page);
  const timings = [];
  for (const scene of scenes) {
    const startSec = (Date.now() - t0) / 1000;
    const narr = manifest[`${flow}/${scene.id}`];
    const minLen = (narr ? narr.duration : 4) + PAD_SEC;
    process.stdout.write(`  ▶ ${scene.id} @ ${startSec.toFixed(1)}s (narration ${narr ? narr.duration.toFixed(1) : '?'}s) ... `);
    timings.push({ scene: scene.id, startSec, narrationSec: narr ? narr.duration : 0 });
    try {
      await scene.run(page, h);
    } catch (e) {
      console.log(`scene error (continuing): ${e.message.split('\n')[0]}`);
    }
    const elapsed = (Date.now() - t0) / 1000 - startSec;
    if (elapsed < minLen) await sleep((minLen - elapsed) * 1000);
    console.log('done');
  }
  await sleep(1500); // closing beat

  await ctx.close();
  // Recover the finalized webm.
  const files = (await readdir(rawDir)).filter((f) => f.endsWith('.webm'));
  const out = `${VIDEOS}/${flow}-tutorial.webm`;
  if (files.length) {
    await rm(out, { force: true });
    await rename(`${rawDir}/${files[0]}`, out);
  }
  await writeFile(`${AUDIO_ROOT}/${flow}-timing.json`, JSON.stringify(timings, null, 2));
  console.log(`  🎬 ${out}\n  ⏱ timing → _audio/${flow}-timing.json`);
}

await mkdir(VIDEOS, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
});
if (FLOW === 'student' || FLOW === 'both') await recordFlow(browser, 'student');
if (FLOW === 'instructor' || FLOW === 'both') await recordFlow(browser, 'instructor');
await browser.close();
console.log('\nDONE. Next: node playwright/mux.mjs');
