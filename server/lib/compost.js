import { readFile, writeFile, mkdir, rename, readdir, stat } from 'node:fs/promises';
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
      cache = parsed && typeof parsed === 'object' ? parsed : { lastRunAt: null, proposals: [], dismissedKeys: [] };
      if (!Array.isArray(cache.proposals)) cache.proposals = [];
      if (!Array.isArray(cache.dismissedKeys)) cache.dismissedKeys = [];
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

async function detectStaleCaptures(vaultPath) {
  const dir = path.join(vaultPath, INBOX_DIR_REL);
  if (!existsSync(dir)) return [];
  const out = [];
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.md') || name === 'To-Do.md') continue;
    const full = path.join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) continue;
    let created = null;
    try {
      created = matter(await readFile(full, 'utf8')).data.created || null;
    } catch {
      /* unreadable file — skip */
    }
    const createdMs = created ? new Date(created).getTime() : st.mtimeMs;
    if (createdMs < cutoff) {
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
    && (backlinks.get(p.id) || 0) === 0
    && p.links.length === 0);
  return orphans.slice(0, MAX_ORPHANS).map((p) => ({
    type: 'orphan',
    key: `orphan:${p.relPath}`,
    title: p.title,
    detail: `No links in, no links out — an island in the galaxy. Worth linking into the graph, or leaving deliberately.`,
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
    detail: checked.map((l) => l.replace(/^- \[x\]\s*/i, '').replace(/_\(added [^)]*\)_\s*$/, '').trim()).join(' · '),
    data: { relPath: TODO_REL, lines: checked },
  }];
}

/* --------------------------------- runs ---------------------------------- */

export async function runCompost(vaultPath) {
  return withLock(async () => {
    const store = await load();
    const found = [
      ...(await detectSweepableTodos(vaultPath)),
      ...(await detectStaleCaptures(vaultPath)),
      ...(await detectOrphans(vaultPath)),
    ];
    const dismissed = new Set(store.dismissedKeys);
    store.proposals = found
      .filter((p) => !dismissed.has(p.key))
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
    store.dismissedKeys.push(p.key);
    if (store.dismissedKeys.length > 200) store.dismissedKeys = store.dismissedKeys.slice(-200);
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

    if (p.type === 'stale-capture') {
      const from = path.join(vaultPath, p.data.relPath);
      if (!existsSync(from)) throw new Error('that note no longer exists');
      await mkdir(path.join(vaultPath, ARCHIVE_DIR_REL), { recursive: true });
      let toRel = `${ARCHIVE_DIR_REL}/${path.basename(p.data.relPath)}`;
      if (existsSync(path.join(vaultPath, toRel))) {
        toRel = toRel.replace(/\.md$/, ` ${Date.now() % 10000}.md`);
      }
      await rename(from, path.join(vaultPath, toRel));
      destination = `Archived — ${p.title}`;
      undoData = { route: 'note-move', from: p.data.relPath, to: toRel };
    } else if (p.type === 'sweep-todos') {
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
      destination = `Swept ${removed.length} completed to-do${removed.length === 1 ? '' : 's'}`;
      undoData = { route: 'todo-restore', relPath: p.data.relPath, lines: removed };
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
