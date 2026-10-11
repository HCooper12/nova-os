// THE SKILL SETS (mockup 97, audit 28): every agent, what each can do, and
// the skills Nova suggests it should learn, each with the evidence that
// raised it.
//
// What each part is read from, and nothing else:
//   skills           the vault registry (skills.js, Wiki/Library/Nova Skills.md),
//                    assigned to an agent by OWNER_RULES below, then by department
//   not yet          the registry's Backlog lines that name the agent
//                    ("Coach: ..."), plus "be consulted" for an agent that is
//                    not on the consult rail (consult.js AGENTS)
//   runs             inbox records of the agent's kinds (orgMap.js KIND_BEING),
//                    counted per day for the last 14 days
//   suggestions      deriveSuggestions(): three signals that exist today
//
// THE SUGGESTION SIGNALS. Each is counted by code, never by a model:
//   asked   the conversation record (read only): a reply of Nova's that said
//           it could not do the thing, after a question of his whose words
//           name an agent's lane
//   hand    his own captures (records with no agent kind) filed to one route,
//           over and over: the thing he did himself that an agent could own
//   inbox   one agent's cards he declined in the Inbox, by kind
// A fourth, "another agent can lend it", has no matcher yet and is not
// faked (audit 28 says so).
//
// A TICK files the suggestion on the rails: an Inbox record (kind
// 'skill-suggest') whose decision is the existing 'skill-backlog' route, so
// it lands on the registry's Backlog (the build list) with an Undo. It never
// grants a skill: Backlog lines carry no autonomy tag, so parseSkills cannot
// read them as a capability. A CROSS retires the suggestion for 60 days
// (respectTheNo.js's cooldown), also with an Undo. Both answers are kept in
// server/data/skill-suggestions.json, never the vault.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEINGS, beingForRecord } from './orgMap.js';

const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const STATE_PATH = () => path.join(dataRoot(), 'skill-suggestions.json');

export const WINDOW_DAYS = 28;
export const DISMISS_DAYS = 60;
export const RUN_DAYS = 14;
const DAY = 86_400_000;

// Which agent owns a registry skill: a phrase rule first, then the
// department's head. A department with two or three beings (Knowledge, Mind)
// needs the rules; the others are one being each.
const OWNER_RULES = [
  [/rehears/i, 'practice'],
  [/\bresearch|citation|paper\b|panels? on screen|live panels|technique|clip\b/i, 'researcher'],
  [/\bvideo|transcript|watch a\b/i, 'watcher'],
  [/summari[sz]e|outline notes|file captures|library|concept|distill|read next/i, 'librarian'],
  [/meal|recipe|protein|shopping|rotation|log food/i, 'mealprep'],
];
const DEPT_HEAD = { Train: 'coach', Fuel: 'mealprep', Mind: 'leader', Money: 'cfo', Knowledge: 'researcher', Logistics: 'commander', Platform: 'guardian' };

export function ownerOf(text, dept) {
  for (const [re, id] of OWNER_RULES) if (re.test(text)) return id;
  return DEPT_HEAD[dept] || null;
}

// What a skill touches, read off its words. `inbox` is definitional for a
// propose skill (it drafts a pending record) and for act-on-approval (his yes
// rides the rails); the rest only when the words name the thing.
const TAG_RULES = [
  ['vault', /\bvault|notes?\b|journal|program|week plan|reflection|registry|instructions|library|log\b|sets\b/i],
  ['calendar', /calendar|reminder|dispatch|morning|evening/i],
  ['web', /research|citation|paper|clip|web|video/i],
  ['health', /health|sleep|protein/i],
  ['bank', /ledger|bank|charges|subscription/i],
  ['inbox', /\binbox\b/i],
];
export function tagsOf(text, autonomy) {
  const tags = TAG_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
  if (autonomy !== 'observe' && !tags.includes('inbox')) tags.push('inbox');
  return tags;
}

// "Coach: Lighten the day after a short night" → { agent: 'coach', text }
export function backlogOwner(text) {
  const m = String(text || '').match(/^([A-Za-z][A-Za-z ]{1,20}):\s+(.+)$/);
  if (!m) return null;
  const b = BEINGS.find((x) => x.name.toLowerCase() === m[1].trim().toLowerCase());
  return b ? { agent: b.id, text: m[2].trim() } : null;
}

const CONSULT_ID = { coach: 'coach', leader: 'leader', researcher: 'researcher', librarian: 'librarian', cfo: 'cfo' };

/* ------------------------------ suggestions ------------------------------ */

// A reply that said no agent could do it. Deterministic and narrow on
// purpose: a false "miss" would raise a skill he never needed.
export const MISS_RE = /\b(no agent (?:can|could)|(?:i|nova) (?:can(?:no|')t|cannot|am not able to|don't have a way to) (?:do|handle|track|split|prepare|plan|check|log)|isn'?t something i can do|not (?:on|in) (?:my|the) (?:skill )?registry|i have no (?:way|skill) to)\b/i;

// Which agent's lane his question was in, by its words. Unknown is skipped:
// a suggestion with no owner is a guess.
const LANE_WORDS = [
  ['cfo', /\b(money|bill|bills|spend|spent|budget|bank|owe|owes|split|subscription|invoice|expense|tax)\b/i],
  ['coach', /\b(workout|session|lift|lifts|squat|bench|deadlift|program|training|gym|reps?|sets?)\b/i],
  ['mealprep', /\b(meal|meals|food|recipe|protein|cook|shopping|grocer\w*|prep)\b/i],
  ['commander', /\b(calendar|meeting|reminder|remind|todo|to-do|schedule|plan my day|tomorrow)\b/i],
  ['leader', /\b(team|one-to-one|1:1|manager|leadership|staff|feedback|lead)\b/i],
  ['watcher', /\b(video|youtube|reel|clip|watch)\b/i],
  ['librarian', /\b(book|books|note|notes|library|read|podcast)\b/i],
  ['researcher', /\b(study|studies|evidence|research|paper)\b/i],
  ['practice', /\b(rehearse|practise|practice|conversation with)\b/i],
  ['guardian', /\b(backup|backups|server|loop|broken|down)\b/i],
];
export function laneOf(question) {
  for (const [id, re] of LANE_WORDS) if (re.test(question)) return id;
  return null;
}

// his own captures by route: who could own that job, and the skill it would be
const HAND_ROUTES = {
  food: { agent: 'mealprep', skill: 'Log your usual meals for you from the rotation' },
  shopping: { agent: 'mealprep', skill: 'Keep the shopping list topped up from the meal plan' },
  expense: { agent: 'cfo', skill: 'Log spending from the ledger instead of by hand' },
  reminder: { agent: 'commander', skill: 'Set the reminders you keep asking for, from your plans' },
  todo: { agent: 'commander', skill: 'Raise the to-dos you keep capturing from your day' },
  journal: { agent: 'leader', skill: 'Draft the journal entry from your day for you to edit' },
  note: { agent: 'librarian', skill: 'File notes like these to the right place unasked' },
  idea: { agent: 'librarian', skill: 'Gather your ideas into the Studio without a capture' },
  stash: { agent: 'librarian', skill: 'Save links like these to the Stash unasked' },
};
export const HAND_MIN = 5;
export const DECLINE_MIN = 3;
export const ASKED_MIN = 2;

const KIND_WORD = (k) => String(k || 'card').replace(/-/g, ' ');
const sid = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const inWindow = (at, now, days = WINDOW_DAYS) => {
  const t = at ? new Date(at).getTime() : NaN;
  return Number.isFinite(t) && t <= now && now - t < days * DAY;
};

// records + turns in, raw suggestions out (before his answers are applied).
// Pure: no clock but `now`, no I/O. `turns` may be null (the record could not
// be read): that signal is then reported unavailable, never zero.
export function deriveSuggestions({ records = [], turns = null, now = Date.now() } = {}) {
  const out = [];

  // 1. asked: his question, then a reply that said it could not
  if (Array.isArray(turns)) {
    const byAgent = new Map();
    for (let i = 1; i < turns.length; i++) {
      const r = turns[i];
      if (r.who !== 'nova' || !MISS_RE.test(String(r.text || ''))) continue;
      if (!inWindow(r.at, now)) continue;
      let q = null;
      for (let j = i - 1; j >= 0 && j >= i - 3; j--) if (turns[j].who === 'you') { q = turns[j]; break; }
      if (!q) continue;
      const agent = laneOf(String(q.text || ''));
      if (!agent) continue;
      const g = byAgent.get(agent) || { n: 0, last: null };
      g.n++; g.last = String(q.text || '').trim();
      byAgent.set(agent, g);
    }
    for (const [agent, g] of byAgent) {
      if (g.n < ASKED_MIN) continue;
      const ask = g.last.replace(/\s+/g, ' ').slice(0, 90);
      out.push({
        id: `asked-${agent}-${sid(agent + ':asked')}`, agent, kind: 'asked',
        skill: `Answer what you asked: “${ask}${g.last.length > 90 ? '…' : ''}”`,
        count: g.n, evidence: `times you asked in four weeks; each answer said it could not`,
        source: 'conversation record (server/data/conversation)',
      });
    }
  }

  // 2. hand: his own captures, filed to one route again and again
  const hand = new Map();
  for (const r of records) {
    if (r.kind || r.status !== 'filed') continue;
    const route = r.decision?.route;
    if (!HAND_ROUTES[route] || !inWindow(r.filedAt || r.createdAt, now)) continue;
    hand.set(route, (hand.get(route) || 0) + 1);
  }
  for (const [route, n] of hand) {
    if (n < HAND_MIN) continue;
    const h = HAND_ROUTES[route];
    out.push({
      id: `hand-${h.agent}-${route}`, agent: h.agent, kind: 'hand', skill: h.skill,
      count: n, evidence: `${route} captures you filed yourself in four weeks`,
      source: `Inbox records: your own captures (route: ${route})`,
    });
  }

  // 3. inbox: an agent's cards he declined, by kind
  const declined = new Map();
  for (const r of records) {
    if (!r.kind || r.status !== 'discarded' || r.expired || r.reason === 'retried') continue;
    if (!inWindow(r.discardedAt || r.createdAt, now)) continue;
    const agent = beingForRecord(r);
    if (!BEINGS.some((b) => b.id === agent)) continue;
    const g = declined.get(r.kind) || { agent, n: 0, reasons: new Map() };
    g.n++;
    if (r.declineReason) g.reasons.set(r.declineReason, (g.reasons.get(r.declineReason) || 0) + 1);
    declined.set(r.kind, g);
  }
  for (const [kind, g] of declined) {
    if (g.n < DECLINE_MIN) continue;
    const top = [...g.reasons].sort((a, b) => b[1] - a[1])[0];
    out.push({
      id: `inbox-${g.agent}-${kind}`, agent: g.agent, kind: 'inbox',
      skill: `Draft ${KIND_WORD(kind)} cards the way you take them`,
      count: g.n,
      evidence: `${KIND_WORD(kind)} cards you turned down in four weeks${top ? `, most often “${String(top[0]).slice(0, 60)}”` : ''}`,
      source: `Inbox records you declined (kind: ${kind})`,
    });
  }
  return out;
}

// His answers applied: accepted ones are on the build list (hidden here,
// shown under Not yet); dismissed ones stay away for DISMISS_DAYS.
export function applyAnswers(suggestions, state = {}, now = Date.now()) {
  return suggestions.filter((s) => {
    const a = state[s.id];
    if (!a) return true;
    if (a.state === 'accepted') return false;
    if (a.state === 'dismissed') return now - new Date(a.at).getTime() >= DISMISS_DAYS * DAY;
    return true;
  });
}

/* -------------------------------- compose -------------------------------- */

export function runsByDay(records, agent, now = Date.now(), days = RUN_DAYS) {
  const counts = new Array(days).fill(0);
  const end = new Date(now); end.setUTCHours(23, 59, 59, 999);
  for (const r of records) {
    if (!r.kind || beingForRecord(r) !== agent) continue;
    const t = new Date(r.createdAt || 0).getTime();
    const back = Math.floor((end.getTime() - t) / DAY);
    if (back >= 0 && back < days) counts[days - 1 - back]++;
  }
  return counts;
}

// The whole payload, pure. `departments` and `backlog` null means the
// registry could not be read: every agent then says so instead of "0 skills".
export function composeSkillSets({ departments = null, backlog = null, records = null, turns = null, state = {}, consultable = [], now = Date.now() } = {}) {
  const raw = records ? deriveSuggestions({ records, turns, now }) : [];
  const open = applyAnswers(raw, state, now);
  const canAsk = Object.keys(CONSULT_ID).filter((id) => consultable.includes(id));
  const agents = BEINGS.map((b) => {
    const groups = [];
    if (departments) {
      for (const d of departments) {
        const mine = d.skills.filter((s) => ownerOf(s.text, d.name) === b.id)
          .map((s) => ({ text: s.text, tier: s.autonomy, tags: tagsOf(s.text, s.autonomy) }));
        if (mine.length) groups.push({ name: d.name, skills: mine });
      }
    }
    const notYet = [];
    if (backlog) {
      for (const it of backlog) {
        const o = backlogOwner(it.text);
        if (o?.agent === b.id) notYet.push({ text: o.text, since: it.proposed, source: 'build list' });
      }
    }
    if (!canAsk.includes(b.id)) notYet.push({ text: 'Be consulted by the other agents', source: 'consult rail' });
    return {
      id: b.id, name: b.name,
      skills: departments ? groups : null,
      notYet,
      consult: { canBeAsked: canAsk.includes(b.id) },
      runs: records ? runsByDay(records, b.id, now) : null,
      suggestions: open.filter((s) => s.agent === b.id),
    };
  });
  return {
    at: new Date(now).toISOString(),
    agents,
    askable: ['nova', ...canAsk],
    signals: {
      asked: Array.isArray(turns) ? 'live' : 'unavailable',
      hand: records ? 'live' : 'unavailable',
      inbox: records ? 'live' : 'unavailable',
      lend: 'not yet',
    },
  };
}

/* ------------------------------ his answers ------------------------------ */

export async function readAnswers() {
  try { return JSON.parse(await readFile(STATE_PATH(), 'utf8')) || {}; } catch { return {}; }
}
async function writeAnswers(s) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${STATE_PATH()}.${randomUUID().slice(0, 6)}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await rename(tmp, STATE_PATH());
}

const nameOf = (id) => BEINGS.find((b) => b.id === id)?.name || id;
export const backlogText = (s) => `${nameOf(s.agent)}: ${s.skill}`.replace(/\s+/g, ' ').slice(0, 200);

// The tick. Files on the rails and remembers the record so Undo can find it.
export async function acceptSuggestion(vaultPath, suggestion, { now = new Date() } = {}) {
  if (!suggestion?.id || !suggestion.agent || !suggestion.skill) throw new Error('that suggestion is not current');
  const { fileDecision } = await import('./inbox.js');
  const { createRecord } = await import('./inboxStore.js');
  const text = backlogText(suggestion);
  const decision = { route: 'skill-backlog', confidence: 'high', title: `Build list: ${text}`, reason: `${suggestion.count} ${suggestion.evidence} (${suggestion.source})`, payload: { text } };
  const { destination, undo } = await fileDecision(vaultPath, decision);
  const at = now.toISOString();
  const record = await createRecord({
    id: randomUUID().slice(0, 8), kind: 'skill-suggest', source: 'skill-sets', mode: 'review-all',
    text, createdAt: at, status: 'filed', decision, destination, undoData: undo, filedAt: at, auto: false,
    suggestionId: suggestion.id,
  });
  const s = await readAnswers();
  s[suggestion.id] = { state: 'accepted', at, recordId: record.id };
  await writeAnswers(s);
  return { record };
}

export async function dismissSuggestion(suggestion, { now = new Date() } = {}) {
  if (!suggestion?.id) throw new Error('that suggestion is not current');
  const s = await readAnswers();
  s[suggestion.id] = { state: 'dismissed', at: now.toISOString() };
  await writeAnswers(s);
  return { id: suggestion.id };
}

// Undo either answer. An accept is undone through the record's own undo
// (the Backlog line comes off); a dismiss just forgets the answer.
export async function undoSuggestion(vaultPath, id) {
  const s = await readAnswers();
  const a = s[id];
  if (!a) throw new Error('nothing to undo for that suggestion');
  if (a.state === 'accepted' && a.recordId) {
    const { undoRecord } = await import('./inbox.js');
    const { getRecord } = await import('./inboxStore.js');
    const r = await getRecord(a.recordId);
    if (r && r.status === 'filed') await undoRecord(vaultPath, a.recordId);
  }
  delete s[id];
  await writeAnswers(s);
  return { id, undone: a.state };
}

// The live payload, read from disk. Every source that fails degrades to null.
export async function loadSkillSets(vaultPath, { now = Date.now() } = {}) {
  const { readFile: rf } = await import('node:fs/promises');
  const { loadSkills, parseBacklog, SKILLS_REL } = await import('./skills.js');
  let departments = null, backlog = null, records = null, turns = null, consultable = [];
  try { departments = await loadSkills(vaultPath); backlog = parseBacklog(await rf(path.join(vaultPath, SKILLS_REL), 'utf8')); } catch { /* says so */ }
  try { records = await (await import('./inboxStore.js')).listRecords(); } catch { /* says so */ }
  try { turns = await (await import('./conversationLog.js')).readTurns({ since: new Date(now - WINDOW_DAYS * DAY).toISOString(), limit: 0 }); } catch { turns = null; }
  try { consultable = Object.keys((await import('./consult.js')).AGENTS); } catch { /* none */ }
  return composeSkillSets({ departments, backlog, records, turns, state: await readAnswers(), consultable, now });
}

export async function findSuggestion(vaultPath, id) {
  const p = await loadSkillSets(vaultPath);
  for (const a of p.agents) { const s = a.suggestions.find((x) => x.id === id); if (s) return s; }
  return null;
}
