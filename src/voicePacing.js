// HOW SOON NOVA STARTS TALKING, AND THAT HE NEVER GOES QUIET (18 Oct 2026).
// Pure helpers for the streamed voice in App.jsx (attachAskPoll and the
// speakTtsSentence queue), kept out of the component so they can be tested.
//
// The audit behind them, from the server log and the turn receipts:
//   - every sentence's /api/tts fired at once; the serial Kokoro sidecar
//     answered six and refused the rest, so 469 sentences in a week showed
//     as text with no voice. ttsFetchesToStart keeps two in flight, in order.
//   - a reply that opens with a document said nothing until the document
//     closed: 12.6 to 18.6 s of silence on four turns. artifactOpenerLine
//     gives code ONE line to say the moment the document starts.
//   - the first sound waited for the first full stop. firstClauseCut lets a
//     long first sentence start on its first clause.

import { parseArtifactBlocks } from './artifactBlocks.js';
import { parseVisualStream } from './visualBeats.js';

const TOKEN_RE = /\[\[artifact:[^\]]*\]\]/gi;
const wordCount = (s) => String(s || '').replace(TOKEN_RE, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

/**
 * Where to cut the FIRST sentence of a reply so the first sound starts on its
 * first clause. `text` is what has arrived of the reply so far (not yet
 * spoken). Returns the length of the clause to speak now, or 0 to wait.
 *
 * The cut is at the first comma, semicolon or colon that is followed by a
 * space (so "1,000" and "6:30" never split), only once the sentence so far
 * has passed `minWords`, and only when the clause before it has at least
 * `minFirst` words: "Yes, sir." is never cut, and a two-word fragment is not
 * worth its own breath.
 */
export function firstClauseCut(text, { minWords = 8, minFirst = 4 } = {}) {
  const s = String(text || '');
  // the first sentence, or everything so far when it has not ended yet
  const end = s.search(/[.!?](?=\s|$)/);
  const sentence = end === -1 ? s : s.slice(0, end + 1);
  if (wordCount(sentence) < minWords) return 0;
  const re = /[,;:](?=\s)/g;
  let m;
  while ((m = re.exec(sentence))) {
    const head = sentence.slice(0, m.index + 1);
    if (wordCount(head) < minFirst) continue;
    // the remainder must be worth saying too, or the cut buys nothing
    if (end !== -1 && wordCount(sentence.slice(m.index + 1)) < 2) return 0;
    const ws = s.slice(m.index + 1).match(/^\s*/)[0].length;
    return m.index + 1 + ws;
  }
  return 0;
}

const UNTITLED = 'Untitled document';
const cleanTitle = (t) => String(t || '').replace(/\s+/g, ' ').trim().replace(/[.!?:;,\s]+$/, '').slice(0, 90);

/**
 * When a reply OPENS with a document, the one line code says at once so the
 * wait is not silence. Returns null when the reply does not open with a
 * document (prose before it is spoken first, as today), else
 * { line, titled, settled }:
 *   titled  — the header's title has arrived and the line names it
 *   settled — the header has finished arriving (a missing title will not come)
 * The caller says the untitled line only once the header has settled or it
 * has waited a beat for the title.
 */
export function artifactOpenerLine(partial) {
  const r = parseArtifactBlocks(String(partial || ''), { final: false });
  const header = r.blocks[0]?.header || r.pending;
  if (!header) return null;
  const at = r.text.search(TOKEN_RE);
  const before = at === -1 ? r.text : r.text.slice(0, at);
  // a VIS line ahead of the document is withheld, never spoken: not prose
  if (parseVisualStream(before).text.trim()) return null;
  const settled = !!r.blocks.length || (r.pending && r.pending.title !== '');
  const title = cleanTitle(header.title);
  if (title && title !== UNTITLED) return { line: `I've put that in a document: ${title}.`, titled: true, settled: true };
  return { line: "I'm writing that up as a document.", titled: false, settled };
}

/**
 * Which queued sentences may start their /api/tts fetch now. At most `max`
 * in flight, taken in queue order. A sentence the engine refused (400/503)
 * waits in state 'retry' and goes again only when it heads the queue, the
 * sentence before it has finished playing, and its retry time has come.
 * Entries: { fetchState: 'waiting'|'fetching'|'retry'|'ok'|'failed'|'none', retryAt }.
 */
export function ttsFetchesToStart(queue, { max = 2, inFlight = 0, playing = false, now = Date.now() } = {}) {
  const out = [];
  let n = inFlight;
  (queue || []).forEach((e, i) => {
    if (n >= max || !e) return;
    if (e.fetchState === 'waiting') { out.push(e); n += 1; return; }
    if (e.fetchState === 'retry' && i === 0 && !playing && now >= (e.retryAt || 0)) { out.push(e); n += 1; }
  });
  return out;
}

/** How an /api/tts failure is handled: 'retry-later' | 'retry-now' | 'give-up'. */
export function ttsFailureAction(err, tries) {
  if (tries >= 2) return 'give-up';
  const status = err?.status;
  if (status === 400 || status === 503) return 'retry-later';
  if (status) return 'give-up'; // a 401 or a 409 is not going to change in a second
  return 'retry-now'; // no status: the request itself dropped (a cellular blip)
}

/**
 * WHERE TO CARRY ON SPEAKING when the text under the voice changed (1 Nov
 * 2026). The speech path counts characters it has said; a Coach rewrite
 * REPLACES the answer mid-stream, and the old count then pointed into the
 * middle of a different text: Nova said fragments, repeated phrases, and
 * once read a document's script. `said` is what was spoken (a prefix of the
 * old text), `next` the new text. Unchanged prefix → the same count; else
 * back to the last sentence end both texts share, so the first sentence
 * that differs is said whole and nothing already said is said again. Pure.
 */
export function resumeAt(said, next, spokenUpTo = String(said || '').length) {
  const a = String(said || '');
  const b = String(next || '');
  if (!a || b.startsWith(a)) return spokenUpTo;
  // the text under the voice was rearranged (the server's fold moved a
  // question, prefixed a line): carry on after the last sentence he heard,
  // wherever it now sits. 1 Nov 2026, his screenshot: the whole Coach reply
  // was said and shown three times because this rewound to the start.
  const units = a.match(/[\s\S]*?(?:[.!?]+["'”’)\]]*(?=\s|$)|\n|$)/g) || [];
  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i].trim();
    if (u.length < 12) continue;
    const at = b.indexOf(u);
    if (at !== -1) return at + u.length;
    break;
  }
  // a real rewrite: back to the last sentence end both texts share, so the
  // first sentence that differs is said whole and nothing is said again
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  let cut = 0;
  for (const m of b.slice(0, n).matchAll(/[.!?]["'”’)]*\s+|\n/g)) cut = m.index + m[0].length;
  return cut;
}
