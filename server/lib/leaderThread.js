import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// THE LEADER'S CONVERSATION, KEPT. design/mockups/82-redesign-leader-r2.html,
// Blend 1, and the audit (design/audits/redesign-2026-09/11-leader.md, finding
// 3): the conversation lived only in the page's memory while its session id
// lived in localStorage, so after a reload (iOS ends an idle web app often)
// the page showed nothing while the Leader remembered everything.
//
// One append-only file of turns on the Leader's own door: his line as he typed
// it (with the item he was talking about), and the Leader's reply as he read
// it, with whom it asked. Operational, derived data (server/data), never the
// vault. A turn is the record of something already said, not a decision, so
// it rides no Inbox card.
//
// THE SEEN MARK (his rule, 9 Oct 2026: "Unread replies from the leader should
// jump to the top"). A reply carries `seenAt`, stamped ONCE, the first time he
// opens the Leader with it on top. Idempotent: a second mark is a no-op and
// says so. No model is involved, and nothing else is written.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = () => process.env.NOVA_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = () => path.join(dataRoot(), 'leader-thread.json');
export const THREAD_CAP = 400;

let queue = Promise.resolve();
const locked = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

export async function readThread() {
  if (!existsSync(FILE())) return [];
  try {
    const raw = JSON.parse(await readFile(FILE(), 'utf8'));
    return Array.isArray(raw?.items) ? raw.items : [];
  } catch { return []; }
}

async function writeThread(items) {
  await mkdir(dataRoot(), { recursive: true });
  const tmp = FILE() + '.tmp';
  await writeFile(tmp, JSON.stringify({ items: items.slice(-THREAD_CAP) }, null, 2), 'utf8');
  await rename(tmp, FILE());
}

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// One turn. `who` is 'you' or 'leader'; a Leader reply starts unread.
export function threadEntry({ who, text, sessionId = null, quote = null, consult = null, at = new Date() }) {
  if (who !== 'you' && who !== 'leader') throw new Error('who must be you or leader');
  const body = clip(text, 20_000);
  if (!body) throw new Error('nothing to keep');
  const q = quote && typeof quote === 'object' && quote.title
    ? { kind: clip(quote.kind, 24) || 'item', title: clip(quote.title, 160), ...(quote.label ? { label: clip(quote.label, 80) } : {}) }
    : null;
  return {
    id: randomUUID().slice(0, 8),
    at: (at instanceof Date ? at : new Date(at)).toISOString(),
    who,
    text: body,
    sessionId: sessionId ? clip(sessionId, 80) : null,
    ...(q ? { quote: q } : {}),
    ...(Array.isArray(consult) && consult.length ? { consult } : {}),
    ...(who === 'leader' ? { seenAt: null } : {}),
  };
}

export function appendThread(fields) {
  const entry = threadEntry(fields);
  return locked(async () => {
    const items = await readThread();
    items.push(entry);
    await writeThread(items);
    return entry;
  });
}

// The newest Leader reply, and whether he has opened it. One reply at a time
// is "unread" on the page: the newest. An older unseen reply is still in the
// conversation, where he reads it; it never queues a second card.
export function newestReply(items = []) {
  for (let i = items.length - 1; i >= 0; i--) if (items[i]?.who === 'leader') return items[i];
  return null;
}

// Stamp a reply seen. Returns { entry, wrote } — wrote is false when it was
// already seen (or is not a reply), so a second call writes nothing.
export function markReplySeen(id, now = new Date()) {
  return locked(async () => {
    const items = await readThread();
    const hit = items.find((x) => x.id === id);
    if (!hit) { const e = new Error('no such reply'); e.status = 404; throw e; }
    if (hit.who !== 'leader') { const e = new Error('only a Leader reply is marked seen'); e.status = 400; throw e; }
    if (hit.seenAt) return { entry: hit, wrote: false };
    hit.seenAt = now.toISOString();
    await writeThread(items);
    return { entry: hit, wrote: true };
  });
}

// Tests only.
export function _threadFile() { return FILE(); }
