// WHAT THE LANES THAT LACKED HIM NEED FROM HIS PROFILE (audit #5, 7 Nov 2026).
// He said "won't eat Vegemite or possibly Brussels sprouts" on 26 Oct and five
// food modules never heard it; ingest and distill ($56.61 in 17 days) minted
// pages with no idea what he is working toward. A whole profile is 8,168 chars.
// These are pure and take the text of a scoped profileContext(), so each lane
// pays for one sentence or two, and a code lane pays nothing.

const said = (text) => String(text || '').replace(/[’‘]/g, "'");

/** Foods he has said he will not eat, read by code from his own sentence. A
 *  hedge he gave ("possibly Brussels sprouts") still counts: he named it. */
export function refusedFoods(fuelText) {
  const out = new Set();
  for (const m of said(fuelText).matchAll(/\b(?:won't|will not|wouldn't|never|refuses? to|doesn't|does not|don't)\s+eat\s+([^.;(]+)/gi)) {
    for (const part of m[1].split(/,|\bor\b|\band\b/i)) {
      const food = part.replace(/\b(?:possibly|maybe|probably|perhaps|any|either|really|those|are|the|only|foods?|he'd|refuse)\b/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      if (food.length > 2) out.add(food);
    }
  }
  return [...out];
}

const singular = (w) => w.replace(/s\b/g, '');

/** Does this name hold a food he refuses? Matched as words, so "ham" is never "hamburger". */
export function refusedIn(name, refused = []) {
  const hay = ` ${singular(String(name || '').toLowerCase().replace(/[^a-z ]+/g, ' '))} `;
  return refused.find((food) => hay.includes(` ${singular(food)} `)) || null;
}

/** What he said about how he eats, in his own lines, for a lane that estimates
 *  food: "Drinks his coffee black" changes a coffee's numbers. */
export function fuelFacts(fuelText, { chars = 320 } = {}) {
  const lines = said(fuelText).split(/;\s+|\n/).map((l) => l.replace(/^- /, '').trim()).filter((l) => /\(said \d{4}-\d{2}-\d{2}\)/.test(l));
  const kept = [];
  let used = 0;
  for (const line of lines.map((l) => l.replace(/^.*?:\s*(?=[A-Z])/, ''))) {
    if (used + line.length > chars) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept.join(' ');
}

/** For the lanes that decide what becomes a page. It steers what is worth
 *  minting and never what a source said. */
export function goalsBlock(profileText, { chars = 720 } = {}) {
  const lines = String(profileText || '').split('\n')
    .filter((l) => /^- /.test(l) && !/^- Nova knows\b/.test(l) && !/not told yet/.test(l))
    .map((l) => l.replace(/\(drafted by Claude[^)]*\)\s*/, ''));
  if (!lines.length) return '';
  // each section its share, so one long section cannot push the next out
  const share = Math.floor(chars / lines.length);
  const body = lines.map((l) => (l.length > share ? `${l.slice(0, share - 1).trimEnd()}…` : l)).join('\n');
  return `WHO THIS VAULT SERVES (from his profile; use it to judge what earns a new page, never to change what a source says):\n${body}\nAn idea that bears on this may earn its own page. One that does not goes on the page it belongs to, not a new one.`;
}
