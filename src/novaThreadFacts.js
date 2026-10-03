// THE NOVA THREAD, THE PURE FACTS (29 Sep 2026) — design/mockups/63-redesign-
// nova-r2.html, variation D · Rising, his pick with one amendment (the name at
// the top toggles a focus mode with the core as the page's centre). The screen
// is src/screens/NovaThread.jsx, its view model src/vals/valsNovaThread.js.
//
// Everything here is a plain function of its arguments, so the rules the page
// stands on are tests, not comments (server/test/novaThread.test.js): where
// the page opens, what a finished stage settles into, what the head says, what
// a door marker says, and the shape of a recording kept after a failure.
import { mergeVisual, dataCard, lightOn } from './glassBeats.js';
import { DATA_KINDS, hostOf, marksOfHost, resolveMark, sentenceAfter, sentenceIndexAt, finderOf } from './glassMarks.js';

// ------------------------------------------------------------ opening --

// WHERE THE PAGE OPENS. Messages opens on the first unread; this opens on the
// first line he has not seen, which is what happens when he talked from the
// Nova button on another page and then comes here. `seenAt` is the time of
// the newest line that was on screen the last time he was here. A line is
// unseen when it is newer than that and is not his own (he has seen what he
// said). No mark yet, or nothing new: -1, and the page opens on its foot.
export function firstUnseenIndex(lines, seenAt) {
  if (!Number.isFinite(seenAt)) return -1;
  const list = lines || [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (Number.isFinite(m?.at) && m.at > seenAt && m.who !== 'you') {
      // open at the start of that exchange: his question just before it, when
      // it is also new, belongs on screen with the answer
      let j = i;
      while (j > 0 && Number.isFinite(list[j - 1]?.at) && list[j - 1].at > seenAt) j--;
      return j;
    }
  }
  return -1;
}

// the newest time on the page, which becomes the mark when he has read it
export function newestAt(lines) {
  let t = null;
  for (const m of lines || []) if (Number.isFinite(m?.at) && (t == null || m.at > t)) t = m.at;
  return t;
}

// ------------------------------------------------------------ the stage --

// WHAT A SPOKEN REPLY PUT ON THE GLASS, KEPT WITH THE REPLY. The glass state
// (glassBeats, glassVisuals) is the app's and is cleared by the next question,
// so the finished reply carries a copy of what it showed. Only the beats and
// the visuals those beats name: small, and nothing the next turn needs.
export function glassSnapshot(beats, visuals) {
  const list = (beats || []).filter((b) => b && b.key && b.spec);
  if (!list.length) return null;
  const vis = {};
  for (const b of list) if (visuals && visuals[b.key]) vis[b.key] = visuals[b.key];
  return { beats: list.map((b) => ({ key: b.key, at: b.at, spec: b.spec })), visuals: vis };
}

// WHICH WORDS EACH LIGHT BELONGED TO (3 Oct 2026). A mark binds to the
// sentence it precedes; the snapshot keeps that sentence's index and its
// words beside the mark, so after a reload the settled card and Replay still
// light each part with the sentence that named it. `text` is the finished
// reply the beats' offsets were measured in. Mutates and returns the
// snapshot (it is fresh, and the line keeps it as is).
export function bindGlassSentences(glass, text) {
  const t = String(text || '');
  if (!glass?.beats?.length || !t) return glass;
  for (const b of glass.beats) {
    if (b.spec?.kind !== 'mark' && !(DATA_KINDS.has(b.spec?.kind) && b.spec.mark)) continue;
    const sp = sentenceAfter(t, b.at);
    b.sentence = sentenceIndexAt(t, sp.start);
    b.said = t.slice(sp.start, sp.end).trim().slice(0, 240);
  }
  return glass;
}

// The panels a snapshot draws, in the order they were shown. A fetched panel
// whose picture never arrived keeps its frame (mergeVisual's rule); a spec
// that merges to nothing is dropped.
//
// A DATA PANEL AND ITS LIGHTS (3 Oct 2026): each light is its own frame, the
// panel with that one part lit, in spoken order, carrying the words that
// named it (`said`). A light whose address is not there is no frame. The
// panel unlit is a frame only when none of its lights resolves; a record
// that could not be read is no frame at all.
export function panelsOf(glass) {
  if (!glass?.beats?.length) return [];
  const beats = glass.beats;
  const vis = glass.visuals || {};
  const out = [];
  beats.forEach((b, i) => {
    const kind = b.spec?.kind;
    if (kind === 'mark') return;   // drawn with its panel, below
    if (!DATA_KINDS.has(kind)) {
      const p = mergeVisual(b.spec, vis[b.key]);
      // a picture that never came is a frame on the settled card, not a spinner
      if (p) out.push(p.pending ? { ...p, pending: false } : p);
      return;
    }
    const card = dataCard(b.spec, vis[b.key]);
    if (!card || !card.data) return;
    const lit = [];
    for (const j of marksOfHost(beats, i)) {
      if (hostOf(beats, j) !== i) continue;
      const r = resolveMark(card, beats[j].spec.mark);
      if (!r.ok) continue;
      lit.push({ ...lightOn(card, beats[j].spec.mark), hostKey: b.key, said: beats[j].said || null, sentence: beats[j].sentence ?? null });
    }
    if (lit.length) out.push(...lit);
    else out.push({ ...card, hostKey: b.key });
  });
  return out;
}

// THE STAGE SETTLES INTO THE THREAD as a card: the last panel he showed,
// large; the others as small rows, newest first; and a count. Nothing is
// dropped, so "all three" on Replay is always the truth.
// A data panel settles UNLIT (nothing is being said any more), and each of
// its lights becomes a row in the order it was spoken, wearing its finder's
// hue (mockup 67, the settled card).
export function settleStage(panels) {
  const list = (panels || []).filter(Boolean);
  if (!list.length) return null;
  const last = list[list.length - 1];
  if (last.lit) {
    const lights = list.filter((p) => p.lit);
    const rest = list.filter((p) => !p.lit && p.hostKey !== last.hostKey).reverse();
    return { last: { ...last, lit: null, compact: true }, others: [...lights, ...rest], count: list.length };
  }
  return { last: DATA_KINDS.has(last.kind) ? { ...last, compact: true } : last, others: list.slice(0, -1).reverse(), count: list.length };
}

// Two short lines for a panel in a small row: what it is, and its gist in
// the words already on it. Never a new number.
// A panel's label arrives in capitals by contract (VIS "SHORT CAPS LABEL");
// this page reads in sentences, so an all-capitals label is shown as one.
export function sentenceCase(s) {
  const t = String(s || '').trim();
  if (!t || t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  const low = t.toLowerCase();
  return low.charAt(0).toUpperCase() + low.slice(1);
}

const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Mon 28 Sep" from a session's ISO date, read as his local day
export function sessionDay(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return Number.isFinite(d.getTime()) ? `${DAY3[d.getDay()]} ${d.getDate()} ${MON3[d.getMonth()]}` : String(isoDate || '');
}

export function gistOf(card) {
  if (!card) return null;
  const label = sentenceCase(card.label);
  const lead = (s) => String(s || '').trim();
  // a light's row is its own words, in its finder's hue
  if (card.lit) return { b: card.lit.short, s: card.lit.detail, hue: card.lit.hue || card.hue || null };
  switch (card.kind) {
    case 'session': return { b: lead(card.data?.routineName) || label || 'Session', s: card.data ? sessionDay(card.data.date) : '', hue: card.hue || null };
    case 'sources': {
      const n = (card.data?.sections || []).length;
      return { b: n === 1 ? 'One finding' : `${n} findings`, s: (card.data?.sections || []).map((x) => finderOf(x.agent).name).join(' · '), hue: null };
    }
    case 'metric': return { b: `${lead(card.value)}${card.unit ? ` ${card.unit}` : ''}`, s: label || lead(card.caption) };
    case 'key': return { b: label || 'The point', s: lead(card.caption) };
    case 'steps':
    case 'list': {
      const n = (card.items || []).length;
      return { b: label || (card.kind === 'steps' ? 'Steps' : 'List'), s: n ? `${n} ${n === 1 ? 'point' : 'points'}` : '' };
    }
    case 'bars': {
      const names = (card.bars || []).map((x) => x.name).filter(Boolean);
      return { b: label || 'Compared', s: names.length > 1 ? `${names[0]} to ${names[names.length - 1]}` : names[0] || '' };
    }
    case 'media': return { b: lead(card.title) || label, s: card.stamp ? `at ${card.stamp}` : lead(card.channel) };
    case 'image': return { b: label || 'Picture', s: lead(card.caption) };
    case 'body': return { b: lead(card.group || card.muscle) || label, s: lead(card.caption) };
    case 'program': return { b: lead(card.routineName) || label, s: (card.remove || []).length ? `${card.remove.length} out` : lead(card.group) };
    default: return { b: label || 'Panel', s: lead(card.caption) };
  }
}

// HIS SENTENCE, WITH THE SPOKEN WORDS LIT. `spokenTo` is how far the voice has
// got in the reply (glassSpokenTo); the lit part is the sentence being said up
// to there, the dim part the rest of that sentence and the next one. On the
// spoken path the text is revealed as it is heard, so `later` is usually
// empty, which is honest: nothing is shown ahead of the voice.
export function stageLine(text, spokenTo) {
  const t = String(text || '');
  if (!t.trim()) return null;
  const to = Math.max(0, Math.min(t.length, Number.isFinite(spokenTo) && spokenTo > 0 ? spokenTo : t.length));
  // the start of the sentence that holds the last spoken character
  let start = 0;
  const re = /[.!?](\s+)/g;
  let m;
  while ((m = re.exec(t)) && m.index + m[0].length < to) start = m.index + m[0].length;
  // the end of the sentence after the one being said
  let end = t.length;
  let seen = 0;
  re.lastIndex = to;
  while ((m = re.exec(t))) { seen++; end = m.index + 1; if (seen >= 2 || m.index + 1 >= to + 160) break; }
  if (seen === 0) end = t.length;
  // the seam between lit and dim keeps its own spacing: a voice that stops
  // mid-word must not print "T uesday"
  const lit = t.slice(start, to).trimStart();
  const later = t.slice(to, Math.max(to, end)).trimEnd();
  return { lit: lit.length > 280 ? `…${lit.slice(-280).replace(/^\S*\s/, '')}` : lit, later: later.slice(0, 200) };
}

// ------------------------------------------------------------ the head --

// SIX STATES, IN WORDS, AND IN A SHAPE. The core beside these words changes
// by form alone (NovaCore formOnly); the glyph is drawn from `key`. Colour
// never carries a state here: gold is waiting on his call, and red is a
// failure card, not a head.
export function stateOf({ listening = false, blind = false, hearing = false, busy = false, speaking = false, offline = false, demo = false, failed = false, lastReplyAt = null } = {}) {
  if (offline) return { key: 'offline', word: 'Offline', hint: lastReplyAt ? `last reply ${clock(lastReplyAt)}` : 'reconnect to ask Nova' };
  if (listening) return { key: 'listening', word: 'Listening', hint: blind ? 'tap Nova to send' : 'a pause sends' };
  if (hearing) return { key: 'thinking', word: 'Writing it down', hint: 'your Mac is listening back' };
  if (speaking) return { key: 'speaking', word: 'Speaking', hint: 'tap Nova to stop and talk' };
  if (busy) return { key: 'thinking', word: 'Thinking', hint: 'reading your vault' };
  if (failed) return { key: 'failed', word: 'Didn’t arrive', hint: 'try again, or type it' };
  return { key: 'turn', word: 'Your turn', hint: demo ? 'demo replies' : 'tap Nova or type' };
}

// how the core moves for each state: pace is the clock's rate, `grow` and
// `pulse` are read by the head's own frame loop, `still` stops it
export function coreFormOf(key) {
  switch (key) {
    case 'listening': return { pace: 1.4, grow: true, pulse: false, still: false, spin: false };
    case 'thinking': return { pace: 3, grow: false, pulse: false, still: false, spin: true };
    case 'speaking': return { pace: 1.2, grow: false, pulse: true, still: false, spin: false };
    case 'offline': return { pace: 1, grow: false, pulse: false, still: true, spin: false };
    default: return { pace: 1, grow: false, pulse: false, still: false, spin: false };
  }
}

// ------------------------------------------------------------ the lines --

const pad2 = (n) => String(n).padStart(2, '0');
export function clock(at) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const DAY = 86_400_000;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayLabel(at, now = Date.now()) {
  const a = startOfDay(at);
  const n = startOfDay(now);
  if (a === n) return 'Today';
  if (n - a <= DAY + 3_600_000 && n > a) return 'Yesterday';
  const d = new Date(at);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

// WHERE IT WAS SAID, when it was not said here. The Nova button on another
// page is the door he asked about (D · 8); Siri and the Action Button write
// the same record from the server. The page's name comes from the line
// itself (`on`, stamped when the line was written), never guessed from where
// he is now; without it the marker says only the door.
const DOORS = { siri: 'Said through Siri', 'action-button': 'Said with the Action Button' };
export function doorOf(m, nameOf = (k) => k) {
  if (!m) return null;
  if (m.via === 'presence') {
    const page = m.on && m.on !== 'voice' ? nameOf(m.on) : null;
    return { key: `presence:${m.on || ''}`, text: page ? `Said on ${page}, with the Nova button` : 'Said with the Nova button' };
  }
  if (DOORS[m.via]) return { key: m.via, text: DOORS[m.via] };
  return null;
}

// PROVENANCE IS NOT BUILT HERE. A separate build is adding `by` / `from`
// authorship to record rows; this is the seam it plugs into. With neither
// field on the line it is null and the byline slot renders nothing.
export function bylineOf(m) {
  if (!m || (!m.by && !m.from)) return null;
  return { by: m.by ? String(m.by) : null, from: m.from ? String(m.from) : null };
}

// The thread as rows: a day heading where the day changes, a door marker at
// the start of a run said through another door, the lines, and the kept
// recordings in time order among them. Pure: the component draws it.
export function threadRows(lines, { takes = [], now = Date.now(), nameOf } = {}) {
  const items = [
    ...(lines || []).map((m, i) => ({ type: 'line', at: m.at, i, m })),
    ...(takes || []).map((t) => ({ type: 'take', at: t.at, t })),
  ];
  // stable by time; a line with no clock keeps its place (it came first)
  const sorted = items.map((x, k) => ({ x, k }))
    .sort((a, b) => ((Number.isFinite(a.x.at) ? a.x.at : -Infinity) - (Number.isFinite(b.x.at) ? b.x.at : -Infinity)) || (a.k - b.k))
    .map(({ x }) => x);
  const rows = [];
  let lastDay = null;
  let lastDoor = null;
  for (const x of sorted) {
    if (Number.isFinite(x.at)) {
      const day = dayLabel(x.at, now);
      if (day !== lastDay) { rows.push({ type: 'day', key: `day:${day}:${x.at}`, text: day }); lastDay = day; lastDoor = null; }
    }
    if (x.type === 'line') {
      const door = doorOf(x.m, nameOf);
      if (door && door.key !== lastDoor) rows.push({ type: 'door', key: `door:${door.key}:${x.at}`, text: door.text });
      lastDoor = door ? door.key : null;
      rows.push({ type: 'line', key: `line:${x.i}:${x.at ?? 'x'}:${x.m.who}`, i: x.i });
    } else {
      lastDoor = null;
      rows.push({ type: 'take', key: `take:${x.t.id}`, id: x.t.id });
    }
  }
  return rows;
}

// ------------------------------------------------ the recording, kept --

// THE KEPT RECORDING'S CONTRACT (decided 29 Sep: "the recording is KEPT after
// a failed transcription so Try again resends it"). What useDictation hands
// onKept becomes one of these; the thread draws it as his own playable bubble
// with a red card under it. It is his audio: it stays on this phone until the
// words arrive (Try again), he types them instead, or he deletes it.
export function keptTake(raw, id) {
  if (!raw || !raw.blob) return null;
  const ms = Math.max(0, Number(raw.ms) || 0);
  return {
    id: String(id || raw.id || `take-${raw.at || Date.now()}`),
    at: Number.isFinite(raw.at) ? raw.at : Date.now(),
    ms, bytes: Number(raw.bytes) || raw.blob.size || 0,
    vad: ['heard', 'silent', 'blind'].includes(raw.vad) ? raw.vad : '',
    reason: String(raw.reason || 'the Mac could not write that down'),
    tries: Math.max(1, Number(raw.tries) || 1),
    blob: raw.blob,
  };
}

// 0:09 — a take's length the way a voice memo says it
export function takeClock(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

// The red card's words: what happened, and that Try again sends the same
// seconds. A timeout is named as one; any other reason is the Mac's own.
export function failWords(take) {
  if (!take) return null;
  const secs = Math.max(1, Math.round((take.ms || 0) / 1000));
  const r = String(take.reason || '');
  const why = /timeout|timed out|abort/i.test(r) ? 'Your Mac didn’t answer in 30 s.'
    : /not connected/i.test(r) ? 'Nova isn’t connected to your Mac.'
    : `Your Mac said: ${r.replace(/[.\s]+$/, '')}.`;
  return {
    title: take.tries > 1 ? 'Still couldn’t write that down' : 'Nova couldn’t write that down',
    body: `${why} The recording above is kept: Try again sends the same ${secs} second${secs === 1 ? '' : 's'}.`,
  };
}

// The store's rules, apart from its storage: newest last, at most `cap`
// kept (the oldest goes first), one id once.
export function takesAdd(list, take, cap = 8) {
  if (!take) return list || [];
  const rest = (list || []).filter((t) => t.id !== take.id);
  return [...rest, take].sort((a, b) => a.at - b.at).slice(-cap);
}
export function takesRemove(list, id) { return (list || []).filter((t) => t.id !== id); }
export function takesPatch(list, id, patch) { return (list || []).map((t) => (t.id === id ? { ...t, ...patch } : t)); }

// Is the newest thing on the page a kept recording? Then the head says so.
export function failedLast(lines, takes) {
  const t = (takes || []).reduce((a, x) => (a == null || x.at > a ? x.at : a), null);
  if (t == null) return false;
  const l = newestAt(lines);
  return l == null || t >= l;
}
