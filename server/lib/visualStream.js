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
import { needsFetch, resolveVisual } from './visualResolve.js';

export function attachVisuals(job, { vaultPath = null, concurrency = 3, allowCaptions = true } = {}) {
  job.visuals = {};
  const seen = new Set();
  const queue = [];
  let inFlight = 0;

  const pump = () => {
    while (inFlight < concurrency && queue.length) {
      const b = queue.shift();
      inFlight++;
      // the cover lands first, the timecode fills into the same card after
      Promise.resolve(resolveVisual(b.spec, { vaultPath, allowCaptions }, (partial) => { job.visuals[b.key] = partial; }))
        .then((v) => { job.visuals[b.key] = v; })
        .catch(() => { /* resolveVisual swallows its own, but never trust that */ })
        .finally(() => { inFlight--; pump(); });
    }
  };

  // Called on every delta. Cheap: the parse is linear over a few KB, and a
  // beat is only ever queued once.
  job.onPartial = (text) => {
    let beats;
    try { ({ beats } = parseVisualStream(text)); } catch { return; }
    for (const b of beats) {
      if (seen.has(b.key)) continue;
      seen.add(b.key);
      if (needsFetch(b.spec)) queue.push(b);   // typographic panels need nothing fetched
    }
    pump();
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
