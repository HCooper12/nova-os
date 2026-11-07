// WHAT NOVA BELIEVES (his approved mockup, Beliefs.dc.html, 7 Nov 2026).
//
// The single page where he sees what his agents act on right now and can say
// "still true" or "not true any more" with one tap. It is a READ of the real
// contexts, never a copy: every row below is a line some agent is handed in
// its prompt, found by the same reader that builds that prompt (injuryLog,
// coachKnowledge's What Works page, standing, learning, the Intake, the
// Profile). A row therefore cannot disagree with what the agents are told.
//
// Two verbs, both his:
//   tick   stamps a confirmed date in this file's own state (it resets the
//          age clock below); it changes nothing an agent reads.
//   cross  makes the line stop being acted on, through that source's own
//          writer: an injury is closed (or a closed one reopened), a What
//          Works line is struck to the page's Struck section (history kept,
//          agents stop reading it), a standing rule is lifted out. A derived
//          figure (a learned tendency, the Intake targets, a Profile part)
//          never takes a cross; its row links to the editor that owns it.
//          Every cross rides the inbox rails as the `belief.drop` verb with
//          an undo, and is said back in one line.
//
// "Worth checking" is decided by code from a table of ages by KIND OF THING,
// not one number, because a session habit goes stale in weeks while a
// lasting fact never does (KIND_TABLE). A line that names a retired thing, or
// an injury he has closed, is worth checking at once, whatever its age.

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localDateISO } from './localDate.js';
import { closedConcerns } from './injuryLog.js';
import { isStaleConcern, closedAsOf } from './concernClose.js';

const DAY = 86400000;

/* ----------------------------------------------------------- the age table */

// Days a belief may go unchecked before it is worth a look. `null` = never.
// The reasons are the point: each age is a claim about how fast that kind of
// thing changes, and he can read why.
export const KIND_TABLE = {
  'session-pattern': { days: 14, label: 'how you train', why: 'a training habit changes within a couple of weeks' },
  'fuel-pattern': { days: 14, label: 'how you eat', why: 'an eating pattern shifts with the week' },
  injury: { days: 14, label: 'an injury', why: 'a niggle either settles or worsens within two weeks' },
  'temporary-state': { days: 14, label: 'a temporary state', why: 'it was said to hold for a while, and a while is short' },
  decision: { days: 60, label: 'a decision', why: 'a decision holds until something changes your mind, so it is asked about rarely' },
  'standing-rule': { days: 60, label: 'a standing rule', why: 'a rule you set holds for months' },
  'lasting-fact': { days: null, label: 'a lasting fact', why: 'facts about you do not go stale on a clock' },
  derived: { days: null, label: 'worked out by code', why: 'code recomputes it from your data every time' },
};

// A line that says it is for a limited time is a deliberate temporary state
// whatever page it sits on.
const TEMPORARY = /\b(?:for now|at the moment|right now|currently|this (?:week|block|month|phase)|until|temporar\w*|for the next|re-?baselin\w*|while (?:i|you|he) (?:am|are|is)|during (?:the|this) (?:cut|bulk|deload|block))\b/i;

// Things he has retired. A line that names one and is not itself the record
// of the retirement is worth checking at once. Extend here, in one place.
export const RETIRED_THINGS = [
  { re: /\bpush[ ,/-]+pull[ ,/-]+legs\b|\bPPL\b/i, name: 'the Push, Pull, Legs split', since: null },
];
const RETIREMENT_RECORD = /\b(?:replac\w*|retir\w*|dropped|instead of|no longer|stopped|moved (?:off|away)|switched (?:from|away))\b/i;

/* --------------------------------------------------------------- the state */

const dataDir = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const STATE = () => path.join(dataDir(), 'beliefs-state.json');

async function readState() {
  try {
    const s = JSON.parse(await readFile(STATE(), 'utf8'));
    return { confirmed: s.confirmed && typeof s.confirmed === 'object' ? s.confirmed : {}, homeQuietUntil: s.homeQuietUntil || null };
  } catch { return { confirmed: {}, homeQuietUntil: null }; }
}
async function writeState(state) {
  await mkdir(dataDir(), { recursive: true });
  const tmp = `${STATE()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, STATE());
}

// serialised: a tick and a Home dismissal can land together
let chain = Promise.resolve();
const locked = (fn) => { const next = chain.then(fn, fn); chain = next.catch(() => {}); return next; };

/** The stable id of a belief: its source and its line, hashed. */
export function beliefId(source, line) {
  return createHash('sha1').update(`${source}\u0000${String(line).replace(/\s+/g, ' ').trim()}`).digest('hex').slice(0, 12);
}

/* ------------------------------------------------------------ date helpers */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : null;
}
const dayMs = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : null;
};
const daysBetween = (fromISO, now) => {
  const t = dayMs(fromISO);
  return t == null ? null : Math.max(0, Math.round((now.getTime() - t) / DAY));
};
const clip = (s, n = 140) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t; };

/* ----------------------------------------------------------- the readers */

const WORKS_SECTIONS = [
  { heading: /^responds to/i, area: 'training', kind: 'session-pattern' },
  { heading: /^avoid/i, area: 'training', kind: 'session-pattern' },
  { heading: /^nutrition/i, area: 'fuel', kind: 'fuel-pattern' },
  { heading: /^decisions/i, area: 'training', kind: 'decision' },
];

/** The What Works page as lines: { heading, line, date, text }. Struck ones skipped. */
export function parseWorks(raw) {
  const out = [];
  let section = null;
  let struck = false;
  for (const l of String(raw || '').split('\n')) {
    const h = l.match(/^##\s+(.*)$/);
    if (h) {
      struck = /^struck/i.test(h[1].trim());
      section = struck ? null : WORKS_SECTIONS.find((s) => s.heading.test(h[1].trim())) || null;
      out.push({ heading: h[1].trim(), section, struck, line: null });
      continue;
    }
    const m = l.match(/^- (?:(\d{4}-\d{2}-\d{2})\s+[—–-]\s+)?(.+?)\s*$/);
    if (m && section && !struck) out.push({ heading: null, section, line: l, date: m[1] || null, text: m[2] });
  }
  return out.filter((x) => x.line);
}

function judgeAge(kind, since, confirmed, now) {
  const rule = KIND_TABLE[kind];
  if (!rule || rule.days == null) return { age: null, due: false };
  const from = [since, confirmed].filter(Boolean).sort().pop();
  const age = daysBetween(from, now);
  return { age, due: age != null && age >= rule.days };
}

function immediateReason(text, closedFor, since, confirmed) {
  if (!RETIREMENT_RECORD.test(text)) {
    for (const r of RETIRED_THINGS) {
      if (r.re.test(text) && !(confirmed && (!r.since || confirmed >= r.since))) return `names ${r.name}, which you retired`;
    }
  }
  if (closedFor?.length) {
    const hit = closedFor.find((c) => isStaleConcern(text, closedAsOf([c], since)) && !(confirmed && confirmed >= c.resolvedAt));
    if (hit) return `names your ${hit.area}, which you closed on ${shortDate(hit.resolvedAt)}`;
  }
  return null;
}

/* --------------------------------------------------------- the collection */

const AREAS = [
  { key: 'training', title: 'Body and training', hue: 'var(--nv-cy)' },
  { key: 'fuel', title: 'Fuel', hue: 'var(--nv-good)' },
  { key: 'rules', title: 'How you want Nova to work', hue: 'var(--nv-vi)' },
  { key: 'you', title: 'About you', hue: 'var(--nv-mg)' },
];
const CHECK_HUE = 'var(--nv-gold)';

async function safe(fn, fallback) { try { return await fn(); } catch { return fallback; } }

/** Every belief, unsorted, before the clock is applied. */
async function gather(vaultPath) {
  const items = [];
  const push = (b) => items.push({ editor: null, strikeable: false, ...b, id: beliefId(b.source, b.key) });

  // 1. Injury Log, active and resolved (the same file the Coach reads)
  const { listInjuries } = await import('./injuryLog.js');
  const injuries = await safe(() => listInjuries(vaultPath), []);
  const active = injuries.filter((i) => !i.resolvedAt);
  for (const i of active) {
    push({
      source: 'injury', key: `active:${i.id}`, area: 'training', kind: 'injury', since: i.startedAt, strikeable: true, strikeKind: 'close',
      text: `${i.area}${i.severity ? ` (${i.severity})` : ''}${i.note ? `: ${clip(i.note, 110)}` : ''}`, who: 'Injury Log', whenWord: 'since', ref: { injuryId: i.id },
    });
  }
  const lastClosed = injuries.filter((i) => i.resolvedAt).map((i) => i.resolvedAt).sort().pop() || null;
  if (!active.length) {
    push({ source: 'injury', key: 'none-active', area: 'training', kind: 'injury', since: lastClosed, text: 'No active injuries', who: 'Injury Log', whenWord: lastClosed ? 'last closed' : null });
  }
  const closed = await safe(() => closedConcerns(vaultPath), []);
  for (const c of closed) {
    const ids = injuries.filter((i) => i.resolvedAt && i.area === c.area).map((i) => i.id);
    push({
      source: 'injury', key: `closed:${c.area}`, area: 'training', kind: 'injury', since: c.resolvedAt, strikeable: true, strikeKind: 'reopen',
      text: `${c.area} is over`, who: 'Injury Log', whenWord: 'you closed it', ref: { injuryIds: ids, area: c.area },
    });
  }

  // 2. What Works For Hayden: patterns and the decisions log
  const { PLAYBOOK_REL } = await import('./coachKnowledge.js');
  const works = parseWorks(await safe(() => readFile(path.join(vaultPath, PLAYBOOK_REL), 'utf8'), ''));
  for (const w of works) {
    const kind = TEMPORARY.test(w.text) && w.section.kind !== 'decision' ? 'temporary-state' : w.section.kind;
    push({
      source: 'works', key: w.line, area: w.section.area, kind, since: w.date, strikeable: true, text: clip(w.text, 150), who: 'Coach', whenWord: null,
      ref: { line: w.line },
    });
  }

  // 3. Standing Instructions
  const { loadStanding } = await import('./standing.js');
  for (const r of await safe(() => loadStanding(vaultPath), [])) {
    push({
      source: 'standing', key: r.raw, area: 'rules', kind: TEMPORARY.test(r.rule) ? 'temporary-state' : 'standing-rule', since: r.added, strikeable: true,
      text: clip(r.rule, 150), who: 'You', whenWord: null, ref: { raw: r.raw },
    });
  }

  // 4. What he tends to do, learned from his decisions (derived)
  const { computePreferences } = await import('./learning.js');
  const prefs = await safe(() => computePreferences(vaultPath), { noticed: [] });
  for (const n of prefs.noticed || []) {
    push({ source: 'learned', key: n.replace(/\d+/g, '#'), area: 'rules', kind: 'derived', text: clip(n.replace(/\.$/, ''), 150), who: 'Learned from what you kept and dismissed', whenWord: null, editor: 'ladder' });
  }

  // 5. Intake targets and goal, and 6. Profile facts (derived / his words)
  const { getProfile } = await import('./profile.js');
  const profile = await safe(() => getProfile(vaultPath), null);
  const plan = profile?.intake?.plan;
  if (plan) {
    const goal = profile.intake.facts?.goal;
    push({
      source: 'intake', key: 'targets', area: 'fuel', kind: 'derived', since: profile.intake.on || null,
      text: `Targets of ${plan.targetKcal} kcal and ${plan.proteinG} g protein a day${goal ? `, to ${goal === 'maintain' ? 'maintain' : goal}` : ''}`,
      who: 'Intake', whenWord: null, editor: 'numbers',
    });
  }
  for (const s of profile?.sections || []) {
    if (!s.text) continue;
    push({
      source: 'profile', key: `${s.key}:${s.text}`, area: 'you', kind: 'lasting-fact', since: s.draftedOn || null,
      text: clip(String(s.text).split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '').replace(/\s*\(said \d{4}-\d{2}-\d{2}\)\s*$/, '').trim()).filter(Boolean).join(' '), 150),
      who: `Profile, ${s.title}${s.drafted ? ', a draft by Claude' : ''}`, whenWord: null, editor: 'profile',
    });
  }
  return { items, closed };
}

/** The page's view model. `now` is injectable for tests. */
export async function loadBeliefs(vaultPath, { now = new Date() } = {}) {
  const [{ items, closed }, state] = await Promise.all([gather(vaultPath), readState()]);
  const today = localDateISO(now);
  const checks = [];
  const rest = [];
  for (const b of items) {
    const confirmedAt = state.confirmed[b.id] || null;
    const imm = ['works', 'standing', 'profile'].includes(b.source) ? immediateReason(b.text, closed, b.since, confirmedAt) : null;
    const aged = imm ? { age: daysBetween(b.since, now), due: false } : judgeAge(b.kind, b.since, confirmedAt, now);
    const rule = KIND_TABLE[b.kind];
    const dateWord = b.since ? shortDate(b.since) : null;
    let from = [b.who, dateWord ? `${b.whenWord ? `${b.whenWord} ` : ''}${dateWord}` : null].filter(Boolean).join(', ');
    let reason = null;
    if (imm) reason = imm;
    else if (aged.due) reason = `${aged.age} days old. ${rule.why[0].toUpperCase()}${rule.why.slice(1)}.`;
    const row = {
      id: b.id, text: b.text, from, source: b.source, kind: b.kind, kindLabel: rule.label, area: b.area,
      confirmedAt, confirmedLabel: confirmedAt ? shortDate(confirmedAt) : null,
      canTick: true, canCross: b.strikeable, editor: b.editor,
      check: !!reason, reason: reason ? clip(reason, 160) : null,
      ageDays: aged.age,
    };
    if (reason) row.from = `${from}${aged.age != null && !imm ? ` · ${aged.age} days old` : ''}`;
    (reason ? checks : rest).push(row);
  }
  // oldest first: what has gone longest unchecked leads
  checks.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));
  const groups = [];
  if (checks.length) groups.push({ key: 'check', title: 'Worth checking', hue: CHECK_HUE, count: 'may be out of date', n: checks.length, items: checks });
  for (const a of AREAS) {
    const its = rest.filter((r) => r.area === a.key);
    if (its.length) groups.push({ key: a.key, title: a.title, hue: a.hue, count: String(its.length), n: its.length, items: its });
  }
  return { at: now.toISOString(), today, total: items.length, worthChecking: checks.length, groups, home: homeFor(checks, state, now) };
}

/* ------------------------------------------------------------- the Home card */

export const HOME_QUIET_DAYS = 7;

function homeFor(checks, state, now) {
  const quiet = state.homeQuietUntil && new Date(state.homeQuietUntil).getTime() > now.getTime();
  if (!checks.length || quiet) return { show: false, count: checks.length };
  const lead = checks[0];
  return {
    show: true, count: checks.length,
    line: checks.length === 1 ? 'One thing may be out of date.' : `${checks.length} things may be out of date.`,
    lead: { text: lead.text, from: lead.from, reason: lead.reason },
    more: checks.slice(1, 3).map((c) => c.text),
  };
}

/** The Home card's own read: cheap, and never throws. */
export async function beliefsHome(vaultPath, { now = new Date() } = {}) {
  try { return (await loadBeliefs(vaultPath, { now })).home; } catch { return { show: false, count: 0 }; }
}

/** Tapped or dismissed: quiet for seven days. */
export async function quietHome({ now = new Date() } = {}) {
  return locked(async () => {
    const state = await readState();
    state.homeQuietUntil = new Date(now.getTime() + HOME_QUIET_DAYS * DAY).toISOString();
    await writeState(state);
    return { quietUntil: state.homeQuietUntil };
  });
}

/* --------------------------------------------------------------- the actions */

/** A tick: still true. Stamps today; resets that belief's clock. */
export async function confirmBelief(vaultPath, id, { now = new Date() } = {}) {
  const { items } = await gather(vaultPath);
  if (!items.some((b) => b.id === id)) throw new Error('that belief is no longer on the page');
  return locked(async () => {
    const state = await readState();
    state.confirmed[id] = localDateISO(now);
    await writeState(state);
    return { id, confirmedAt: state.confirmed[id] };
  });
}

/** Undo of a tick: put the previous stamp (or none) back. */
export async function unconfirmBelief(id, prior = null) {
  return locked(async () => {
    const state = await readState();
    if (prior) state.confirmed[id] = prior; else delete state.confirmed[id];
    await writeState(state);
  });
}

/** A cross: the belief stops being acted on. Returns the rails' { destination, said, undo }. */
export async function dropBelief(vaultPath, id) {
  const { items } = await gather(vaultPath);
  const b = items.find((x) => x.id === id);
  if (!b) throw new Error('that belief is no longer on the page');
  if (!b.strikeable) throw new Error(b.editor ? 'that one is worked out from your data, so it cannot be crossed out. Change it where it is set.' : 'that one cannot be crossed out here');
  const { source } = b;
  if (source === 'injury' && b.strikeKind === 'close') {
    const { resolveInjuries } = await import('./injuryLog.js');
    const closed = await resolveInjuries(vaultPath, [b.ref.injuryId]);
    if (!closed.length) throw new Error('that injury is already closed');
    return { destination: `Injury Log, closed ${closed[0].area}`, said: `Closed ${closed[0].area} in your Injury Log, so Coach plans as if it is over. Undo puts it back.`, undo: { source, mode: 'close', ids: closed.map((c) => c.id), area: closed[0].area } };
  }
  if (source === 'injury' && b.strikeKind === 'reopen') {
    const { listInjuries, reopenInjuries } = await import('./injuryLog.js');
    const was = (await listInjuries(vaultPath)).filter((i) => b.ref.injuryIds.includes(i.id) && i.resolvedAt).map((i) => ({ id: i.id, resolvedAt: i.resolvedAt }));
    await reopenInjuries(vaultPath, was.map((w) => w.id));
    return { destination: `Injury Log, reopened ${b.ref.area}`, said: `Reopened ${b.ref.area} in your Injury Log, so Coach plans around it again. Undo closes it.`, undo: { source, mode: 'reopen', was, area: b.ref.area } };
  }
  if (source === 'works') {
    const { strikeLearning } = await import('./coachKnowledge.js');
    const r = await strikeLearning(vaultPath, b.ref.line);
    return { destination: 'What Works For Hayden, struck', said: 'Struck that from What Works, so Coach stops using it. The line stays on the page under Struck. Undo puts it back.', undo: { source, mode: 'works', struck: r.struck, original: r.original } };
  }
  if (source === 'standing') {
    const { removeStandingRule, STANDING_REL } = await import('./standing.js');
    const before = (await safe(() => readFile(path.join(vaultPath, STANDING_REL), 'utf8'), '')).split('\n');
    const at = before.indexOf(b.ref.raw);
    if (!(await removeStandingRule(vaultPath, b.ref.raw))) throw new Error('that rule is already gone');
    return { destination: 'Standing Instructions, lifted', said: 'Lifted that standing rule, so agents stop following it. Undo puts it back.', undo: { source, mode: 'standing', raw: b.ref.raw, at: at === -1 ? null : at, prev: before[at - 1] ?? null } };
  }
  throw new Error('that one cannot be crossed out here');
}

/** The undo of a cross, from the record's undoData. */
export async function undoDrop(vaultPath, u) {
  if (u.source === 'injury' && u.mode === 'close') {
    const { reopenInjuries } = await import('./injuryLog.js');
    await reopenInjuries(vaultPath, u.ids);
    return `${u.area} is open in your Injury Log again`;
  }
  if (u.source === 'injury' && u.mode === 'reopen') {
    const { setResolvedAt } = await import('./injuryLog.js');
    for (const w of u.was) await setResolvedAt(vaultPath, w.id, w.resolvedAt);
    return `${u.area} is closed in your Injury Log again`;
  }
  if (u.mode === 'works') {
    const { unstrikeLearning } = await import('./coachKnowledge.js');
    const r = await unstrikeLearning(vaultPath, u);
    return r.restored ? 'put that line back on What Works' : 'that line was already back';
  }
  if (u.mode === 'standing') {
    const { restoreStandingLine } = await import('./standing.js');
    await restoreStandingLine(vaultPath, u.raw, { at: u.at, prev: u.prev });
    return 'put that standing rule back';
  }
  throw new Error('nothing to undo for that belief');
}
