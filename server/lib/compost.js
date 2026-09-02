import { readFile, writeFile, mkdir, rename, readdir, stat } from 'node:fs/promises';
import { respectNo } from './respectTheNo.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import matter from 'gray-matter';
import { Vault } from './vault.js';
import { backupFile } from './backup.js';
import { createRecord } from './inboxStore.js';

// The Compost loop — runs weekly (or on demand), READ-ONLY: it scans the
// vault and proposes hygiene, never performs it. Accepting a proposal runs
// deterministic code, and every mutation lands in the inbox history with
// undo data. All three detectors are pure code — no model involved.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = () => path.join(dataRoot(), 'compost.json');

const INBOX_DIR_REL = 'Wiki/Inbox';
const ARCHIVE_DIR_REL = 'Wiki/Inbox/Archive';
const TODO_REL = 'Wiki/Inbox/To-Do.md';
const STALE_DAYS = 14;
// A dismissed proposal stays dismissed for this long, then may return —
// naming the history. Replaces a 200-key slice whose memory expired by
// displacement: when a no came back depended on how much else he had
// dismissed since (lib/respectTheNo.js, the plain-cooldown form).
const DISMISS_COOLDOWN_DAYS = 90;
const DISMISS_KEEP_DAYS = 365;
const MAX_ORPHANS = 8;

let cache = null;
let loadPromise = null;
let lock = Promise.resolve();
function withLock(fn) {
  const run = lock.catch(() => {}).then(fn);
  lock = run.catch(() => {});
  return run;
}

// Single-flight load + atomic persist — same hardening as inboxStore (found
// by the Breaker there): concurrent cold loads share one promise, and a
// mid-write kill can never leave a torn file. Compost state regenerates from
// a re-scan, so a corrupt file just starts fresh.
function load() {
  if (cache) return Promise.resolve(cache);
  if (!loadPromise) {
    loadPromise = (async () => {
      let parsed = null;
      if (existsSync(STORE_PATH())) {
        try {
          parsed = JSON.parse(await readFile(STORE_PATH(), 'utf8'));
        } catch {
          parsed = null;
        }
      }
      cache = parsed && typeof parsed === 'object' ? parsed : { lastRunAt: null, proposals: [], dismissed: {} };
      if (!Array.isArray(cache.proposals)) cache.proposals = [];
      if (!cache.dismissed || typeof cache.dismissed !== 'object') cache.dismissed = {};
      // one-time migration from the undated key list: those no's take the
      // last run's date, so their cooldown starts from the last time they held
      if (Array.isArray(cache.dismissedKeys)) {
        for (const k of cache.dismissedKeys) if (!cache.dismissed[k]) cache.dismissed[k] = cache.lastRunAt || new Date().toISOString();
        delete cache.dismissedKeys;
      }
      return cache;
    })();
    loadPromise.catch(() => { loadPromise = null; });
  }
  return loadPromise;
}

async function persist() {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = STORE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
  await rename(tmp, STORE_PATH());
}

/* ------------------------------- detectors ------------------------------- */

// Studio's graveyard guard: idea seeds untouched for 30 days deserve one
// "archive or promote" nudge instead of quietly rotting.
// The whole idea pipeline is guarded, not just seeds: a seed goes stale at
// 30 days; an idea stalled in outlining or scripting at 45 (there was work
// in it — give it longer), with status-aware wording.
const SEED_STALE_DAYS = 30;
const PIPELINE_STALE_DAYS = 45;
const PIPELINE_STATUSES = new Set(['outlining', 'scripting']);
async function detectStaleSeeds(vaultPath) {
  const dir = path.join(vaultPath, 'Wiki/Studio/Ideas');
  if (!existsSync(dir)) return [];
  const out = [];
  const cutoff = Date.now() - SEED_STALE_DAYS * 24 * 60 * 60 * 1000;
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.md')) continue;
    const full = path.join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) continue;
    let data = {};
    try {
      data = matter(await readFile(full, 'utf8')).data || {};
    } catch {
      continue;
    }
    if (data.type !== 'idea') continue;
    const status = String(data.status || '').toLowerCase();
    const inPipeline = PIPELINE_STATUSES.has(status);
    if (status !== 'seed' && !inPipeline) continue;
    const updatedMs = data.updated ? new Date(data.updated).getTime() : st.mtimeMs;
    const limit = inPipeline ? Date.now() - PIPELINE_STALE_DAYS * 24 * 60 * 60 * 1000 : cutoff;
    if (updatedMs < limit) {
      out.push({
        type: 'stale-seed',
        key: `seed:${name}`,
        title: name.replace(/\.md$/, ''),
        detail: inPipeline
          ? `An idea stalled in ${status} since ${data.updated || 'over six weeks ago'} — finish the ${status === 'outlining' ? 'outline' : 'script'}, park it, or archive it.`
          : `An idea seed untouched since ${data.updated || 'over a month ago'} — archive it, or open it and move it along the pipeline.`,
        data: { relPath: `Wiki/Studio/Ideas/${name}`, status },
      });
    }
  }
  return out;
}

// COMPOST RUNS BEHIND THE DISTILLER. An unlinked capture the distiller has
// not read yet is not compost material — it is next week's distillation.
// A capture the distiller has SEEN and left alone (its leave-alone memory,
// lib/distill.js) is honest compost at the normal 14 days; an unlinked one
// it has not read waits two distill cycles (28 days). Linked captures keep
// the 14-day rule: the graph already has them.
const UNSEEN_STALE_DAYS = 28;
async function detectStaleCaptures(vaultPath) {
  const dir = path.join(vaultPath, INBOX_DIR_REL);
  if (!existsSync(dir)) return [];
  const out = [];
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const unseenCutoff = Date.now() - UNSEEN_STALE_DAYS * 24 * 60 * 60 * 1000;
  let leftAlone = new Set();
  try {
    const { leftAloneRecently, loadRecentJobs } = await import('./distill.js');
    leftAlone = leftAloneRecently(await loadRecentJobs(), new Date(), 52); // ever seen, this year
  } catch { /* no memory → the longer rule applies to every unlinked capture */ }
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.md') || name === 'To-Do.md') continue;
    const full = path.join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) continue;
    let created = null;
    let linked = true;
    try {
      const raw = await readFile(full, 'utf8');
      created = matter(raw).data.created || null;
      linked = raw.includes('[[');
    } catch {
      /* unreadable file — skip */
    }
    const rel = `${INBOX_DIR_REL}/${name}`;
    const seenByDistiller = leftAlone.has(rel);
    const createdMs = created ? new Date(created).getTime() : st.mtimeMs;
    const limit = linked || seenByDistiller ? cutoff : unseenCutoff;
    if (createdMs < limit) {
      out.push({
        type: 'stale-capture',
        key: `stale:${INBOX_DIR_REL}/${name}`,
        title: name.replace(/\.md$/, ''),
        detail: `Captured ${created || st.mtime.toISOString().slice(0, 10)} and still sitting in the Inbox — archive it, or open it in Obsidian and promote it properly.`,
        data: { relPath: `${INBOX_DIR_REL}/${name}` },
      });
    }
  }
  return out;
}

async function detectOrphans(vaultPath) {
  const vault = new Vault(vaultPath);
  let pages;
  try {
    pages = await vault.listPages();
  } catch {
    return [];
  }
  const backlinks = await vault.backlinkCounts(pages);
  // Only knowledge pages can be "orphans". Nova's own state pages (shopping
  // list, rotation, exercise state, workout sessions…) are unlinked by
  // design, and Inbox captures have their own stale-capture lifecycle.
  const KNOWLEDGE_TYPES = new Set(['concept', 'topic', 'source', 'entity', 'analysis', 'idea', 'raw', 'note']);
  const orphans = pages.filter((p) =>
    KNOWLEDGE_TYPES.has((p.type || '').toLowerCase())
    && !p.relPath.startsWith(INBOX_DIR_REL)
    && !p.relPath.startsWith('Wiki/Studio/Ideas') // seeds have their own stale-seed lifecycle
    && (backlinks.get(p.id) || 0) === 0
    && p.links.length === 0);
  // the cap is said, on the first island, instead of biting silently
  const shown = orphans.slice(0, MAX_ORPHANS);
  const capNote = orphans.length > shown.length ? ` (${shown.length} of ${orphans.length} islands shown — the rest come forward as these clear.)` : '';
  return shown.map((p, i) => ({
    type: 'orphan',
    key: `orphan:${p.relPath}`,
    title: p.title,
    detail: `No links in, no links out — an island in the galaxy. Worth linking into the graph, or leaving deliberately.${i === 0 ? capNote : ''}`,
    data: { noteId: p.id, relPath: p.relPath },
  }));
}

async function detectSweepableTodos(vaultPath) {
  const full = path.join(vaultPath, TODO_REL);
  if (!existsSync(full)) return [];
  const raw = await readFile(full, 'utf8');
  const checked = raw.split('\n').filter((l) => /^- \[x\]/i.test(l.trim()));
  if (!checked.length) return [];
  return [{
    type: 'sweep-todos',
    key: `sweep:${checked.length}:${checked.join('|').length}`,
    title: `Sweep ${checked.length} completed to-do${checked.length === 1 ? '' : 's'}`,
    detail: checked.map((l) => l.replace(/^- \[x\]\s*/i, '').replace(/_\(added [^)]*\)_\s*(#[a-z-]+\s*)?$/, '').trim()).join(' · '),
    data: { relPath: TODO_REL, lines: checked },
  }];
}

/* --------------------------------- runs ---------------------------------- */

export async function runCompost(vaultPath, { now = Date.now() } = {}) {
  return withLock(async () => {
    const store = await load();
    const found = [
      ...(await detectSweepableTodos(vaultPath)),
      ...(await detectStaleCaptures(vaultPath)),
      ...(await detectStaleSeeds(vaultPath)),
      ...(await detectOrphans(vaultPath)),
    ];
    store.proposals = found
      .map((p) => {
        const at = store.dismissed[p.key];
        const no = respectNo({ declined: at ? { at: new Date(at).getTime(), metric: null, count: 1 } : null, now, cooldownDays: DISMISS_COOLDOWN_DAYS, materialChange: null });
        if (!no.raise) return null;
        // a return after the cooldown says so — he passed on it once
        return no.history ? { ...p, detail: `${p.detail} (${no.history[0].toUpperCase()}${no.history.slice(1)}.)`, returned: true } : p;
      })
      .filter(Boolean)
      .map((p) => ({ id: randomUUID().slice(0, 8), status: 'open', createdAt: new Date().toISOString(), ...p }));
    store.lastRunAt = new Date().toISOString();
    await persist();
    return { lastRunAt: store.lastRunAt, proposals: store.proposals };
  });
}

export async function getCompost() {
  const store = await load();
  return { lastRunAt: store.lastRunAt, proposals: store.proposals };
}

export async function dismissProposal(id) {
  return withLock(async () => {
    const store = await load();
    const p = store.proposals.find((x) => x.id === id);
    if (!p) throw new Error('proposal not found');
    p.status = 'dismissed';
    store.dismissed[p.key] = new Date().toISOString();
    // a year-old no has long since had its say — keep the file small
    const keepFrom = Date.now() - DISMISS_KEEP_DAYS * 86_400_000;
    for (const [k, at] of Object.entries(store.dismissed)) if (new Date(at).getTime() < keepFrom) delete store.dismissed[k];
    await persist();
    return p;
  });
}

// Accepting runs the deterministic action and records it in the inbox
// history (kind: compost) with undo data, so the receipts live in one place.
export async function acceptProposal(vaultPath, id) {
  return withLock(async () => {
    const store = await load();
    const p = store.proposals.find((x) => x.id === id);
    if (!p) throw new Error('proposal not found');
    if (p.status !== 'open') throw new Error('proposal already handled');

    let destination;
    let undoData;

    if (p.type === 'stale-capture' || p.type === 'stale-seed') {
      const from = path.join(vaultPath, p.data.relPath);
      if (!existsSync(from)) throw new Error('that note no longer exists');
      const archiveRel = p.type === 'stale-seed' ? 'Wiki/Studio/Ideas/Archive' : ARCHIVE_DIR_REL;
      await mkdir(path.join(vaultPath, archiveRel), { recursive: true });
      let toRel = `${archiveRel}/${path.basename(p.data.relPath)}`;
      if (existsSync(path.join(vaultPath, toRel))) {
        toRel = toRel.replace(/\.md$/, ` ${Date.now() % 10000}.md`);
      }
      await rename(from, path.join(vaultPath, toRel));
      destination = `Archived — ${p.title}`;
      undoData = { route: 'note-move', from: p.data.relPath, to: toRel };
    } else if (p.type === 'sweep-todos') {
      // shares the todoLine write lock with every other writer of this page
      const { withTodoLock } = await import('./todoLine.js');
      const swept = await withTodoLock(async () => {
        const full = path.join(vaultPath, p.data.relPath);
        if (!existsSync(full)) throw new Error('the To-Do file no longer exists');
        await backupFile(full);
        let raw = await readFile(full, 'utf8');
        const removed = [];
        for (const line of p.data.lines) {
          const idx = raw.indexOf(line);
          if (idx === -1) continue;
          raw = raw.slice(0, idx) + raw.slice(idx + line.length).replace(/^\n/, '');
          removed.push(line);
        }
        if (!removed.length) throw new Error('those lines have changed since the scan — re-run the loop');
        await writeFile(full, raw, 'utf8');
        return removed;
      });
      destination = `Swept ${swept.length} completed to-do${swept.length === 1 ? '' : 's'}`;
      undoData = { route: 'todo-restore', relPath: p.data.relPath, lines: swept };
    } else {
      throw new Error('this proposal is informational — open it or dismiss it');
    }

    p.status = 'accepted';
    await persist();

    const record = {
      id: randomUUID().slice(0, 8),
      kind: 'compost',
      text: p.title,
      source: 'compost',
      mode: 'manual',
      status: 'filed',
      createdAt: new Date().toISOString(),
      decision: { route: 'note', confidence: 'high', title: p.title, reason: 'Compost loop proposal, accepted by you.', payload: {} },
      destination,
      undoData,
      filedAt: new Date().toISOString(),
      auto: false,
    };
    await createRecord(record);
    return { proposal: p, record };
  });
}

// Weekly cadence: a daily check that runs the scan when the last run is
// more than 7 days old. The scan itself is read-only and cheap.
async function checkAndRun(vaultPath) {
  try {
    const store = await load();
    const last = store.lastRunAt ? new Date(store.lastRunAt).getTime() : 0;
    if (Date.now() - last > 7 * 24 * 60 * 60 * 1000) await runCompost(vaultPath);
  } catch (err) {
    console.error('Compost loop failed:', err.message);
  }
}

export function startCompostScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('compost');
    return checkAndRun(vaultPath);
  };
  tick();
  setInterval(tick, 24 * 60 * 60 * 1000);
}

// test hook
export function _resetCompost() {
  cache = null;
  loadPromise = null;
}
