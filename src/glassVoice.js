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

const norm = (s) => String(s || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/^(?:(?:hey|hi|ok|okay)\s+)?nova[, ]*/, '').replace(/^(?:can|could|would|will) you\s+/, '').replace(/^(?:please|just)\s+/, '').replace(/\s+(?:please|for me|now|thanks|thank you)$/, '').trim();

const THAT = /^(?:that|this|it|that one|this one|the big one|the first one|the last one)$/;
const ALL = /^(?:all|all of them|everything|them|them all|the (?:lot|rest|screen|glass|wall|panels|cards))$/;

const VERBS = [
  { cmd: 'tidy', re: /^(?:tidy(?: up| it| them| the (?:glass|wall|screen|panels))?|line (?:them|it) up|square (?:them|it) up|neaten (?:it|them|up)|arrange (?:them|the panels))$/ },
  { cmd: 'clear', re: /^(?:clear (?:the )?(?:screen|glass|wall|view|panels|everything|them|it|all)|clear(?: view| up)?|put (?:them|it|everything|the panels) away|close (?:them|everything|the panels|all of them)|take (?:them|it|everything) down|wipe (?:it|the screen))$/ },
  { cmd: 'restore', re: /^(?:put (?:it|that|them) back|bring (?:it|that|them) back|un ?maximise|minimise(?: (?:it|that))?|minimize(?: (?:it|that))?|close (?:it|that)|go back|back)$/ },
  { cmd: 'history', re: /^(?:(?:show|open) (?:the )?history|history)$/ },
];
const OBJECT_VERBS = [
  { cmd: 'maximise', re: /^(?:maximi[sz]e|max|enlarge|expand|open(?: up)?|zoom (?:in on|into|on)|make (?:\S+ )?bigger|blow up|focus on|show me)\s+(.+)$/ },
  { cmd: 'away', re: /^(?:put (.+?) away|close (.+)|hide (.+)|get rid of (.+)|drop (.+)|remove (.+)|lose (.+))$/ },
  { cmd: 'bring', re: /^(?:bring (?:back|up) (.+)|bring (.+) (?:back|up)|show (.+) again|put (.+) (?:back )?(?:up|on (?:the )?(?:screen|glass))|pull up (.+)|get (.+) back)$/ },
  { cmd: 'clear-except', re: /^(?:clear (?:them|everything|all|it|the (?:screen|glass|wall))(?: everything| all| them)?(?: other than| except(?: for)?| but| apart from| save) (.+)|keep (?:only |just )?(.+?)(?: and (?:clear|lose) the rest)?)$/ },
];

const firstGroup = (m) => m.slice(1).find((g) => g != null);

/** The panel whose name his words name, by the most of his words in its
 *  title or label; null when nothing fits two words in three. Pure. */
export function matchPanel(words, panels) {
  const w = norm(words).replace(/^the\s+/, '').replace(/\s+(?:one|card|panel|chart|video|page|quote|figure|note)$/, '').trim();
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
 * `panels` are the cards on the glass ({ key, title, label, kind, … }); `hero`
 * is the one lit or last said, for "that one". `history` are past cards he
 * may bring back ({ key, title, label, kind }).
 */
export function glassCommand(words, { panels = [], hero = null, history = [] } = {}) {
  const q = norm(words);
  if (!q || q.length > 80) return null;
  for (const v of VERBS) if (v.re.test(q)) return { cmd: v.cmd };
  for (const v of OBJECT_VERBS) {
    const m = q.match(v.re);
    if (!m) continue;
    const what = String(firstGroup(m) || '').replace(/\s+(?:for me|please|now)$/, '').trim();
    if (!what) continue;
    if (v.cmd === 'clear-except') {
      const keep = THAT.test(what) ? hero : matchPanel(what, panels);
      return keep ? { cmd: 'clear-except', key: keep.key, title: keep.title || keep.label } : null;
    }
    if (ALL.test(what)) return v.cmd === 'away' ? { cmd: 'clear' } : null;
    const pool = v.cmd === 'bring' ? [...panels, ...history] : panels;
    const target = THAT.test(what) ? (v.cmd === 'bring' ? history[0] || null : hero) : matchPanel(what, pool);
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
    case 'maximise': return `${cmd.title || 'That'}, larger.`;
    case 'away': return `${cmd.title || 'That'} is away.`;
    case 'bring': return `${cmd.title || 'That'} is back.`;
    case 'clear-except': return `Just ${cmd.title || 'that'} now.`;
    default: return '';
  }
}
