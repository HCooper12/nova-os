// CFO domain: the Money screen — month summary with budget bars, the
// subscription radar, the transaction ledger, the imports pipeline, and the
// statement scanner. Everything reads the deterministic ledger; every write
// path (capture, CSV drop, photo scan) goes through the inbox rails.
// Adds to ctx: nothing (Money has no nav count — a dollar figure in the
// sidebar would be noise).

const fmtMoney = (n) => `$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function valsMoney(app, ctx) {
  const st = app.state;
  const { demoMode, isOffline } = ctx;

  const money = st.liveMoney;
  const monthLabel = (m) => m ? new Date(`${m}-15T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';

  const spendDelta = money && money.prevSpent > 0
    ? Math.round(((money.spent - money.prevSpent) / money.prevSpent) * 100)
    : null;

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
      setBudget: () => {
        const current = c.budget || '';
        const raw = window.prompt(`Monthly budget for ${c.category} (blank to clear):`, current);
        if (raw === null) return;
        app.setMoneyBudget(c.category, raw.trim() === '' ? 0 : Number(raw));
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
      cadence: s.cadence.toUpperCase(),
      nextLabel: days < 0 ? 'overdue — may have lapsed' : days === 0 ? 'expected today' : days === 1 ? 'expected tomorrow' : `expected in ${days} days`,
      soon: days >= 0 && days <= 3,
      priceRise: s.priceRise ? `${fmtMoney(s.priceRise.from)} → ${fmtMoney(s.priceRise.to)}` : null,
    };
  });

  const transactions = (money?.transactions || []).slice(0, 120).map((t) => ({
    id: t.id,
    date: t.date.slice(5).split('-').reverse().join('/'),
    merchant: t.merchant,
    note: t.note,
    category: t.category,
    editingCategory: st.moneyEditCategoryId === t.id,
    startEditCategory: () => app.setState({ moneyEditCategoryId: t.id }),
    pickCategory: (e) => app.setMoneyCategory(t.id, e.target.value),
    amountLabel: (t.amount < 0 ? '−' : '+') + fmtMoney(t.amount),
    isSpend: t.amount < 0,
    source: (t.source || 'manual').toUpperCase(),
    remove: () => app.removeMoneyTransaction(t.id),
  }));

  const fyNow = today.getMonth() >= 6 ? today.getFullYear() + 1 : today.getFullYear();

  return {
    isMoney: st.screen === 'money',
    moneyHeaderLabel: demoMode
      ? 'CONNECT A BACKEND TO SEE THE LEDGER'
      : isOffline
        ? 'OFFLINE — SHOWING LAST-KNOWN LEDGER'
        : money
          ? `${monthLabel(money.month).toUpperCase()} · ${money.count} TRANSACTION${money.count === 1 ? '' : 'S'}`
          : 'LOADING…',
    moneyConnected: !demoMode && !isOffline,
    moneyLoaded: !!money,
    moneySpentLabel: money ? fmtMoney(money.spent) : '—',
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
    submitMoneyAdd: () => app.submitMoneyAdd(),
    moneyAddKey: (e) => { if (e.key === 'Enter') app.submitMoneyAdd(); },
    moneyFyLabel: `FY${String(fyNow - 1).slice(2)}-${String(fyNow).slice(2)}`,
    moneyExport: () => app.downloadMoneyExport(fyNow),
  };
}
