import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { beat } from './heartbeat.js';

// The overnight queue — work Hayden hands Nova during the day that runs
// while he sleeps. Each item becomes a REAL agent job (the Researcher, with
// its citation-required, review-gated rails untouched); the queue only
// decides WHEN. Results are pending inbox records by morning — the human
// gate stays the only checkpoint. Queue state is operational, so it lives
// in data/, not the vault.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const QUEUE_PATH = () => path.join(dataRoot(), 'overnight-queue.json');

// Honest caps: each item is a real model run with a real budget.
const MAX_QUEUED = 8;
const KEEP_HISTORY_DAYS = 7;
// The run window: 03:30–06:30 local. The Mac's scheduled wake (05:55)
// catches the tail even if it slept through the start; a missed night just
// leaves items queued for the next one. Run-now exists for demos and
// impatience.
export const WINDOW = { startMin: 3 * 60 + 30, endMin: 6 * 60 + 30 };

let chain = Promise.resolve();
function locked(fn) { chain = chain.then(fn, fn); return chain; }

async function load() {
  if (!existsSync(QUEUE_PATH())) return { items: [], lastRunDay: null };
  try {
    const raw = JSON.parse(await readFile(QUEUE_PATH(), 'utf8'));
    return { items: Array.isArray(raw.items) ? raw.items : [], lastRunDay: raw.lastRunDay || null };
  } catch {
    return { items: [], lastRunDay: null };
  }
}

async function persist(state) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = QUEUE_PATH() + '.tmp';
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await rename(tmp, QUEUE_PATH());
}

function pad(n) { return String(n).padStart(2, '0'); }
function localDay(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function pruned(items) {
  const cutoff = Date.now() - KEEP_HISTORY_DAYS * 24 * 3600e3;
  return items.filter((i) => i.status === 'queued' || i.status === 'running'
    || new Date(i.ranAt || i.queuedAt).getTime() > cutoff);
}

export async function listOvernight() {
  const state = await load();
  return {
    items: [...state.items].sort((a, b) => String(b.queuedAt).localeCompare(String(a.queuedAt))),
    lastRunDay: state.lastRunDay,
    windowLabel: '03:30–06:30',
    queuedCount: state.items.filter((i) => i.status === 'queued').length,
  };
}

export async function enqueueOvernight({ kind = 'research', question, ideaId, ideaTitle }) {
  // Two kinds of real work run in the window now: Researcher questions and
  // Studio outlines ("drafts waiting at dawn"). Both are queued BY HAYDEN —
  // the window decides when, never what; autonomy stays his.
  let fields;
  if (kind === 'research') {
    const q = String(question || '').replace(/\s+/g, ' ').trim();
    if (q.length < 8) throw new Error('give the Researcher a real question');
    if (q.length > 500) throw new Error('keep an overnight question under 500 characters');
    fields = { kind: 'research', question: q };
  } else if (kind === 'outline') {
    const id = String(ideaId || '').trim();
    const title = String(ideaTitle || '').replace(/\s+/g, ' ').trim();
    if (!id || !title) throw new Error('an overnight outline needs a Studio idea');
    // question doubles as the display line so every queue surface renders
    // both kinds without special-casing
    fields = { kind: 'outline', ideaId: id, question: `Outline: ${title}` };
  } else {
    throw new Error('the overnight window runs research questions and Studio outlines');
  }
  return locked(async () => {
    const state = await load();
    const queued = state.items.filter((i) => i.status === 'queued');
    if (queued.length >= MAX_QUEUED) throw new Error(`the queue holds ${MAX_QUEUED} — each is a real overnight run`);
    if (queued.some((i) => i.question.toLowerCase() === fields.question.toLowerCase())) throw new Error('that one is already queued');
    const item = { id: randomUUID().slice(0, 8), ...fields, status: 'queued', queuedAt: new Date().toISOString() };
    state.items = pruned([...state.items, item]);
    await persist(state);
    return item;
  });
}

export async function removeOvernightItem(id) {
  return locked(async () => {
    const state = await load();
    const item = state.items.find((i) => i.id === id);
    if (!item) throw new Error('not in the queue');
    if (item.status === 'running') throw new Error('that one is running right now — it will finish on its own');
    state.items = state.items.filter((i) => i.id !== id);
    await persist(state);
    return true;
  });
}

// Pure so the window logic is testable to the minute.
export function shouldRunNow(now, state, queuedCount) {
  if (!queuedCount) return false;
  if (state.lastRunDay === localDay(now)) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= WINDOW.startMin && mins < WINDOW.endMin;
}

async function markItem(id, patch) {
  return locked(async () => {
    const state = await load();
    state.items = state.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    await persist(state);
  });
}

// Sequential, one model at a time: start the agent job (which creates its
// own classifying→pending record on the existing rails), then wait for the
// record to leave 'classifying'. startJob/pollRecord are injectable so the
// runner is testable without spawning anything.
export async function runOvernightQueue(vaultPath, { startJob, pollRecord, pollMs = 5000, itemTimeoutMs = 8 * 60_000, force = false } = {}) {
  const state = await load();
  const queued = state.items.filter((i) => i.status === 'queued');
  const summary = { ran: 0, done: 0, errors: 0 };
  if (!queued.length) return summary;

  // A forced (daytime/demo) run must NOT consume tonight's natural window.
  if (!force) {
    await locked(async () => {
      const s = await load();
      s.lastRunDay = localDay();
      await persist(s);
    });
  }

  const start = startJob || (async (vp, item) => {
    if (item.kind === 'outline') {
      const { startOutline } = await import('./studio.js');
      return startOutline(vp, item.ideaId);
    }
    const { startResearch } = await import('./researcher.js');
    return startResearch(vp, item.question);
  });
  const poll = pollRecord || (async (id) => (await import('./inboxStore.js')).getRecord(id));

  for (const item of queued) {
    summary.ran++;
    await markItem(item.id, { status: 'running', startedAt: new Date().toISOString() });
    try {
      const record = await start(vaultPath, item);
      const deadline = Date.now() + itemTimeoutMs;
      let final = null;
      while (Date.now() < deadline) {
        const r = await poll(record.id);
        if (r && r.status !== 'classifying') { final = r; break; }
        await new Promise((res) => setTimeout(res, pollMs));
      }
      if (!final) throw new Error('timed out waiting for the brief — check the Inbox; it may still land');
      if (final.status === 'error') throw new Error(final.error || 'the agent run failed');
      await markItem(item.id, { status: 'done', recordId: record.id, ranAt: new Date().toISOString(), title: final.decision?.title || null });
      summary.done++;
    } catch (e) {
      await markItem(item.id, { status: 'error', error: e.message, ranAt: new Date().toISOString() });
      summary.errors++;
    }
  }
  return summary;
}

// One line for the morning dispatch — what landed while he slept.
export async function overnightMorningLine() {
  const { items } = await listOvernight();
  const since = Date.now() - 12 * 3600e3;
  const landed = items.filter((i) => i.status === 'done' && new Date(i.ranAt).getTime() > since);
  const failed = items.filter((i) => i.status === 'error' && new Date(i.ranAt).getTime() > since);
  if (!landed.length && !failed.length) return null;
  const bits = [];
  if (landed.length) {
    const briefs = landed.filter((i) => i.kind !== 'outline').length;
    const outlines = landed.length - briefs;
    const what = [
      briefs ? `${briefs} research brief${briefs === 1 ? '' : 's'}` : null,
      outlines ? `${outlines} Studio outline${outlines === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' and ');
    bits.push(`${what} landed for review: ${landed.map((i) => i.title || i.question.slice(0, 50)).join('; ')}`);
  }
  if (failed.length) bits.push(`${failed.length} run${failed.length === 1 ? '' : 's'} failed — still queued thinking, not lost: ${failed.map((i) => i.question.slice(0, 40)).join('; ')}`);
  return `**Overnight.** ${bits.join('. ')}.`;
}

export function startOvernightScheduler(vaultPath) {
  const tick = async () => {
    beat('overnight');
    try {
      const state = await load();
      const queuedCount = state.items.filter((i) => i.status === 'queued').length;
      if (shouldRunNow(new Date(), state, queuedCount)) {
        const summary = await runOvernightQueue(vaultPath);
        console.log(`overnight queue: ran ${summary.ran}, done ${summary.done}, errors ${summary.errors}`);
      }
    } catch (err) {
      console.error('overnight queue tick failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 10 * 60_000);
}
