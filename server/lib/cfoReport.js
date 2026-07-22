import { randomUUID } from 'node:crypto';
import { getMonthSummary } from './money.js';
import { createRecord, listRecords } from './inboxStore.js';

// The CFO's monthly money report — deterministic composition over the
// ledger, drafted onto the inbox rails on the 1st (covering the month just
// ended), approved into the journal like every other brief.

function pad(n) {
  return String(n).padStart(2, '0');
}
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

async function reportExistsThisMonth() {
  const items = await listRecords();
  const key = monthKey();
  return items.some((r) => r.kind === 'cfo' && r.createdAt && monthKey(new Date(r.createdAt)) === key);
}

export async function runCfoReport({ force = false } = {}) {
  if (!force && (await reportExistsThisMonth())) return { skipped: true };

  // report on the PREVIOUS month — the one that just closed
  const prev = new Date();
  prev.setDate(0); // last day of previous month
  const month = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
  const s = await getMonthSummary(month);

  const monthLong = prev.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const lines = [];
  if (!s.count) {
    lines.push(`**Ledger.** No transactions recorded for ${monthLong} — captures, CSV drops into Money/Imports, and statement scans all feed it.`);
  } else {
    const delta = s.prevSpent ? Math.round(((s.spent - s.prevSpent) / s.prevSpent) * 100) : null;
    lines.push(`**Spend.** $${s.spent.toFixed(0)} across ${s.count} transactions${delta != null ? ` — ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)}% on the month before` : ''}.${s.income ? ` $${s.income.toFixed(0)} came in.` : ''}`);
    const top = [...s.byCategory].filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).slice(0, 3);
    if (top.length) lines.push(`**Where.** ${top.map((c) => `${c.category} $${c.spent.toFixed(0)}`).join(' · ')}.`);
    const over = s.byCategory.filter((c) => c.budget && c.spent > c.budget);
    if (over.length) lines.push(`**Budgets.** Over in ${over.map((c) => `${c.category} ($${c.spent.toFixed(0)} of $${c.budget})`).join(', ')}.`);
    if (s.subscriptions.length) {
      const monthly = s.subscriptions.filter((x) => x.cadence === 'monthly').reduce((sum, x) => sum + x.amount, 0);
      lines.push(`**Subscriptions.** ${s.subscriptions.length} recurring charges detected${monthly ? ` (~$${monthly.toFixed(0)}/month on monthlies)` : ''}.`);
      const rises = s.subscriptions.filter((x) => x.priceRise);
      for (const r of rises) lines.push(`**Price rise.** ${r.merchant}: $${r.priceRise.from.toFixed(2)} → $${r.priceRise.to.toFixed(2)}.`);
    }
  }

  const title = `CFO Report — ${monthLong}`;
  const record = {
    id: randomUUID().slice(0, 8),
    kind: 'cfo',
    text: title,
    source: 'cfo',
    mode: 'draft',
    status: 'pending',
    createdAt: new Date().toISOString(),
    decision: {
      route: 'journal',
      confidence: 'high',
      title,
      reason: 'Monthly money report composed from the ledger — no model call.',
      payload: { text: `${title}\n\n${lines.join('\n')}`, category: 'system', label: 'CFO report' },
    },
  };
  await createRecord(record);
  return { record };
}

export function startCfoScheduler() {
  const tick = async () => {
    const { beat } = await import('./heartbeat.js');
    beat('cfo'); // joins the watch-the-watcher net — a stalled CFO loop was invisible
    try {
      if (new Date().getDate() === 1) await runCfoReport();
    } catch (err) {
      console.error('cfo report failed:', err.message);
    }
  };
  tick();
  setInterval(tick, 6 * 3600_000);
}
