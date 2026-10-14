import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from '../../src/where.js';

// ---------------------------------------------------------------------------
// WHY HIS TURN ENDED — the receipt, not analytics.
//
// 12 Sep, driving, on cellular: "when I first tried explaining with my ramble
// it somehow thought that I was finished talking even though I did not pause
// while speaking." Three different things could have done that — the
// two-minute cap, a restart that threw and submitted, or the wake word
// fighting dictation for the microphone — and there was no way to tell which,
// because nothing on either side of the wire wrote down what happened.
//
// So every held turn now closes with a line here: when it ended, why, how long
// it ran, how many engines it burned through, and whether it ever heard a
// word. The next time he says "it cut me off", the answer is a record instead
// of a theory.
//
// It is deliberately small and deliberately dumb: last 500 turns, one file, no
// aggregation, nothing reads it but a person. Nothing in Nova behaves
// differently because of what is in here.
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const TURNS_DIR = () => path.join(dataRoot(), 'voice');
const TURNS_PATH = () => path.join(TURNS_DIR(), 'turns.json');

// A receipt nobody can read is not a receipt, so the vocabulary is closed and
// anything unrecognised is stored as 'unknown' rather than as whatever the
// client happened to send. These are turnEnd.js's reasons, and the two names
// must move together.
// 'barge-in' is not a turn ENDING — it is a turn starting because he talked
// over Nova. It rides the same rail because it answers the same question, and
// because the two are read together: a barge-in immediately followed by a turn
// that heard nothing is the signature of a FALSE one (Nova cut itself off on
// its own echo, and there was no one there).
export const END_REASONS = new Set(['hold', 'lead', 'cap-idle', 'cap-absolute', 'restart-limit', 'engine', 'barge-in', 'unknown']);
// 'ask' (15 Oct 2026): one row per question sent, carrying how long he waited
// for the ack, the first words and the first sound (scripts/voice-latency.mjs
// reads them back). Its `reason` is 'unknown': an ask is not a turn ending.
const SURFACES = new Set(['voice', 'presence', 'barge', 'ask']);
// what the level meter thought, for a turn heard by Nova's own ears (vad.js)
const VAD_STATES = new Set(['heard', 'silent', 'blind']);

export const MAX_TURNS = 500;

export function readTurns() {
  const file = TURNS_PATH();
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(raw?.turns) ? raw.turns : [];
  } catch {
    // a half-written file must not take the voice endpoint down with it
    return [];
  }
}

const LATENCY_FIELDS = ['ackMs', 'firstTextMs', 'firstAudioMs'];
// a wait longer than ten minutes is not a wait he sat through; it is a clock fault
const LATENCY_MAX_MS = 10 * 60_000;
function latency(body) {
  const out = {};
  for (const k of LATENCY_FIELDS) {
    const v = body[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= LATENCY_MAX_MS) out[k] = Math.round(v);
  }
  return out;
}

// One turn in. Everything is clamped here rather than trusted: this is written
// by a browser, and a receipt that can be made enormous is a receipt that
// fills his disk.
export function turnRecord(body = {}, ua = '') {
  const reason = END_REASONS.has(body.reason) ? body.reason : 'unknown';
  const ms = Number.isFinite(body.ms) ? Math.max(0, Math.round(body.ms)) : 0;
  const restarts = Number.isFinite(body.restarts) ? Math.max(0, Math.round(body.restarts)) : 0;
  return {
    at: new Date().toISOString(),
    reason,
    ms,
    restarts,
    heard: !!body.heard,
    surface: SURFACES.has(body.surface) ? body.surface : 'voice',
    preset: typeof body.preset === 'string' ? body.preset.slice(0, 24) : '',
    // WHY, and WHAT IT HEARD. A false barge-in cannot be diagnosed from a count:
    // the useful question is whether it misheard Nova's own echo or a passenger,
    // and only the words answer that. Kept short, kept on his own Mac, in his
    // own data directory, and deletable like any other file in it — a deliberate
    // trade for being able to fix this rather than guess at it.
    ...(typeof body.why === 'string' && body.why ? { why: body.why.slice(0, 120) } : {}),
    ...(typeof body.text === 'string' && body.text ? { text: body.text.slice(0, 80) } : {}),
    // WHICH EARS. 'nova' = recorded and transcribed on the Mac (src/recorder.js);
    // absent = the browser's own engine, as every turn before 25 Sep was. Read
    // by device AND engine: the whole point is to see whether the recording
    // path hears him on the phone where the engine never did.
    ...(body.engine === 'nova' ? {
      engine: 'nova',
      vad: VAD_STATES.has(body.vad) ? body.vad : 'unknown',
      bytes: Number.isFinite(body.bytes) ? Math.max(0, Math.round(body.bytes)) : 0,
      ...(Number.isFinite(body.txMs) ? { txMs: Math.max(0, Math.round(body.txMs)) } : {}),
    } : {}),
    // HOW QUICKLY HE HEARD SOMETHING (15 Oct 2026, his E.V. note): ms after
    // the ask left the device until the ack started playing, the first
    // words of the reply arrived, and the reply's first sentence was heard.
    // A value that is not a finite, non-negative number is dropped, never
    // stored as a guess.
    ...latency(body),
    ...(typeof body.lane === 'string' && body.lane ? { lane: body.lane.slice(0, 12) } : {}),
    ...(typeof body.ackText === 'string' && body.ackText ? { ackText: body.ackText.slice(0, 60) } : {}),
    ...(typeof body.ackId === 'string' && body.ackId ? { ackId: body.ackId.slice(0, 40) } : {}),
    // WHERE HE WAS (src/where.js): the closed set only, so voice-latency can
    // group by it; anything else is left off rather than stored as a guess
    ...(PLACES.includes(body.place) ? { place: body.place } : {}),
    ua: String(body.ua || ua || '').slice(0, 200),
  };
}

export async function appendTurn(body, ua) {
  const record = turnRecord(body, ua);
  const next = [...readTurns(), record].slice(-MAX_TURNS);
  await mkdir(TURNS_DIR(), { recursive: true });
  const tmp = `${TURNS_PATH()}.tmp`;
  await writeFile(tmp, JSON.stringify({ turns: next }, null, 2), 'utf8');
  await rename(tmp, TURNS_PATH());
  return record;
}
