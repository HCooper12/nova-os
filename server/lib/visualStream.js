// RESOLVING THE GLASS WHILE THE MODEL IS STILL WRITING.
//
// The runway is the whole trick. A reply takes seconds to generate and more
// seconds to speak; a podcast cover takes about one to fetch. So the moment a
// `VIS {…}` directive appears in the stream — long before the sentence it
// belongs to is spoken — its picture is already being fetched. By the time
// Nova reaches those words the panel is usually whole, which is what he asked
// for: "ideally visuals should present simultaneously with the discussion."
//
// Results land on the job itself, so the poll the client already runs every
// 150ms carries them. No second endpoint, no second round trip.
import { parseVisualStream } from '../../src/visualBeats.js';
import { hostOf, resolveMark, DATA_KINDS } from '../../src/glassMarks.js';
import { needsFetch, resolveVisual } from './visualResolve.js';

export function attachVisuals(job, { vaultPath = null, concurrency = 3, allowCaptions = true, log = (m) => console.warn(m) } = {}) {
  job.visuals = {};
  // EVERY ADDRESS CHECKED (3 Oct 2026). A mark names a part of the data panel
  // already up; code checks it against the data it built, and one that is
  // not there is dropped: never shown, and logged here with the reason.
  // `markChecks` is the verdict per mark beat, for anyone who wants to see
  // what was dropped; the client resolves with the same function
  // (src/glassMarks.js), so the light it draws is the one checked here.
  job.markChecks = {};
  const seen = new Set();
  const queue = [];
  let inFlight = 0;
  let beatsNow = [];

  const checkMarks = () => {
    beatsNow.forEach((b, i) => {
      const carries = b.spec.kind === 'mark' || (DATA_KINDS.has(b.spec.kind) && b.spec.mark);
      if (!carries || job.markChecks[b.key]) return;
      const h = hostOf(beatsNow, i);
      if (h < 0) {
        job.markChecks[b.key] = { ok: false, why: 'no data panel is up for this mark to light' };
        log(`[glass] dropped a mark: ${job.markChecks[b.key].why}`);
        return;
      }
      const host = job.visuals[beatsNow[h].key];
      if (!host) return;   // the panel is still being built: check when it lands
      const verdict = host.state === 'no-record'
        ? { ok: false, why: `the panel could not be built (${host.reason})` }
        : resolveMark(host, b.spec.mark);
      job.markChecks[b.key] = verdict.ok ? { ok: true, name: verdict.name } : { ok: false, why: verdict.why };
      if (!verdict.ok) log(`[glass] dropped a mark: ${verdict.why}`);
    });
  };

  const pump = () => {
    while (inFlight < concurrency && queue.length) {
      const b = queue.shift();
      inFlight++;
      // the cover lands first, the timecode fills into the same card after
      Promise.resolve(resolveVisual(b.spec, { vaultPath, allowCaptions, consult: () => job.consult }, (partial) => { job.visuals[b.key] = partial; }))
        .then((v) => { job.visuals[b.key] = v; if (DATA_KINDS.has(b.spec.kind)) checkMarks(); })
        .catch(() => { /* resolveVisual swallows its own, but never trust that */ })
        .finally(() => { inFlight--; pump(); });
    }
  };

  // Called on every delta. Cheap: the parse is linear over a few KB, and a
  // beat is only ever queued once.
  job.onPartial = (text) => {
    let beats;
    try { ({ beats } = parseVisualStream(text)); } catch { return; }
    beatsNow = beats;
    for (const b of beats) {
      if (seen.has(b.key)) continue;
      seen.add(b.key);
      if (needsFetch(b.spec)) queue.push(b);   // typographic panels need nothing fetched
    }
    pump();
    checkMarks();
  };
  return job;
}

// WHAT THE AGENTS ARE TOLD. One contract, used by Ask Nova, the Coach and the
// Leader, so the three can never drift into different glass vocabularies.
// Pairs with src/visualBeats.js — change the kinds in one and you must change
// them in the other.
export const GLASS_CONTRACT = `THE RUNNING GLASS — panels that follow your sentences.

(This is not the single CARD line. CARD puts ONE card up at the end, for an answer that has one shape — a figure, a name. The running glass is for an answer with MOVEMENTS, which is most of what you say to him. Use one or the other, never both: if your reply carries VIS lines, do not also end it with CARD.)

He listens to your replies aloud, and a long answer is hard to hold by ear — that is the whole problem this solves. So put things on screen AS YOU TALK. On its own line, immediately before the prose it belongs to, write:

VIS {"kind":"…","label":"SHORT CAPS LABEL","caption":"one short line"}

Everything after that line, until the next one, is spoken while that panel is on the glass.

REQUIRED: any reply longer than about three sentences carries at least one VIS line, and a reply with several movements carries one per movement — roughly every two to four sentences. He asked for this specifically after a long answer he could not follow by ear. A long spoken answer with nothing on the glass is the failure, so when in doubt use a "key" panel: it needs nothing fetched and always lands.

KINDS
- key    {"label":"THE IDEA","caption":"the idea, in one line"} — the phrase he should be looking at. Your default; it needs nothing fetched and always lands.
- steps  {"label":"THIS WEEK","items":["first","second"]} — a list that BUILDS: item one is alone on screen while you say it, two joins it when you reach two. Use it for deliverables and takeaways.
- image  {"label":"HOW IT WORKS","query":"what to search for"} — a diagram, a mechanism, a researcher's face. Code searches Wikimedia and the pages your research actually cited. Use it only where a picture genuinely explains.
- media  {"label":"WORTH HEARING","title":"the episode or talk, as searchable as you can make it","moment":"the words spoken around the idea you are citing"} — a podcast, talk or video you refer to. Code finds it, puts its cover up, and marks the exact timecode when his vault or the captions can prove one. Put the IDEA in "moment", not the title — that is what finds the point.
- metric {"label":"PROTEIN TODAY","value":"84","unit":"g"} — one number you just said out loud.
- bars   {"label":"HARD SETS","bars":[{"name":"chest","value":6},{"name":"back","value":18}]} — a few comparable numbers.
- list   {"label":"THE THREE","items":["a","b"]} — a few named things, shown together.
- body   {"label":"CHEST","muscle":"Chest","caption":"12 sets a week — not a priority"} — his 3D body rises with that muscle lit and the camera eases in. Use the library's group names exactly: Chest, Back, Shoulders, Biceps, Triceps, Quads, Hamstrings, Glutes, Calves, Abs, Forearms. A name outside that list lights nothing.
- program {"label":"PUSH DAY","routine":"Push","muscle":"Triceps","remove":["Cable Overhead Tricep Extension"],"keep":["Rope Overhead Tricep Extension"]} — his program as he wrote it, every exercise for that muscle lit; the ones in "remove" blink, strike through and leave as you explain why; "keep" is the one the evidence protects. Names must be the exact exercise names from his routines; a name that is not in that routine simply does not move.
- steps with "decide":true {"label":"WHAT I WOULD CHANGE","decide":true,"items":["Cap RPE at 8–9","Move arm work to positions 1–4"]} — the numbered changes he is being asked about. Each arrives as you reach it and carries a light tick and a cross; the panel carries one "do all". Use this ONLY for changes to his program that he can accept; a plain list of points is "steps" without it.

- session {"panel":"session","date":"2026-09-28","by":"coach"} — ONE workout he logged, drawn by code from his session record: every lift, every set with its kg, reps and RPE, and the program's target for each lift. Name it by its date ("date":"YYYY-MM-DD") or as the last of a routine ("routine":"Push"). "by" says whose finding it is: "coach", "researcher", "librarian", "leader", or "nova" for your own; the lit part wears that agent's colour.
- mark {"mark":{"lift":"Bench press","set":3}} — lights ONE part of the data panel already up, for the one sentence right after it. On a session: {"lift":"<exact lift name from his log>"} lights the lift; add "set":3 for one set; "field":"kg" for its weight; "target":true for its weight against the program's target reps. The light goes out when that sentence ends.
- sources {"panel":"sources","by":"nova"} — after you consulted, ONE panel composed from the agents who answered, each part built from that agent's own record (the Coach's lift trend from his log, the Librarian's passage from his note, the Researcher's claim and its source count). Light a part with {"mark":{"section":"coach"}} (or "researcher", "librarian"); {"mark":{"section":"librarian","quote":true}} lights the exact words the Librarian quoted, when code finds them in his note.

WHEN A DATA PANEL APPEARS (his rule, word for word in spirit): only when there is something to point at: a number he should see, two things compared, or a place in his own record. A plain sentence gets no panel. Write the panel line, then the mark for your first sentence, each on its own line, before that sentence; then one mark line before each further sentence that points at a part of it. One thing lit at a time, only while you say it, and say in words what is lit ("your third set", "the Librarian's passage"). Every number on it comes from his records: name only sessions, lifts and sets you have actually read in his log, and never state a number the panel does not hold. Code checks every address and drops one that is not there. If the record cannot be read, raise no panel and say so plainly.

WALKING HIM THROUGH A REPORT (his ask, 21 Sep — "just like Jarvis"): open with a metric for the one number the verdict rests on; then, for each muscle the report judges, a body panel while you say what the figure means; then a program panel for the routine it comes from, with the exercise you would drop in "remove" and the one the evidence protects in "keep", while you explain the change; end with the numbered changes as steps with "decide":true, one per item, in the order you say them. He can tick, cross, say "make all of them", or argue — and any yes reaches you as a plain sentence, which you turn into a PROPOSE routine-edit exactly as always.

RULES
- A panel may only restate what you are SAYING. Never put a fact on the glass that is not in your words.
- Never invent a source. image and media are searches, not citations: if you are not certain the thing exists, use key.
- EVERY panel carries a "label": two to four words, in caps. It is the heading on the glass. Caption: one short line.
- One line, valid JSON. A malformed directive costs its panel, and he sees nothing where something should have been.`;

// HOW IT READS AND SOUNDS. The Coach and the Leader were built as writing
// agents; their answers now land in a log that is SPOKEN aloud. His 10 Sep
// report: "when conversing nova should sound and act like a normal human not
// reading things in parentheses and stuff like that."
//
// The code strips markdown either way (src/spokenProse.js) — this is so the
// sentences are shaped for the ear in the first place, which stripping cannot
// do. A heading with the hashes removed is still a heading.
export const SPOKEN_REGISTER = `HE HEARS THIS, HE DOES NOT READ IT.

Your reply is spoken aloud and shown in a running conversation log. Write it the way you would SAY it to him:
- No markdown at all. No ## headings, no **bold**, no *italics*, no bullet characters, no horizontal rules, no code fences. If a point deserves emphasis, say why it matters instead of styling it.
- Name a vault page in words — "your Purpose Shift page" — never as [[Purpose Shift in Difficult Conversations]].
- No citation furniture, no asides in parentheses, no "(see above)". If it is worth saying, say it in the sentence.
- Quote a source the way a person quotes one: say whose words they are, then the words. Do not wrap them in punctuation he would have to see.
- Short sentences. One idea each. A long answer is fine — a dense one is not.
This is not a request to say less. It is a request to say it out loud.`;
