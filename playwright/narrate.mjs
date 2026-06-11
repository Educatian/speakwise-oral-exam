// SpeakWise tutorial narration generator (ElevenLabs TTS).
// Generates one mp3 per scene + a manifest with measured durations.
//
// Usage:  ELEVENLABS_API_KEY=... node playwright/narrate.mjs
// Output: docs/guidebooks/videos/_audio/<flow>/<scene>.mp3 + narration-manifest.json
//
// Scenes are imported from tutorial-scenes.mjs so narration text and the
// recorded actions can never drift apart.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { FLOWS } from './tutorial-scenes.mjs';

const ROOT = 'C:/Users/jewoo/Projects/speakwise-oral-exam';
const AUDIO_ROOT = `${ROOT}/docs/guidebooks/videos/_audio`;
const MANIFEST = `${AUDIO_ROOT}/narration-manifest.json`;

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY not set');
  process.exit(1);
}

// "Alice — Clear, Engaging Educator": fits the calm academic register.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'Xb7hH8MSUJpSbSDYk0k2';
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

function ffprobeDuration(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file
  ]).toString().trim();
  return parseFloat(out);
}

async function tts(text, outFile) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.2 }
    })
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outFile, buf);
}

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{}'));

for (const [flow, scenes] of Object.entries(FLOWS)) {
  await mkdir(`${AUDIO_ROOT}/${flow}`, { recursive: true });
  for (const scene of scenes) {
    const file = `${AUDIO_ROOT}/${flow}/${scene.id}.mp3`;
    const hash = createHash('sha1').update(VOICE_ID + '|' + scene.narration).digest('hex');
    const key = `${flow}/${scene.id}`;
    const cached = manifest[key];
    const exists = await access(file).then(() => true, () => false);
    if (cached && cached.hash === hash && exists) {
      console.log(`  = ${key} (cached, ${cached.duration.toFixed(1)}s)`);
      continue;
    }
    process.stdout.write(`  ♪ ${key} ... `);
    await tts(scene.narration, file);
    const duration = ffprobeDuration(file);
    manifest[key] = { hash, duration, chars: scene.narration.length };
    console.log(`${duration.toFixed(1)}s`);
  }
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
console.log(`\nManifest → ${MANIFEST}`);
