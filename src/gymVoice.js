// THE GYM BY VOICE — phase 3 of the Verbs plan (design/VERBS-PLAN.md).
//
// A live workout is CLIENT state (the cockpit's draft, persisted locally,
// written to the vault only on finish), so these verbs run here, with no
// server round trip at all — the fastest path Nova has. Pure functions:
// parse his words against the session he is in, return the next session
// and one short sentence to say. App.jsx applies the state; the cockpit on
// Train shows every set the moment it is spoken.
//
// The same rules as the server registry: a name resolves strictly (a tie
// asks, a miss says so); numbers are parsed, never guessed; nothing is
// finished without his yes.

const norm = (q) => String(q || '')
  .toLowerCase()
  .replace(/^(hey|hi|ok|okay)?[,\s]*(nova|jarvis)[,\s]*/i, '')
  .replace(/[?!.]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|a|an|my|day|session|workout|routine)\b/g, ' ').replace(/\s+/g, ' ').trim();

// exact > prefix > every word; a tie asks
export function matchRoutine(routines, query) {
  const q = nameKey(query);
  if (!q) return { hit: null, why: 'which routine?' };
  const scored = routines.map((r) => {
    const n = nameKey(r.name);
    if (!n) return { r, score: 0 };
    if (n === q) return { r, score: 4 };
    if (n.startsWith(q)) return { r, score: 3 };
    const qt = q.split(' ').filter((t) => t.length > 1);
    if (qt.length && qt.every((t) => n.split(' ').includes(t))) return { r, score: 2 };
    return { r, score: 0 };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return { hit: null, why: `there's no routine called "${String(query).trim()}"` };
  const top = scored[0].score;
  const tied = scored.filter((x) => x.score === top);
  if (tied.length > 1 && top < 4) return { hit: null, why: `"${String(query).trim()}" could be ${tied.map((x) => `"${x.r.name}"`).join(' or ')} — which one?` };
  return { hit: tied[0].r };
}

const NUM = String.raw`(\d+(?:\.\d+)?)`;
// a separator is REQUIRED between weight and reps — "12" alone must never read as 1×2
const SET_RE = new RegExp(`^${NUM}\\s*(?:kg|kilos?|kilograms?|k)?\\s*(?:for|x|×|by|,)\\s*${NUM}\\s*(?:reps?)?(?:\\s*(?:at|@)\\s*(?:rpe\\s*)?${NUM})?$`);
const REPS_ONLY_RE = new RegExp(`^${NUM}\\s*reps?(?:\\s*(?:at|@)\\s*(?:rpe\\s*)?${NUM})?$`);
const WEIGHT_ONLY_RE = new RegExp(`^(?:drop to|go to|up to|down to|take it to|make it|weight)\\s*${NUM}\\s*(?:kg|kilos?)?$`);

// Parses a sentence said DURING a session. Returns { kind, … } or null.
export function parseInSession(text) {
  const q = norm(text);
  if (!q) return null;
  let m;
  if ((m = q.match(SET_RE))) return { kind: 'set', weight: Number(m[1]), reps: Number(m[2]), rpe: m[3] != null ? Number(m[3]) : null };
  if ((m = q.match(REPS_ONLY_RE))) return { kind: 'set', weight: null, reps: Number(m[1]), rpe: m[2] != null ? Number(m[2]) : null };
  if ((m = q.match(WEIGHT_ONLY_RE))) return { kind: 'weight', weight: Number(m[1]) };
  if (/^(?:same|same again|again|another one|one more|repeat(?: that)?)$/.test(q)) return { kind: 'same' };
  if (/^add (?:a |another )?set$/.test(q)) return { kind: 'addset' };
  if (/^(?:next|next exercise|move on|done with (?:this|that)(?: one)?|on to the next)$/.test(q)) return { kind: 'next' };
  if (/^skip(?: (?:it|this|that|this one|the exercise))?$/.test(q)) return { kind: 'skip' };
  if (/^(?:finish|finished|end|complete|wrap up|save)(?: (?:the|my|this))?(?: (?:session|workout))?$|^(?:i'?m|im) done$|^that'?s (?:it|me|the session)$|^all done$/.test(q)) return { kind: 'finish' };
  if (/^(?:save (?:it |this )?for later|pause(?: the)?(?: session| workout)?|leave it for now)$/.test(q)) return { kind: 'later' };
  if (/^(?:what'?s next|what is next|where (?:am i|are we)(?: (?:at|up to))?|what'?s left|how many (?:sets )?left)$/.test(q)) return { kind: 'where' };
  if (/^(?:undo|undo that|scrap that|take that back)$/.test(q)) return { kind: 'undo' };
  return null;
}

// Parses "start push day" when NO session is live.
export function parseStart(text) {
  const q = norm(text);
  const m = q.match(/^(?:start|begin|let'?s do|kick off|open|fire up)\s+(?:my\s+|the\s+|a\s+)?(.+?)(?:\s+(?:session|workout))?$/);
  if (!m) return null;
  const name = m[1].trim();
  if (/^(?:today'?s?|today)$/.test(name)) return { kind: 'start', today: true };
  return { kind: 'start', name };
}

// the exercise the words apply to: the explicit cursor, else the first
// unskipped exercise with an unticked set
function cursorOf(session) {
  const ex = session.exercises || [];
  const c = Number.isInteger(session.voiceCursor) ? session.voiceCursor : -1;
  if (c >= 0 && c < ex.length && !ex[c].skipped) return c;
  const i = ex.findIndex((e) => !e.skipped && (e.sets || []).some((s) => !s.done));
  return i === -1 ? -1 : i;
}
function nextUndone(e) { return (e.sets || []).findIndex((s) => !s.done); }
const kg = (w) => (w ? `${w}kg` : 'bodyweight');
const setWord = (i, n) => `set ${i + 1} of ${n}`;

// Applies a parsed command. Returns { session, said, finish?, later?, undoable? }.
// Never throws for his words — a miss is a sentence.
export function applyInSession(cmd, session) {
  const ex = (session.exercises || []).map((e) => ({ ...e, sets: (e.sets || []).map((s) => ({ ...s })) }));
  const next = { ...session, exercises: ex };
  const ci = cursorOf(next);
  const cur = ci >= 0 ? ex[ci] : null;
  const remaining = () => ex.filter((e) => !e.skipped && e.sets.some((s) => !s.done)).length;

  if (cmd.kind === 'where') {
    if (!cur) return { session, said: 'Everything is ticked — say finish when you are done.' };
    const si = nextUndone(cur);
    const s = cur.sets[si];
    return { session, said: `${cur.name}, ${setWord(si, cur.sets.length)}${s ? ` — ${kg(s.weight)} for ${s.reps} is the plan` : ''}. ${remaining()} exercise${remaining() === 1 ? '' : 's'} to go.` };
  }
  if (cmd.kind === 'finish') return { session, finish: true, said: 'Finish the session and log it? Say yes.' };
  if (cmd.kind === 'later') return { session, later: true, said: 'Saved for later — resume from the card on Train.' };

  if (!cur) return { session, said: 'Every set is ticked — say finish to log it, or "add a set".' };

  if (cmd.kind === 'set' || cmd.kind === 'same') {
    let si = nextUndone(cur);
    if (si === -1) { cur.sets.push({ ...cur.sets[cur.sets.length - 1], done: false }); si = cur.sets.length - 1; }
    const prevDone = [...cur.sets].reverse().find((s) => s.done) || cur.sets[si];
    const s = cur.sets[si];
    if (cmd.kind === 'same') { s.weight = prevDone.weight; s.reps = prevDone.reps; if (prevDone.rpe != null) s.rpe = prevDone.rpe; }
    else { if (cmd.weight != null) s.weight = cmd.weight; s.reps = cmd.reps; if (cmd.rpe != null) s.rpe = cmd.rpe; }
    s.done = true;
    next.voiceCursor = ci;
    next.voiceLast = { exIdx: ci, setIdx: si };
    const left = cur.sets.filter((x) => !x.done).length;
    return { session: next, undoable: true, said: `${kg(s.weight)} for ${s.reps}${s.rpe != null ? ` at ${s.rpe}` : ''} — ${cur.name}, ${setWord(si, cur.sets.length)}.${left ? '' : ` That's ${cur.name} done${ex[ci + 1] && !ex[ci + 1].skipped ? ` — next is ${ex[ci + 1].name}` : ''}.`}` };
  }
  if (cmd.kind === 'weight') {
    const si = nextUndone(cur);
    if (si === -1) return { session, said: `${cur.name} is fully ticked — say "add a set" first.` };
    cur.sets[si].weight = cmd.weight;
    next.voiceCursor = ci;
    return { session: next, said: `${kg(cmd.weight)} on the bar for ${cur.name}, ${setWord(si, cur.sets.length)}. Say the reps when it's done.` };
  }
  if (cmd.kind === 'addset') {
    const last = cur.sets[cur.sets.length - 1] || { weight: 0, reps: 8 };
    cur.sets.push({ weight: last.weight, reps: last.reps, done: false });
    next.voiceCursor = ci;
    return { session: next, said: `Set ${cur.sets.length} added to ${cur.name}.` };
  }
  if (cmd.kind === 'next') {
    const after = ex.findIndex((e, i) => i > ci && !e.skipped && e.sets.some((s) => !s.done));
    if (after === -1) return { session: next, said: `${cur.name} was the last one — say finish to log the session.` };
    next.voiceCursor = after;
    const s0 = ex[after].sets[nextUndone(ex[after])];
    return { session: next, said: `${ex[after].name}${s0 ? ` — ${kg(s0.weight)} for ${s0.reps} is the plan` : ''}.` };
  }
  if (cmd.kind === 'skip') {
    cur.skipped = true;
    const after = ex.findIndex((e, i) => i > ci && !e.skipped && e.sets.some((s) => !s.done));
    next.voiceCursor = after === -1 ? ci : after;
    return { session: next, undoable: true, said: `Skipped ${cur.name}.${after !== -1 ? ` Next is ${ex[after].name}.` : ' Say finish when you are done.'}` };
  }
  if (cmd.kind === 'undo') {
    const last = session.voiceLast;
    if (!last || !ex[last.exIdx]?.sets[last.setIdx]?.done) return { session, said: 'Nothing spoken to take back.' };
    ex[last.exIdx].sets[last.setIdx].done = false;
    next.voiceLast = null;
    next.voiceCursor = last.exIdx;
    return { session: next, said: `Unticked ${ex[last.exIdx].name}, ${setWord(last.setIdx, ex[last.exIdx].sets.length)}.` };
  }
  return { session, said: null };
}
