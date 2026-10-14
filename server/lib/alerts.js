// THE ALERT LAYER — one door for everything Nova says first
// (design/EVIE-STUDY.md §4D, 15 Oct 2026).
//
// The reference is E.V. in Brand New Day: on the roof, Peter's phone lays
// ALERT: CRIME IN PROGRESS over what he is watching, a map, the police band,
// and ONE spoken line ("Suspect is 5'8 to 5'10, medium build."). His note:
// "the alert card has an anatomy". Unprompted speech is rare and high-stakes:
// when Nova speaks first it is because something needs him now. And the bar
// is measured, because Nova once made ~154 drafts a month and he kept 9.
//
// So every proactive thing goes through raiseAlert, with one of three tiers:
//   now   — speaks if a voice session is live, drops in the island, pushes.
//           Passes standby; still honours quiet hours unless `urgent`.
//   next  — waits for the next app open (the island) and the start of his
//           next spoken turn ("One thing first: …"). No push.
//   later — an Inbox record only (kind 'alert'), on the existing rails.
// The anatomy is code-written and bounded: a LABEL (≤14, upper case), WHAT
// (one sentence, ≤90), WHERE (a time, a place or a record), SOURCE ("from
// Apple Health"), and at most ONE action (a verb the registry can run, or a
// screen to open). Never a paragraph. The spoken form is ≤12 words.
//
// RECEIPTS: every alert lands a row in server/data/alerts/log.jsonl with its
// tier and whether he acted (tapped / dismissed / spoken-only / nothing).
// Weekly, the pattern scout reads alertStats: a kind raised ≥6 times in 14
// days that he acted on <20% of the time is PROPOSED for demotion (now→next,
// next→later) as a normal Inbox card. Nothing is ever demoted by itself.
//
// Everything here is code. No model writes a word of an alert.

import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREEN_KEYS } from '../../src/screenKeys.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const DIR = () => path.join(dataRoot(), 'alerts');
const LOG_PATH = () => path.join(DIR(), 'log.jsonl');
const PENDING_PATH = () => path.join(DIR(), 'pending.json');
const TIERS_PATH = () => path.join(DIR(), 'tiers.json');

export const TIERS = ['now', 'next', 'later'];
export const LABEL_MAX = 14;
export const WHAT_MAX = 90;
export const WHERE_MAX = 40;
export const SOURCE_MAX = 40;
export const ACTION_LABEL_MAX = 18;
export const SPOKEN_MAX_WORDS = 12;
export const PENDING_MAX = 10;
export const LOG_MAX = 1000;
// how long an island card stays worth showing if he never opens the app
export const PENDING_TTL_MS = { now: 2 * 3600_000, next: 24 * 3600_000 };
// "is he in a voice session?" — a spoken turn this recent (turns.json)
export const VOICE_LIVE_MS = 10 * 60_000;
// the demotion bar (the produce-vs-keep correction applied to interruptions)
export const DEMOTE_MIN_RAISED = 6;
export const DEMOTE_MAX_RATIO = 0.2;
export const DEMOTE_DAYS = 14;
export const ACTED = ['tapped', 'dismissed', 'spoken-only'];

// The label vocabulary. Others are accepted if they fit the shape; these are
// the ones the sources use and the client knows a hue for.
export const LABELS = ['CALENDAR', 'HEALTH', 'RESEARCHER', 'WORKOUT', 'PLAN', 'MONEY', 'SYSTEM', 'NOVA'];

// Where the source is the label's own domain, saying it aloud is noise.
const OBVIOUS_SOURCE = {
  CALENDAR: /calendar/i,
  HEALTH: /health/i,
  RESEARCHER: /researcher/i,
  WORKOUT: /pocket|workout/i,
  MONEY: /cfo|money|ledger/i,
  PLAN: /plan/i,
  SYSTEM: /system/i,
};

/* ----------------------------------------------------------------- shape -- */

const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Cut at a word, never mid-word; an ellipsis says something was cut.
export function clip(s, max) {
  const t = flat(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[,.;:—–-]+$/, '')}…`;
}

export function normLabel(label) {
  return String(label || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX).trim();
}

// ONE sentence: anything after the first full stop is a second thought.
function oneSentence(s) {
  const t = flat(s);
  const m = t.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : t).replace(/[.]+$/, '');
}

const SAFE_OPEN = /^#\/([a-z-]{1,24})(?:\?[A-Za-z0-9=&_.:-]{0,80})?$/;
export function safeOpen(open) {
  const m = SAFE_OPEN.exec(String(open || ''));
  return !!(m && SCREEN_KEYS.includes(m[1]));
}

// The one action. A verb must be one the registry knows (checked against
// verbs.js VERB_IDS by the caller-facing raiseAlert); an `open` must be one
// of Nova's own screens. Anything else is dropped, never guessed into shape.
export function normAction(action, verbIds = null) {
  if (!action || typeof action !== 'object') return null;
  const label = clip(action.label || '', ACTION_LABEL_MAX);
  if (!label) return null;
  if (action.open) return safeOpen(action.open) ? { label, open: action.open } : null;
  if (action.verb) {
    const verb = String(action.verb);
    if (verbIds && !verbIds.includes(verb)) return null;
    const args = action.args && typeof action.args === 'object' && !Array.isArray(action.args) ? action.args : {};
    return { label, verb, args };
  }
  return null;
}

/** The anatomy, bounded. Throws on what cannot be an alert at all. */
export function normalizeAlert(input = {}, { verbIds = null } = {}) {
  const tier = TIERS.includes(input.tier) ? input.tier : null;
  if (!tier) throw new Error(`alert tier must be one of ${TIERS.join(', ')}`);
  const label = normLabel(input.label);
  if (!label) throw new Error('alert needs a label');
  const what = clip(oneSentence(input.what), WHAT_MAX);
  if (!what) throw new Error('alert needs a what');
  const kind = String(input.kind || label.toLowerCase()).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'alert';
  return {
    tier,
    label,
    what,
    where: clip(input.where || '', WHERE_MAX),
    source: clip(input.source || '', SOURCE_MAX),
    action: normAction(input.action, verbIds),
    kind,
    dedupeKey: input.dedupeKey ? String(input.dedupeKey).slice(0, 120) : null,
  };
}

/* ---------------------------------------------------------------- spoken -- */

const words = (s) => flat(s).split(' ').filter(Boolean);
const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// a path, a hash route or a record id is for the card, never for his ears
const speakable = (where) => !!where && !/[/#]/.test(where) && !/^[a-z0-9-]{6,}$/i.test(where);

export function sourceObvious(label, source) {
  if (!source) return true;
  const re = OBVIOUS_SOURCE[label];
  return !!(re && re.test(source));
}

/**
 * The line he hears, code-written, ≤12 words: "{What}. {Where}." with the
 * source only when it is not obvious from the label. Too long: the source
 * goes first, then the where, then the what is cut at a word.
 */
export function spokenAlert(alert) {
  const what = flat(alert?.what).replace(/[.!?…]+$/, '');
  if (!what) return '';
  const where = speakable(alert?.where) ? flat(alert.where).replace(/[.!?]+$/, '') : '';
  const source = !sourceObvious(alert?.label, alert?.source) ? flat(alert.source).replace(/[.!?]+$/, '') : '';
  const compose = (parts) => parts.filter(Boolean).map((p) => `${cap1(p)}.`).join(' ');
  for (const parts of [[what, where, source], [what, where], [what]]) {
    const line = compose(parts);
    if (words(line).length <= SPOKEN_MAX_WORDS) return line;
  }
  return `${words(what).slice(0, SPOKEN_MAX_WORDS).join(' ').replace(/[,;:—–-]+$/, '')}.`;
}

/** The sentence that opens his next spoken turn, for a tier-next alert. */
export function firstThingLine(alert) {
  const what = flat(alert?.what).replace(/[.!?…]+$/, '');
  if (!what) return '';
  return `One thing first: ${words(what).slice(0, SPOKEN_MAX_WORDS).join(' ').replace(/[,;:—–-]+$/, '')}.`;
}

/* ----------------------------------------------------------- by place -- */

// WHERE HE IS (src/where.js, design/EVIE-STUDY.md §4E): the interruptions
// allowed switch with the place, and nothing else does.
//   gym      only tier now speaks and drops; tier next waits until he is
//            out of the gym (no card, no "One thing first")
//   driving  tier now is SPOKEN ONLY (no card: nothing to look at); tier
//            next waits
//   desk, phone, unknown   as before: now and next both drop and may speak
// `speak` / `card` are the tiers that may; `waits` are held, untouched, for
// a later sync from somewhere else. Tier later is the Inbox and never here.
const BY_PLACE = {
  gym: { speak: ['now'], card: ['now'], waits: ['next'] },
  driving: { speak: ['now'], card: [], waits: ['next'] },
  default: { speak: ['now', 'next'], card: ['now', 'next'], waits: [] },
};
export function allowedTiers(place) {
  const p = BY_PLACE[place] || BY_PLACE.default;
  return { speak: [...p.speak], card: [...p.card], waits: [...p.waits] };
}

/** One pending alert, marked for the place: { ...alert, showCard, speak, waits }. */
export function forPlace(alert, place) {
  const t = allowedTiers(place);
  return { ...alert, showCard: t.card.includes(alert.tier), speak: t.speak.includes(alert.tier), waits: t.waits.includes(alert.tier) };
}

/* ----------------------------------------------------------------- files -- */

let chain = Promise.resolve();
const locked = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

async function atomicWrite(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text, 'utf8');
  await rename(tmp, file);
}

export function readLog() {
  try {
    if (!existsSync(LOG_PATH())) return [];
    return readFileSync(LOG_PATH(), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch {
    return [];
  }
}
const writeLog = (rows) => atomicWrite(LOG_PATH(), rows.slice(-LOG_MAX).map((r) => JSON.stringify(r)).join('\n') + '\n');

function readPendingRaw() {
  try {
    if (!existsSync(PENDING_PATH())) return [];
    const raw = JSON.parse(readFileSync(PENDING_PATH(), 'utf8'));
    return Array.isArray(raw?.alerts) ? raw.alerts : [];
  } catch {
    return [];
  }
}
const writePending = (alerts) => atomicWrite(PENDING_PATH(), JSON.stringify({ alerts: alerts.slice(-PENDING_MAX) }, null, 2));

/** The island's list: unexpired, newest last, at most 10. */
export function pendingAlerts(now = Date.now()) {
  const t = typeof now === 'number' ? now : new Date(now).getTime();
  return readPendingRaw().filter((a) => !a.expiresAt || Date.parse(a.expiresAt) > t).slice(-PENDING_MAX);
}

/** His standing demotions: { kind: tier }. */
export function tierOverrides() {
  try {
    if (!existsSync(TIERS_PATH())) return {};
    const raw = JSON.parse(readFileSync(TIERS_PATH(), 'utf8'));
    return raw && typeof raw.tiers === 'object' && raw.tiers ? raw.tiers : {};
  } catch {
    return {};
  }
}

/** Set (or clear, with null) a kind's tier. Returns the prior value. */
export async function setTierOverride(kind, tier) {
  if (tier !== null && !TIERS.includes(tier)) throw new Error(`tier must be one of ${TIERS.join(', ')}`);
  return locked(async () => {
    const tiers = { ...tierOverrides() };
    const prior = tiers[kind] ?? null;
    if (tier === null) delete tiers[kind]; else tiers[kind] = tier;
    await atomicWrite(TIERS_PATH(), JSON.stringify({ tiers, updatedAt: new Date().toISOString() }, null, 2));
    return prior;
  });
}

// An override only ever LOWERS a tier: a demotion he approved cannot be read
// as licence to promote something past where its source put it.
export function effectiveTier(tier, kind, overrides = tierOverrides()) {
  const o = overrides[kind];
  if (!o || !TIERS.includes(o)) return tier;
  return TIERS.indexOf(o) > TIERS.indexOf(tier) ? o : tier;
}

export function hasDedupe(key) {
  if (!key) return false;
  return readLog().some((r) => r.dedupeKey === key);
}

/* ------------------------------------------------------------- live voice -- */

/** Is he in a voice session? The latest spoken turn receipt is recent. */
export async function voiceLive(now = Date.now()) {
  try {
    const { readTurns } = await import('./voiceTurns.js');
    const turns = readTurns();
    const last = [...turns].reverse().find((t) => ['voice', 'ask', 'presence', 'barge'].includes(t.surface));
    return !!(last && now - Date.parse(last.at) <= VOICE_LIVE_MS);
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- raise -- */

let deps = null;
/** Tests only: replace push / inbox / broadcast. null restores the real ones. */
export function _setAlertDepsForTests(d) { deps = d || null; }

async function realDeps() {
  return {
    push: async (note) => (await import('./push.js')).sendPush(note),
    createRecord: async (r) => (await import('./inboxStore.js')).createRecord(r),
    getRecord: async (id) => (await import('./inboxStore.js')).getRecord(id),
    gate: async (o) => (await import('./standby.js')).gateProactive(o),
    broadcast: async (kind) => (await import('./events.js')).broadcast(kind),
    verbIds: async () => (await import('./verbs.js')).VERB_IDS,
  };
}

/**
 * Raise one alert. Returns { id, tier, deduped?, pushed?, pending?, recordId? }.
 *
 *   raiseAlert({ tier, label, what, where, source, action, kind, dedupeKey,
 *                at, urgent, push: { title, body, url, tag }, recordId })
 *
 * `push` overrides the notification's own words (the pocket keeps its exact
 * lock-screen text); `recordId` on a tier-later alert names the Inbox record
 * that already says this, so nothing is filed twice.
 */
export async function raiseAlert(input = {}) {
  const d = { ...(await realDeps()), ...(deps || {}) };
  let verbIds = null;
  if (input.action?.verb) { try { verbIds = await d.verbIds(); } catch { verbIds = []; } }
  const a = normalizeAlert(input, { verbIds });
  const atMs = input.at ? new Date(input.at).getTime() : Date.now();
  const at = new Date(atMs).toISOString();

  // the same alert twice is one alert (a calendar event, a day's HRV, a workout)
  if (a.dedupeKey && hasDedupe(a.dedupeKey)) return { deduped: true, tier: a.tier };

  const tier = effectiveTier(a.tier, a.kind);
  const id = randomUUID().slice(0, 8);
  const alert = { id, at, ...a, tier, ...(tier !== a.tier ? { raisedAs: a.tier } : {}) };
  const out = { id, tier };

  // STANDBY: tier now passes (urgent-equivalent); next and later are held in
  // the standby queue exactly as any proactive line is, so "Back. Two things
  // landed while you were out." counts them.
  let held = false;
  try {
    held = !(await d.gate({ kind: 'alert', text: `${a.label}: ${a.what}`, urgent: tier === 'now' || !!input.urgent, now: new Date(atMs) }));
  } catch { /* an unreadable standby is no standby */ }
  if (held) out.standby = true;

  if (tier === 'later') {
    // the Inbox already has it (plan today): a receipt, never a second card
    let existing = null;
    if (input.recordId) { try { existing = await d.getRecord(input.recordId); } catch { existing = null; } }
    if (existing) {
      out.recordId = existing.id;
      out.existing = true;
    } else {
      const rec = await d.createRecord({
        id: randomUUID().slice(0, 8),
        kind: 'alert',
        text: a.what,
        source: 'alert',
        mode: 'review-all',
        status: 'pending',
        createdAt: at,
        alertId: id,
        alert: { label: a.label, what: a.what, where: a.where, source: a.source, action: a.action, kind: a.kind },
      });
      out.recordId = rec?.id || null;
    }
  } else {
    const ttl = PENDING_TTL_MS[tier];
    const entry = { ...alert, expiresAt: new Date(atMs + ttl).toISOString(), spokenAt: null };
    await locked(async () => {
      const list = readPendingRaw().filter((x) => !x.expiresAt || Date.parse(x.expiresAt) > atMs);
      list.push(entry);
      await writePending(list);
    });
    out.pending = true;
    if (tier === 'now') {
      const note = {
        title: input.push?.title || `${a.label} — Nova`,
        body: input.push?.body || [a.what, a.where].filter(Boolean).join(' · '),
        tag: input.push?.tag || `alert-${a.dedupeKey ? a.dedupeKey.replace(/[^a-z0-9-]/gi, '').slice(0, 30) : id}`,
        url: input.push?.url || (a.action?.open ? `./${a.action.open}` : './#/inbox'),
        tier: 'now',
        urgent: !!input.urgent,
      };
      try {
        const r = await d.push(note);
        out.pushed = r || { sent: 0 };
      } catch (e) {
        out.pushed = { sent: 0, error: e.message };
      }
    }
    try { await d.broadcast('alerts'); } catch { /* the next sync carries it */ }
  }

  await locked(async () => {
    const rows = readLog();
    rows.push({ id, at, tier, label: a.label, kind: a.kind, ...(a.dedupeKey ? { dedupeKey: a.dedupeKey } : {}), ...(out.recordId ? { recordId: out.recordId } : {}), ...(held ? { standby: true } : {}), acted: null, ms: null });
    await writeLog(rows);
  });
  return out;
}

/**
 * He acted on it: 'tapped' (the action), 'dismissed', or 'spoken-only'
 * (heard it, did nothing on the card). A tap or a dismiss closes the card;
 * spoken-only marks it said, so it is never said twice, and leaves the card.
 * A later tap or dismiss overrides spoken-only, never the other way round.
 */
export async function markActed(id, how, { now = Date.now() } = {}) {
  if (!ACTED.includes(how)) throw new Error(`acted must be one of ${ACTED.join(', ')}`);
  return locked(async () => {
    const rows = readLog();
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    // the first real answer stands; spoken-only is only ever overwritten
    if (!row.acted || (row.acted === 'spoken-only' && how !== 'spoken-only')) {
      row.acted = how;
      row.ms = Math.max(0, Math.round(now - Date.parse(row.at)));
    }
    await writeLog(rows);
    const list = readPendingRaw();
    const next = how === 'spoken-only'
      ? list.map((x) => (x.id === id ? { ...x, spokenAt: new Date(now).toISOString() } : x))
      : list.filter((x) => x.id !== id);
    if (JSON.stringify(next) !== JSON.stringify(list)) await writePending(next);
    try { const b = deps?.broadcast || (async (k) => (await import('./events.js')).broadcast(k)); await b('alerts'); } catch { /* fine */ }
    return row;
  });
}

/* ----------------------------------------------------------------- stats -- */

/** Per kind over the last `days`: { raised, acted, ratio, tier }. */
export function alertStats(days = DEMOTE_DAYS, { now = Date.now(), rows = readLog() } = {}) {
  const cut = now - days * 86400_000;
  const out = {};
  for (const r of rows) {
    if (!(Date.parse(r.at) >= cut)) continue;
    const k = out[r.kind] || (out[r.kind] = { raised: 0, acted: 0, ratio: 0, tier: r.tier });
    k.raised += 1;
    if (r.acted === 'tapped') k.acted += 1;
    k.tier = r.tier; // the latest tier this kind went out at
  }
  for (const k of Object.values(out)) k.ratio = k.raised ? +(k.acted / k.raised).toFixed(3) : 0;
  return out;
}

const DEMOTE_TO = { now: 'next', next: 'later' };

/** The kinds that have not earned their tier: [{ kind, from, to, raised, acted, ratio }]. */
export function demotionCandidates(stats) {
  return Object.entries(stats || {})
    .filter(([, s]) => s.raised >= DEMOTE_MIN_RAISED && s.ratio < DEMOTE_MAX_RATIO && DEMOTE_TO[s.tier])
    .map(([kind, s]) => ({ kind, from: s.tier, to: DEMOTE_TO[s.tier], raised: s.raised, acted: s.acted, ratio: s.ratio }));
}

/** The Inbox card a demotion becomes (a pattern-scout proposal on the rails). */
export function demotionRecord(c, { now = new Date() } = {}) {
  const why = `${c.raised} ${c.kind} alerts in ${DEMOTE_DAYS} days, ${c.acted} acted on (${Math.round(c.ratio * 100)}%).`;
  return {
    id: randomUUID().slice(0, 8),
    kind: 'pattern',
    text: why,
    source: 'scout',
    mode: 'review-all',
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    decision: {
      route: 'alert-tier',
      confidence: 'high',
      title: `Quieter: ${c.kind} alerts ${c.from} → ${c.to}`,
      reason: why,
      payload: { kind: c.kind, from: c.from, to: c.to },
    },
  };
}

/**
 * The scout's weekly alert input: file each candidate as a pending proposal,
 * unless that kind already has one in the last 30 days (pending, filed or
 * declined: his no is respected, and a yes already moved it).
 */
export async function proposeAlertDemotions({ now = Date.now(), listRecords, createRecord } = {}) {
  const store = (listRecords && createRecord) ? null : await import('./inboxStore.js');
  const list = listRecords || store.listRecords;
  const create = createRecord || store.createRecord;
  const candidates = demotionCandidates(alertStats(DEMOTE_DAYS, { now }));
  if (!candidates.length) return { proposed: [] };
  const records = await list();
  const cut = now - 30 * 86400_000;
  const proposed = [];
  for (const c of candidates) {
    const seen = records.some((r) => r.decision?.route === 'alert-tier' && r.decision?.payload?.kind === c.kind && Date.parse(r.createdAt) >= cut);
    if (seen) continue;
    const rec = demotionRecord(c, { now: new Date(now) });
    await create(rec);
    proposed.push(rec);
  }
  return { proposed };
}

/* --------------------------------------------------------------- sources -- */

// The pocket's one notification (lib/pocket.js keeps the one-per-workout
// promise; the key makes it one alert too). Its lock-screen words are kept
// exactly; the card reads "Push day in progress · 3 of 18 sets".
export function pocketAlert(note = {}) {
  const open = String(note.url || './#/workouts').replace(/^\.\//, '');
  return {
    tier: 'now', label: 'WORKOUT', kind: 'pocket',
    what: note.title || 'Your workout is still open',
    where: String(note.body || '').split(/[.·]/)[0],
    source: 'from the pocket',
    action: { label: 'Back to it', open: safeOpen(open) ? open : '#/workouts' },
    dedupeKey: note.key ? `pocket:${note.key}` : null,
    push: { title: note.title, body: note.body, url: note.url, tag: note.tag },
  };
}

// A calendar event about to start: within 10 minutes, timed (an all-day
// event never "starts"), once per event start.
export const CALENDAR_SOON_MIN = 10;
export function eventsStartingSoon(events = [], now = Date.now(), withinMin = CALENDAR_SOON_MIN) {
  return (events || []).filter((e) => {
    if (!e?.time || !e.startISO) return false;
    const t = Date.parse(e.startISO);
    return Number.isFinite(t) && t > now && t - now <= withinMin * 60_000;
  });
}

// "3:40": his clock, no am/pm (standby.clockLine's rule: he knows which half he is in)
const clock12 = (d) => `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')}`;
export function calendarAlert(e, now = Date.now()) {
  const mins = Math.max(1, Math.round((Date.parse(e.startISO) - now) / 60_000));
  return {
    tier: 'now', label: 'CALENDAR', kind: 'calendar-soon',
    what: `${clip(e.label || 'Your next event', 60)} starts soon`,
    where: `in ${mins} minute${mins === 1 ? '' : 's'}, at ${clock12(new Date(Date.parse(e.startISO)))}`,
    source: 'from your calendar',
    action: { label: 'See today', open: '#/mission' },
    dedupeKey: `cal:${e.id || e.label}:${e.startISO}`,
  };
}

export async function calendarSoonCheck(events, { now = Date.now() } = {}) {
  const out = [];
  for (const e of eventsStartingSoon(events, now)) {
    const a = calendarAlert(e, now);
    if (hasDedupe(a.dedupeKey)) continue;
    out.push(await raiseAlert(a));
  }
  return out;
}

// A Researcher brief landing. Tier now only if he is in a voice session as it
// lands; otherwise it waits for his next turn. The brief's own record is the
// action ("open the inbox record").
export function researcherAlert({ recordId, title, live }) {
  return {
    tier: live ? 'now' : 'next', label: 'RESEARCHER', kind: 'research-landed',
    what: `Your brief is back${title ? `: ${clip(title, 60)}` : ''}`,
    where: 'in your Inbox', source: 'from the Researcher',
    action: { label: 'Read it', open: `#/inbox?open=${encodeURIComponent(recordId)}` },
    dedupeKey: `research:${recordId}`,
    // the brief's record already pushed as "Research brief"; the same tag
    // makes this one replace it on the lock screen instead of stacking
    push: { tag: `record-${recordId}` },
  };
}

// Last night's health push did not land (lib/healthSentinel.js).
export function missedPushAlert(yday) {
  return {
    tier: 'next', label: 'HEALTH', kind: 'health-missed-push',
    what: "Last night's health push didn't land",
    // the fix lives in Shortcuts (the 00:05 automation); the day is the key
    where: 'fix in Shortcuts', source: 'from Apple Health',
    action: { label: 'Settings', open: '#/settings' },
    dedupeKey: `sentinel:${yday}`,
  };
}

/* ------------------------------------------------------------- scheduler -- */

// The two daily server-side checks that are alerts by nature: an HRV drop
// past the existing deload threshold (coach.computeDeloadSignal, 10%), and a
// configured connection reporting a fault at the morning systems check.
// Both tier next: neither needs waking him; both belong in the first thing
// he hears. Once per local day each (the dedupe key carries the date).
export const MORNING_HOUR = 7;
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function hrvAlertCheck({ now = new Date(), loadDays } = {}) {
  const day = localDay(now);
  const key = `hrv:${day}`;
  if (now.getHours() < MORNING_HOUR || hasDedupe(key)) return null;
  const days = await (loadDays ? loadDays(14) : (await import('./healthData.js')).loadRecentDays(14));
  const { computeDeloadSignal } = await import('./coach.js');
  const sig = computeDeloadSignal(days, { now });
  if (sig?.signal !== 'hrv') return null;
  return raiseAlert({
    tier: 'next', label: 'HEALTH', kind: 'health-hrv', dedupeKey: key,
    what: `HRV is down ${Math.round(sig.drop * 100)}% on your baseline`,
    where: 'over the last 3 days', source: 'from Apple Health',
    action: { label: 'Readiness', open: '#/workouts' },
  });
}

export async function systemsAlertCheck({ now = new Date(), checkAll, env = process.env } = {}) {
  const day = localDay(now);
  const key = `roster:${day}`;
  if (now.getHours() < MORNING_HOUR || hasDedupe(key)) return null;
  const roster = await import('./roster.js');
  const all = await (checkAll || roster.checkAll)();
  // a FAULT is something set up that is now off — never a thing he never connected
  const faults = all.filter((x) => x.state === 'off' && roster.ROSTER.find((r) => r.id === x.id)?.configured(env));
  if (!faults.length) return null;
  const names = faults.map((x) => x.label.replace(/^your\s+/i, ''));
  const what = faults.length === 1 ? `${cap1(names[0])} is off` : `${faults.length} connections are off: ${names.join(', ')}`;
  return raiseAlert({
    tier: 'next', label: 'SYSTEM', kind: 'system-fault', dedupeKey: key,
    what, where: 'this morning', source: 'from the systems check',
    action: { label: 'Check', verb: 'check.systems', args: {} },
  });
}

export function startAlertsScheduler() {
  const tick = async () => {
    try { const { beat } = await import('./heartbeat.js'); beat('alerts'); } catch { /* optional */ }
    try { await hrvAlertCheck(); } catch (e) { console.log(`alerts: hrv check failed: ${e.message}`); }
    try { await systemsAlertCheck(); } catch (e) { console.log(`alerts: systems check failed: ${e.message}`); }
  };
  tick();
  const iv = setInterval(tick, 30 * 60_000);
  iv.unref?.();
  return () => clearInterval(iv);
}
