// Cue avatar check against a local dev server in localStorage-only mode (no Supabase vars: nothing is written to a database).
//   node playwright/cue-check.mjs [outDir] [--live]
// Seeds one course and a local student session, joins, and screenshots the interview screen at desktop, tablet and phone widths.
// --live also runs an interview: Chrome's fake microphone plays CUE_FAKE_MIC (a 48 kHz WAV of a spoken answer), and the
// Gemini Live socket is answered by a local stand-in that streams CUE_VOICE_DIR/turn1..3.wav (24 kHz mono PCM16) with their
// transcript and answers the speech-to-text and scoring calls, so the app's own audio, turn-taking and avatar code run
// end to end without a paid session.
// Set CUE_REAL_LIVE=1 to talk to the real Live API instead.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'playwright/cue-check';
const live = process.argv.includes('--live');
fs.mkdirSync(out, { recursive: true });
const course = {
    id: '424242', name: 'Cue check: photosynthesis', instructorName: 'Local', instructorPinHash: '', password: 'cue',
    prompt: 'Ask two short questions about photosynthesis. Keep each question under 20 words.',
    submissions: [], createdAt: 1, interviewSettings: { showInterviewerAvatar: true, silenceThresholdMs: 3000, minTurnDurationMs: 700 }
};
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'];
if (process.env.CUE_FAKE_MIC) args.push(`--use-file-for-fake-audio-capture=${process.env.CUE_FAKE_MIC}`);
const browser = await chromium.launch({ args });
const LINES = ['Welcome. Let us begin. In your own words, what is photosynthesis, and where in the plant cell does it take place?',
    'Thank you. One follow up. Why does the rate of photosynthesis change with light intensity?',
    'Thank you for your answers today. That concludes our interview. [END_INTERVIEW]'];

function pcm(turn) {
    const file = `${process.env.CUE_VOICE_DIR}/turn${turn}.wav`;
    if (process.env.CUE_VOICE_DIR && fs.existsSync(file)) {
        const wav = fs.readFileSync(file);
        return wav.subarray(wav.indexOf('data') + 8);
    }
    const tone = Buffer.alloc(24000 * 2 * 5);          // no recording: five seconds of a quiet tone
    for (let i = 0; i < tone.length / 2; i++) tone.writeInt16LE(Math.round(2500 * Math.sin(i * .05) * Math.sin(i * .0009) ** 2), i * 2);
    return tone;
}

/** A stand-in for the Live API: answers each client turn with audio chunks, the transcript and turnComplete.
 *  The speech-to-text and scoring calls (/api/llm) get canned answers too, so no provider key is needed. */
async function standInLive(context) {
    await context.route('**/api/llm', async route => {
        const audio = route.request().postData()?.includes('input_audio');
        const content = audio
            ? 'Photosynthesis is the process where plants use sunlight, water, and carbon dioxide to make glucose and release oxygen. It happens in the chloroplasts.'
            : JSON.stringify({ strengths: ['Clear definition'], areasOfImprovement: ['Add detail'], overallScore: 80, detailedFeedback: 'Local check.' });
        if (!audio) await new Promise(done => setTimeout(done, 6000));     // a real scoring call takes a few seconds
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }) });
    });
    await context.routeWebSocket(/generativelanguage\.googleapis\.com/, ws => {
        let turn = 0;
        ws.onMessage(async raw => {
            const message = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
            if (message.setup) return ws.send(JSON.stringify({ setupComplete: {} }));
            if (!message.clientContent) return;
            const text = LINES[Math.min(turn, LINES.length - 1)];
            const audio = pcm(Math.min(++turn, LINES.length));
            const step = 24000 * 2 / 5;                   // 200 ms
            for (let at = 0; at < audio.length; at += step) {
                ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: audio.subarray(at, at + step).toString('base64') } }] } } }));
                await new Promise(done => setTimeout(done, 190));
            }
            ws.send(JSON.stringify({ serverContent: { outputTranscription: { text } } }));
            ws.send(JSON.stringify({ serverContent: { turnComplete: true } }));
        });
    });
}
const errors = [];
let failed = false;

async function join(viewport, name) {
    const context = await browser.newContext({ viewport, permissions: ['microphone'] });
    if (live && !process.env.CUE_REAL_LIVE) await standInLive(context);
    await context.addInitScript(c => {
        localStorage.setItem('speakwise_courses', JSON.stringify([c]));
        localStorage.setItem('speakwise_user', JSON.stringify({ id: 'local', email: 'student@example.edu', displayName: 'Test Student', role: 'student' }));
    }, course);
    const page = await context.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${name} pageerror: ${e.message}`));
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.getByText(course.name).first().click();
    await page.getByLabel('Entry code').fill(course.password);
    await page.getByRole('button', { name: 'Start Interview' }).click();
    const stage = page.locator('.cue-stage');
    await stage.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('.cue-stage canvas')?.style.opacity === '1', null, { timeout: 20000 });
    return { page, stage, context };
}

for (const [name, viewport] of [['desktop-1366', { width: 1366, height: 768 }], ['tablet-820', { width: 820, height: 1180 }], ['mobile-390', { width: 390, height: 844 }]]) {
    try {
        const { page, stage, context } = await join(viewport, name);
        await page.waitForTimeout(1500);
        await stage.scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${out}/${name}.png` });
        await stage.screenshot({ path: `${out}/${name}-stage.png` });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        console.log(`${name}: Cue rendered, horizontal overflow ${overflow}px`);
        if (overflow > 0) failed = true;
        if (live && name === 'desktop-1366') {
            const says = text => page.waitForFunction(t => document.body.innerText.includes(t), text, { timeout: 90000 }).then(() => true, () => false);
            const shots = async (tag, count, gap) => { for (let i = 0; i < count; i++) { await page.waitForTimeout(gap); await stage.screenshot({ path: `${out}/live-${tag}-${i}.png`, timeout: 3000 }).catch(() => {}); } };
            await page.getByRole('button', { name: /Start Interview Session/i }).click();
            const steps = [];
            for (const round of [1, 2]) {
                steps.push([`examiner speaking (turn ${round})`, await says('Listen to the prompt')]);
                await shots(`speak${round}`, 8, 350);
                steps.push([`student turn (turn ${round})`, await says('Respond when you are ready')]);
                await shots(`listen${round}`, 6, 1300);
                await page.screenshot({ path: `${out}/live-page-${round}.png` });
            }
            steps.push(['interview completed', await says('Interview completed')]);
            await shots('end', 6, 500);
            await page.waitForTimeout(4000);
            await page.screenshot({ path: `${out}/live-page-end.png` });
            for (const [label, ok] of steps) { console.log(`live: ${label}: ${ok ? 'yes' : 'NO'}`); if (!ok) failed = true; }
        }
        await context.close();
    } catch (e) { errors.push(`${name}: ${e.message.split('\n')[0]}`); }
}
await browser.close();
console.log(`errors: ${errors.length}`);
errors.forEach(e => console.log('  - ' + e));
process.exit(errors.length || failed ? 1 : 0);
