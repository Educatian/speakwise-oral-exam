// SpeakWise tutorial muxer — aligns ElevenLabs narration clips to the
// recorded screencast using the timing manifest, producing a web-ready mp4.
//
// Usage: node playwright/mux.mjs        (after narrate.mjs + tutorial.mjs)
// Env:   FLOW = student | instructor | both (default both)

import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { FLOWS } from './tutorial-scenes.mjs';

const ROOT = 'C:/Users/jewoo/Projects/speakwise-oral-exam';
const VIDEOS = `${ROOT}/docs/guidebooks/videos`;
const AUDIO_ROOT = `${VIDEOS}/_audio`;
const FLOW = process.env.FLOW || 'both';

async function mux(flow) {
  const video = `${VIDEOS}/${flow}-tutorial.webm`;
  await access(video);
  const timings = JSON.parse(await readFile(`${AUDIO_ROOT}/${flow}-timing.json`, 'utf8'));
  const sceneIds = FLOWS[flow].map((s) => s.id);

  const inputs = ['-i', video];
  const delayParts = [];
  const mixLabels = [];
  let n = 1;
  for (const t of timings) {
    if (!sceneIds.includes(t.scene)) continue;
    const mp3 = `${AUDIO_ROOT}/${flow}/${t.scene}.mp3`;
    try { await access(mp3); } catch { continue; }
    inputs.push('-i', mp3);
    const delayMs = Math.max(0, Math.round(t.startSec * 1000));
    delayParts.push(`[${n}:a]adelay=${delayMs}|${delayMs}[a${n}]`);
    mixLabels.push(`[a${n}]`);
    n++;
  }
  if (!mixLabels.length) throw new Error(`no narration clips found for ${flow}`);

  const filter = `${delayParts.join(';')};${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0,loudnorm=I=-17:TP=-1.5[aout]`;
  const out = `${VIDEOS}/${flow}-tutorial.mp4`;
  console.log(`▸ ${flow}: ${mixLabels.length} narration clips → ${out}`);
  execFileSync('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', filter,
    '-map', '0:v', '-map', '[aout]',
    '-c:v', 'libx264', '-crf', '21', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    out
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
}

if (FLOW === 'student' || FLOW === 'both') await mux('student');
if (FLOW === 'instructor' || FLOW === 'both') await mux('instructor');
console.log('DONE.');
