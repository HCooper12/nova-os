// THE CODE SCREEN'S ARITHMETIC, pure (round 3, mockup 89). Everything the
// screen says about projects, sessions, files and runs is computed here from
// the records the server returns, so it can be tested without React and
// without a server (server/test/codeModel.test.js). Nothing here invents a
// value: a count is a count of real records, and when there is nothing to
// count the words say so.

export const STALE_MS = 12 * 60 * 60 * 1000; // claudeSessions.js STALE_AFTER_MS
export const MESSAGE_MIN = 8;                // codeChanges.js MESSAGE_MIN

// The families Nova already knows by folder (claudeSessions.js projectOf).
// Each owns one hue; Wren is Science Atlas's assistant and wears the same
// hue, drawn outlined. Nova OS and the Vault are where the Builder works.
export const PROJECTS = {
  nova: { key: 'nova', title: 'Nova OS', hue: 'var(--nv-cy)', glyph: 'nova', workspace: 'repo', folder: 'nova-os' },
  atlas: { key: 'atlas', title: 'Science Atlas', hue: 'var(--nv-m-quads)', glyph: 'atlas', folder: 'Atomic_Hub' },
  wren: { key: 'wren', title: 'Wren', hue: 'var(--nv-m-quads)', glyph: 'wren', kin: true, folder: 'atlas-partner' },
  vault: { key: 'vault', title: 'Vault', hue: 'var(--nv-m-mobility)', glyph: 'vault', workspace: 'vault' },
  builds: { key: 'builds', title: 'Builds', hue: 'var(--nv-m-triceps)', glyph: 'build' },
};
const BY_FOLDER = { 'nova-os': 'nova', Atomic_Hub: 'atlas', 'atlas-partner': 'wren' };
export const WORKSPACE_PROJECT = { repo: 'nova', vault: 'vault' };

/** Which tile a session belongs to: a known family, or its own folder. */
export function projectKeyOf(project) {
  const k = project?.key || '';
  return BY_FOLDER[k] || `p:${k || 'somewhere'}`;
}
export function projectInfo(key, label = '') {
  if (PROJECTS[key]) return PROJECTS[key];
  return { key, title: label || key.replace(/^p:/, '').replace(/[-_]+/g, ' '), hue: 'var(--nv-sum-ink2, var(--nv-ink60))', glyph: 'folder' };
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const countWord = (n) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "9:41", "10:04": the clock the mockup draws, local time, no seconds. */
export function clock(at) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function minutesWords(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'under a minute';
  if (m < 90) return `${m} min`;
  return `${Math.round(m / 60)} h`;
}

// ------------------------------------------------------------- sessions

/** The quiet bar: how long nobody has spoken, against the 12 hours after which a session counts as left open. */
export function quietOf(s) {
  if (s.state === 'working') return { live: true, words: 'talking now' };
  const ms = Number.isFinite(s.quietMs) ? s.quietMs : null;
  if (ms == null) return { live: false, q: s.state === 'left-open' || s.state === 'gone' ? 1 : 0, over: s.state === 'left-open' || s.state === 'gone', words: s.quietAgo ? `quiet ${s.quietAgo.replace(/^about /, '')}` : 'quiet' };
  const mins = Math.round(ms / 60000);
  const words = mins < 1 ? 'just quiet' : mins < 90 ? `${mins} min quiet` : mins < 36 * 60 ? `${Math.round(mins / 60)} h quiet` : `${Math.round(mins / 1440)} days quiet`;
  // a sliver stays visible for a session that went quiet a minute ago
  return { live: false, q: ms > 0 ? Math.min(1, Math.max(0.02, ms / STALE_MS)) : 0, over: ms > STALE_MS, words };
}

/** The server's own sentence, with when it started for a working one. */
export function sessionLine(s) {
  if (s.state === 'working' && s.startedAgo) return `Working now. Started ${s.startedAgo}.`;
  return s.plain || 'Open.';
}

export function sessionRows(sessions) {
  return (sessions || []).map((s) => ({
    id: s.sessionId,
    name: s.name || 'A session',
    state: s.state,
    line: sessionLine(s),
    quiet: quietOf(s),
    canShow: !!s.canShow,
    canClose: !!s.canClose,
  }));
}

/** State chips for a tile, from the real states (E's lanes). */
export function chipsFor(sessions, { building = false, ready = 0, doneToday = 0, runsToday = 0 } = {}) {
  const n = (st) => (sessions || []).filter((s) => s.state === st).length;
  const chips = [];
  if (building || n('working')) chips.push({ kind: 'work', text: 'Working' });
  const hands = n('waiting') + n('blocked');
  if (hands) chips.push({ kind: 'wait', text: hands === 1 ? 'Waiting for you' : `${hands} waiting for you` });
  if (ready) chips.push({ kind: 'ready', text: `${ready} to commit` });
  if (doneToday) chips.push({ kind: 'done', text: `Done today ${doneToday}` });
  if (runsToday) chips.push({ kind: 'done', text: plural(runsToday, 'run') + ' today' });
  const open = n('left-open') + n('gone');
  if (open) chips.push({ kind: 'open', text: `${open} left open` });
  return chips;
}

// ------------------------------------------------------------- the review

/** Ticked unless he unticked it, or another session's journal touched it. */
export function isTicked(f, overrides = {}) {
  if (Object.prototype.hasOwnProperty.call(overrides, f.path)) return !!overrides[f.path];
  return !f.other;
}

export function reviewFiles(files, overrides = {}) {
  const rows = (files || []).map((f) => ({ ...f, ticked: isTicked(f, overrides) }));
  const max = Math.max(1, ...rows.map((f) => (f.added || 0) + (f.removed || 0)));
  return rows.map((f) => {
    const lines = (f.added || 0) + (f.removed || 0);
    return {
      ...f,
      width: lines ? Math.max(3, (lines / max) * 100) : 0,
      count: f.binary ? 'binary' : `+${f.added || 0}${f.removed ? ` \u2212${f.removed}` : ''}`,
      note: f.other ? 'Changed by another session, left out' : (!f.ticked ? 'Left out' : null),
    };
  });
}

export function reviewTotals(rows) {
  const t = rows.filter((f) => f.ticked);
  return { files: t.length, added: t.reduce((a, f) => a + (f.added || 0), 0), removed: t.reduce((a, f) => a + (f.removed || 0), 0) };
}

/** The 8-character rule, drawn as eight ticks lighting as he types. */
export function ruleOf(message) {
  const n = String(message || '').trim().length;
  return { lit: Math.min(MESSAGE_MIN, n), met: n >= MESSAGE_MIN };
}

/** What the receipt says about the files that stayed behind. */
export function leftOutLine(left, rows) {
  if (!left?.length) return null;
  const byPath = new Map((rows || []).map((f) => [f.path, f]));
  const names = left.map((p) => byPath.get(p)?.name || p.split('/').pop());
  const allOther = left.every((p) => byPath.get(p)?.other);
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${plural(names.length - 3, 'more')}` : names.join(', ');
  if (allOther) return { lead: `${plural(left.length, 'file')} left out: `, names: shown, tail: `, changed by another session. ${left.length === 1 ? 'It stays' : 'They stay'} uncommitted.`, allOther };
  return { lead: `${plural(left.length, 'file')} left out: `, names: shown, tail: `. ${left.length === 1 ? 'It stays' : 'They stay'} uncommitted.`, allOther };
}

// ------------------------------------------------------------- runs

/** Numbered findings in a Breaker's report ("1. …", "2) …"). */
export function findingsOf(text) {
  return String(text || '').split('\n').filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
}

/** Prose and numbered lists, for the authored lines in Runs. */
export function textBlocks(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const m = raw.match(/^\s*\d+[.)]\s+(.*)$/);
    if (m) {
      const last = out[out.length - 1];
      if (last?.type === 'ol') last.items.push(m[1]);
      else out.push({ type: 'ol', items: [m[1]] });
    } else if (raw.trim()) {
      const last = out[out.length - 1];
      if (last?.type === 'p' && !raw.match(/^\s*$/)) last.text += '\n' + raw;
      else out.push({ type: 'p', text: raw });
    } else out.push({ type: 'gap' });
  }
  return out.filter((b, i, a) => b.type !== 'gap' || (i > 0 && i < a.length - 1 && a[i - 1].type !== 'gap'));
}

/** The head of each authored line: who, what, when. */
export function lineHead(m, { modelLabel = (x) => x } = {}) {
  const at = m.at ? clock(m.at) : '';
  if (m.who === 'you') return { who: 'you', name: 'You', detail: at };
  if (m.who === 'claude') {
    const bits = [];
    if (m.model) bits.push(modelLabel(m.model));
    if (Number.isFinite(m.endedAt) && Number.isFinite(m.startedAt)) bits.push(minutesWords(m.endedAt - m.startedAt));
    if (Number.isFinite(m.files) && m.files > 0) bits.push(plural(m.files, 'file'));
    return { who: 'bld', name: 'Builder', detail: m.streaming ? 'working' : bits.join(' · ') || at };
  }
  if (m.who === 'breaker') {
    const bits = ['read-only'];
    if (Number.isFinite(m.endedAt) && Number.isFinite(m.startedAt)) bits.push(minutesWords(m.endedAt - m.startedAt));
    return { who: 'brk', name: 'Breaker', detail: bits.join(' · ') };
  }
  return { who: 'nova', name: 'Nova', detail: at };
}

/** The last Breaker pass he has not answered yet (no message of his after it). */
export function unansweredBreaker(chat) {
  const list = chat || [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].who === 'you') return null;
    if (list[i].who === 'breaker') return list[i];
  }
  return null;
}

// ------------------------------------------------------------- the root

/** The news line, written by code from the same records the tiles show. */
export function newsLine({ waiting = [], ready = [], working = null, away = false, nothing = false }) {
  if (away) return 'Your Mac isn\u2019t answering, so this is what Nova last saw.';
  const parts = [];
  // one project both waiting and ready reads as one sentence about it
  if (waiting.length === 1 && ready[0]?.title === waiting[0]) {
    return `${waiting[0]} is waiting on you and has ${countWord(ready[0].n)} file${ready[0].n === 1 ? '' : 's'} ready to commit.`;
  }
  if (waiting.length === 1) parts.push(`${waiting[0]} is waiting on you`);
  else if (waiting.length > 1) parts.push(`${cap(countWord(waiting.length))} sessions are waiting on you`);
  for (const r of ready.slice(0, 1)) parts.push(`${r.title} has ${countWord(r.n)} file${r.n === 1 ? '' : 's'} ready to commit`);
  if (!parts.length && working) parts.push(`The Builder is working in ${working}`);
  if (!parts.length) return nothing ? 'Nothing is running, and everything is committed.' : 'Nothing is waiting on you.';
  return cap(parts.join(', and ')) + '.';
}

export function startOfToday(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
