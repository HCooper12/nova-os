import { anatomyOf, sideFor, muscleVar } from './muscleHue.js';

// WHAT IS ON THE GLASS RIGHT NOW.
//
// The server named the panels and went and fetched their pictures
// (visualBeats.js, visualResolve.js). This decides WHEN each one is up, and
// it is driven by the voice rather than by the clock: every sentence handed
// to the speech queue carries the span of the reply it covers, and when its
// audio starts, the panel whose prose begins in that span becomes the hero.
// Voice leads, glass follows — the same rule the text reveal already obeys.
//
// His constraint, given twice: "visuals should always land in context, I'd
// rather them not dropped at all." So a panel is never withheld waiting for
// its picture. The FRAME goes up on time carrying the label and caption the
// model wrote — words about the very thing being said — and the picture
// fills into that frame whenever it lands. Nothing is dropped, and nothing
// can appear against the wrong sentence.

// The last panel whose prose has begun. `spokenTo` is the end of the span
// now being spoken, so a panel introduced anywhere inside it is already the
// subject of what he is hearing.
export function activeBeat(beats, spokenTo) {
  let idx = -1;
  for (let i = 0; i < (beats?.length || 0); i++) if (beats[i].at < spokenTo) idx = i;
  return idx;
}

// Spent panels, newest first — the strip along the edge of the JARVIS wall.
// He can still see what he was told two minutes ago, which is most of why
// the strip is there.
export function railOf(beats, activeIdx, max = 4) {
  if (activeIdx <= 0) return [];
  return beats.slice(Math.max(0, activeIdx - max), activeIdx).reverse();
}

const KEYWORDS = (s) => String(s || '').toLowerCase().match(/[a-z][a-z']{3,}/g) || [];

// A `steps` panel BUILDS, which was his most specific request: "number one on
// its own while it was written to me, which would then dynamically adjust to
// also display number two and number one together when it began reading
// number 2 to me."
//
// We cannot know from the audio which item he has reached, so we read the
// prose that has been spoken so far and count the items whose own words have
// been said. Cumulative by construction: an item once shown never disappears,
// because a list that un-writes itself while he reads it is worse than one
// that appears all at once.
// `span` is how long this panel's whole passage is, so progress through it
// can stand in when the words do not match.
export function stepsRevealed(items, spokenSoFar, span = 0) {
  const total = items?.length || 0;
  if (!total) return 0;
  const said = new Set(KEYWORDS(spokenSoFar));
  let matched = 0;
  for (let i = 0; i < total; i++) {
    const want = [...new Set(KEYWORDS(items[i]?.name))];
    if (!want.length) continue;
    const hit = want.filter((w) => said.has(w)).length;
    if (hit / want.length >= 0.5) matched = i + 1;   // reached it — and everything before it
  }
  // THE WORDS USUALLY DO NOT MATCH. Caught on a turn shaped like a real one:
  // a `steps` item is the model's SUMMARY of the passage ("Ask for advice, do
  // not pitch"), while the passage itself says "get ten minutes alone". Word
  // overlap then finds nothing and the list never builds — which is the one
  // behaviour he asked for by name. So progress through the passage stands in
  // when the words are silent, and the better of the two wins.
  const heard = String(spokenSoFar || '').length;
  const paced = span > 0 ? Math.ceil((total * Math.min(heard, span)) / span) : 0;
  return Math.max(matched, Math.min(total, paced));
}

// The panel to draw: what the model named, plus whatever the fetch has
// brought back so far. Order matters — a resolved panel may downgrade its own
// kind (an image that could not be found becomes the words), and that answer
// must win over the kind the model asked for.
export function mergeVisual(spec, resolved) {
  if (!spec) return null;
  if (!resolved) return { ...spec, pending: FETCHED.has(spec.kind) };
  return { ...spec, ...resolved, pending: false };
}
const FETCHED = new Set(['image', 'media']);

// THE GLASS — the panels a spoken reply raises as it talks (9 Sep 2026).
//
// The voice decides which one is the hero: `glassSpokenTo` is how far the
// AUDIO has got, not how far the text has arrived. A `steps` panel needs the
// prose spoken since it went up, so it can build a line at a time the way he
// described — one alone while it is read to him, then one and two together.
// THE SPOKEN REPORT'S PANELS ARE BUILT FROM HIS VAULT, NOT FROM THE MODEL.
// The model NAMES a muscle or a routine (design/JARVIS-REPORT-PLAN.md); this
// is where code turns the name into the figure's regions and the program's
// real rows. A name the library does not hold comes back null and the beat
// draws nothing — the doctrine is that a directive can never invent a
// picture, and that includes a muscle he does not have or a routine he
// never wrote.
const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function enrichBody(spec) {
  const ids = anatomyOf(spec.muscle);
  if (!ids.length) return null;
  return { ...spec, group: groupLabel(spec.muscle), ids, side: sideFor(ids), hue: muscleVar(spec.muscle) };
}

export function enrichProgram(spec, routines) {
  const list = Array.isArray(routines) ? routines : [];
  const want = fold(spec.routine);
  // exact first, then a routine whose name contains what was said ("Push"
  // for "Push day"); never a guess beyond that
  const r = list.find((x) => fold(x.name) === want) || list.find((x) => want && fold(x.name).includes(want));
  if (!r) return null;
  const exercises = Array.isArray(r.exercises) ? r.exercises : [];
  const byName = new Map(exercises.map((e) => [fold(e.name), e]));
  const match = (names) => (names || []).map((n) => byName.get(fold(n))).filter(Boolean).map((e) => e.name);
  const remove = match(spec.remove);
  const keep = match(spec.keep);
  const group = spec.muscle ? groupLabel(spec.muscle) : null;
  const rows = exercises.map((e) => ({
    name: e.name,
    muscle: e.muscleGroup || null,
    // lit: the muscle the report is about; the two verdicts override it
    lit: !!group && !!e.muscleGroup && fold(e.muscleGroup) === fold(group),
    verdict: remove.includes(e.name) ? 'remove' : keep.includes(e.name) ? 'keep' : null,
  }));
  return { ...spec, routineName: r.name, group, hue: group ? muscleVar(group) : 'var(--nv-acc)', rows, remove, keep };
}

// A `decide` panel's items are changes he is being asked about. The
// handlers are the conversation: a tick says "make change N", a cross says
// "skip change N", and both go to Nova as plain sentences, which she turns
// into a PROPOSE on the rails exactly as she would from his voice. Nothing
// here writes.
export function decideHandlers(spec, say) {
  if (!spec.decide || typeof say !== 'function') return {};
  const n = (i) => i + 1;
  return {
    onTick: (i) => say(`Make change ${n(i)} — ${spec.items[i].name}.`),
    onCross: (i) => say(`Skip change ${n(i)} — ${spec.items[i].name}. Leave that as it is.`),
    onAll: () => say('Make all of them.'),
  };
}

export function glassOf(st, app) {
  const beats = st.glassBeats || [];
  if (!beats.length) return null;
  const spokenTo = st.glassSpokenTo || 0;
  const idx = activeBeat(beats, spokenTo);
  if (idx < 0) return null;
  const chat = st.voiceChat || [];
  const lastSaid = [...chat].reverse().find((m) => m.who !== 'you')?.text || '';
  const say = app && typeof app.askNova === 'function' ? (t) => app.askNova(t) : null;
  const panel = (b) => {
    const v = mergeVisual(b.spec, (st.glassVisuals || {})[b.key]);
    if (!v) return null;
    if (v.kind === 'body') return enrichBody(v);
    if (v.kind === 'program') return enrichProgram(v, st.liveWorkoutRoutines);
    if (v.kind !== 'steps') return v;
    // the passage runs from this panel to the next one (or to the end)
    const next = beats[beats.indexOf(b) + 1];
    const span = (next ? next.at : lastSaid.length) - b.at;
    return { ...v, revealed: stepsRevealed(v.items, lastSaid.slice(b.at, spokenTo), span), ...decideHandlers(v, say) };
  };
  const hero = panel(beats[idx]);
  if (!hero) return null;
  return { hero, rail: railOf(beats, idx).map(panel).filter(Boolean) };
}

function groupLabel(name) {
  const ids = anatomyOf(name);
  if (!ids.length) return null;
  // the library's own spelling of the group, from the first region's filing
  const s = String(name || '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
