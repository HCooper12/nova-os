import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// THE MORNING BRIEF'S AUDIO, SYNTHESIZED BEFORE HE OPENS THE APP.
//
// Measured from his 27-Aug morning (server receipts, not a guess): the app
// fired eight TTS requests at once and the local engine answered them
// serially — 5.9s, 6.9s, 9.1s, 12.6s, 14.2s, 17.2s, 18.8s. Because the
// client only reveals each beat when its audio BEGINS, the glass sat empty
// for the first six seconds and the whole brief took ~22s to finish
// arriving. On his second open every line came back in ~12ms, from this
// engine's own cache — which is the entire clue: the work is cacheable, it
// was simply being done at the worst possible moment, with him watching.
//
// composeShow is fully deterministic (no model call), so the same text can
// be produced ahead of time and pushed through the same synthesize path,
// filling the same cache the request path reads.
//
// Why it re-runs every half hour rather than once at dawn: the brief's text
// is derived from live data (overnight health, the inbox, the calendar),
// so a 5am warm can be stale by 8am and every changed sentence would miss.
// A re-run costs nothing when nothing changed — every line is a cache hit —
// and re-synthesizes only what actually moved.
//
// LOCAL ENGINE ONLY, deliberately: local synthesis is CPU on an idle Mac.
// Doing this against a paid per-character API would be spending his money
// on speech he may never hear.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const VOICE_PATH = () => path.join(dataRoot(), 'tts-voice.json');

// The cache key includes the voice, so warming the wrong voice warms
// nothing. The request path records what his device actually asks for.
export async function recordSpokenVoice(voiceId) {
  const v = String(voiceId || '').trim();
  if (!v) return;
  try {
    if (await lastSpokenVoice() === v) return; // no write on the common path
    await mkdir(dataRoot(), { recursive: true });
    const tmp = VOICE_PATH() + '.tmp';
    await writeFile(tmp, JSON.stringify({ voiceId: v, at: new Date().toISOString() }), 'utf8');
    await rename(tmp, VOICE_PATH());
  } catch { /* a missed record just means a colder warm */ }
}

export async function lastSpokenVoice() {
  if (!existsSync(VOICE_PATH())) return null;
  try {
    const raw = JSON.parse(await readFile(VOICE_PATH(), 'utf8'));
    return typeof raw.voiceId === 'string' && raw.voiceId ? raw.voiceId : null;
  } catch {
    return null;
  }
}

// Compose the brief exactly as the route would and push every spoken line
// through the engine. Returns what it did so the caller can log a receipt
// rather than claim success blindly.
export async function warmMorningBrief(vaultPath) {
  const { ttsConfigured, ttsEngine } = await import('./tts.js');
  if (!ttsConfigured() || ttsEngine() !== 'local') {
    return { skipped: true, reason: 'no local TTS engine' };
  }
  const { composeShow } = await import('./morningShow.js');
  const { synthesizeLocal } = await import('./ttsLocal.js');
  const voiceId = (await lastSpokenVoice()) || 'nova';

  const show = await composeShow(vaultPath, { variant: 'morning' });
  const lines = (show.steps || []).map((s) => s.say).filter(Boolean);
  let warmed = 0;
  let failed = 0;
  for (const line of lines) {
    // Serial on purpose: the engine serialises anyway, and hammering it in
    // parallel is what made the live path feel broken in the first place.
    try { await synthesizeLocal(line, voiceId); warmed++; } catch { failed++; }
  }
  return { skipped: false, lines: lines.length, warmed, failed, voiceId };
}

// Between 05:00 and 10:00 his brief is plausible; outside it, warming is
// wasted CPU. Ticks every 30 minutes so a brief composed from data that
// changed at 07:00 is still warm when he opens at 07:40.
const START_HOUR = 5;
const END_HOUR = 10;

export function startBriefWarmScheduler(vaultPath) {
  const tick = async () => {
    const h = new Date().getHours();
    if (h < START_HOUR || h >= END_HOUR) return;
    try {
      const out = await warmMorningBrief(vaultPath);
      if (!out.skipped) console.log(`brief warm: ${out.warmed}/${out.lines} lines ready (voice ${out.voiceId})${out.failed ? `, ${out.failed} failed` : ''}`);
    } catch (err) {
      console.error('brief warm failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 30 * 60 * 1000);
}
