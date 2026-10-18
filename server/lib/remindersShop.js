import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { lineKey } from '../../src/shopPrice.js';

// ONE LIST, TWO DOORS (19 Oct 2026). His ask: the Reminders list Siri calls
// "Shopping" and Nova's shopping list are the same list, both ways, so "Hey
// Siri, add milk to my shopping list" shows up in Nova, and the recipe lines
// Nova writes show up in Reminders. His calls: the list is "Shopping"; a tick
// on either side ticks both.
//
// The vault stays the source of truth. Each pass reads both sides and
// compares each with what the last pass left (the base), so only a REAL
// change moves anything:
//
//   - one reminder per Nova line ("10 Weet-Bix", the recipe in the notes)
//   - a reminder Siri added is filed into the vault the way a Quick Capture
//     is: code sorts it into an aisle, an Inbox record carries its Undo
//   - a tick on one side ticks the other; changed on both, the vault wins
//   - deleted in Reminders, the line leaves Nova with an Undo record;
//     removed in Nova, its reminder is removed
//   - THE GUARD: when more than half of the linked lines vanish in one pass
//     (an empty read, iCloud's stale-file quirk), nothing is deleted on
//     either side and the status says why
//   - the first pass deletes nothing: it links lines by name and adds what
//     each side is missing
//
// EventKit is reached through server/bin/nova-reminders (native/
// reminders-bridge.swift), a pipe with no judgement of its own.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = () => path.join(dataRoot(), 'reminders-shop.json');
export const LIST = 'Shopping';
export const BRIDGE = path.join(__dirname, '..', 'bin', 'nova-reminders');
const SRC = path.join(__dirname, '..', 'native', 'reminders-bridge.swift');
const PLIST = path.join(__dirname, '..', 'native', 'reminders-bridge.plist');
export const EVERY_MS = 20 * 1000;

/* ------------------------------------------------------------ the store -- */

const emptyStore = () => ({ version: 1, list: LIST, map: {}, lastSync: null, lastError: null, counts: null });
export async function loadSyncStore() {
  try { return { ...emptyStore(), ...JSON.parse(await readFile(STORE(), 'utf8')) }; } catch { return emptyStore(); }
}
async function saveSyncStore(s) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${STORE()}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 1));
  await rename(tmp, STORE());
}

/* ------------------------------------------------------------ the lines -- */

// The words of a reminder are what Nova would have read had he typed them
const NUMS = /^\s*((?:\d+(?:\.\d+)?|[¼½¾])\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:kg|g|ml|l|tbsp|tsp|cups?|slices?|cloves?|cans?|tins?|packs?|jars?|bottles?|punnets?|bunch(?:es)?|heads?|sachets?)?\s*(?:\+\s*)?)+/i;
export const keyOfTitle = (title) => lineKey(String(title || '').replace(NUMS, '').replace(/\s*×\s*\d+\s*$/, ''));

// Nova's items grouped as the screen groups them (src/shopModel.js buildLines)
export function linesOf(items) {
  const by = new Map();
  for (const it of items || []) {
    if (!it?.name) continue;
    const k = lineKey(it.name) || `id:${it.id}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(it);
  }
  const out = new Map();
  for (const [key, its] of by) {
    const first = its[0];
    const amounts = its.map((i) => (i.amount ? `${i.amount}${(Number(i.qty) || 1) > 1 ? ` × ${i.qty}` : ''}` : null)).filter(Boolean);
    const qty = its.length === 1 && !first.amount && (Number(first.qty) || 1) > 1 ? ` ×${first.qty}` : '';
    const title = `${amounts.length ? `${amounts.join(' + ')} ` : ''}${first.name}${qty}`;
    const sources = [...new Set(its.map((i) => i.source).filter((s) => s && !/^(reminders|text|voice|inbox|siri)$/i.test(s)))];
    out.set(key, { key, items: its, done: its.every((i) => i.checked), title, notes: sources.length ? `for ${sources.join(' · ')}` : '' });
  }
  return out;
}

/* ------------------------------------------------------------- the pass -- */

const GUARD_MIN = 3;
const tooMany = (gone, linked) => gone > GUARD_MIN && gone > linked / 2;

// deps: {
//   readReminders() → [{ id, title, notes, done }]
//   applyReminders(ops) → [{ op, ref, id, ok, item }]
//   loadItems() → vault items
//   fileFromReminders(title) → { ids, record }        (an Inbox record, Undo)
//   removeFromReminders(ids, title) → { removed, record }
//   toggle(id, checked)
//   now()
// }
export async function syncPass(deps, store) {
  const s = store || await loadSyncStore();
  s.map ||= {};
  const report = { imported: [], removedInNova: [], tickedInNova: 0, added: 0, updated: 0, removedInReminders: 0, guarded: null, errors: [] };

  /* -- A: Reminders → the vault -- */
  let rs = await deps.readReminders();
  let lines = linesOf(await deps.loadItems());
  const byRid = new Map(Object.entries(s.map).map(([k, m]) => [m.rid, k]));
  const rById = new Map(rs.map((r) => [r.id, r]));

  // deleted in Reminders
  const goneInR = Object.entries(s.map).filter(([, m]) => !rById.has(m.rid));
  if (tooMany(goneInR.length, Object.keys(s.map).length)) {
    report.guarded = `${goneInR.length} of ${Object.keys(s.map).length} linked reminders vanished in one read; nothing was deleted`;
  } else {
    for (const [k, m] of goneInR) {
      const L = lines.get(k);
      if (L) {
        const { removed } = await deps.removeFromReminders(L.items.map((i) => i.id), L.title);
        if (removed?.length) report.removedInNova.push(L.title);
      }
      delete s.map[k];
      byRid.delete(m.rid);
    }
  }

  // added in Reminders (Siri, or him in the app)
  for (const r of rs) {
    if (byRid.has(r.id)) continue;
    const k = keyOfTitle(r.title);
    if (!k) continue;
    if (lines.has(k) && !s.map[k]) {
      // the same thing on both sides: link them, nothing added
      s.map[k] = { rid: r.id, rDone: r.done, nDone: lines.get(k).done, title: r.title, notes: r.notes };
      byRid.set(r.id, k);
      continue;
    }
    if (r.done) continue; // an old ticked reminder is not a new thing to buy
    const { ids } = await deps.fileFromReminders(r.title);
    report.imported.push(r.title);
    // a second "milk" while milk is linked folds into the line, and its
    // reminder goes (the line's own reminder now carries both)
    if (s.map[k]) { s.map[`dupe:${r.id}`] = { rid: r.id, dupe: true }; continue; }
    s.map[k] = { rid: r.id, rDone: false, nDone: false, title: r.title, notes: r.notes, ids };
    byRid.set(r.id, k);
  }

  // ticked in Reminders
  for (const [k, m] of Object.entries(s.map)) {
    if (m.dupe) continue;
    const r = rById.get(m.rid);
    const L = lines.get(k);
    if (!r || !L) continue;
    const rCh = r.done !== m.rDone;
    const nCh = L.done !== m.nDone;
    if (rCh && !nCh) {
      for (const it of L.items) if (!!it.checked !== r.done) await deps.toggle(it.id, r.done);
      report.tickedInNova += 1;
      m.nDone = r.done;
      m.rDone = r.done;
    }
  }

  /* -- B: the vault → Reminders -- */
  lines = linesOf(await deps.loadItems());
  const ops = [];
  const goneInN = Object.entries(s.map).filter(([k, m]) => !m.dupe && !lines.has(k) && rById.has(m.rid));
  const guardN = tooMany(goneInN.length, Object.keys(s.map).length);
  if (guardN) report.guarded = `${goneInN.length} of ${Object.keys(s.map).length} lines vanished from the vault in one read; nothing was deleted`;

  for (const [k, m] of Object.entries(s.map)) {
    if (m.dupe) { if (rById.has(m.rid)) ops.push({ op: 'remove', id: m.rid, key: k }); else delete s.map[k]; continue; }
    const L = lines.get(k);
    const r = rById.get(m.rid);
    if (!L) {
      if (!r) { delete s.map[k]; continue; }
      if (!guardN) ops.push({ op: 'remove', id: m.rid, key: k });
      continue;
    }
    if (!r) continue; // linked before this pass's own read: next pass sees it
    const want = { title: L.title, notes: L.notes, done: L.done };
    if (r.title !== want.title || (r.notes || '') !== want.notes || r.done !== want.done) ops.push({ op: 'set', id: m.rid, key: k, ...want });
  }
  for (const [k, L] of lines) {
    if (s.map[k]) continue;
    ops.push({ op: 'add', ref: k, key: k, title: L.title, notes: L.notes, done: L.done });
  }

  if (ops.length) {
    const results = await deps.applyReminders(ops.map(({ key, ...o }) => o));
    results.forEach((res, i) => {
      const o = ops[i];
      if (!res?.ok) { report.errors.push(`${o.op} ${o.title || o.id}: ${res?.error || 'failed'}`); return; }
      const L = lines.get(o.key);
      if (o.op === 'add') {
        s.map[o.key] = { rid: res.item.id, rDone: o.done, nDone: L.done, title: o.title, notes: o.notes };
        report.added += 1;
      } else if (o.op === 'set') {
        Object.assign(s.map[o.key], { rDone: o.done, nDone: L.done, title: o.title, notes: o.notes });
        report.updated += 1;
      } else if (o.op === 'remove') {
        delete s.map[o.key];
        report.removedInReminders += 1;
      }
    });
  }
  // what both sides agree on now is the next pass's base
  for (const [k, m] of Object.entries(s.map)) {
    const L = lines.get(k);
    if (!m.dupe && L && !ops.some((o) => o.key === k)) { m.nDone = L.done; const r = rById.get(m.rid); if (r) m.rDone = r.done; }
  }

  s.lastSync = deps.now().toISOString();
  s.lastError = report.errors[0] || report.guarded || null;
  s.counts = { linked: Object.values(s.map).filter((m) => !m.dupe).length };
  await saveSyncStore(s);
  return report;
}

/* ----------------------------------------------------------- the bridge -- */

function runBridge(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(BRIDGE, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Reminders did not answer in 60 s')); }, 60000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', () => {
      clearTimeout(timer);
      let json = null;
      try { json = JSON.parse(out.trim().split('\n').pop()); } catch { /* below */ }
      if (!json) return reject(new Error(err.trim() || 'the Reminders bridge answered nothing'));
      if (json.error) return reject(Object.assign(new Error(json.error), { bridge: true }));
      resolve(json);
    });
    // always closed: an open stdin hangs a child that reads it (spawnStdin.test.js)
    child.stdin.end(input || '');
  });
}

// Built on this Mac from its source when missing; never committed.
export async function ensureBridge() {
  if (existsSync(BRIDGE)) return true;
  await mkdir(path.dirname(BRIDGE), { recursive: true });
  await new Promise((resolve, reject) => execFile('swiftc', ['-O', '-swift-version', '5', SRC, '-o', BRIDGE,
    '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', PLIST], (e) => (e ? reject(e) : resolve())));
  return true;
}

export const bridge = {
  access: () => runBridge(['access']),
  read: async (list = LIST) => (await runBridge(['read', list])).items,
  apply: async (ops, list = LIST) => (await runBridge(['apply', list], JSON.stringify(ops))).results,
};

/* ------------------------------------------------------- the live wiring -- */

export function liveDeps(vaultPath) {
  return {
    readReminders: () => bridge.read(),
    applyReminders: (ops) => bridge.apply(ops),
    loadItems: async () => (await (await import('./shoppingList.js')).loadShoppingList(vaultPath)).items,
    toggle: async (id, checked) => (await import('./shoppingList.js')).toggleItem(vaultPath, id, checked),
    now: () => new Date(),
    // filed the way a Quick Capture shopping add is: code sorts it, the
    // record's Undo takes it off again
    async fileFromReminders(title) {
      const { decisionFor } = await import('./captureLocal.js');
      const { fileDecision } = await import('./inbox.js');
      const { createRecord } = await import('./inboxStore.js');
      const decision = { ...decisionFor('shopping', title, new Date(), 'Added in Reminders (Siri or the app)'), by: 'code' };
      const { destination, undo } = await fileDecision(vaultPath, decision, { source: 'reminders' });
      const at = new Date().toISOString();
      const record = await createRecord({
        id: randomUUID().slice(0, 8), text: title, source: 'reminders', mode: 'auto-all', status: 'filed',
        createdAt: at, decision, destination, undoData: undo, filedAt: at, auto: true,
      });
      return { ids: undo.ids, record };
    },
    // a line deleted in Reminders leaves the vault with its Undo
    async removeFromReminders(ids, title) {
      const { removeItemsReturning } = await import('./shoppingList.js');
      const { createRecord } = await import('./inboxStore.js');
      const { removed } = await removeItemsReturning(vaultPath, ids);
      if (!removed.length) return { removed };
      const at = new Date().toISOString();
      const record = await createRecord({
        id: randomUUID().slice(0, 8), text: `Removed in Reminders: ${title}`, source: 'reminders', mode: 'auto-all', status: 'filed',
        createdAt: at, decision: { route: 'shopping', confidence: 'high', title: `Removed ${title}`, reason: 'Deleted from Shopping in Reminders', by: 'code', payload: { items: [] } },
        destination: `Shopping List — removed ${title}`, undoData: { route: 'shopping-restore', items: removed }, filedAt: at, auto: true,
      });
      return { removed, record };
    },
  };
}

let running = false;
let timer = null;
export async function syncNow(vaultPath) {
  if (running) return { skipped: 'a pass is already running' };
  running = true;
  try {
    return await syncPass(liveDeps(vaultPath));
  } catch (e) {
    const s = await loadSyncStore();
    s.lastError = e.message;
    s.lastTry = new Date().toISOString();
    await saveSyncStore(s);
    throw e;
  } finally { running = false; }
}

export async function remindersShopStatus() {
  const s = await loadSyncStore();
  return { list: s.list, lastSync: s.lastSync, lastTry: s.lastTry || null, lastError: s.lastError, linked: s.counts?.linked ?? 0, on: !!timer };
}

export function startRemindersShopSync(vaultPath) {
  if (timer || process.env.NOVA_REMINDERS_SYNC === 'off') return;
  const tick = () => syncNow(vaultPath).catch((e) => { if (!/already running/.test(e.message)) console.error('reminders shop sync:', e.message); });
  ensureBridge().then(() => { setTimeout(tick, 15 * 1000); }).catch((e) => console.error('reminders bridge build failed:', e.message));
  timer = setInterval(tick, EVERY_MS);
}
