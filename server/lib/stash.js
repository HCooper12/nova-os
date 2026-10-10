import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { backupFile } from './backup.js';
import { stashKey, hostOf } from '../../src/stashUrl.js';

// The Stash — categorised links to come back to: products to restock
// (skincare, supplements), references to revisit, anything with a URL worth
// keeping one tap away. One source of truth in the vault so Obsidian can
// read/edit it too; this module is the single writer.
//
// Format contract (change every reader/writer or none; every reader goes
// through parseStash below):
//   ## Category                         a shelf
//   ## For Mum [date:: 2026-12-25]      a gift shelf, with its day if he gave one
//   ## Bought                           the bought history, newest first
//   - [Name](https://url) — optional note [lasts:: 8] [bought:: 2026-09-12]
//
// THE INLINE FIELDS (10 Oct 2026, the rebuild and his five additions). His
// facts about an item live on its own line, in Dataview's `[key:: value]`
// form, so Obsidian shows them and he can edit them there: how long one lasts
// (`lasts`, weeks), when he last bought it (`bought`), a check moved later by
// "Plenty left" (`check`), the price he paid and the shelf it came from on a
// Bought line (`paid`, `from`), a price he asked Nova to watch (`watch:: on`)
// and a reading link he finished (`read`). A line with no fields is byte for
// byte the line this file always wrote, so the Inbox's and the verbs' undo
// (which find a line by its exact text) still work. Operational, re-fetchable
// things (pictures, a page's text, opens, prices read) never come here: they
// live in server/data/stash (lib/stashMeta.js).
//
// EVERY WRITE IS A LIST OF LINE OPERATIONS whose inverse is returned, so the
// rails can put the file back exactly (lib/stashRails.js, undo route
// `stash-ops`). An operation that cannot find its line refuses in words
// ("that item changed since") rather than touching the wrong one: lines are
// identified by their exact text (the todos precedent).
export const STASH_REL = 'Wiki/Library/Stash.md';
export const BOUGHT_SHELF = 'Bought';
const HEADER = `# Stash

Links and products to come back to — restock, reference, revisit. Managed from Nova's Stash tab; safe to edit here too.
`;

export const FIELD_ORDER = ['lasts', 'bought', 'check', 'paid', 'from', 'watch', 'read'];
const FIELD_TAIL = /\s*\[([A-Za-z]+)::\s*([^\]]*?)\s*\]\s*$/;
const ITEM_HEAD = /^- \[(.+?)\]\((https?:\/\/[^\s)]+)\)(.*)$/;
const HEADING = /^##\s+(.+?)\s*$/;

function stashPath(vaultPath) {
  return path.join(vaultPath, STASH_REL);
}

function splitFields(text) {
  const fields = {};
  let rest = String(text || '');
  let m;
  while ((m = rest.match(FIELD_TAIL))) {
    const k = m[1].toLowerCase();
    if (!(k in fields)) fields[k] = m[2];
    rest = rest.slice(0, m.index);
  }
  return { rest, fields };
}

const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export function parseItemLine(line) {
  const m = String(line).match(ITEM_HEAD);
  if (!m) return null;
  const { rest, fields } = splitFields(m[3]);
  let note = null;
  const r = rest.trim();
  if (r) {
    const n = r.match(/^—\s*(.*)$/);
    if (!n) return null; // trailing words that are not a note: not a Stash line
    note = n[1].trim() || null;
  }
  return {
    raw: line,
    name: m[1],
    url: m[2],
    note,
    host: hostOf(m[2]),
    key: stashKey(m[2]),
    lasts: num(fields.lasts),
    bought: iso(fields.bought),
    check: iso(fields.check),
    paid: num(fields.paid),
    from: fields.from || null,
    watch: /^(on|yes|true)$/i.test(fields.watch || ''),
    read: iso(fields.read),
    fields,
  };
}

export function parseHeading(line) {
  const h = String(line).match(HEADING);
  if (!h) return null;
  const { rest, fields } = splitFields(h[1]);
  const name = rest.trim();
  if (!name) return null;
  const gift = name.match(/^For\s+(.+)$/i);
  return {
    name,
    raw: line,
    date: iso(fields.date),
    gift: gift ? gift[1].trim() : null,
    bought: name.toLowerCase() === BOUGHT_SHELF.toLowerCase(),
  };
}

export function parseStash(raw) {
  const categories = [];
  let current = null;
  for (const line of (raw || '').split('\n')) {
    const h = parseHeading(line);
    if (h) {
      current = { ...h, items: [] };
      categories.push(current);
      continue;
    }
    const it = current && parseItemLine(line);
    if (it) current.items.push(it);
  }
  return { categories };
}

const clean = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

export function formatStashItem({ name, url, note, fields } = {}) {
  const cleanName = clean(name).replace(/[[\]]/g, '');
  const cleanNote = clean(note).replace(/\[[A-Za-z]+::[^\]]*\]/g, '').trim();
  let line = `- [${cleanName}](${String(url).trim()})${cleanNote ? ` — ${cleanNote}` : ''}`;
  for (const k of FIELD_ORDER) {
    const v = fields?.[k];
    if (v == null || v === '' || v === false) continue;
    line += ` [${k}:: ${v === true ? 'on' : clean(v).replace(/[[\]]/g, '')}]`;
  }
  return line;
}

export function formatHeading({ name, date } = {}) {
  return `## ${clean(name).replace(/[[\]#]/g, '')}${date ? ` [date:: ${date}]` : ''}`;
}

// the fields an item line carries now, ready to change one and re-format
export function fieldsOf(item) {
  return {
    lasts: item.lasts ?? undefined, bought: item.bought ?? undefined, check: item.check ?? undefined,
    paid: item.paid != null ? item.paid.toFixed(2) : undefined, from: item.from ?? undefined,
    watch: item.watch ? 'on' : undefined, read: item.read ?? undefined,
  };
}

export async function loadStash(vaultPath) {
  const full = stashPath(vaultPath);
  if (!existsSync(full)) return { categories: [] };
  return parseStash(await readFile(full, 'utf8'));
}

/* ----------------------------- the line engine ---------------------------- */

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function headingIndex(lines, name) {
  return lines.findIndex((l) => { const h = parseHeading(l); return h && sameName(h.name, name); });
}

// the section's item lines: [first item index, index after the last nonblank]
function sectionBounds(lines, hi) {
  let end = hi + 1;
  for (let i = hi + 1; i < lines.length; i++) {
    if (HEADING.test(lines[i])) break;
    if (lines[i].trim()) end = i + 1;
  }
  return end;
}

function refuse(msg, status = 409) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

// One operation on the file's lines; returns its inverse.
//   replace  { from, to }               to null removes the line
//   insert   { raw, category, at, after, heading }   at 'start' | 'end'; after = an exact line
//   heading  { from, to }               a heading changed; to null removes an EMPTY shelf
//   shelf    { raw }                    a new heading at the end
function applyOne(lines, op) {
  if (op.op === 'replace') {
    const i = lines.indexOf(op.from);
    if (i === -1) throw refuse('that item changed since; nothing was touched');
    if (op.to == null) {
      // remember where it sat, so the inverse puts it back in its place
      let hi = i;
      while (hi >= 0 && !HEADING.test(lines[hi])) hi--;
      const h = hi >= 0 ? parseHeading(lines[hi]) : null;
      let after = null;
      for (let j = i - 1; j > hi; j--) if (parseItemLine(lines[j])) { after = lines[j]; break; }
      lines.splice(i, 1);
      return { op: 'insert', raw: op.from, category: h?.name || 'Unsorted', after, at: after ? null : 'start' };
    }
    lines[i] = op.to;
    return { op: 'replace', from: op.to, to: op.from };
  }
  if (op.op === 'insert') {
    let hi = headingIndex(lines, op.category);
    let created = null;
    if (hi === -1) {
      created = op.heading || formatHeading({ name: op.category });
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      lines.push('', created, '');
      hi = lines.length - 2;
    }
    const end = sectionBounds(lines, hi);
    let at = op.at === 'start' ? hi + 1 : end;
    if (op.after) {
      const j = lines.indexOf(op.after);
      if (j > hi && j < end) at = j + 1;
    }
    // straight after a heading, keep the blank line Obsidian users write
    if (at === hi + 1 && lines[hi + 1] === '' && end > hi + 1) at = hi + 2;
    if (at === hi + 1 && end === hi + 1 && lines[hi + 1] === '') at = hi + 2;
    lines.splice(at, 0, op.raw);
    const inv = { op: 'replace', from: op.raw, to: null };
    return created ? [inv, { op: 'heading', from: created, to: null }] : inv;
  }
  if (op.op === 'heading') {
    const i = lines.indexOf(op.from);
    if (i === -1) throw refuse('that shelf changed since; nothing was touched');
    if (op.to == null) {
      const end = sectionBounds(lines, i);
      for (let j = i + 1; j < end; j++) if (parseItemLine(lines[j])) throw refuse('that shelf has links on it now; nothing was touched');
      lines.splice(i, Math.max(1, end - i));
      if (i > 0 && lines[i - 1] === '' && (i >= lines.length || lines[i] === '')) lines.splice(i - 1, 1);
      return { op: 'shelf', raw: op.from };
    }
    lines[i] = op.to;
    return { op: 'heading', from: op.to, to: op.from };
  }
  if (op.op === 'shelf') {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    lines.push('', op.raw, '');
    return { op: 'heading', from: op.raw, to: null };
  }
  throw refuse(`unknown stash operation ${op.op}`, 400);
}

// THE FILE'S SHAPE, written the same way every time: one blank line around
// each shelf heading, never two blank lines in a row, one newline at the
// end. A write and its Undo therefore meet on the same bytes (a hand-edited
// file takes this shape on Nova's first write to it, its lines unchanged).
export function canonical(lines) {
  const out = [];
  for (const line of lines) {
    if (HEADING.test(line)) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(line, '');
      continue;
    }
    if (line.trim() === '') { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

// one writer at a time on Stash.md
let chain = Promise.resolve();
const locked = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

// Apply operations to the file, all or nothing. Returns the inverse list
// (apply it to put the file back) and the Stash as it now reads.
export function applyStashOps(vaultPath, ops) {
  return locked(async () => {
    const full = stashPath(vaultPath);
    let raw;
    if (existsSync(full)) {
      await backupFile(full);
      raw = await readFile(full, 'utf8');
    } else {
      await mkdir(path.dirname(full), { recursive: true });
      raw = HEADER;
    }
    const lines = raw.split('\n');
    const inverse = [];
    for (const op of ops) {
      const inv = applyOne(lines, op);
      inverse.unshift(...(Array.isArray(inv) ? inv : [inv]));
    }
    const out = canonical(lines);
    await writeFile(full, out, 'utf8');
    return { inverse, stash: parseStash(out) };
  });
}

/* ------------------------------ the writes -------------------------------- */

export function findItem(stash, raw) {
  for (const c of stash.categories) {
    const it = c.items.find((i) => i.raw === raw);
    if (it) return { item: it, category: c };
  }
  return null;
}

// the live shelves' copy of a link (the Bought history is not a duplicate)
export function findDuplicate(stash, url) {
  const key = stashKey(url);
  for (const c of stash.categories) {
    if (c.bought) continue;
    const it = c.items.find((i) => i.key === key);
    if (it) return { item: it, category: c };
  }
  return null;
}

function duplicateError(hit) {
  const e = refuse(`already on ${hit.category.name}: ${hit.item.name}`);
  e.code = 'duplicate';
  e.duplicate = { category: hit.category.name, raw: hit.item.raw, name: hit.item.name, url: hit.item.url };
  return e;
}

function mustFind(stash, raw) {
  const hit = findItem(stash, raw);
  if (!hit) throw refuse('that item is no longer there');
  return hit;
}

// The writes return { inverse, stash, ... } and never file anything: the
// rails (lib/stashRails.js) file the record and its Undo.
export async function stashAdd(vaultPath, { category, name, url, note, fields } = {}) {
  const cat = clean(category);
  const cleanUrl = String(url || '').trim();
  if (!cat) throw refuse('category is required', 400);
  if (!clean(name)) throw refuse('name is required', 400);
  if (!/^https?:\/\/\S+$/.test(cleanUrl) || /[\s)]/.test(cleanUrl)) throw refuse('url must start with http:// or https://', 400);
  if (sameName(cat, BOUGHT_SHELF)) throw refuse('the Bought shelf fills itself when you mark something bought', 400);
  const before = await loadStash(vaultPath);
  const hit = findDuplicate(before, cleanUrl);
  if (hit) throw duplicateError(hit);
  const raw = formatStashItem({ name, url: cleanUrl, note, fields });
  const out = await applyStashOps(vaultPath, [{ op: 'insert', raw, category: cat, at: 'end' }]);
  return { ...out, raw, category: cat };
}

export async function stashRemove(vaultPath, raw) {
  const out = await applyStashOps(vaultPath, [{ op: 'replace', from: raw, to: null }]);
  return out;
}

// change an item's note, name or fields; `patch` holds only what changes
export async function stashUpdate(vaultPath, raw, patch = {}) {
  const { item } = mustFind(await loadStash(vaultPath), raw);
  const fields = { ...fieldsOf(item) };
  for (const k of FIELD_ORDER) if (k in patch) fields[k] = patch[k] == null || patch[k] === false ? undefined : patch[k];
  const next = formatStashItem({
    name: 'name' in patch ? patch.name : item.name,
    url: item.url,
    note: 'note' in patch ? patch.note : item.note,
    fields,
  });
  if (next === raw) throw refuse('nothing to change', 400);
  const out = await applyStashOps(vaultPath, [{ op: 'replace', from: raw, to: next }]);
  return { ...out, raw: next, item };
}

export async function stashMove(vaultPath, raw, to) {
  const shelf = clean(to);
  if (!shelf) throw refuse('which shelf?', 400);
  if (sameName(shelf, BOUGHT_SHELF)) throw refuse('mark it bought to move it to Bought', 400);
  const { category } = mustFind(await loadStash(vaultPath), raw);
  if (sameName(category.name, shelf)) throw refuse(`it is already on ${category.name}`, 400);
  const out = await applyStashOps(vaultPath, [
    { op: 'replace', from: raw, to: null },
    { op: 'insert', raw, category: shelf, at: 'end' },
  ]);
  return { ...out, from: category.name, to: shelf };
}

// MARK BOUGHT (his yes, 10 Oct). A one-off leaves its shelf for Bought, with
// the date and the price paid if he gave one. A restock item (it has a
// rhythm) stays where it is with its clock restarted, and a dated line joins
// Bought as the history its rhythm learns from.
export async function stashBought(vaultPath, raw, { date, paid } = {}) {
  if (!iso(date)) throw refuse('a date is needed (YYYY-MM-DD)', 400);
  const price = paid == null || paid === '' ? null : num(paid);
  if (paid != null && paid !== '' && price == null) throw refuse(`could not read "${String(paid).slice(0, 20)}" as a price`, 400);
  const { item, category } = mustFind(await loadStash(vaultPath), raw);
  if (category.bought) throw refuse('that is already in Bought', 400);
  const history = formatStashItem({
    name: item.name, url: item.url, note: null,
    fields: { bought: date, paid: price != null ? price.toFixed(2) : undefined, from: category.name },
  });
  const ops = [];
  if (item.lasts) {
    const next = formatStashItem({ name: item.name, url: item.url, note: item.note, fields: { ...fieldsOf(item), bought: date, check: undefined } });
    if (next !== raw) ops.push({ op: 'replace', from: raw, to: next });
  } else {
    ops.push({ op: 'replace', from: raw, to: null });
  }
  ops.push({ op: 'insert', raw: history, category: BOUGHT_SHELF, at: 'start' });
  const out = await applyStashOps(vaultPath, ops);
  return { ...out, stays: !!item.lasts, history, item, category: category.name };
}

// a shelf of his own, or a gift list ("For Mum") with an optional day
export async function stashShelf(vaultPath, { name, date } = {}) {
  const n = clean(name);
  if (!n) throw refuse('a name is needed', 400);
  if (date && !iso(date)) throw refuse('the date must be YYYY-MM-DD', 400);
  const stash = await loadStash(vaultPath);
  const existing = stash.categories.find((c) => sameName(c.name, n));
  if (existing) {
    if ((existing.date || null) === (date || null)) throw refuse(`${existing.name} is already a shelf`, 409);
    const to = formatHeading({ name: existing.name, date: date || null });
    const out = await applyStashOps(vaultPath, [{ op: 'heading', from: existing.raw, to }]);
    return { ...out, name: existing.name, changed: 'date' };
  }
  const out = await applyStashOps(vaultPath, [{ op: 'shelf', raw: formatHeading({ name: n, date: date || null }) }]);
  return { ...out, name: n, changed: 'new' };
}

/* --------------- the old doors, kept for the Inbox and the verbs ----------- */

export async function addStashItem(vaultPath, item) {
  return (await stashAdd(vaultPath, item)).stash;
}

// Identity is the exact raw line (the todos precedent) — no ids to drift.
export async function removeStashItem(vaultPath, rawLine) {
  const full = stashPath(vaultPath);
  if (!existsSync(full)) throw new Error('stash file not found');
  try {
    return (await stashRemove(vaultPath, rawLine)).stash;
  } catch (e) {
    if (e.status === 409) throw new Error('that item is no longer there');
    throw e;
  }
}
