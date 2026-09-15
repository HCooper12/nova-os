// THE REPERTOIRE VIEW, as data — pure, so it can be tested without a browser.
//
// His ask, 15 Sep: view the whole catalogue AND all the research from the Home
// technique card. The shaping is small but it is where the mistakes live —
// which family a technique belongs under, what a report's one meta line says,
// and whether a discarded draft is shown at all.
//
// It IS shown. Two of the three reports behind his current catalogue are drafts
// that were thrown away on the way to the one that stuck; hiding them would
// make the research look tidier than it was, and the point of an archive is
// what was actually done.

// Group in PAGE ORDER, which is teaching order — the position each technique
// will be taught at is its number here, so the "1 of 7" on Home and the "01"
// in the list are the same fact.
export function groupFamilies(techniques = []) {
  const families = [];
  techniques.forEach((t, i) => {
    let fam = families.find((f) => f.name === t.family);
    if (!fam) { fam = { name: t.family || 'Unfiled', techniques: [] }; families.push(fam); }
    fam.techniques.push({ ...t, position: i + 1 });
  });
  return families;
}

// One line under a report title. Everything in it is a FACT off the record —
// when it ran, what it read, how many techniques it added, and whether he kept
// it. No adjectives.
export function reportMeta(r = {}) {
  const parts = [String(r.at || '').slice(0, 10)];
  if (r.topUp) parts.push('researched when the curriculum ran low');
  else if (r.confirmLine) parts.push(r.confirmLine);
  if (r.added) parts.push(`${r.added} technique${r.added === 1 ? '' : 's'}`);
  parts.push(r.status === 'filed' ? 'kept' : r.status === 'discarded' ? 'discarded draft' : String(r.status || ''));
  return parts.filter(Boolean).join(' · ');
}

export function shapeReports(reports = [], openId = null) {
  return reports.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    kept: r.status === 'filed',
    meta: reportMeta(r),
    open: openId === r.id,
  }));
}
