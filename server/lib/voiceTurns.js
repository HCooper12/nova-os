import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from '../../src/where.js';
import { TRIGGERS, ENDED_BY } from '../../src/listenRules.js';

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
// 'tap', 'hidden', 'mic-timeout' (18 Oct 2026): his own tap (it was logged as
// 'engine', which read as the engine failing), the screen going away mid-turn
// (lock, app switch), and a microphone that never opened (src/useDictation.js).
export const END_REASONS = new Set(['hold', 'lead', 'cap-idle', 'cap-absolute', 'restart-limit', 'engine', 'barge-in', 'tap', 'hidden', 'mic-timeout', 'unknown']);
// 'ask' (15 Oct 2026): one row per question sent, carrying how long he waited
// for the ack, the first words and the first sound (scripts/voice-latency.mjs
// reads them back). Its `reason` is 'unknown': an ask is not a turn ending.
const SURFACES = new Set(['voice', 'presence', 'barge', 'ask']);
// what the level meter thought, for a turn heard by Nova's own ears (vad.js)
const VAD_STATES = new Set(['heard', 'silent', 'blind']);

export const MAX_TURNS = 500;

// THE LISTENING RECEIPT (18 Oct 2026). The audit of 48 iPhone turns could not
// tell a mic Nova opened by itself from one he opened, a tap from the clock,
// or a mic that never opened from one that heard silence, without joining
// three logs by timestamp. These fields say it on the row. Each is a closed
// set or a bounded number; anything else is left off, never stored as a
// guess. The vocabularies are src/listenRules.js's and move with it.
const TRIGGER_SET = new Set(TRIGGERS);
const ENDED_BY_SET = new Set(ENDED_BY);
const TX_STATUS = new Set(['ok', 'empty', 'error', 'skipped', 'none']);
const AUDIO_SESSIONS = new Set(['auto', 'playback', 'play-and-record', 'transient', 'transient-solo', 'ambient', 'unsupported']);
const CAUSES = new Set(['empty-capture', 'hidden', 'mic-timeout', 'blind-draft']);
const TURN_MAX_MS = 900_000;   // turnEnd.js maxSpeakingMs: no turn runs longer
const boundedMs = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= TURN_MAX_MS ? Math.round(v) : undefined);
export function listenFields(body = {}) {
  const out = {};
  if (TRIGGER_SET.has(body.trigger)) out.trigger = body.trigger;
  if (ENDED_BY_SET.has(body.endedBy)) out.endedBy = body.endedBy;
  // null is a fact here: the microphone never opened
  if (body.micOpenMs === null) out.micOpenMs = null;
  else if (boundedMs(body.micOpenMs) !== undefined) out.micOpenMs = boundedMs(body.micOpenMs);
  for (const k of ['recMs', 'blindMs']) if (boundedMs(body[k]) !== undefined) out[k] = boundedMs(body[k]);
  if (body.firstSoundMs === null) out.firstSoundMs = null;
  else if (boundedMs(body.firstSoundMs) !== undefined) out.firstSoundMs = boundedMs(body.firstSoundMs);
  if (typeof body.peak === 'number' && Number.isFinite(body.peak) && body.peak >= 0) out.peak = Math.round(Math.min(1, body.peak) * 10000) / 10000;
  if (TX_STATUS.has(body.txStatus)) out.txStatus = body.txStatus;
  if (Number.isInteger(body.txChars) && body.txChars >= 0 && body.txChars <= 100_000) out.txChars = body.txChars;
  if (typeof body.txDropped === 'string' && body.txDropped) out.txDropped = body.txDropped.slice(0, 60);
  if (AUDIO_SESSIONS.has(body.audioSession)) out.audioSession = body.audioSession;
  if (typeof body.novaSpeaking === 'boolean') out.novaSpeaking = body.novaSpeaking;
  if (typeof body.hidden === 'boolean') out.hidden = body.hidden;
  if (CAUSES.has(body.cause)) out.cause = body.cause;
  // A DEAF TURN, DIAGNOSED (29 Oct 2026): how many reads of the clip decided a
  // blind turn, how long the page's own clock was frozen, which meter heard
  // him, what the shared audio graph was doing when it went deaf, and whether
  // the phone handed over a muted microphone
  if (Number.isInteger(body.blindReads) && body.blindReads >= 0 && body.blindReads <= 1000) out.blindReads = body.blindReads;
  if (boundedMs(body.stallMs) !== undefined && body.stallMs > 0) out.stallMs = boundedMs(body.stallMs);
  if (METERS.has(body.meter)) out.meter = body.meter;
  if (GRAPH_STATES.has(body.graphAtBlind)) out.graphAtBlind = body.graphAtBlind;
  if (body.muted === true) out.muted = true;
  return out;
}
const METERS = new Set(['shared', 'own', 'none']);
const GRAPH_STATES = new Set(['running', 'suspended', 'interrupted', 'closed', 'none']);

// THE LISTENING TABLE (scripts/voice-latency.mjs): per trigger, how often the
// mic heard him, how the turns ended, and how long the mic took to open.
// Turns only (not asks, not barge-ins). `deaf` is the health count: turns
// that heard nothing, leaving out the mics Nova opened by itself ('auto',
// 'reply-window'), where silence is usually him having nothing to add, and
// the turns he ended with a tap.
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};
export function listeningTable(turns = []) {
  const rows = turns.filter((t) => t && (t.surface === 'voice' || t.surface === 'presence'));
  const by = new Map();
  for (const t of rows) {
    const k = t.trigger || '?';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(t);
  }
  const groups = [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([trigger, ts]) => {
    const endedBy = {};
    for (const t of ts) { const e = t.endedBy || '?'; endedBy[e] = (endedBy[e] || 0) + 1; }
    const opens = ts.map((t) => t.micOpenMs).filter((v) => Number.isFinite(v));
    return {
      trigger,
      n: ts.length,
      heard: ts.filter((t) => t.heard).length,
      endedBy,
      micOpenMedianMs: median(opens),
      neverOpened: ts.filter((t) => t.micOpenMs === null).length,
    };
  });
  const deaf = rows.filter((t) => !t.heard && t.trigger !== 'auto' && t.trigger !== 'reply-window' && t.endedBy !== 'tap').length;
  return { turns: rows.length, deaf, groups };
}

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

// preAskMs (18 Oct 2026): his words back from the Mac → the ask leaving the
// phone, client time. firstSpeakableMs: → the first text that is not a
// withheld VIS line or document body (src/App.jsx attachAskPoll).
const LATENCY_FIELDS = ['ackMs', 'firstTextMs', 'firstAudioMs', 'preAskMs', 'firstSpeakableMs'];
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
    // what opened and closed the mic, and what the capture held (listenFields)
    ...listenFields(body),
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
    // THE SENTENCES HE SAW BUT DID NOT HEAR (18 Oct 2026): shown as text
    // after the engine refused them twice. A count, bounded; and the slowest
    // step before the ask left ("prime:1840"), only in its own small shape.
    ...(Number.isInteger(body.droppedSentences) && body.droppedSentences >= 0 && body.droppedSentences <= 500 ? { droppedSentences: body.droppedSentences } : {}),
    ...(typeof body.preAskSlowest === 'string' && /^[a-z]{1,12}:\d{1,6}$/.test(body.preAskSlowest) ? { preAskSlowest: body.preAskSlowest } : {}),
    ua: String(body.ua || ua || '').slice(0, 200),
  };
}

// Two turns can land in the same tick (a barge-in racing the turn it cut
// off): both used to read-modify-write the SAME `turns.json.tmp`, and
// whichever renamed second found its own tmp file already moved — ENOENT.
// Every write now goes through one chain (one writer at a time, the way
// acks.js serialises its ledger) and gets its own tmp name, so a crash
// mid-write never collides with the next call.
let writing = Promise.resolve();
let tmpCounter = 0;

export async function appendTurn(body, ua) {
  const record = turnRecord(body, ua);
  const job = writing.then(async () => {
    const next = [...readTurns(), record].slice(-MAX_TURNS);
    await mkdir(TURNS_DIR(), { recursive: true });
    const tmp = `${TURNS_PATH()}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`;
    await writeFile(tmp, JSON.stringify({ turns: next }, null, 2), 'utf8');
    await rename(tmp, TURNS_PATH());
    return record;
  });
  writing = job.then(() => {}, () => {});
  return job;
}
