import { chosenOptions } from './profileOptions.js';

// "NOT SURE HOW LONG IT NEEDS UNTIL IT CONSIDERS THERE TO BE ENOUGH" (his
// words, 27 Oct 2026). An honest measure of how much of About you is in his
// own words, with no finish line: Nova keeps learning as he talks. Pure, so
// the server and the PWA read one rule (src imports this file directly, the
// way it imports profileOptions.js; lib/profile.js re-exports it).
//
// Per section:
//   'own'   his words: a confirmed section, or a drafted one holding any
//           `(said <date>)` line or a chosen option;
//   'draft' only Claude's draft;
//   'empty' nothing yet.
// Overall picture:
//   rich     all twelve his own and at least 30 lines of his own;
//   working  every section has something and at least 8 are his own;
//   growing  at least 3 his own, or at least 6 with something;
//   starting otherwise.

const SAID_RE = /\(said \d{4}-\d{2}-\d{2}\)\s*$/;
const linesOf = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);

/** Lines of his own in one section: all of a confirmed section's lines, or
 *  a drafted section's said-lines and chosen options. */
export function ownLines(s) {
  if (!s?.text) return 0;
  const lines = linesOf(s.text);
  if (!s.drafted) return lines.length;
  const chosen = new Set((Array.isArray(s.chosen) ? s.chosen : chosenOptions(s.key, s.text)).map((p) => p.toLowerCase()));
  return lines.filter((l) => SAID_RE.test(l) || chosen.has(l.replace(/^-\s*/, '').toLowerCase())).length;
}

export function sectionState(s) {
  if (!s?.text) return 'empty';
  return ownLines(s) > 0 ? 'own' : 'draft';
}

const RANK = { empty: 0, draft: 1, own: 2 };

export function profileCoverage(profile, order = null) {
  const sections = Array.isArray(profile?.sections) ? profile.sections : [];
  const keys = order || sections.map((s) => s.key);
  const rows = keys.map((key, i) => {
    const s = sections.find((x) => x.key === key) || { key, title: key, text: '' };
    return { key, title: s.title || key, state: sectionState(s), own: ownLines(s), i };
  });
  const count = (st) => rows.filter((r) => r.state === st).length;
  const own = count('own');
  const draft = count('draft');
  const empty = count('empty');
  const total = rows.length;
  const ownLinesTotal = rows.reduce((a, r) => a + r.own, 0);
  let picture = 'starting';
  if (total > 0 && own === total && ownLinesTotal >= 30) picture = 'rich';
  else if (total > 0 && empty === 0 && own >= 8) picture = 'working';
  else if (own >= 3 || own + draft >= 6) picture = 'growing';
  const thin = [...rows].sort((a, b) => RANK[a.state] - RANK[b.state] || a.own - b.own || a.i - b.i)[0] || null;
  return {
    own, draft, empty, total, ownLines: ownLinesTotal, picture,
    sections: rows.map(({ key, title, state, own: n }) => ({ key, title, state, ownLines: n })),
    nextFocus: thin ? { key: thin.key, title: thin.title } : null,
  };
}

/** The plain sentence under the ring. */
export function coverageLine(c) {
  if (!c || !c.total) return '';
  const tail = 'There is no finish line; Nova keeps learning as you talk.';
  const words = `${c.own} of ${c.total} in your words`;
  if (c.picture === 'rich') return `A rich picture, all ${c.total} in your words. ${tail}`;
  if (c.picture === 'working') return `A working picture at ${words}. ${tail}`;
  if (c.picture === 'growing') return `A growing picture at ${words}. ${tail}`;
  return `Just starting, ${words}. ${tail}`;
}
