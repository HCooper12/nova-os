import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
export const END_REASONS = new Set(['hold', 'lead', 'cap-idle', 'cap-absolute', 'restart-limit', 'engine', 'unknown']);
const SURFACES = new Set(['voice', 'presence']);

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
