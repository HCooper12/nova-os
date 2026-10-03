import { anatomyOf, sideFor, muscleVar } from './muscleHue.js';
import { DATA_KINDS, hostOf, marksOfHost, resolveMark, litNow, hueOf, finderWords } from './glassMarks.js';

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
  if (!resolved) return { ...spec, pending: FETCHED.has(spec.kind) || DATA_KINDS.has(spec.kind) };
  return { ...spec, ...resolved, pending: false };
}
const FETCHED = new Set(['image', 'media']);

// A DATA PANEL, ready to draw (3 Oct 2026): the server's build merged in,
// with the finder's hue and words. A record that could not be read is NO
// panel (null), never an empty frame; one still being built is its frame.
export function dataCard(spec, resolved) {
  const v = mergeVisual(spec, resolved);
  if (!v || !DATA_KINDS.has(v.kind)) return null;
  if (v.state === 'no-record') return null;
  return { ...v, hue: hueOf(v.by), finder: finderWords(v.by), lit: null };
}

// The host panel with one mark's light on it, or the panel unlit when the
// address is not there (dropped: nothing lights, nothing is guessed).
export function lightOn(card, mark) {
  if (!card || !card.data || !mark) return card;
  const r = resolveMark(card, mark);
  if (!r.ok) return card;
  return { ...card, lit: { ...r, hue: hueOf(r.by || card.by) } };
}

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
// "skip change N", and both go to Nova as plain sentences, which he turns
// into a PROPOSE on the rails exactly as he would from his voice. Nothing
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

// THE STAGE WITH ITS LIGHTS (3 Oct 2026). A mark relights the data panel
// already up rather than raising a new one, and lights only while the
// sentence after it is spoken (src/glassMarks.js litNow). The count the
// stage shows is the panel's lights ("2 of 3"), and its key is the panel's,
// so a relight never re-enters the panel.
export function dataStage(beats, idx, { visuals = {}, text = '', spokenTo = 0 } = {}) {
  const h = hostOf(beats, idx);
  if (h < 0) return null;
  const card = dataCard(beats[h].spec, visuals[beats[h].key]);
  if (!card) return { hero: null, h };
  const lights = marksOfHost(beats, h);
  const k = lights.indexOf(idx);
  const b = beats[idx];
  const hero = k >= 0 && litNow(b, text, spokenTo) ? lightOn(card, b.spec.mark) : card;
  return { hero, h, n: k >= 0 ? k + 1 : 0, total: lights.length, key: beats[h].key };
}

export function glassOf(st, app) {
  const beats = st.glassBeats || [];
  if (!beats.length) return null;
  const spokenTo = st.glassSpokenTo || 0;
  let idx = activeBeat(beats, spokenTo);
  // a mark with no panel to light is not a beat at all
  while (idx >= 0 && beats[idx].spec?.kind === 'mark' && hostOf(beats, idx) < 0) idx--;
  if (idx < 0) return null;
  const chat = st.voiceChat || [];
  const lastSaid = [...chat].reverse().find((m) => m.who !== 'you')?.text || '';
  const say = app && typeof app.askNova === 'function' ? (t) => app.askNova(t) : null;
  const panel = (b) => {
    if (DATA_KINDS.has(b.spec?.kind)) return dataCard(b.spec, (st.glassVisuals || {})[b.key]);
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
  const data = beats[idx].spec?.kind === 'mark' || DATA_KINDS.has(beats[idx].spec?.kind)
    ? dataStage(beats, idx, { visuals: st.glassVisuals || {}, text: lastSaid, spokenTo })
    : null;
  // the rail: the panels before this one, the marks folded into theirs
  const before = (end) => beats.slice(0, end).filter((b) => b.spec?.kind !== 'mark');
  if (data) {
    if (!data.hero) return null;   // the record could not be read: no panel
    const rail = before(data.h).slice(-4).reverse().map(panel).filter(Boolean);
    return { hero: data.hero, rail, n: data.n, total: data.total, key: data.key };
  }
  const hero = panel(beats[idx]);
  if (!hero) return null;
  return { hero, rail: before(idx).slice(-4).reverse().map(panel).filter(Boolean) };
}

function groupLabel(name) {
  const ids = anatomyOf(name);
  if (!ids.length) return null;
  // the library's own spelling of the group, from the first region's filing
  const s = String(name || '').trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
