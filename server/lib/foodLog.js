import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createWriteLock } from './vaultStateFile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Off-plan eating (snacks, extras, anything not one of today's rotation
// recipes) — deliberately not in the Obsidian vault for the same reason as
// health data: this is raw daily telemetry, not synthesized knowledge.
// NOVA_DATA_DIR override exists for tests (read lazily so tests can set it).
const LOG_DIR = () => path.join(process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data'), 'food-log');

function localDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function today() {
  return localDay(new Date());
}

// Retro logging: an entry may target today or up to RETRO_DAYS back — the
// day-to-day reality of tracking (last night's dinner logged after
// midnight, yesterday filled in this morning). Never the future, never the
// deep past. No arg (or empty) resolves to today, so callers can use this
// as the single date gate.
const RETRO_DAYS = 30;
export function resolveLogDate(date) {
  if (date == null || date === '') return today();
  const d = String(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('date must be YYYY-MM-DD');
  if (d > today()) throw new Error("can't log food to a future day");
  const floor = new Date();
  floor.setDate(floor.getDate() - RETRO_DAYS);
  if (d < localDay(floor)) throw new Error(`retro logging reaches back ${RETRO_DAYS} days — ${d} is older`);
  return d;
}

export async function getDay(date) {
  return loadDay(resolveLogDate(date));
}

async function loadDay(date) {
  const full = path.join(LOG_DIR(), `${date}.json`);
  if (!existsSync(full)) return { date, entries: [] };
  return JSON.parse(await readFile(full, 'utf8'));
}

async function saveDay(day) {
  await mkdir(LOG_DIR(), { recursive: true });
  // atomic tmp+rename — this was the one store with neither atomicity nor
  // backups; a mid-write kill could tear the day's food log
  const full = path.join(LOG_DIR(), `${day.date}.json`);
  // UNIQUE tmp name: a shared one let two concurrent saves collide — the
  // second rename found the first's temp file already moved and threw ENOENT,
  // failing the write outright rather than merely losing an entry.
  const tmp = `${full}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(day, null, 2), 'utf8');
  await rename(tmp, full);
}

export async function getToday() {
  return loadDay(today());
}

// EVERY mutation goes through one lock. Each was a read-modify-write on the
// same file: two logs landing together (a double tap, a re-log while a scan
// finishes, the offline outbox draining) both read the same day, both pushed,
// and the second write clobbered the first — an entry silently vanishing,
// which is exactly what "it didn't stay there" looked like.
const withWriteLock = createWriteLock();

// THE ITEMISED PLATE (design/ATHLETE-AI-PLAN.md #3). A photo or a sentence
// arrives as a BREAKDOWN — 3 eggs, sourdough 54 g, half an avocado — and
// Nova used to collapse it to one total the moment it was logged. A wrong
// total is then a lie he has to accept whole: delete the meal and retype it,
// or live with it. Keeping the lines makes it correctable instead.
//
// The contract, and every reader depends on it: WHEN AN ENTRY HAS ITEMS, ITS
// MACROS ARE THE SUM OF THEM, computed here. That is what makes deleting one
// line arithmetically honest. Editing an entry's totals by hand therefore
// DROPS its items — they no longer describe the number.
const ITEM_CAP = 24;
export function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const name = String(raw?.name || '').trim().slice(0, 80);
    if (!name) return null;
    const m = raw?.macros || raw || {};
    const macros = { p: round1(m.p), c: round1(m.c), f: round1(m.f), kcal: Math.round(Math.max(0, Number(m.kcal) || 0)) };
    const grams = Number(raw?.grams);
    return {
      id: randomUUID().slice(0, 6),
      name,
      ...(Number.isFinite(grams) && grams > 0 ? { grams: Math.round(grams) } : {}),
      macros,
      // where the number came from — "USDA — egg, whole, raw (SR Legacy)" or
      // "estimated, not matched to a database". Shown, never invented.
      ...(raw?.source ? { source: String(raw.source).slice(0, 120) } : {}),
      ...(raw?.sourced != null ? { sourced: !!raw.sourced } : {}),
    };
  }).filter(Boolean).slice(0, ITEM_CAP);
}
const round1 = (n) => Math.round(Math.max(0, Number(n) || 0) * 10) / 10;
export function macrosOfItems(items = []) {
  const t = items.reduce((a, it) => ({
    p: a.p + (Number(it.macros?.p) || 0), c: a.c + (Number(it.macros?.c) || 0),
    f: a.f + (Number(it.macros?.f) || 0), kcal: a.kcal + (Number(it.macros?.kcal) || 0),
  }), { p: 0, c: 0, f: 0, kcal: 0 });
  return { p: round1(t.p), c: round1(t.c), f: round1(t.f), kcal: Math.round(t.kcal) };
}

export async function addEntry({ name, macros, source, date, items }) {
  return withWriteLock(() => addEntryUnlocked({ name, macros, source, date, items }));
}

async function addEntryUnlocked({ name, macros, source, date, items }) {
  const target = resolveLogDate(date);
  const day = await loadDay(target);
  const entry = {
    id: randomUUID().slice(0, 8),
    // the clock time is only true for same-day logs — stamping a retro
    // entry with the moment it was TYPED would be fiction about when he ate
    ...(target === today() ? { time: new Date().toTimeString().slice(0, 5) } : {}),
    name,
    macros: { p: Number(macros.p) || 0, c: Number(macros.c) || 0, f: Number(macros.f) || 0, kcal: Number(macros.kcal) || 0 },
  };
  // How it was logged — 'scan' | 'barcode' | 'manual' | 'history'. Optional and
  // additive: older entries simply lack it and every reader tolerates that.
  if (source) entry.source = String(source).slice(0, 20);
  // the plate, itemised — and the total becomes the sum of its lines
  const lines = normalizeItems(items);
  if (lines.length) {
    entry.items = lines;
    entry.macros = macrosOfItems(lines);
  }
  day.entries.push(entry);
  await saveDay(day);
  return day;
}

// Rotation meals ARE food. Ticking "lunch eaten" used to write a single
// boolean into the vault's Daily Rotation frontmatter — which holds ONE
// day — so the moment the date rolled, the biggest meals of the day became
// invisible: a past day showed only the off-plan extras (54.6g protein
// against a real 149g on 17 Aug 2026, his report). They now land in the
// same per-day store as everything else, keyed by slot so ticking and
// unticking are idempotent, and carrying the recipe id so the entry can be
// traced back to what was actually eaten.
export async function setRotationEntry({ date, slot, name, macros, recipeId, consumed }) {
  return withWriteLock(async () => {
    const target = resolveLogDate(date);
    const day = await loadDay(target);
    // v2 rotation (7 Sep): a slot can hold several dishes each ticked on its
    // own, so the log carries ONE entry per (slot, recipe). A recipe-less
    // legacy entry for the slot is replaced whichever recipe is named.
    day.entries = day.entries.filter((e) => !(e.source === 'rotation' && e.slot === slot && (!recipeId || !e.recipeId || e.recipeId === recipeId)));
    if (consumed) {
      day.entries.push({
        id: randomUUID().slice(0, 8),
        ...(target === today() ? { time: new Date().toTimeString().slice(0, 5) } : {}),
        name,
        macros: { p: Number(macros?.p) || 0, c: Number(macros?.c) || 0, f: Number(macros?.f) || 0, kcal: Number(macros?.kcal) || 0 },
        source: 'rotation',
        slot,
        ...(recipeId ? { recipeId } : {}),
      });
    }
    await saveDay(day);
    return day;
  });
}

// The ONE way to total a day. The rotation+extras join used to be written
// out by hand in six places (snapshot, two val mappers, dispatch twice,
// health insight) — a shared format with six readers is a contract waiting
// to drift, and it did. Rotation meals are now IN entries, so this is a
// straight sum with no join at all.
export function totalsOf(entries = []) {
  return entries.reduce((t, e) => ({
    p: t.p + (Number(e.macros?.p) || 0),
    c: t.c + (Number(e.macros?.c) || 0),
    f: t.f + (Number(e.macros?.f) || 0),
    kcal: t.kcal + (Number(e.macros?.kcal) || 0),
  }), { p: 0, c: 0, f: 0, kcal: 0 });
}

// Correct an entry in place — any day, today or retro. Add and delete
// existed; editing did not, so fixing a wrong estimate meant deleting and
// re-typing it (and losing its original clock time in the process).
export async function editEntryOn(date, entryId, { name, macros }) {
  return withWriteLock(async () => {
    const target = resolveLogDate(date);
    const day = await loadDay(target);
    const entry = day.entries.find((e) => e.id === entryId);
    if (!entry) throw new Error('that entry is no longer there');
    if (typeof name === 'string' && name.trim()) entry.name = name.trim().slice(0, 120);
    if (macros) {
      for (const k of ['p', 'c', 'f', 'kcal']) {
        if (macros[k] != null) entry.macros[k] = Math.max(0, Number(macros[k]) || 0);
      }
    }
    // His numbers now, not the breakdown's: keeping lines that no longer add
    // up to the total would be the fiction this feature exists to remove.
    if (macros && entry.items) delete entry.items;
    entry.edited = true; // an amended number is not the original estimate
    await saveDay(day);
    return day;
  });
}

// Drop ONE line of a plate. The entry's total is recomputed from what is
// left; when the last line goes so does the entry, because an empty plate is
// not a meal. Everything needed to put it back rides in the return.
export async function removeEntryItem(date, entryId, itemId) {
  return withWriteLock(async () => {
    const target = resolveLogDate(date);
    const day = await loadDay(target);
    const entry = day.entries.find((e) => e.id === entryId);
    if (!entry) throw new Error('that entry is no longer there');
    if (!entry.items?.length) throw new Error('that entry has no itemised lines');
    const index = entry.items.findIndex((it) => it.id === itemId);
    if (index < 0) throw new Error('that line is no longer there');
    const [removed] = entry.items.splice(index, 1);
    const entryRemoved = entry.items.length === 0;
    if (entryRemoved) day.entries = day.entries.filter((e) => e.id !== entryId);
    else entry.macros = macrosOfItems(entry.items);
    await saveDay(day);
    return { day, removed, index, entryRemoved, entry: entryRemoved ? { name: entry.name, source: entry.source, time: entry.time } : null };
  });
}

// The undo. A line goes back where it was; a plate emptied by the last delete
// comes back whole, with its clock time and provenance intact.
export async function restoreEntryItem(date, entryId, item, index = -1, entryShell = null) {
  return withWriteLock(async () => {
    const target = resolveLogDate(date);
    const day = await loadDay(target);
    const line = normalizeItems([item])[0];
    if (!line) throw new Error('nothing to put back');
    if (item?.id) line.id = String(item.id).slice(0, 8);
    let entry = day.entries.find((e) => e.id === entryId);
    if (!entry) {
      entry = { id: entryId, ...(entryShell?.time ? { time: entryShell.time } : {}), name: entryShell?.name || line.name, macros: { p: 0, c: 0, f: 0, kcal: 0 }, items: [] };
      if (entryShell?.source) entry.source = entryShell.source;
      day.entries.push(entry);
    }
    entry.items = entry.items || [];
    const at = index >= 0 && index <= entry.items.length ? index : entry.items.length;
    entry.items.splice(at, 0, line);
    entry.macros = macrosOfItems(entry.items);
    await saveDay(day);
    return day;
  });
}

// Most-recent-first list of day files, for cross-day history/aggregation. The
// per-day files are never deleted, so this is a durable log of everything
// eaten off-plan — nothing read across them until now.
export async function loadRecentDays(days = 45) {
  const dir = LOG_DIR();
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(0, days);
  const out = [];
  for (const f of files) {
    try { out.push(JSON.parse(await readFile(path.join(dir, f), 'utf8'))); } catch { /* skip a corrupt day, don't fail the query */ }
  }
  return out;
}

// Entries are only ever shown/removable for today, so no need to search
// across days for the id.
export async function removeEntry(entryId) {
  return withWriteLock(() => removeEntryUnlocked(entryId));
}

async function removeEntryUnlocked(entryId) {
  const day = await loadDay(today());
  day.entries = day.entries.filter((e) => e.id !== entryId);
  await saveDay(day);
  return day;
}

// Undo for a removal: the entry goes back VERBATIM — same id, same time, same
// macros — so an undone delete leaves the day byte-identical to before it,
// rather than a new entry that merely looks similar. Appended at the end if
// its original position is gone; entries carry their own time.
export async function restoreEntryOn(date, entry) {
  return withWriteLock(async () => {
    const target = resolveLogDate(date);
    const day = await loadDay(target);
    if (day.entries.some((e) => e.id === entry.id)) return day; // already back
    day.entries.push(entry);
    await saveDay(day);
    return day;
  });
}

// Date-addressed removal for inbox undo, which may run after midnight has
// rolled the "today" file over.
export async function removeEntryOn(date, entryId) {
  return withWriteLock(() => removeEntryOnUnlocked(date, entryId));
}

async function removeEntryOnUnlocked(date, entryId) {
  const day = await loadDay(date);
  const before = day.entries.length;
  day.entries = day.entries.filter((e) => e.id !== entryId);
  await saveDay(day);
  return before - day.entries.length;
}
