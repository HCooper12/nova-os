// ERRORS SAY WHAT HAPPENED (his rule, 24 Oct 2026: "always factual"). Every
// failed weave on 22–23 Oct told him "Claude isn't available right now" while
// the real cause was an iCloud-evicted journal page — a guess dressed as a
// fact. A message he reads names the cause code actually saw, in everyday
// words, and never blames a component that did not fail. Unknown causes pass
// through as the error's own words rather than being replaced by a story.

const RULES = [
  [(e) => e?.laneOff, (e) => String(e.message)],
  [(e, m) => /Unknown system error -11|EDEADLK/i.test(m), () => "A vault file is stored only in iCloud and couldn't be downloaded to the Mac"],
  [(e, m) => /usage limit|rate.?limit|quota|credit balance|out of (extra )?usage|429/i.test(m), () => "Claude's usage limit is used up for now"],
  [(e, m) => /timed out|ETIMEDOUT|SIGKILL/i.test(m), () => 'It took too long and was stopped'],
  [(e, m) => /ENOTFOUND|ECONNREFUSED|ECONNRESET|network|fetch failed/i.test(m), () => "The Mac couldn't reach the internet"],
  [(e, m) => /ENOSPC/.test(m), () => 'The Mac is out of disk space'],
  [(e, m) => /came back empty|no JSON|unparseable|could not parse/i.test(m), () => "Claude answered, but not in a form Nova could read"],
];

/** An error → one factual sentence (no trailing full stop) naming its cause. */
export function plainCause(err) {
  const m = String(err?.message ?? err ?? '').trim();
  for (const [hit, say] of RULES) if (hit(err, m)) return say(err, m);
  const first = m.split('\n')[0].replace(/^Error:\s*/, '').slice(0, 200);
  return first ? first.charAt(0).toUpperCase() + first.slice(1).replace(/\.$/, '') : 'It failed without saying why';
}

/** The cause, then what was kept: "<cause>. Nova kept the link and will weave it when you retry." */
export function keptBecause(err, keptLine) {
  return `${plainCause(err)}. ${keptLine}`;
}
