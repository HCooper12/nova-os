// THE LIT PART OF A DATA PANEL (3 Oct 2026) — design/mockups/67-agent-
// provenance-r2.html, screens 3 and 5, and his rule in NOVA-METHOD.md §2b
// ("When a glass panel appears").
//
// His words, 29 Sep: "a dynamic panel pop-up showing Monday's workout and
// highlighting the specific parts that it is referring to while it speaks
// back to me out loud… purposeful and clear and not simply more clutter."
//
// THE SPLIT, the same one every directive keeps: the model NAMES a data
// panel (`VIS {"panel":"session","date":"2026-09-28","by":"coach"}`) and,
// before each sentence that points at a part of it, an ADDRESS
// (`VIS {"mark":{"lift":"Bench press","set":3}}`). Code builds the panel from
// his records (server/lib/panels.js) and resolves every address here, against
// the data it built. An address that is not there is DROPPED: nothing lights,
// and nothing is guessed in its place. A light is never a claim the record
// cannot stand behind.
//
// Plain JS, shared by the server (which logs a dropped address) and the
// client (which draws the light), so the two can never disagree about what
// a mark means. No React.
// WHOSE FINDING IT IS. Each agent wears the hue its being already has
// (src/agentWorld/beings.js): the Coach coral, the Researcher blue, the
// Librarian teal, the Leader magenta, and Nova's own finding his starlight.
// The Coach, the Leader and Nova match src/artifactClient.js AGENT exactly
// (server/test/sessionPanel.test.js holds them together). Not imported from
// there: artifactClient reaches this module through the glass parser, and
// the cycle left AGENT unread when this table was built. Not added to AGENT
// either: that table is also the Documents legend, and the two Knowledge
// beings file no documents.
export const FINDERS = {
  coach: { key: 'coach', name: 'Coach', the: 'the Coach', hue: 'var(--nv-m-chest)' },
  researcher: { key: 'researcher', name: 'Researcher', the: 'the Researcher', hue: 'var(--nv-m-quads)' },
  librarian: { key: 'librarian', name: 'Librarian', the: 'the Librarian', hue: 'var(--nv-m-back)' },
  leader: { key: 'leader', name: 'Leader', the: 'the Leader', hue: 'var(--nv-mg)' },
  calendar: { key: 'calendar', name: 'Calendar', the: 'your calendar', hue: 'var(--nv-nova)' },
  // Money's hue (its Index tile): the CFO is a code-read source like the calendar
  cfo: { key: 'cfo', name: 'CFO', the: 'the CFO', hue: 'var(--nv-vi)' },
  // the Stash's teal (its hue is the Librarian's): a code-read source like the calendar
  stash: { key: 'stash', name: 'Stash', the: 'the Stash', hue: 'var(--nv-m-back)' },
  nova: { key: 'nova', name: 'Nova', the: 'Nova', hue: 'var(--nv-nova)' },
};
export const finderOf = (by) => FINDERS[String(by || '').toLowerCase()] || FINDERS.nova;
export const hueOf = (by) => finderOf(by).hue;
// "from the Coach" / "Nova's own": the words that name the finder beside the light
export const finderWords = (by) => (finderOf(by).key === 'nova' ? 'Nova’s own' : `from ${finderOf(by).the}`);

const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const MARK_FIELDS = ['kg', 'reps', 'rpe'];

// The panels built by the server from his records, which marks can light.
export const DATA_KINDS = new Set(['session', 'sources']);

// THE PANEL A MARK RELIGHTS: the panel already up, which is the nearest data
// panel before it with only marks in between. A mark after any other panel
// (a key line came between) has nothing to light and draws nothing; -1.
export function hostOf(beats, idx) {
  for (let i = Math.min(idx, (beats?.length || 0) - 1); i >= 0; i--) {
    const k = beats[i]?.spec?.kind;
    if (DATA_KINDS.has(k)) return i;
    if (k !== 'mark') return -1;
  }
  return -1;
}

// The beats that carry a light on one host panel, in spoken order: the
// panel's own inline mark (if it has one), then every mark straight after it.
export function marksOfHost(beats, h) {
  const out = [];
  if (h < 0 || !beats?.[h]) return out;
  if (beats[h].spec?.mark) out.push(h);
  for (let j = h + 1; j < beats.length && beats[j]?.spec?.kind === 'mark'; j++) out.push(j);
  return out;
}

// An address, as the model wrote it, made safe. Strict: a field that is
// present but malformed costs the whole mark rather than being quietly
// dropped from it, because "set three" read as "the whole lift" would light
// a part he was never told about.
export function normaliseMark(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const out = {};
  const lift = clean(m.lift ?? m.exercise, 60);
  if (lift) out.lift = lift;
  if (m.set != null) {
    const n = Number(m.set);
    if (!Number.isInteger(n) || n < 1 || n > 30) return null;
    out.set = n;
  }
  if (m.field != null) {
    const f = String(m.field).toLowerCase().trim();
    if (!MARK_FIELDS.includes(f)) return null;
    out.field = f;
  }
  if (m.target === true) out.target = true;
  const section = String(m.section ?? m.agent ?? '').toLowerCase().trim();
  if (section) {
    if (!/^[a-z]{2,20}$/.test(section)) return null;
    out.section = section;
  }
  if (m.quote === true) out.quote = true;
  // an address names a place: a lift on a session, a section of the joint panel
  if (!out.lift && !out.section) return null;
  return out;
}

// the key a mark contributes to its beat's key
export const markKey = (m) => (m ? [m.lift || '', m.set || '', m.field || '', m.target ? 't' : '', m.section || '', m.quote ? 'q' : ''].join(',') : '');

const repsWords = (t) => (t ? `${t.repsLow}${t.repsHigh > t.repsLow ? `–${t.repsHigh}` : ''}` : '');
const kgWords = (n) => `${Number.isInteger(n) ? n : Number(n).toFixed(1).replace(/\.0$/, '')} kg`;

// One lift by the name he heard: exact first, then a single containing match.
// Two lifts that both contain the words is an ambiguity, and an ambiguous
// address lights nothing.
function findLift(lifts, name) {
  const want = fold(name);
  if (!want) return -1;
  const exact = lifts.findIndex((l) => fold(l.name) === want);
  if (exact >= 0) return exact;
  const loose = lifts.map((l, i) => ({ i, f: fold(l.name) })).filter((x) => x.f.includes(want) || want.includes(x.f));
  return loose.length === 1 ? loose[0].i : -1;
}

const fail = (why) => ({ ok: false, why });

// RESOLVE AN ADDRESS against the panel code built. Returns
//   { ok: true, at, short, detail, name, by }  — what to light, and its words
//   { ok: false, why }                         — dropped, and why (logged)
// `card` is the merged panel ({ kind, data, by }); `mark` a normalised mark.
export function resolveMark(card, mark) {
  if (!card || !card.data) return fail('the panel has no data to point at');
  if (!mark) return fail('the mark has no address');
  if (card.kind === 'session') return resolveSessionMark(card, mark);
  if (card.kind === 'sources') return resolveSourcesMark(card, mark);
  return fail(`a ${card.kind} panel takes no marks`);
}

function resolveSessionMark(card, mark) {
  if (!mark.lift) return fail('a session mark names a lift');
  if (mark.section) return fail('a session has no sections');
  const lifts = card.data.lifts || [];
  const i = findLift(lifts, mark.lift);
  if (i < 0) return fail(`no lift called "${mark.lift}" in this session`);
  const lift = lifts[i];
  const sets = (lift.sets || []).filter((s) => s.n != null);
  let set = null;
  if (mark.set != null) {
    set = sets.find((s) => s.n === mark.set) || null;
    if (!set) return fail(`${lift.name} has no set ${mark.set} in this session`);
  }
  if (mark.field === 'rpe' && (!set || set.rpe == null)) return fail(`no RPE logged for ${lift.name}${set ? ` set ${set.n}` : ''}`);
  if (mark.target && !lift.target) return fail(`the program holds no target for ${lift.name}`);
  if (mark.field === 'kg' && lift.topKg == null) return fail(`${lift.name} carries no weight`);
  const by = card.by || 'nova';
  const at = { kind: 'session', lift: i, set: set ? set.n : null, field: mark.field || null, target: !!mark.target };
  // THE WORDS, from the data and nothing else: the stage names the light
  // ("Bench press, set 3") and the settled card's row carries its gist.
  if (set && !mark.target) {
    const rpe = set.rpe != null ? ` at RPE ${set.rpe}` : '';
    const what = mark.field === 'kg' ? kgWords(set.kg) : mark.field === 'rpe' ? `RPE ${set.rpe}` : `${set.reps} reps`;
    return { ok: true, at, by, short: `Set ${set.n}`, detail: mark.field === 'kg' ? `${kgWords(set.kg)} × ${set.reps}` : `${set.reps}${rpe}`, name: `${lift.name}, set ${set.n}${mark.field ? `, ${what}` : ''}` };
  }
  if (mark.target) {
    const kg = lift.topKg != null ? kgWords(lift.topKg) : null;
    const tw = `target ${repsWords(lift.target)} reps`;
    return { ok: true, at, by, short: kg || `Target ${repsWords(lift.target)}`, detail: kg ? tw : `${lift.target.sets} sets`, name: `${lift.name}${kg ? `, ${kg}` : ''} · ${tw}` };
  }
  if (mark.field === 'kg') {
    return { ok: true, at, by, short: kgWords(lift.topKg), detail: 'the working weight', name: `${lift.name}, ${kgWords(lift.topKg)}` };
  }
  const n = sets.length;
  return { ok: true, at, by, short: lift.name, detail: `${n} ${n === 1 ? 'set' : 'sets'}${lift.topKg != null ? ` at ${kgWords(lift.topKg)}` : ''}`, name: lift.name };
}

function resolveSourcesMark(card, mark) {
  if (!mark.section) return fail('a joint-panel mark names a section');
  const sections = card.data.sections || [];
  const s = sections.find((x) => x.agent === mark.section);
  if (!s) return fail(`no section from "${mark.section}" on this panel`);
  if (mark.quote && !(s.type === 'passage' && s.span)) return fail(`${finderOf(s.agent).the} has no quoted span checked against his note`);
  if (mark.lift || mark.set != null) return fail('a joint-panel section takes no lift or set');
  return {
    ok: true,
    at: { kind: 'sources', section: s.agent, quote: !!mark.quote },
    by: s.agent,
    short: finderOf(s.agent).name,
    detail: s.gist || '',
    name: mark.quote ? `${finderOf(s.agent).the}’s passage, the quoted words` : `${finderOf(s.agent).the}’s part`,
  };
}

// ------------------------------------------------- binding to a sentence --

// A mark lights while the sentence it precedes is spoken, and only then.
// This finds that sentence: from the beat's place in the prose (skipping the
// whitespace a directive line leaves), to its first full stop that is
// followed by a space or the end ("9.5" is not a full stop), and `until`, the
// start of the sentence after it. Before the sentence has arrived whole, it
// runs to the end of what has.
export function sentenceAfter(text, at) {
  const t = String(text || '');
  let i = Math.max(0, Math.min(t.length, Number(at) || 0));
  while (i < t.length && /\s/.test(t[i])) i++;
  const start = i;
  const re = /[.!?](?=\s|$)/g;
  re.lastIndex = start;
  const m = re.exec(t);
  if (!m) return { start, end: t.length, until: t.length, complete: false };
  const end = m.index + 1;
  let until = end;
  while (until < t.length && /\s/.test(t[until])) until++;
  return { start, end, until, complete: true };
}

// The ordinal of the sentence holding `pos` (0-based): the snapshot keeps it,
// so the settled card and Replay know which words each light belonged to.
export function sentenceIndexAt(text, pos) {
  const t = String(text || '').slice(0, Math.max(0, Number(pos) || 0));
  return (t.match(/[.!?](?=\s)/g) || []).length;
}

// Is this mark's sentence the one being spoken? `spokenTo` is where the
// voice has got (the end of the span now playing, glassSpokenTo).
export function litNow(beat, text, spokenTo) {
  if (!beat || !(spokenTo > beat.at)) return false;
  return spokenTo <= sentenceAfter(text, beat.at).until;
}
