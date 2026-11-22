// THE GLASS OBEYS WORDS (7 Nov 2026, design/ROSE-STUDY.md §2 point 9).
//
// Rose: "maximise the headset share chart", "maximize that for me", "clear
// them, everything other than pumpkin", "bring up that VR report", "put it
// on screen". None of these need a model, and none should cost a turn: code
// matches them on the client before anything is sent, acts on the wall, and
// says a word back. A miss sends the words on to Nova exactly as before.
//
// Pure: given his words and the names of the panels on the glass, the
// command or null. The names are the panels' titles and labels as drawn.

const plain = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
// a panel's name, or words already cleaned (matchPanel): one opener and one closer off
const norm = (s) => plain(s)
  .replace(/^(?:(?:hey|hi|ok|okay)\s+)?nova[, ]*/, '').replace(/^(?:can|could|would|will) you\s+/, '').replace(/^(?:please|just)\s+/, '').replace(/\s+(?:please|for me|now|thanks|thank you)$/, '').trim();

// HOW PEOPLE REALLY SAY IT (22 Nov 2026): speech-to-text hands over "Can you,
// uh, can you maximise the headset share chart, please?" with or without its
// commas, capitals and final mark, and the demo he wants matched is exactly
// that. What is left once the stumbles and the manners are off is the command.
// Fillers go wherever they fall; openers and thanks come off the two ends as
// many times as they are stacked ("hey Nova, could you please ...").
// "you know" is a filler only between commas, at either end, or right after
// an opener: "do you know what this is" is a question and keeps its words.
const FILLER = /\b(?:uh+|um+|uhm+|er+m?|hm+|mm+|mhm|ah|eh)\b/g;
const LEAD = /^(?:(?:hey|hi|hello|ok|okay|alright|so|well|right|now|just|please|nova)|(?:can|could|would|will) you|go ahead and|i(?:'d| would)? (?:like|want|need) you to|you know(?! (?:what|how|where|who|why|when|if|whether|that)\b))\s+/;
const TRAIL = /\s+(?:please|for me|now|ok|okay|you know|thank(?:s| you)(?: (?:very|so) much| a lot)?)$/;
const said = (s) => {
  let q = plain(String(s || '').replace(/,\s*you know\s*,/gi, ' ')).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  for (let was = ''; was !== q;) { was = q; q = q.replace(LEAD, '').replace(TRAIL, '').trim(); }
  return q;
};

const THAT = /^(?:that|this|it|that one|this one|the big one|the first one|the last one)$/;
const ALL = /^(?:all|all of them|everything|them|them all|the (?:lot|rest|screen|glass|wall|panels|cards))$/;

const VERBS = [
  { cmd: 'tidy', re: /^(?:tidy(?: up| it| them| the (?:glass|wall|screen|panels))?|line (?:them|it) up|square (?:them|it) up|neaten (?:it|them|up)|arrange (?:them|the panels))$/ },
  { cmd: 'clear', re: /^(?:clear (?:the )?(?:screen|glass|wall|view|panels|everything|them|it|all)|clear(?: view| up)?|put (?:them|it|everything|the panels) away|close (?:them|everything|the panels|all of them)|take (?:them|it|everything) down|wipe (?:it|the screen))$/ },
  { cmd: 'restore', re: /^(?:put (?:it|that|them) back|bring (?:it|that|them) back|un ?maximi[sz]e|minimi[sz]e(?: (?:it|that))?|close (?:it|that)|go back|back)$/ },
  { cmd: 'history', re: /^(?:(?:show|open) (?:the )?history|history)$/ },
  // THE CAMERA (8 Nov 2026, Rose's pumpkin reel): open it, close it, box
  // what he names, say what he is holding
  { cmd: 'camera-on', re: /^(?:(?:open|turn on|switch on|start|bring up) (?:the |your |my )?camera|camera on|open (?:your |the )?eyes|look (?:at me|at the desk|through the camera))$/ },
  // the phone as the Mac's camera (lib/cameraRelay.js): said on the phone
  // it starts beaming; said on the Mac it looks through the phone
  { cmd: 'camera-beam', re: /^(?:be (?:my|the) camera|(?:stream|send|beam|share) (?:your|the|this|my) camera(?: to the mac)?|use (?:this|my) phone as (?:the|a|my) camera|phone camera on|become the camera)$/ },
  { cmd: 'camera-phone', re: /^(?:use (?:the|my) phone(?:'?s)? camera|use (?:the|my) phone|look through (?:the|my) phone|(?:switch|change) (?:the )?camera to (?:the |my )?phone|phone camera|camera source phone)$/ },
  { cmd: 'camera-mac', re: /^(?:use (?:the|your|this) (?:mac|macbook|laptop)(?:'?s)? camera|(?:switch|change) (?:the )?camera to (?:the )?(?:mac|macbook|laptop)|camera source mac)$/ },
  { cmd: 'camera-off', re: /^(?:(?:close|turn off|switch off|stop|kill) (?:the |your |my )?camera|camera off|close (?:your |the )?eyes)$/ },
  { cmd: 'see-held', re: /^(?:what (?:am i|'?m i) holding|what(?:'s| is) (?:this|that)(?: thing)?|what (?:do you|can you) see|look at (?:this|that)|can you see (?:this|what i'?m holding)|do you know what this is)$/ },
  { cmd: 'unbox', re: /^(?:clear (?:the )?boxes|(?:remove|hide|drop) (?:the |all the )?boxes|unbox (?:it|them|everything)|clear (?:the )?highlights?)$/ },
  // the words (8 Nov 2026, his call): the wall shows no spoken text by
  // default; "show the transcript" opens it, "hide the words" folds it
  { cmd: 'words', re: /^(?:show (?:me )?(?:the )?(?:words|text|transcript|subtitles|captions)|(?:words|subtitles|captions|transcript) on|what did you (?:just )?say|show (?:me )?what you said|expand the (?:words|text|transcript))$/ },
  { cmd: 'nowords', re: /^(?:hide (?:the )?(?:words|text|transcript|subtitles|captions)|(?:words|subtitles|captions|transcript) off|fold the (?:words|text|transcript)|collapse the (?:words|text|transcript))$/ },
];
const OBJECT_VERBS = [
  { cmd: 'highlight', re: /^(?:(?:highlight|box|outline|circle|mark|find|point (?:at|to)|show me) (?:the |a |my )?(.+?)(?: (?:in|on) (?:the )?(?:camera|view|frame|desk))?)$/ },
  // "expand on that" is always a question, never a panel
  { cmd: 'maximise', re: /^(?:maximi[sz]e|max|enlarge|expand(?! on\b)|open(?: up)?|zoom (?:in on|into|on)|blow up|focus on|show me)\s+(.+)$/ },
  { cmd: 'away', re: /^(?:put (.+?) away|close (.+)|hide (.+)|get rid of (.+)|drop (.+)|remove (.+)|lose (.+))$/ },
  { cmd: 'bring', re: /^(?:bring (?:back|up) (.+)|bring (.+) (?:back|up)|show (.+) again|put (.+) (?:back )?(?:up|on (?:the )?(?:screen|glass))|pull up (.+)|get (.+) back)$/ },
  { cmd: 'clear-except', re: /^(?:clear (?:them|everything|all|it|the (?:screen|glass|wall))(?: everything| all| them)?(?: other than| except(?: for)?| but| apart from| save) (.+)|keep (?:only |just )?(.+?)(?: and (?:clear|lose) the rest)?)$/ },
];

const firstGroup = (m) => m.slice(1).find((g) => g != null);

// THE EVERYDAY WAYS TO SAY LARGER AND SMALLER (22 Nov 2026). Said as the verbs
// the glass already has, so there is one place that finds the panel: "make it
// bigger" is "maximise it", "zoom out" is the restore it already does. Each
// pattern's first group is what he wants changed; the bare ones name nothing
// ("bigger", "zoom in", "full screen") and so mean the panel that is lit or
// came up last. Nothing here invents an action.
const DEGREE = '(?:(?:a lot|a bit|a little bit|a little|much|way|even|slightly|far) )?';
const ENLARGE = [
  new RegExp(`^make (.+?) ${DEGREE}(?:bigger|larger)$`),
  /^make (.+?) (?:full ?screen|full size)$/,
  /^blow (.+?) up$/,
  /^full ?screen (.+)$/,
];
const ENLARGE_BARE = new RegExp(`^(?:(?:go )?full ?screen|${DEGREE}(?:bigger|larger)|zoom in)$`);
const SMALLER = [
  new RegExp(`^make (.+?) ${DEGREE}smaller$`),
  /^(?:shrink|minimi[sz]e|un ?maximi[sz]e) (.+)$/,
];
const SMALLER_BARE = /^(?:smaller|zoom out|back to normal(?: size)?)$/;
const firstOf = (list, q) => { for (const re of list) { const m = q.match(re); if (m) return m[1]; } return null; };
// "about ..." and "on" + a bare noun name a subject, not a thing a camera can box
// ("on the desk" and "on my left" are places, so they stay)
const TOPIC = /\babout\b|\bon (?!(?:the|my|your|a|an|this|that|these|those|his|her|its|our|their)\b)/;

// BRING BACK WHAT I SHOWED YOU (8 Nov 2026): a past lookup by name, with a
// time ("from yesterday", "earlier") or the noun for what was shown ("that
// Busy Bar lookup", "the Flipper references"). The server's record answers
// (lib/wallRecall.js); the wall's own "bring up the chart" is not this.
const RECALL_VERB = /^(?:bring (?:up|back)|pull (?:up|back)|put (?:back )?up|show (?:me )?again|get (?:me )?back|recall|reopen|open (?:up|back)|show me)\s+(.+)$/;
const RECALL_TIME = /\b(?:from |on |of )?(?:yesterday|earlier(?: today)?|before|this morning|this afternoon|last night|last week|the other day|a few days ago|(?:on )?(?:mon|tues|wednes|thurs|fri|satur|sun)day)$/;
const RECALL_NOUN = /\b(?:lookup|search|report|brief(?:ing)?|research|document|doc|references?|pages|cards|results|wall|stuff)\b/;
export function recallCommand(words) {
  const q = said(words);
  const m = q.match(RECALL_VERB);
  if (!m) return null;
  const rest = m[1].trim();
  if (!RECALL_TIME.test(rest) && !RECALL_NOUN.test(rest)) return null;
  return { cmd: 'recall', raw: String(words || '').trim() };
}

/** The panel whose name his words name, by the most of his words in its
 *  title or label; null when nothing fits two words in three. Pure. */
export function matchPanel(words, panels) {
  // "the chart", "that chart" and "this video" name the panel the same way
  const w = norm(words).replace(/^(?:the|that|this)\s+/, '').replace(/\s+(?:one|card|panel|chart|video|page|quote|figure|note)$/, '').trim();
  if (!w) return null;
  const want = w.split(' ').filter((x) => x.length > 1);
  if (!want.length) return null;
  const KIND_WORDS = { chart: ['bars', 'metric', 'figure'], video: ['video', 'media'], page: ['page'], quote: ['quote'], figure: ['figure', 'metric'], number: ['figure', 'metric'], price: ['figure'], note: ['note', 'key'], list: ['list', 'steps'], map: ['map'], image: ['image'], picture: ['image'], body: ['body'], program: ['program'], session: ['session'] };
  let best = null;
  for (const p of panels || []) {
    const name = norm(`${p.title || ''} ${p.label || ''} ${p.name || ''} ${p.host || ''} ${p.channel || ''}`);
    const have = new Set(name.split(' '));
    let hit = want.filter((x) => have.has(x)).length;
    // "the chart", "the video": the kind alone names a panel when it is the only one of its kind
    const kindOnly = want.length === 1 && KIND_WORDS[want[0]];
    if (kindOnly && kindOnly.includes(p.kind)) hit = Math.max(hit, 1);
    const score = hit / want.length;
    if (score >= 2 / 3 && (!best || score > best.score)) best = { panel: p, score };
  }
  if (!best) return null;
  // a kind word alone must be unambiguous
  if (want.length === 1 && KIND_WORDS[want[0]]) {
    const same = (panels || []).filter((p) => KIND_WORDS[want[0]].includes(p.kind));
    if (same.length > 1 && !same.some((p) => norm(`${p.title} ${p.label}`).includes(want[0]))) return null;
  }
  return best.panel;
}

/**
 * The command in his words, or null to send them on.
 *   { cmd: 'tidy' | 'clear' | 'restore' | 'history' }
 *   { cmd: 'maximise' | 'away' | 'bring', key, title }
 *   { cmd: 'clear-except', key, title }
 * `panels` are the cards on the glass ({ key, title, label, kind, … }), oldest
 * first (the last came up last); `hero` is the one lit or open, for "that
 * one". `history` are past cards he may bring back ({ key, title, label, kind },
 * the one put away last first).
 *
 * "that" and "it", with no panel named, mean the lit panel, else the one that
 * came up last; with nothing on the glass they mean nothing, so the bare forms
 * ("bigger", "zoom in", "make it smaller") give null and the words go to Nova.
 */
export function glassCommand(words, { panels = [], hero = null, history = [] } = {}) {
  // the length cap is on what is left once the stumbles and the manners are
  // off: a long sentence is a question, a polite short one is not
  const q = said(words);
  if (!q || q.length > 80) return null;
  panels = panels || [];
  history = history || [];
  for (const v of VERBS) if (v.re.test(q)) return { cmd: v.cmd };
  // "that" with no panel named: the lit one, else the newest (see above)
  const newest = hero || panels[panels.length - 1] || null;
  // the way back from larger: the restore the glass already has, once there is something to shrink
  const smaller = SMALLER_BARE.test(q) ? 'it' : firstOf(SMALLER, q);
  if (smaller) return (THAT.test(smaller) ? newest : matchPanel(smaller, panels)) ? { cmd: 'restore' } : null;
  // a past lookup by name comes before the wall's own bring: "bring back the
  // Busy Bar lookup from yesterday" names nothing that is up
  const past = recallCommand(words);
  if (past && !matchPanel(past.raw.replace(/\b(?:from|on|of)\s+\S+$/, ''), [...panels, ...history])) return past;
  // "make it bigger", "zoom in", "full screen": the maximise verb, said plainly
  const bigger = ENLARGE_BARE.test(q) ? 'it' : firstOf(ENLARGE, q);
  const s = bigger ? `maximise ${bigger}` : q;
  for (const v of OBJECT_VERBS) {
    const m = s.match(v.re);
    if (!m) continue;
    const what = String(firstGroup(m) || '').replace(/\s+(?:for me|please|now)$/, '').trim();
    if (!what) continue;
    if (v.cmd === 'highlight') {
      // "show me the chart" is a panel; "highlight the pumpkin" is the camera
      if (matchPanel(what, panels)) { const t = matchPanel(what, panels); return { cmd: 'maximise', key: t.key, title: t.title || t.label }; }
      // "show me the bigger picture on leadership" is a request, not a thing on
      // the desk: a camera box wants an object, so a topic goes to Nova
      if (/^show me /.test(s) && TOPIC.test(what)) return null;
      return { cmd: 'highlight', what };
    }
    if (v.cmd === 'clear-except') {
      const keep = THAT.test(what) ? hero : matchPanel(what, panels);
      return keep ? { cmd: 'clear-except', key: keep.key, title: keep.title || keep.label } : null;
    }
    if (ALL.test(what)) return v.cmd === 'away' ? { cmd: 'clear' } : null;
    const pool = v.cmd === 'bring' ? [...panels, ...history] : panels;
    const target = THAT.test(what) ? (v.cmd === 'bring' ? history[0] || null : v.cmd === 'maximise' ? newest : hero) : matchPanel(what, pool);
    if (!target) return null;
    return { cmd: v.cmd, key: target.key, title: target.title || target.label };
  }
  return null;
}

/** The word said back, in code's voice. Pure. */
export function glassReceipt(cmd) {
  if (!cmd) return '';
  switch (cmd.cmd) {
    case 'tidy': return 'Tidied.';
    case 'clear': return 'Cleared.';
    case 'restore': return 'Back as it was.';
    case 'history': return 'History.';
    case 'words': return 'Words on.';
    case 'camera-on': return 'Camera on.';
    case 'camera-off': return 'Camera off.';
    case 'camera-beam': return 'Streaming to the Mac.';
    case 'camera-phone': return 'Looking through your phone.';
    case 'camera-mac': return 'Mac camera.';
    case 'unbox': return 'Boxes cleared.';
    case 'highlight': return '';   // code says what it boxed, from the count
    case 'see-held': return '';
    case 'nowords': return 'Words off.';
    case 'maximise': return `${cmd.title || 'That'}, larger.`;
    case 'away': return `${cmd.title || 'That'} is away.`;
    case 'bring': return `${cmd.title || 'That'} is back.`;
    case 'clear-except': return `Just ${cmd.title || 'that'} now.`;
    case 'recall': return '';   // the server's line, once it has looked (lib/wallRecall.js)
    default: return '';
  }
}
