import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Vault } from './vault.js';
import { tokenize } from './recall.js';
import { listTodos, addTodo, TODO_REL, guessTodoCategory } from './todos.js';
import { createRecord } from './inboxStore.js';
import { respectNo } from './respectTheNo.js';

// THE COMMITMENT FINDER — the "recovered record", turned on his own life.
//
// From the reel he sent (11 Sep 2026): the valuable thing was never search.
// It was the system surfacing something he had FORGOTTEN EXISTED, out of data
// he already owned — a buying intent sitting unread in an old call. His
// analogue is a promise he made himself in writing and never closed. Brain
// Week already walks the knowledge folders by date, but it reports what
// ARRIVED; nothing in Nova has ever reported what was left OPEN.
//
// READ-ONLY and PURE CODE — no model, the same bar as compost's detectors.
// A proposal Nova cannot explain in one sentence is one he cannot trust, and
// "a model thought this looked like a promise" is not an explanation.
//
// What it never does: write. It proposes, he approves, and approving runs one
// deterministic action (add a to-do) that lands in the inbox history with
// undo data, like every other write in the system.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const STORE_PATH = () => path.join(dataRoot(), 'commitments.json');

// A promise needs time to have been kept before its silence means anything.
const MIN_AGE_DAYS = 21;
// Older than this and it is history, not an open loop — raising a two-year-old
// aside as if it were live is how a loop loses his trust.
const MAX_AGE_DAYS = 540;
const MAX_FOUND = 6;
const DISMISS_COOLDOWN_DAYS = 120;
const DISMISS_KEEP_DAYS = 365;
// Two shared distinctive terms is the bar for "he wrote about this again".
const CLOSURE_TOKENS = 2;

// WHERE HIS OWN VOICE LIVES — an ALLOWLIST, measured against the real vault
// (11 Sep 2026) rather than guessed.
//
// The first pass excluded `Raw/` and `Wiki/Sources` because a four-hour
// podcast transcript is hundreds of "I'll" and "I need to", every one of them
// the guest speaking. That exclusion was right and it earned its keep: 545
// commitment-shaped lines sit in those two folders alone.
//
// But it was not enough. Of the four candidates that survived, ALL FOUR were
// false positives out of `Wiki/Concepts` — his distilled notes ABOUT other
// people's ideas, where hypothetical first person is the house style
// ("...the logic that says I'll just take more stimulants tomorrow"). And 133
// of his 301 pages are Concepts. A blocklist would have to grow forever to
// keep up with places other people's words can appear.
//
// So: a promise is something he wrote IN HIS OWN VOICE, in a page that records
// HIS LIFE — the journal, a capture, a plan, a studio idea. Health and workout
// pages are Nova's own machine-written state and hold no intentions at all.
// Adding a folder here is a deliberate act; inheriting one by default is how
// this loop would fill up with other people's words again.
const OWN_VOICE_PREFIXES = ['Wiki/Journal/', 'Wiki/Inbox/', 'Wiki/Plans/', 'Wiki/Studio/'];
const EXCLUDED_TYPES = new Set(['raw', 'source']);

// First-person intent, and the predicate it commits to. Ordered longest-first
// where two could match the same line, so "I said I'd call" reports the call
// rather than matching the bare "I'd".
const TRIGGERS = [
  /\bi said i(?:'|’)?d\s+(.+)$/i,
  /\bi promised(?:\s+to)?\s+(.+)$/i,
  /\bi(?:'|’)?m going to\s+(.+)$/i,
  /\bnote to self\s*[:,-]\s*(.+)$/i,
  /\bnext steps?\s*[:,-]\s*(.+)$/i,
  /\bremember to\s+(.+)$/i,
  /\bfollow up (?:with|on)\s+(.+)$/i,
  /\bi need to\s+(.+)$/i,
  /\bi(?:'|’)?ll\s+(.+)$/i,
  /\bi will\s+(.+)$/i,
  /\bi should\s+(.+)$/i,
  /\bi want to\s+(.+)$/i,
];

/* ------------------------------------------------------------------ store */

let cache = null;
let loadPromise = null;
let lock = Promise.resolve();
function withLock(fn) {
  const run = lock.catch(() => {}).then(fn);
  lock = run.catch(() => {});
  return run;
}

// Single-flight load + atomic persist, the hardening the Breaker found in
// inboxStore: concurrent cold loads share one promise, a mid-write kill can
// never leave a torn file, and a corrupt file just starts fresh because the
// whole state regenerates from a re-scan.
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
      return cache;
    })();
  }
  return loadPromise;
}

async function persist() {
  const { writeFile, mkdir, rename } = await import('node:fs/promises');
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${STORE_PATH()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
  await rename(tmp, STORE_PATH());
}

/* --------------------------------------------------------------- detection */

// A fenced block is code or pasted output, never a promise.
function stripFences(raw) {
  return String(raw || '').replace(/^```[\s\S]*?^```/gm, '');
}

// The distinctive terms of a line: long enough to mean something, and rare
// enough across the vault to identify THIS commitment rather than his general
// vocabulary. `df` is the document frequency map built once per scan.
function distinctive(text, df, pageCount) {
  const ceiling = Math.max(2, Math.floor(pageCount * 0.25));
  const out = new Set();
  for (const t of tokenize(text)) {
    if (t.length < 4) continue;
    if (df && (df.get(t) || 0) > ceiling) continue;
    out.add(t);
  }
  return out;
}

function sharedCount(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

// One sentence, not the rest of the paragraph. The first pass captured to end
// of line and produced things like `just take more stimulants tomorrow" —
// you'll *feel* as`, which is three clauses of somebody else's argument.
function oneSentence(s) {
  const cut = s.search(/[.!?;](?:\s|$)|\s+—\s+|["\u201c\u201d]/);
  return (cut > 0 ? s.slice(0, cut) : s).replace(/\s+/g, ' ').replace(/[,;:]+$/, '').trim();
}

// A journal day is not written by one author. Nova files its own dispatches,
// reviews and plans into the same page his own entries live in, under the
// convention `## HH:MM · system` (his are `· personal` / `· training`). His
// vault has 37 system sections against 47 of his — so without this, Nova's
// own prose would be read back to him as his promise. Same class of mistake
// as reading a podcast transcript; it just happens inside the right folder.
const SECTION_RE = /^##\s+\d{1,2}:\d{2}\s+·\s+([a-z-]+)/i;
const NOT_HIS_VOICE = new Set(['system']);

// Pull every commitment out of one page's raw markdown.
export function commitmentsIn(raw) {
  const out = [];
  const lines = stripFences(raw).split('\n');
  let mine = true;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const section = trimmed.match(SECTION_RE);
    if (section) mine = !NOT_HIS_VOICE.has(section[1].toLowerCase());
    if (!mine) continue;
    if (trimmed.startsWith('>')) continue;                 // a quotation — someone else
    if (/^[-*]\s*\[x\]/i.test(trimmed)) continue;          // already ticked
    if (/^#{1,6}\s/.test(trimmed)) continue;               // a heading
    // strip list/checkbox markers so the trigger sees the sentence
    const body = trimmed.replace(/^[-*]\s*(?:\[\s?\]\s*)?/, '');
    for (const re of TRIGGERS) {
      const m = body.match(re);
      if (!m) continue;
      // A trigger inside an open quotation is reported speech, or a thought he
      // is examining rather than making — not a promise.
      const before = body.slice(0, m.index + m[0].length - m[1].length);
      if ((before.match(/["\u201c\u201d]/g) || []).length % 2 === 1) break;
      const text = oneSentence(m[1]);
      // too short to act on, or so long it is prose rather than a promise
      if (text.length < 12 || text.length > 200) break;
      out.push({ line: trimmed, text });
      break; // one commitment per line — the first (longest) trigger wins
    }
  }
  return out;
}

function eligiblePage(page) {
  if (!page?.relPath) return false;
  if (page.relPath === TODO_REL) return false;
  if (!OWN_VOICE_PREFIXES.some((p) => page.relPath.startsWith(p))) return false;
  if (EXCLUDED_TYPES.has(String(page.type || '').toLowerCase())) return false;
  return true;
}

async function detectLostCommitments(vaultPath, now) {
  const vault = new Vault(vaultPath);
  let pages;
  try {
    pages = await vault.listPages();
  } catch {
    return [];
  }
  if (!pages.length) return [];

  // document frequency, so "distinctive" means distinctive in HIS vault
  const df = new Map();
  const pageTokens = new Map();
  for (const p of pages) {
    const toks = new Set(tokenize(`${p.title} ${p.raw || ''}`));
    pageTokens.set(p.relPath, toks);
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }

  const msOf = (p) => {
    const ms = new Date(p.date).getTime();
    return Number.isFinite(ms) ? ms : null;
  };

  const young = now - MIN_AGE_DAYS * 86_400_000;
  const ancient = now - MAX_AGE_DAYS * 86_400_000;

  const { items: todos } = await listTodos(vaultPath).catch(() => ({ items: [] }));
  const todoSets = todos.map((t) => distinctive(t.text, df, pages.length));

  const found = [];
  for (const page of pages) {
    if (!eligiblePage(page)) continue;
    const ms = msOf(page);
    if (ms === null || ms > young || ms < ancient) continue;
    for (const c of commitmentsIn(page.raw)) {
      const terms = distinctive(c.text, df, pages.length);
      if (terms.size < CLOSURE_TOKENS) continue; // nothing distinctive to track

      // Already on the list, ticked or not — that is not a lost promise.
      if (todoSets.some((s) => sharedCount(terms, s) >= CLOSURE_TOKENS)) continue;

      // Did he write about it again AFTER saying it? Then it lived on.
      let revisited = false;
      for (const other of pages) {
        if (other.relPath === page.relPath) continue;
        const oms = msOf(other);
        if (oms === null || oms <= ms) continue;
        if (sharedCount(terms, pageTokens.get(other.relPath) || new Set()) >= CLOSURE_TOKENS) {
          revisited = true;
          break;
        }
      }
      if (revisited) continue;

      const days = Math.round((now - ms) / 86_400_000);
      found.push({
        type: 'lost-commitment',
        key: `commit:${page.relPath}:${c.text.slice(0, 60).toLowerCase()}`,
        title: c.text.length > 72 ? `${c.text.slice(0, 69)}…` : c.text,
        detail: `You wrote this in ${page.title} ${days} days ago and nothing since mentions it — no to-do, no later note. Put it on the list, or let it go.`,
        days,
        data: { relPath: page.relPath, pageTitle: page.title, line: c.line, text: c.text, writtenOn: page.date },
      });
    }
  }

  // oldest first — the most forgotten is the one worth seeing
  found.sort((a, b) => b.days - a.days);
  return found.slice(0, MAX_FOUND);
}

/* -------------------------------------------------------------------- runs */

export async function runCommitments(vaultPath, { now = Date.now() } = {}) {
  return withLock(async () => {
    const store = await load();
    const found = await detectLostCommitments(vaultPath, now);
    store.proposals = found
      .map((p) => {
        const at = store.dismissed[p.key];
        const no = respectNo({
          declined: at ? { at: new Date(at).getTime(), metric: null, count: 1 } : null,
          now,
          cooldownDays: DISMISS_COOLDOWN_DAYS,
          materialChange: null,
        });
        if (!no.raise) return null;
        return no.history
          ? { ...p, detail: `${p.detail} (${no.history[0].toUpperCase()}${no.history.slice(1)}.)`, returned: true }
          : p;
      })
      .filter(Boolean)
      .map((p) => ({ id: randomUUID().slice(0, 8), status: 'open', createdAt: new Date(now).toISOString(), ...p }));
    store.lastRunAt = new Date(now).toISOString();
    await persist();
    return { lastRunAt: store.lastRunAt, proposals: store.proposals };
  });
}

export async function getCommitments() {
  const store = await load();
  return { lastRunAt: store.lastRunAt, proposals: store.proposals };
}

export async function dismissCommitment(id) {
  return withLock(async () => {
    const store = await load();
    const p = store.proposals.find((x) => x.id === id);
    if (!p) throw new Error('proposal not found');
    p.status = 'dismissed';
    store.dismissed[p.key] = new Date().toISOString();
    const keepFrom = Date.now() - DISMISS_KEEP_DAYS * 86_400_000;
    for (const [k, at] of Object.entries(store.dismissed)) {
      if (new Date(at).getTime() < keepFrom) delete store.dismissed[k];
    }
    await persist();
    return p;
  });
}

// Accepting runs the one deterministic action — the promise becomes a to-do —
// and records it in the inbox history with undo data, so the receipt lives
// where every other receipt lives.
export async function acceptCommitment(vaultPath, id) {
  return withLock(async () => {
    const store = await load();
    const p = store.proposals.find((x) => x.id === id);
    if (!p) throw new Error('proposal not found');
    if (p.status !== 'open') throw new Error('proposal already handled');

    const before = await listTodos(vaultPath).catch(() => ({ items: [] }));
    const beforeRaw = new Set(before.items.map((t) => t.raw));
    const category = guessTodoCategory(p.data.text);
    let after;
    try {
      after = await addTodo(vaultPath, p.data.text, category);
    } catch (err) {
      if (/already on the list/i.test(err.message)) throw new Error('that is already on your to-do list');
      throw err;
    }
    const added = after.items.find((t) => !beforeRaw.has(t.raw));

    p.status = 'accepted';
    await persist();

    const record = {
      id: randomUUID().slice(0, 8),
      kind: 'commitment',
      text: p.data.text,
      source: 'commitments',
      mode: 'manual',
      status: 'filed',
      createdAt: new Date().toISOString(),
      decision: {
        route: 'todo',
        confidence: 'high',
        title: p.title,
        reason: `A commitment from ${p.data.pageTitle}, ${p.days} days old and never closed. You accepted it.`,
        payload: {},
      },
      destination: `To-Do · ${p.data.text}`,
      undoData: added ? { route: 'todo', relPath: TODO_REL, lines: [added.raw] } : null,
      filedAt: new Date().toISOString(),
      auto: false,
    };
    await createRecord(record);
    return { proposal: p, record };
  });
}

/* --------------------------------------------------------------- scheduler */

// Fortnightly. A promise does not rot on a weekly clock, and this loop earns
// its keep by being rare enough that its findings still feel like a discovery.
const SCAN_EVERY_MS = 14 * 24 * 60 * 60 * 1000;

async function checkAndRun(vaultPath) {
  try {
    const store = await load();
    const last = store.lastRunAt ? new Date(store.lastRunAt).getTime() : 0;
    if (Date.now() - last > SCAN_EVERY_MS) await runCommitments(vaultPath);
  } catch (err) {
    console.error('Commitment finder failed:', err.message);
  }
}

export function startCommitmentScheduler(vaultPath) {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('commitments');
    return checkAndRun(vaultPath);
  };
  tick();
  setInterval(tick, 24 * 60 * 60 * 1000);
}

// test hook
export function _resetCommitments() {
  cache = null;
  loadPromise = null;
}
