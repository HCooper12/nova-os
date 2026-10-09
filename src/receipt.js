import { notify, dismissIsland } from './island.js';

// THE TICK RECEIPT (9 Oct 2026, his call: "a pill with Undo on every tick").
// The reel's second move is a write acted out where it lands and confirmed by
// a small pill. Every one-tap tick in Nova (To-Do, Shopping, the practice
// mark, a meal eaten, a set logged, a plan priority marked) calls
// `tickReceipt` once its change is on screen. It raises ONE island pill with
// an Undo, and the number the tick moved counts to its new value through
// CountUp where it is drawn, so the change is shown twice: in the row and in
// the figure.
//
// The rules it keeps:
//   - one pill, however fast he ticks. A tick while the pill is up changes
//     that pill's words in place ("3 ticked") and restarts its clock; the
//     island never drops a second card (it would machine-gun)
//   - Undo takes back EVERY tick the pill counts, newest first, each through
//     its own reverse path (the same API the tick used, the opposite value)
//   - a thing ticked and unticked inside one pill cancels out: it leaves the
//     batch, and an empty batch takes the pill away
//   - the batch closes when the pill leaves the island, or after a quiet
//     spell longer than its life, whichever is first (a pill dropped from a
//     full queue never says it left, so time is the backstop)
//   - his words stay on one line: a long item name ends in an ellipsis
//     rather than growing the pill
//   - nothing here calls the server. A tick in demo mode never reaches one
//     because its reverse path is the same local change the tick made.

export const RECEIPT_MS = 4000;
export const RECEIPT_IDLE = RECEIPT_MS + 1500;

// the words a batch shows, newest tick last
export function receiptWords(entries) {
  const n = entries.length;
  if (!n) return null;
  if (n === 1) {
    const e = entries[0];
    return e.title || `${e.done === false ? 'Unticked' : 'Ticked'} ${e.label}`;
  }
  const ticked = entries.filter((e) => e.done !== false).length;
  if (ticked === n) return `${n} ticked`;
  if (ticked === 0) return `${n} unticked`;
  return `${n} changed`;
}

// a tick folded into the batch. The same thing ticked the other way cancels
// it; the same thing ticked the same way again keeps the FIRST reverse path,
// which is the one that restores what was there before the pill
export function foldTick(entries, entry) {
  const i = entries.findIndex((e) => e.key === entry.key);
  if (i < 0) return [...entries, entry];
  if (entries[i].done !== entry.done) return entries.filter((_, j) => j !== i);
  return entries;
}

export function createReceipts({ post = notify, dismiss = dismissIsland, now = () => Date.now() } = {}) {
  let batch = null;
  let seq = 0;

  const close = (b) => { if (batch === b) batch = null; };

  const show = (b) => {
    const title = receiptWords(b.entries);
    if (!title) { close(b); dismiss(b.id); return; }
    post({
      id: b.id,
      replace: true,
      oneLine: true,
      tone: 'done',
      title,
      duration: RECEIPT_MS,
      action: { label: 'Undo', run: () => undo(b) },
      onClose: () => close(b),
    });
  };

  const undo = (b) => {
    close(b);
    const list = [...b.entries].reverse();
    b.entries = [];
    for (const e of list) {
      try { e.undo?.(); } catch { /* one reverse path failing must not strand the rest */ }
    }
    return list.length;
  };

  function tickReceipt({ key, label, done = true, undo: reverse, title } = {}) {
    const t = now();
    if (batch && t - batch.at > RECEIPT_IDLE) batch = null;
    if (!batch) { seq += 1; batch = { id: `tick-receipt-${seq}`, entries: [], at: t }; }
    batch.at = t;
    batch.entries = foldTick(batch.entries, { key: String(key ?? label ?? seq), label: String(label ?? ''), done, undo: reverse, title });
    const b = batch;
    show(b);
    return b.id;
  }

  return {
    tickReceipt,
    // what the pill counts right now (tests, and the dev console)
    pending: () => (batch ? batch.entries.map((e) => e.key) : []),
    undoAll: () => (batch ? undo(batch) : 0),
  };
}

const shared = createReceipts();
export const tickReceipt = shared.tickReceipt;
