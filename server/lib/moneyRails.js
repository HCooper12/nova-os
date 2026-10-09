import { randomUUID } from 'node:crypto';
import { addTransactions, findTransactions, removeTransactions, editTransaction, setBudget, getBudget } from './money.js';
import { createRecord } from './inboxStore.js';

// HIS OWN MONEY WRITES RIDE THE RAILS (10 Oct 2026; the audit's finding 6).
//
// The Money screen's header promised "All writes ride the inbox rails", and
// four of its seven write paths did not: adding a line by hand, deleting one,
// recategorising and setting a budget wrote straight to the ledger, with no
// record and no way back. Each now writes AND files one record, status
// `filed` at once (the tap is the approval, as a calendar follow-up's is),
// whose undoData puts the ledger back exactly as it was through the same
// /api/inbox/:id/undo every other filing uses. The screen's pill offers that
// Undo for four seconds; the Inbox's history keeps it after.
//
// Filed records never push (lib/push.js pushes only for pending ones).

const fmt = (n) => `$${Math.abs(Number(n) || 0).toFixed(2)}`;
// the category in the page's own words: "Eating out", "Health & fitness"
const cat = (c) => String(c || '').replace(/\b(Out|Fitness|Bills)\b/g, (w) => w.toLowerCase());

async function fileReceipt({ text, destination, undoData, payload }) {
  const now = new Date().toISOString();
  return createRecord({
    id: randomUUID().slice(0, 8),
    kind: 'money-write',
    text,
    source: 'money',
    mode: 'auto',
    status: 'filed',
    createdAt: now,
    filedAt: now,
    auto: false,
    destination,
    undoData,
    decision: {
      route: 'money-write',
      confidence: 'high',
      title: text,
      reason: 'His own change on the Money screen, filed as he made it. Undo puts it back.',
      payload: payload || {},
    },
  });
}

// A line typed on the Money screen.
export async function addLine(input) {
  const [added] = await addTransactions([input], 'manual');
  if (!added) {
    const e = new Error('that line is already in the ledger (same day, amount and merchant)');
    e.status = 409;
    throw e;
  }
  const sign = added.amount < 0 ? '−' : '+';
  const record = await fileReceipt({
    text: `Added ${added.merchant} ${sign}${fmt(added.amount)}`,
    destination: `Ledger · ${added.merchant} ${sign}${fmt(added.amount)} (${cat(added.category)})`,
    undoData: { route: 'expense', ids: [added.id] },
    payload: { transaction: added },
  });
  return { transaction: added, record };
}

// Lines deleted, each kept whole on the record so Undo restores it as it was
// (same id, same note, same source).
export async function deleteLines(ids) {
  const rows = await findTransactions(ids);
  if (!rows.length) {
    const e = new Error('transaction not found');
    e.status = 404;
    throw e;
  }
  const removed = await removeTransactions(rows.map((t) => t.id));
  const one = rows[0];
  const record = await fileReceipt({
    text: rows.length === 1 ? `Deleted ${one.merchant} ${fmt(one.amount)}` : `Deleted ${rows.length} lines`,
    destination: 'Ledger',
    undoData: { route: 'money-restore', transactions: rows },
    payload: { ids: rows.map((t) => t.id) },
  });
  return { removed, record };
}

// A line's category and/or note, and the merchant rule only when he asked.
export async function editLine(id, { category, note, rule = false } = {}) {
  const res = await editTransaction(id, { category, note, rule });
  const t = res.transaction;
  const what = category !== undefined && category !== res.before.category
    ? `${t.merchant} to ${cat(t.category)}${res.override ? ', and every line from it' : ''}`
    : `the note on ${t.merchant}`;
  const record = await fileReceipt({
    text: `Changed ${what}`,
    destination: `Ledger · ${t.merchant}`,
    undoData: { route: 'money-edit', id, before: res.before, override: res.override },
    payload: { id, category: t.category, note: t.note, rule: !!res.override },
  });
  return { transaction: t, record };
}

// A budget set or cleared. `raw` is what he typed ("$250", "1,200", "");
// an unreadable amount throws and nothing changes.
export async function changeBudget(category, raw) {
  const before = await getBudget(category);
  const budgets = await setBudget(category, raw);
  const after = budgets[category] || null;
  const record = await fileReceipt({
    text: after ? `${cat(category)} budget ${before ? `$${before} to ` : ''}$${after}` : `Cleared the ${cat(category).toLowerCase()} budget`,
    destination: `Budgets · ${cat(category)}`,
    undoData: { route: 'money-budget', category, before },
    payload: { category, before, after },
  });
  return { budgets, record };
}
