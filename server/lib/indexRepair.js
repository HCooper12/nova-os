// PAGES THE INDEX CANNOT REACH.
//
// Found 15 Sep 2026 by checking his real vault rather than trusting the weave:
// four of the twelve most recent Source pages existed, with their transcripts,
// and were linked from nothing. `Wiki/index.md` is how the vault is walked —
// by him, by Obsidian's graph, and by every agent that reads the index to find
// what exists — so a page missing from it is a page that was written and then
// lost.
//
// The cause is known and already fixed going forward (ingest.js's staging
// diff dropped a drifted index.md rather than merging it; commit 40643ad and
// its siblings). This repairs the ones written before that, and will keep
// finding any future case the fix misses — which is the point of having it
// rather than a one-off script.
//
// It only ever ADDS a bullet. It never edits or removes one, so a line he has
// written himself cannot be touched, and running it twice is a no-op.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { upsertIndexBullet } from './journal.js';
import { stampPriors, applyChanges } from './stagedPass.js';
import { createRecord } from './inboxStore.js';
import { randomUUID } from 'node:crypto';

export const INDEX_REL = 'Wiki/index.md';

// folder → the heading in index.md that lists it. Journal and Analysis are
// deliberately absent: journal pages are indexed by journal.js as they are
// written, and Analysis is a working area, not a catalogue.
export const INDEXED_FOLDERS = {
  'Wiki/Sources': 'Sources',
  'Wiki/Entities': 'Entities',
  'Wiki/Concepts': 'Concepts',
  'Wiki/Topics': 'Topics',
};

const frontmatter = (body) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(String(body || ''));
  return m ? m[1] : '';
};
const fmValue = (body, key) => {
  const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(frontmatter(body));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
};

// THE ONE LINE THAT DESCRIBES THE PAGE, taken from the page itself — never
// invented. The first bolded lead ("**Source:** Instagram Reel (1:21) by …")
// is what these pages actually open with; failing that, the first real
// sentence of prose. If neither exists the bullet carries the title alone,
// which is still reachable and still true.
export function describePage(body) {
  const afterFm = String(body || '').replace(/^---\n[\s\S]*?\n---\n?/, '');
  const lines = afterFm.split('\n').map((l) => l.trim());
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('---')) continue;
    const plain = line
      .replace(/^\*\*[^*]+:\*\*\s*/, '')       // drop the "**Source:**" label, keep what it said
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim();
    // A SECTION LABEL IS NOT A DESCRIPTION. Kian Deehan's page opens with the
    // single word "Provenance." — true, and useless as an index line. Four
    // words is the bar for a line that says something.
    if (plain.length < 20 || plain.split(/\s+/).length < 4) continue;
    // ...and a bold lead-in is a label too: "**Provenance.** Kian Deehan is a
    // coach who…" splits to "Provenance." on the first full stop. When the
    // first sentence is itself too short to be a description, take what
    // follows it instead.
    const sentences = plain.split(/(?<=[.!?])\s/);
    let firstSentence = (sentences[0] || plain).trim();
    if (firstSentence.length < 20 && sentences.length > 1) firstSentence = sentences.slice(1).join(' ').trim();
    // an opening quote with no close reads as a broken line in the index
    if ((firstSentence.match(/"/g) || []).length % 2 === 1) firstSentence = firstSentence.replace(/"/g, '');
    return firstSentence.length > 150 ? `${firstSentence.slice(0, 147).trimEnd()}…` : firstSentence;
  }
  return '';
}

export function bulletFor(title, body) {
  const desc = describePage(body);
  const updated = fmValue(body, 'updated') || fmValue(body, 'created');
  const tail = updated ? ` (updated ${updated})` : '';
  return desc ? `- [[${title}]] — ${desc}${tail}` : `- [[${title}]]${tail}`;
}

// Every page under an indexed folder that index.md does not link. Pure enough
// to test: it takes the index text and a list of {category, title, body}.
export function orphansIn(indexRaw, pages) {
  const raw = String(indexRaw || '');
  return pages.filter(({ title }) => !raw.includes(`[[${title}]]`) && !raw.includes(`[[${title}|`));
}

// Read the vault's indexed pages. Skips Nova's own backup tree and anything
// that is not a markdown page.
export function readIndexedPages(vaultPath) {
  const out = [];
  for (const [rel, category] of Object.entries(INDEXED_FOLDERS)) {
    const dir = path.join(vaultPath, rel);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md') || f.startsWith('.')) continue;
      const full = path.join(dir, f);
      let body = '';
      try { body = readFileSync(full, 'utf8'); } catch { continue; }
      out.push({ category, title: f.slice(0, -3), rel: path.join(rel, f), body });
    }
  }
  return out;
}

// What the repair WOULD do. Returns the orphans and the single index.md
// change that adds them — nothing is written here, so the caller can show him
// the list before anything touches the vault.
export function planIndexRepair(vaultPath) {
  const indexFull = path.join(vaultPath, INDEX_REL);
  if (!existsSync(indexFull)) return { orphans: [], changes: [], reason: 'there is no Wiki/index.md to repair' };
  const prior = readFileSync(indexFull, 'utf8');
  const orphans = orphansIn(prior, readIndexedPages(vaultPath));
  if (!orphans.length) return { orphans: [], changes: [], reason: 'every page is already reachable from the index' };

  // one write, not one per page: upsertIndexBullet is applied in sequence to
  // the same text so the whole repair is a single undoable change
  let next = prior;
  const added = [];
  for (const o of orphans) {
    try {
      next = upsertIndexBullet(next, o.category, o.title, bulletFor(o.title, o.body));
      added.push(o);
    } catch (e) {
      // a missing "## Category" heading is his vault's shape, not an error to
      // throw over — the other pages still get indexed, and this one is named
      o.skipped = e.message;
    }
  }
  if (next === prior) return { orphans, changes: [], reason: 'none of the orphans could be placed in a section that exists' };
  return {
    orphans: added,
    skipped: orphans.filter((o) => o.skipped),
    changes: [{ path: INDEX_REL, kind: 'updated', content: next, prior }],
  };
}


// Apply it, on the rails. The write goes through the staged pass like every
// other vault write — priors stamped, drift checked, merged rather than
// refused when index.md has moved elsewhere — and it leaves a receipt whose
// undo restores exactly what was there before.
export async function applyIndexRepair(vaultPath) {
  const plan = planIndexRepair(vaultPath);
  if (!plan.changes.length) return { repaired: 0, reason: plan.reason, recordId: null };

  const changes = stampPriors(vaultPath, plan.changes.map(({ path: p, kind, content }) => ({ path: p, kind, content })));
  const prior = changes[0].prior;
  await applyChanges(vaultPath, changes, {
    what: 'this index repair',
    remedy: 'run it again — it only ever adds a bullet, so a second run is safe',
    merge: true,
  });
  const applied = changes[0].content;

  const n = plan.orphans.length;
  const byCategory = plan.orphans.reduce((acc, o) => { acc[o.category] = (acc[o.category] || 0) + 1; return acc; }, {});
  // createRecord does NOT mint an id — every caller supplies one, and a record
  // without an id is in the store but unaddressable, which means unundoable.
  // Learned the hard way on the first real run.
  const record = await createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'index-repair',
    text: `Linked ${n} page${n === 1 ? '' : 's'} back into Wiki/index.md`,
    source: 'nova',
    mode: 'auto',
    status: 'filed',
    createdAt: new Date().toISOString(),
    destination: Object.entries(byCategory).map(([c, k]) => `${k} ${c}`).join(' · '),
    decision: {
      route: 'note',
      confidence: 'high',
      title: `${n} page${n === 1 ? '' : 's'} were in the vault but not in the index`,
      reason: `Written by earlier weaves whose index edit was dropped, and unreachable since. Added, never edited: ${plan.orphans.slice(0, 6).map((o) => o.title).join(', ')}${n > 6 ? `, and ${n - 6} more` : ''}.`,
      payload: { titles: plan.orphans.map((o) => o.title), byCategory },
    },
    // the whole prior, because index.md is one file and this is one write
    undoData: { route: 'index-repair', prior, applied },
  });
  return { repaired: n, byCategory, recordId: record?.id || null };
}

// Undo: put index.md back exactly as it was — unless he has edited it since,
// in which case reverting would throw his own words away. The drift rule that
// governs every other write governs this one.
export async function undoIndexRepair(vaultPath, undo) {
  const full = path.join(vaultPath, INDEX_REL);
  const current = existsSync(full) ? readFileSync(full, 'utf8') : null;
  if (current !== undo.applied) {
    throw new Error('Wiki/index.md has changed since the repair — undoing now would discard those edits. Remove the bullets by hand, or keep them.');
  }
  await applyChanges(vaultPath, [{ path: INDEX_REL, kind: 'updated', content: undo.prior, prior: current }], {
    what: 'this undo', remedy: 'the index is already back', merge: false,
  });
  return { restored: 1 };
}
