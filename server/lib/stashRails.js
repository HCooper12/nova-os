import { randomUUID } from 'node:crypto';
import { createRecord } from './inboxStore.js';
import {
  loadStash, stashAdd, stashRemove, stashUpdate, stashMove, stashBought, stashShelf, findItem, applyStashOps, formatStashItem, fieldsOf,
} from './stash.js';
import { noteAdded } from './stashMeta.js';
import { todayISO, addDays, SNOOZE_DAYS, RHYTHM_WEEKS } from '../../src/stashRhythm.js';
import { stashKey, hostOf } from '../../src/stashUrl.js';

// EVERY STASH WRITE RIDES THE RAILS (10 Oct 2026, the rebuild).
//
// The old screen wrote straight to Stash.md: add, and a remove that was final
// after its inline confirm (the lists audit, finding 3). Every write now
// changes the file through lib/stash.js's line operations AND files one
// record, status `filed` at once (the tap is the approval, as Money's are),
// whose undoData is the INVERSE of those operations (route `stash-ops`), so
// /api/inbox/:id/undo puts the file back exactly as it was. A write that also
// put a line on the shopping list carries those ids, and Undo takes them off.
// The screen's pill offers that Undo; the Inbox's history keeps it after.
// Filed records never push.

const plural = (n, w, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;

async function fileReceipt({ text, destination, ops = [], shoppingIds = [], payload }) {
  const now = new Date().toISOString();
  return createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'stash-write',
    text,
    source: 'stash',
    mode: 'auto',
    status: 'filed',
    createdAt: now,
    filedAt: now,
    auto: false,
    destination,
    undoData: { route: 'stash-ops', ops, shoppingIds },
    decision: {
      route: 'stash-write',
      confidence: 'high',
      title: text,
      reason: 'His own change on the Stash, filed as he made it. Undo puts it back.',
      payload: payload || {},
    },
  });
}

const where = (shelf) => `Stash · ${shelf}`;

// THE UNDO (inbox.js undoFiling, route `stash-ops`)
export async function undoStashOps(vaultPath, undo) {
  let n = 0;
  if (undo.ops?.length) { await applyStashOps(vaultPath, undo.ops); n += undo.ops.length; }
  if (undo.shoppingIds?.length) {
    const { removeItems } = await import('./shoppingList.js');
    await removeItems(vaultPath, undo.shoppingIds).catch(() => 0);
  }
  if (!n && !undo.shoppingIds?.length) throw new Error('this change wrote nothing to take back');
  return undo.shoppingIds?.length ? 'put the Stash back and took the line off the shopping list' : 'put the Stash back as it was';
}

async function hit(vaultPath, raw) {
  const h = findItem(await loadStash(vaultPath), raw);
  if (!h) { const e = new Error('that item is no longer there'); e.status = 409; throw e; }
  return h;
}

/* --------------------------------- add ------------------------------------ */

// A link onto a shelf. `lasts` (weeks) starts its clock today. `via`: 'safari'
// when the Shortcut sent it. A link already on a shelf throws a 409 carrying
// the item it already is (lib/stash.js findDuplicate).
export async function addLink(vaultPath, { category, name, url, note, lasts, via } = {}) {
  const weeks = Number(lasts) || null;
  if (weeks && !(weeks > 0 && weeks <= 104)) { const e = new Error('lasts is in weeks, 1 to 104'); e.status = 400; throw e; }
  const out = await stashAdd(vaultPath, { category, name, url, note, fields: weeks ? { lasts: weeks, bought: todayISO() } : undefined });
  await noteAdded(url, via || null).catch(() => {});
  const record = await fileReceipt({
    text: `Stashed ${String(name).trim()} on ${out.category}`,
    destination: where(out.category),
    ops: out.inverse,
    payload: { raw: out.raw, category: out.category, url, via: via || null },
  });
  return { stash: out.stash, raw: out.raw, category: out.category, record };
}

// THE SHARE SHEET (mockup 90 s3, his yes to the Shortcut): the shelf is the
// one his other links from that site are on, else Unsorted; the name is the
// page's own when Nova could read it, else the site's.
export async function shareLink(vaultPath, { url, name } = {}) {
  const stash = await loadStash(vaultPath);
  const host = hostOf(url);
  const counts = new Map();
  for (const c of stash.categories) {
    if (c.bought || c.gift) continue;
    const k = c.items.filter((i) => i.host === host).length;
    if (k) counts.set(c.name, k);
  }
  const shelf = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unsorted';
  // a Shortcut waits on this answer (iOS drops a request silent for ~25 s),
  // so only the page's name is read now; its picture follows in the queue
  const { previewLink } = await import('./stashMeta.js');
  let title = String(name || '').trim();
  if (!title || /^https?:\/\//i.test(title)) {
    const p = await previewLink(url, { images: false }).catch(() => null);
    title = p?.name || host;
  }
  const out = await addLink(vaultPath, { category: shelf, name: title.slice(0, 140), url, via: 'safari' });
  previewLink(url).catch(() => {});
  return { ...out, picked: counts.size ? 'site' : 'unsorted' };
}

/* --------------------------------- edits ---------------------------------- */

export async function removeLink(vaultPath, raw) {
  const { item, category } = await hit(vaultPath, raw);
  const out = await stashRemove(vaultPath, raw);
  const record = await fileReceipt({ text: `Removed ${item.name}`, destination: where(category.name), ops: out.inverse, payload: { raw, url: item.url } });
  return { stash: out.stash, record };
}

export async function moveLink(vaultPath, raw, to) {
  const { item } = await hit(vaultPath, raw);
  const out = await stashMove(vaultPath, raw, to);
  const record = await fileReceipt({ text: `Moved ${item.name} to ${out.to}`, destination: where(out.to), ops: out.inverse, payload: { raw, from: out.from, to: out.to } });
  return { stash: out.stash, record };
}

// the restock rhythm: weeks, or 0/null for off. Setting one on an item with no
// bought date starts its clock today.
export async function setRhythm(vaultPath, raw, weeks) {
  const { item, category } = await hit(vaultPath, raw);
  const w = Number(weeks) || 0;
  if (w && !(w > 0 && w <= 104)) { const e = new Error('lasts is in weeks, 1 to 104'); e.status = 400; throw e; }
  const patch = w ? { lasts: w, bought: item.bought || todayISO(), check: null } : { lasts: null, check: null };
  const out = await stashUpdate(vaultPath, raw, patch);
  const text = w ? `${item.name} lasts about ${plural(w, 'week')}` : `Restock rhythm off for ${item.name}`;
  const record = await fileReceipt({ text, destination: where(category.name), ops: out.inverse, payload: { raw: out.raw, lasts: w || null } });
  return { stash: out.stash, raw: out.raw, record };
}

export async function setWatch(vaultPath, raw, on) {
  const { item, category } = await hit(vaultPath, raw);
  const out = await stashUpdate(vaultPath, raw, { watch: on ? 'on' : null });
  const record = await fileReceipt({
    text: on ? `Watching the price of ${item.name}` : `Stopped watching ${item.name}`,
    destination: where(category.name), ops: out.inverse, payload: { raw: out.raw, watch: !!on },
  });
  return { stash: out.stash, raw: out.raw, record };
}

export async function setNote(vaultPath, raw, note) {
  const { item, category } = await hit(vaultPath, raw);
  const out = await stashUpdate(vaultPath, raw, { note: String(note || '').trim() || null });
  const record = await fileReceipt({ text: `Changed the note on ${item.name}`, destination: where(category.name), ops: out.inverse, payload: { raw: out.raw } });
  return { stash: out.stash, raw: out.raw, record };
}

// FINISHED (mockup 90 s1: "Finished, moved to Read"): the line takes the
// day he finished it and moves to the Read shelf, made if it is not there.
// Unread again clears the day and leaves it where it is.
export const READ_SHELF = 'Read';
export async function markRead(vaultPath, raw, done = true) {
  const { item, category } = await hit(vaultPath, raw);
  if (!done || category.name.toLowerCase() === READ_SHELF.toLowerCase()) {
    const out = await stashUpdate(vaultPath, raw, { read: done ? todayISO() : null });
    const record = await fileReceipt({ text: done ? `Finished ${item.name}` : `${item.name} is unread again`, destination: where(category.name), ops: out.inverse, payload: { raw: out.raw } });
    return { stash: out.stash, raw: out.raw, record };
  }
  const next = formatStashItem({ name: item.name, url: item.url, note: item.note, fields: { ...fieldsOf(item), read: todayISO() } });
  const out = await applyStashOps(vaultPath, [
    { op: 'replace', from: raw, to: null },
    { op: 'insert', raw: next, category: READ_SHELF, at: 'start' },
  ]);
  const record = await fileReceipt({ text: `Finished, moved to Read: ${item.name}`, destination: where(READ_SHELF), ops: out.inverse, payload: { raw: next, from: category.name } });
  return { stash: out.stash, raw: next, record };
}

export async function markBought(vaultPath, raw, { paid, date } = {}) {
  const day = date || todayISO();
  const out = await stashBought(vaultPath, raw, { date: day, paid });
  const p = out.history.match(/\[paid:: ([0-9.]+)\]/);
  const text = `Bought ${out.item.name}${p ? ` for $${p[1]}` : ''}`;
  const record = await fileReceipt({
    text: out.stays ? `${text}, clock restarted` : text,
    destination: where('Bought'), ops: out.inverse, payload: { raw, history: out.history, stays: out.stays },
  });
  const { resolveLevelChecks } = await import('./stashSignals.js');
  await resolveLevelChecks(out.item.key, 'bought').catch(() => {});
  return { stash: out.stash, record, stays: out.stays };
}

// a line on the shopping list, with Undo
export async function toShoppingList(vaultPath, raw, { quiet = false } = {}) {
  const { item } = await hit(vaultPath, raw);
  const { addItemsDirect } = await import('./shoppingList.js');
  const added = await addItemsDirect(vaultPath, [{ name: item.name, category: 'Household & Other', qty: 1, source: 'stash' }]);
  if (quiet) return { ids: added.map((a) => a.id) };
  const record = await fileReceipt({ text: `${item.name} is on your shopping list`, destination: 'Shopping list', shoppingIds: added.map((a) => a.id), payload: { raw, url: item.url } });
  return { record, ids: added.map((a) => a.id) };
}

// THE LEVEL CHECK, ANSWERED (mockup 88: in place, three answers, each with Undo)
//   plenty     asked again in two weeks (`check` moves)
//   low        onto the shopping list, and asked again in two weeks
//   reordered  bought today: the clock restarts and Bought gets the line
export async function answerCheck(vaultPath, raw, answer) {
  const { item, category } = await hit(vaultPath, raw);
  const { resolveLevelChecks } = await import('./stashSignals.js');
  if (answer === 'reordered') {
    const out = await markBought(vaultPath, raw, { date: todayISO() });
    return out;
  }
  if (answer !== 'plenty' && answer !== 'low') { const e = new Error('unknown answer'); e.status = 400; throw e; }
  // two weeks from today, or from a check already moved past today
  const from = item.check && item.check > todayISO() ? item.check : todayISO();
  const out = await stashUpdate(vaultPath, raw, { check: addDays(from, SNOOZE_DAYS) });
  let shoppingIds = [];
  if (answer === 'low') shoppingIds = (await toShoppingList(vaultPath, out.raw, { quiet: true })).ids;
  await resolveLevelChecks(stashKey(item.url), answer).catch(() => {});
  const record = await fileReceipt({
    text: answer === 'low' ? `${item.name} is on your list, with its link` : `Asked again about ${item.name} in two weeks`,
    destination: answer === 'low' ? 'Shopping list' : where(category.name),
    ops: out.inverse, shoppingIds, payload: { raw: out.raw, answer },
  });
  return { stash: out.stash, raw: out.raw, record };
}

export async function makeShelf(vaultPath, { name, date } = {}) {
  const out = await stashShelf(vaultPath, { name, date });
  const record = await fileReceipt({
    text: out.changed === 'new' ? `New shelf: ${out.name}${date ? `, ${date}` : ''}` : `${out.name}${date ? ` is on ${date}` : ' has no date now'}`,
    destination: where(out.name), ops: out.inverse, payload: { name: out.name, date: date || null },
  });
  return { stash: out.stash, record };
}

export { RHYTHM_WEEKS };
