import { nf } from './fmt.js';
import { buildMoneyView, moneyMoment as momentOf } from '../moneyModel.js';
import { demoMoneyState, demoSummary, demoVariant } from '../moneyDemo.js';
import { readAmount } from '../moneyParse.js';
// CFO domain: the Money screen. Under the `summary` style (his phone) the
// page is mockup 85 with the round-3 refinements (src/screens/MoneySummary.jsx,
// built 10 Oct 2026), drawn entirely from `moneySum`, which src/moneyModel.js
// computes from the server's month summary; under cupertino and command the
// classic panels stay (Money.jsx), with the audit's fixes. Every write rides
// the inbox rails with Undo (server/lib/moneyRails.js).
// Adds to ctx: nothing. Exposes `moneyMoment` for Home: a row only while a
// money record waits on him, nothing when all is fine.

const fmtMoney = (n) => `$${nf('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))}`;
// the ledger list on screen — the newest this many; the export has the rest
const MONEY_LIST_CAP = 120;

// money records the page and Home read: from the Inbox, or the demo's own
export function moneyRecords(st, demoMode) {
  if (demoMode) return (st.moneyDemo || demoMoneyState(demoVariant())).records || [];
  return (st.liveInbox?.items || []).filter((r) => r && (r.kind === 'money' || r.kind === 'money-import'));
}

export function valsMoney(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline } = ctx;

  // demo: the invented month in memory (src/moneyDemo.js); live: the server's
  const demoState = demoMode ? (st.moneyDemo || demoMoneyState(demoVariant())) : null;
  const money = demoMode ? demoSummary(demoState) : st.liveMoney;
  const records = moneyRecords(st, demoMode);
  const monthLabel = (m) => m ? new Date(`${m}-15T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
  const readOnly = isOffline || !!demoState?.offline;

  const spendDelta = money && money.prevSpent > 0
    ? Math.round(((money.spent - money.prevSpent) / money.prevSpent) * 100)
    : null;

  // ---------------------------------------------------------- classic ---
  const categoryRows = (money?.byCategory || [])
    .filter((c) => c.category !== 'Income')
    .sort((a, b) => b.spent - a.spent)
    .map((c) => ({
      category: c.category,
      spentLabel: fmtMoney(c.spent),
      budgetLabel: c.budget ? `of $${c.budget}` : null,
      over: !!(c.budget && c.spent > c.budget),
      pct: c.budget ? Math.min(100, Math.round((c.spent / c.budget) * 100)) : null,
      prevLabel: c.prev ? `last month ${fmtMoney(c.prev)}` : 'new this month',
      setBudget: readOnly ? undefined : () => {
        const current = c.budget || '';
        const raw = window.prompt(`Monthly budget for ${c.category} ("$250" or "1,200" is fine; blank to clear):`, current);
        if (raw === null) return;
        // the raw words go to the server's one reader (src/moneyParse.js), so
        // "$250" sets 250 and an unreadable answer keeps the old budget
        if (readAmount(raw).kind === 'unreadable') { app.toastMsg(`Could not read "${raw}" as an amount. The budget is unchanged.`); return; }
        app.setMoneyBudget(c.category, raw);
      },
    }));

  const today = new Date();
  const subDays = (s) => Math.round((new Date(s.nextExpected) - today) / 86400000);
  const subscriptions = (money?.subscriptions || []).map((s) => {
    const days = subDays(s);
    return {
      key: `${s.merchant}@${s.nextExpected}`,
      merchant: s.merchant,
      amountLabel: fmtMoney(s.amount),
      cadence: s.cadence.charAt(0).toUpperCase() + s.cadence.slice(1),
      nextLabel: days < 0 ? 'overdue, it may have lapsed' : days === 0 ? 'expected today' : days === 1 ? 'expected tomorrow' : `expected in ${days} days`,
      soon: days >= 0 && days <= 3,
      priceRise: s.priceRise ? `${fmtMoney(s.priceRise.from)} to ${fmtMoney(s.priceRise.to)}` : null,
    };
  });

  // the list shows the newest MONEY_LIST_CAP; the cap is said, never implied
  const allTransactions = money?.transactions || [];
  const transactions = allTransactions.slice(0, MONEY_LIST_CAP).map((t) => ({
    id: t.id,
    date: t.date.slice(5).split('-').reverse().join('/'),
    merchant: t.merchant,
    note: t.note,
    category: t.category,
    editingCategory: st.moneyEditCategoryId === t.id,
    startEditCategory: readOnly ? undefined : () => app.setState({ moneyEditCategoryId: t.id }),
    pickCategory: (e) => app.setMoneyCategory(t.id, e.target.value),
    amountLabel: (t.amount < 0 ? '−' : '+') + fmtMoney(t.amount),
    isSpend: t.amount < 0,
    source: (t.source || 'manual').toUpperCase(),
    remove: readOnly ? undefined : () => app.removeMoneyTransaction(t.id),
  }));

  const fyNow = today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear();
  const fyLabel = `FY${String(fyNow - 1).slice(2)}-${String(fyNow).slice(2)}`;
  const thisMonth = money && money.isCurrent !== false && money.month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  // ---------------------------------------------------------- summary ---
  const summary = st.novaStyle === 'summary';
  const view = summary && st.screen === 'money'
    ? buildMoneyView({ money, records, offline: readOnly, demo: demoMode })
    : null;
  const prevMonthLabel = money?.prevMonth ? new Date(`${money.prevMonth}-15T00:00:00`).toLocaleDateString('en-GB', { month: 'long' }) : 'last month';
  const moneySum = view ? {
    view,
    sheet: st.moneySheet || null,
    page: st.moneyPage || null,
    compare: !!st.moneyCompare,
    selected: st.moneyLineSel || null,
    search: st.moneySearch || '',
    busy: !!st.moneyBusy,
    scanBusy: !!st.moneyScanBusy,
    scanError: st.moneyScanError || null,
    scanQuestion: st.moneyScanQuestion || null,
    fyLabel,
    prevMonthLabel,
    importsDir: money?.importsDir || 'Money/Imports',
    // doors
    openSheet: (sheet) => app.openMoneySheet(sheet),
    closeSheet: () => app.closeMoneySheet(),
    openPage: (page) => app.openMoneyPage(page),
    closePage: () => app.closeMoneyPage(),
    setCompare: (on) => app.setState({ moneyCompare: !!on }),
    select: (id) => app.setState({ moneyLineSel: id }),
    setSearch: (q) => app.setState({ moneySearch: q }),
    setMonth: (m) => app.setMoneyMonth(m),
    // writes (each one pill with Undo; refused while offline)
    add: (line) => app.moneyWrite('add', line),
    remove: (id) => app.moneyWrite('remove', id),
    edit: (id, patch) => app.moneyWrite('edit', id, patch),
    setBudget: (category, raw) => app.moneyWrite('budget', category, raw),
    answer: (id, answer) => app.moneyAnswer(id, answer),
    approveImport: (id) => app.moneyAnswer(id, 'file'),
    discardImport: (id) => app.moneyAnswer(id, 'discard'),
    // the rest of the house's doors, moved, never dropped
    checkImports: () => (demoMode ? app.toastMsg('Demo data: nothing to check') : app.runMoneyImportNow()),
    report: () => (demoMode ? app.toastMsg('Demo data: no report to draft') : app.cfoReportNow()),
    exportFy: () => (demoMode ? app.toastMsg('Demo data: no export') : app.downloadMoneyExport(fyNow)),
    onScanFiles: (e) => { if (!demoMode) app.onStatementScanFiles(e.target.files); e.target.value = ''; },
    discuss: (subject) => app.moneyDiscuss(subject),
    openBudgetSite: () => { try { window.open('https://app.billroo.com', '_blank', 'noopener'); } catch { /* blocked */ } },
  } : null;

  return {
    isMoney: st.screen === 'money',
    moneySum,
    moneyMoment: buildMoment(app, records, demoMode),
    moneyListNote: allTransactions.length > MONEY_LIST_CAP
      ? `showing ${MONEY_LIST_CAP} of ${allTransactions.length} · older in the export`
      : null,
    // said once, in words that are true for the month on screen
    moneyHeaderLabel: demoMode
      ? 'Demo data · invented lines'
      : isOffline
        ? (money ? 'Offline · the last ledger Nova had, read only' : 'Offline · no ledger yet')
        : money
          ? `${monthLabel(money.month)} · ${money.count} transaction${money.count === 1 ? '' : 's'}`
          : null,
    moneyThisMonthLabel: money ? (thisMonth ? 'This month' : monthLabel(money.month)) : 'This month',
    // the ledger renders read-only from cache when offline
    moneyConnected: !demoMode && (!isOffline || !!st.liveMoney),
    moneyReadOnly: readOnly,
    moneyLoaded: !!money,
    moneySpentLabel: money ? fmtMoney(money.spent) : '—',
    // the hero counts up from $0 with the page (Money.jsx, CountUp)
    moneySpent: money && Number.isFinite(Number(money.spent)) ? Math.abs(Number(money.spent)) : null,
    moneyFmt: fmtMoney,
    moneySpentDelta: spendDelta != null ? { label: `${spendDelta >= 0 ? '+' : '−'}${Math.abs(spendDelta)}% vs ${monthLabel(money.prevMonth)}`, up: spendDelta > 0 } : null,
    moneyIncomeLabel: money && money.income ? fmtMoney(money.income) : null,
    moneyMonths: (money?.months || []).map((m) => ({
      value: m, label: monthLabel(m), active: money?.month === m,
    })),
    setMoneyMonth: (e) => app.setMoneyMonth(e.target.value),
    moneyMonth: money?.month || '',
    moneyCategories: categoryRows,
    moneySubscriptions: subscriptions,
    moneySubsMonthly: money?.subscriptions?.length
      ? fmtMoney(money.subscriptions.filter((s) => s.cadence === 'monthly').reduce((sum, s) => sum + s.amount, 0)) + '/mo'
      : null,
    moneyTransactions: transactions,
    moneyAllCategories: money?.categories || [],
    moneyImportsDir: money?.importsDir || 'Money/Imports',
    moneyBusy: st.moneyBusy,
    moneyScanBusy: st.moneyScanBusy,
    moneyScanError: st.moneyScanError,
    moneyScanQuestion: st.moneyScanQuestion,
    onStatementScanFiles: (e) => { app.onStatementScanFiles(e.target.files); e.target.value = ''; },
    runMoneyImportNow: () => app.runMoneyImportNow(),
    cfoReportNow: () => app.cfoReportNow(),
    moneyAddMerchant: st.moneyAddMerchant,
    setMoneyAddMerchant: (e) => app.setState({ moneyAddMerchant: e.target.value }),
    moneyAddAmount: st.moneyAddAmount,
    setMoneyAddAmount: (e) => app.setState({ moneyAddAmount: e.target.value }),
    moneyAddIsSpend: st.moneyAddIsSpend,
    toggleMoneyAddSign: () => app.setState((s) => ({ moneyAddIsSpend: !s.moneyAddIsSpend })),
    submitMoneyAdd: () => (readOnly ? null : app.submitMoneyAdd()),
    moneyAddKey: (e) => { if (e.key === 'Enter' && !readOnly) app.submitMoneyAdd(); },
    moneyFyLabel: fyLabel,
    moneyExport: () => app.downloadMoneyExport(fyNow),
  };
}

// THE HOME ROW (summary style): only while a money record waits on him.
function buildMoment(app, records, demoMode) {
  const m = momentOf(records);
  if (!m) return null;
  return {
    ...m,
    discuss: () => app.moneyDiscuss(m.talk),
    open: () => app.navigate('money'),
    noted: () => (demoMode ? app.moneyAnswer(m.ids, 'noted') : m.ids.forEach((id) => app.inboxAction(id, 'approve'))),
  };
}
