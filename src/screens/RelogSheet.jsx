import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { useSheetDrag } from '../useSheetDrag.js';
import { haptic } from '../haptics.js';
import {
  amountLabel, amountShort, amountMacros, amountChips, stepAmount, validAmount, usedHint,
  searchFoods, matchSpan, whenDay, dayHeading,
} from '../relogFacts.js';

// LOG IT AGAIN (mockup 110, his yes on 4 Nov 2026): the "Again" rail that
// takes Likely now's place on Fuel, the Log again sheet behind its "All", and
// the amount tray both open. Every figure comes from src/relogFacts.js through
// valsFuelSummary's `relog`; every write is app.relogAt / relogChange /
// relogUndoMany. The frames these must match are design/mockups/110-relog-
// food.html, round 2.

const kc = (n) => Math.round(Number(n) || 0).toLocaleString('en-AU');
const g1 = (n) => { const r = Math.round((Number(n) || 0) * 10) / 10; return r >= 10 || Number.isInteger(r) ? String(Math.round(r)) : String(r); };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const dayTotals = (day) => (day?.entries || []).reduce((t, e) => ({ kcal: t.kcal + (Number(e.macros?.kcal) || 0), p: t.p + (Number(e.macros?.p) || 0) }), { kcal: 0, p: 0 });

const Tick = () => (
  <span className="nv-rl-tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
);

// ---------------------------------------------------------------- the rail --
/** Fuel's "Again" row, in Likely now's slot and at its height (frame 1). */
export function AgainRail({ r, onAll, onHold, receipt }) {
  if (!r?.rail?.length) return null;
  return (
    <>
      <div className="nv-fs-rhd nv-sum-rise" style={{ '--i': 2, marginTop: '16px' }}>
        <span className="nv-fs-hk" style={{ margin: 0 }}>Again</span>
        <Interactive as="span" className="nv-rl-all" onClick={onAll} haptic="tick" focusStyle={{}} aria-label={`All ${r.total} foods you have logged`}>All {r.total} ›</Interactive>
      </div>
      <div className="nv-fs-rail nv-fs-likely nv-sum-rise" style={{ '--i': 2 }} role="group" aria-label="Log again, newest first">
        {r.rail.map((it) => (
          <Interactive key={it.key} as="span" className="nv-sum-card nv-fs-lk nv-rl-ag" data-gr="back" onClick={() => it.tap()} onLongPress={() => onHold(it)} haptic="commit" focusStyle={{}}
            aria-label={`Log ${it.name} again, ${it.mid}, ${it.kcal} kilocalories. ${it.usual ? 'Usual around now. ' : ''}Last ${it.when}. Hold to choose the amount`}>
            <span className="nv-fs-lx">
              <span className="nv-fs-nm">{it.name}</span>
              <span className="nv-fs-sv">
                {it.sub.lead && <><u>{it.sub.lead}</u> · </>}
                {it.sub.rest.map((x, i) => <span key={i}>{i ? ' · ' : ''}{x === it.mid && it.food.kind !== 'count' ? <i>{x}</i> : x}</span>)}
              </span>
            </span>
          </Interactive>
        ))}
      </div>
      {receipt}
    </>
  );
}

// ------------------------------------------------------------- the receipt --
/** A log's receipt: the tick, the day's new totals, the amount (tap to change)
 *  and Undo (frame 6). Used under the rail and at the foot of the sheet. */
export function RelogReceipt({ rc, targetKcal, onAmount, onUndo, inSheet }) {
  const t = dayTotals(rc.day);
  const word = rc.dayWord ? `for ${rc.dayWord}` : 'for today';
  return (
    <div className={`nv-rl-receipt${inSheet ? ' in-sheet' : ''}`} role="status">
      <Tick />
      <b><span className="nv-rl-rt"><span className="nv-rl-rn">{rc.title}</span><span>, logged {word}</span></span><small>{kc(t.kcal)}{targetKcal ? ` of ${kc(targetKcal)}` : ''} kcal · {Math.round(t.p)} g</small></b>
      {rc.food && rc.entries.length === 1 && (
        <Interactive as="span" className="nv-rl-amtchip" onClick={onAmount} haptic="tick" focusStyle={{}} aria-label={`Change the amount, now ${amountLabel(rc.food, rc.amount)}`}>
          {amountShort(rc.food, rc.amount)} ▾
        </Interactive>
      )}
      <Interactive as="span" className="nv-rl-undo" onClick={onUndo} haptic="tick" focusStyle={{}} aria-label={`Undo: ${rc.title}`}>Undo</Interactive>
    </div>
  );
}

// ---------------------------------------------------------------- the tray --
/** The amount: counts for a count food, servings for the rest (frames 4, 5).
 *  mode 'log' logs at the amount; 'change' edits the entry just logged. */
export function AmountTray({ food, start, mode, onDone, onClose }) {
  const [amt, setAmt] = useState(start);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const trayRef = useRef(null);
  const drag = useSheetDrag(onClose, { threshold: 70 });
  const chips = useMemo(() => amountChips(food), [food]);
  const m = amountMacros(food, amt);
  const protFirst = m.p >= 5;
  const label = amountLabel(food, amt);
  const big = amountShort(food, amt);
  const unitWords = food.kind === 'count' ? label.slice(big.length + 1) : (amt > 1 ? 'servings' : 'serving');
  const u = food.unitMacros || {};
  const sub = food.kind === 'count'
    ? `${kc(u.kcal)} kcal a ${food.unit}${food.oneAtATime ? ` · you log this one ${food.unit} at a time` : ''}`
    : `one serving is ${kc(u.kcal)} kcal · ${Math.round(u.p || 0)} g protein`;
  const pick = (a) => { if (validAmount(food, a)) { setAmt(a); setTyping(false); haptic('tick'); } };
  const commitTyped = () => { const a = Number(String(typed).replace(',', '.')); if (validAmount(food, a)) pick(a); else setTyping(false); };
  const go = () => {
    if (busy || !validAmount(food, amt)) return;
    setBusy(true);
    haptic('commit');
    Promise.resolve(onDone(amt)).catch(() => {}).finally(() => setBusy(false));
  };
  useLayoutEffect(() => {
    const el = trayRef.current;
    if (!el || reduced()) return;
    const ease = getComputedStyle(document.documentElement).getPropertyValue('--nv-spring-smooth').trim() || 'cubic-bezier(.23,1,.32,1)';
    el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 520, easing: ease });
  }, []);
  const used = chips.used || [];
  return (
    <div className="nv-rl-layer" role="dialog" aria-modal="true" aria-label={`How much ${food.base}`}>
      <div className="nv-rl-scrim2" onClick={onClose} />
      <div className="nv-rl-tray" data-sheet="" ref={(el) => { trayRef.current = el; drag.sheetRef.current = el; }}>
        <div {...drag.handleProps} className="nv-rl-grabzone"><span className="nv-rl-grab" /></div>
        <div className="nv-rl-trh"><b>{food.base}</b><small>{sub}</small></div>
        <div className="nv-rl-amt">
          <Interactive as="span" className="nv-rl-stp" onClick={() => pick(stepAmount(food, amt, -1))} haptic="tick" focusStyle={{}} aria-label="Less">−</Interactive>
          {typing ? (
            <span className="nv-rl-big">
              <input autoFocus inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} onBlur={commitTyped}
                onKeyDown={(e) => { if (e.key === 'Enter') commitTyped(); }} aria-label={food.kind === 'count' ? `How many ${unitWords}` : 'How many servings'} />
              <em>{food.kind === 'count' ? unitWords : 'servings'}</em>
            </span>
          ) : (
            <span className="nv-rl-big" aria-live="polite"><b key={big}>{big}</b><em>{unitWords}</em></span>
          )}
          <Interactive as="span" className="nv-rl-stp" onClick={() => pick(stepAmount(food, amt, 1))} haptic="tick" focusStyle={{}} aria-label="More">+</Interactive>
        </div>
        <div className="nv-rl-live">
          <b>{kc(m.kcal)} kcal</b>
          {protFirst && <> · <i>{g1(m.p)} g protein</i></>} · {g1(m.c)} g carbs · {g1(m.f)} g fat{!protFirst && <> · {g1(m.p)} g protein</>}
        </div>
        {food.kind === 'count' ? (
          <>
            <div className="nv-rl-chips cen">
              {chips.counts.map((a) => <Chip key={a} on={Math.abs(a - amt) < 1e-9} onClick={() => pick(a)}>{a}</Chip>)}
              <Chip oth onClick={() => { setTyped(''); setTyping(true); }}>Type</Chip>
            </div>
            {used.length > 0 && <p className="nv-rl-hint">{usedHint(food)}</p>}
          </>
        ) : (
          <>
            <div className="nv-rl-chips cen">
              {chips.fractions.map((a) => <Chip key={a} on={Math.abs(a - amt) < 1e-9} onClick={() => pick(a)}>{amountShort(food, a)}</Chip>)}
            </div>
            <div className="nv-rl-chips cen" style={{ marginTop: '8px' }}>
              {chips.whole.map((a) => <Chip key={a} on={Math.abs(a - amt) < 1e-9} onClick={() => pick(a)}>{amountShort(food, a)}</Chip>)}
              <Chip oth onClick={() => { setTyped(''); setTyping(true); }}>Type</Chip>
            </div>
          </>
        )}
        <Interactive as="button" type="button" className="nv-rl-go" onClick={go} focusStyle={{}} disabled={busy}>
          {mode === 'change' ? 'Change to' : 'Log'} {label} · {kc(m.kcal)} kcal
        </Interactive>
      </div>
    </div>
  );
}

function Chip({ on, oth, onClick, children }) {
  return (
    <Interactive as="span" className={`nv-rl-chip${on ? ' on' : ''}${oth ? ' oth' : ''}`} onClick={onClick} haptic="tick" focusStyle={{}} role="button" aria-pressed={on || undefined}>
      {children}
    </Interactive>
  );
}

// --------------------------------------------------------------- the sheet --
const DAYS_FIRST = 8;

/** Log again: Regulars, every day in groups, and search (frames 2, 3, 6). */
export function RelogSheet({ r, onClose, runLog }) {
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(DAYS_FIRST);
  const [done, setDone] = useState(() => new Set());
  const [receipt, setReceipt] = useState(null);
  const [tray, setTray] = useState(null);
  const sheetRef = useRef(null);
  const moreRef = useRef(null);
  const closing = useRef(false);
  const drag = useSheetDrag(onClose, { threshold: 90 });

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = sheetRef.current;
    if (!el || reduced()) { onClose(); return; }
    el.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' })
      .finished.catch(() => {}).then(onClose);
  };

  useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el || reduced()) return;
    const ease = getComputedStyle(document.documentElement).getPropertyValue('--nv-spring-smooth').trim() || 'cubic-bezier(.23,1,.32,1)';
    el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 560, easing: ease });
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (tray) setTray(null); else close(); } };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tray]);
  // more days as the foot comes into view (ninety days at once is a lot of DOM)
  useEffect(() => {
    const el = moreRef.current;
    if (!el || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver((xs) => { if (xs.some((x) => x.isIntersecting)) setShown((n) => n + 8); }, { root: sheetRef.current?.querySelector('.nv-rl-body') || null, rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, q]);

  const results = useMemo(() => (q.trim() ? searchFoods(r.foods, q) : null), [q, r.foods]);

  // every log in the sheet lands here: the tick on the row, the receipt below
  const logged = (key, food, amount, entries, res, title) => {
    setDone((s) => new Set(s).add(key));
    setReceipt({ key: `${key}-${Date.now()}`, food, amount, entries, date: res?.date, day: res?.day, title, dayWord: r.logsTo });
  };
  const logOne = (key, food, amt, exact) => runLog(food, amt, exact).then((res) => {
    if (res?.entry) logged(key, food, amt, [res.entry], res, food.base);
    return res;
  });
  const logAll = async (gkey, rows) => {
    haptic('commit');
    const entries = [];
    let last = null;
    for (const row of rows) {
      // one at a time, so they land in the order he ate them
      // eslint-disable-next-line no-await-in-loop
      const res = await runLog(row.food, row.amount, row).catch(() => null);
      if (res?.entry) { entries.push(res.entry); last = res; setDone((s) => new Set(s).add(`${gkey}:${row.key}`)); }
    }
    if (entries.length) setReceipt({ key: `${gkey}-${Date.now()}`, food: null, amount: null, entries, date: last.date, day: last.day, title: `${entries.length} ${entries.length === 1 ? 'thing' : 'things'}`, dayWord: r.logsTo });
  };
  const changeAmount = (amt) => {
    const rc = receipt;
    return r.change(rc.entries[0], rc.date, rc.food, amt).then((res) => {
      setReceipt({ ...rc, amount: amt, entries: res?.entry ? [res.entry] : rc.entries, day: res?.day || rc.day });
      setTray(null);
    });
  };

  return (
    <div className="nv-rl-layer top" role="dialog" aria-modal="true" aria-label="Log again">
      <div className="nv-rl-scrim" onClick={close} />
      <div className="nv-rl-sheet" data-sheet="" ref={(el) => { sheetRef.current = el; drag.sheetRef.current = el; }}>
        <div {...drag.handleProps} className="nv-rl-grabzone"><span className="nv-rl-grab" /></div>
        <div className="nv-rl-sh">
          <b>Log again</b>
          <Interactive as="span" className="nv-rl-done" onClick={close} haptic="tick" focusStyle={{}} aria-label="Done">Done</Interactive>
        </div>
        <label className="nv-rl-find">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${r.total} foods`} aria-label={`Search ${r.total} foods`}
            enterKeyHint="search" autoComplete="off"
            onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) { const t = q.trim(); close(); r.describe(t); } }} />
        </label>

        <div className="nv-rl-body">
          {results ? (
            <SearchResults results={results} q={q} r={r} done={done} onLog={logOne} onTray={(food, amt) => setTray({ food, amt, mode: 'log' })} />
          ) : (
            <>
              {r.regulars.length > 0 && (
                <>
                  <div className="nv-rl-sec">Regulars <em>most logged, last 6 weeks</em></div>
                  <div className="nv-rl-regs">
                    {r.regulars.map(({ food, count }) => {
                      const k = `reg:${food.key}`;
                      return (
                        <Interactive key={food.key} as="div" className={`nv-rl-rg${done.has(k) ? ' done' : ''}`} onClick={() => logOne(k, food, food.last.amount)}
                          onLongPress={() => setTray({ food, amt: food.last.amount, mode: 'log' })} haptic="commit" focusStyle={{}}
                          aria-label={`Log ${food.base}, logged ${count} times. Hold to choose the amount`}>
                          <b>{food.base}</b>
                          <small>{food.kind === 'count' ? `per ${food.unit} · ${kc(food.unitMacros.kcal)} kcal` : `${Math.round(food.last.macros.p)} g · ${kc(food.last.macros.kcal)} kcal`} · {count}×</small>
                        </Interactive>
                      );
                    })}
                  </div>
                </>
              )}
              {r.days.slice(0, shown).map((d) => {
                const h = dayHeading(d.date, r.today);
                return (
                  <section key={d.date} aria-label={h.label}>
                    <div className="nv-rl-sec">{h.label} <em>{h.date}</em></div>
                    {d.groups.map((g, gi) => {
                      const gkey = `${d.date}:${gi}`;
                      const many = g.rows.length > 1;
                      return (
                        <div key={gkey} className="nv-rl-grp">
                          <div className="nv-rl-gh">
                            <span>{g.untimed ? 'no time logged' : g.from === g.to ? g.from : `${g.from} – ${g.to}`}{many ? ` · ${g.rows.length} things` : ''}</span>
                            {many && <Interactive as="span" className="nv-rl-all-g" onClick={() => logAll(gkey, g.rows)} focusStyle={{}} aria-label={`Log all ${g.rows.length} again`}>Log all</Interactive>}
                          </div>
                          {[...g.rows].reverse().map((row) => {
                            const k = `${gkey}:${row.key}`;
                            const f = row.food;
                            const sub = f.kind === 'count'
                              ? <>{amountLabel(f, row.amount)} · {kc(row.macros.kcal)} kcal{row.entries > 1 ? ` · logged as ${row.entries} entries` : ''}</>
                              : <><i>{Math.round(row.macros.p)} g</i> · {kc(row.macros.kcal)} kcal{Math.abs(row.amount - 1) > 1e-9 ? ` · ${amountLabel(f, row.amount)}` : ''}{row.entries > 1 ? ` · logged as ${row.entries} entries` : ''}</>;
                            return (
                              <Interactive key={row.key} as="div" className={`nv-rl-it${done.has(k) ? ' done' : ''}`} onClick={() => logOne(k, f, row.amount, row)}
                                onLongPress={() => setTray({ food: f, amt: row.amount, mode: 'log', key: k })} haptic="commit" focusStyle={{}}
                                aria-label={`Log ${f.base} again, ${amountLabel(f, row.amount)}. Hold to choose the amount`}>
                                <span><b>{f.base}</b><small>{sub}</small></span>
                                {done.has(k) ? <Tick /> : <span className="nv-rl-t">{row.time || ''}</span>}
                              </Interactive>
                            );
                          })}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
              {shown < r.days.length && <div ref={moreRef} className="nv-rl-more" aria-hidden="true" />}
              {!r.days.length && <p className="nv-rl-empty">Nothing outside your rotation logged yet. What you log in the field collects here.</p>}
            </>
          )}
          <div style={{ height: receipt ? '96px' : '40px' }} />
        </div>
        <div className="nv-rl-fade" aria-hidden="true" />
        {receipt && (
          <RelogReceipt key={receipt.key} rc={receipt} targetKcal={r.targetKcal} inSheet
            onAmount={() => setTray({ food: receipt.food, amt: receipt.amount, mode: 'change' })}
            onUndo={() => { r.undo(receipt.entries, receipt.date); setReceipt(null); setDone(new Set()); }} />
        )}
      </div>
      {tray && (
        <AmountTray key={`${tray.food.key}-${tray.mode}`} food={tray.food} start={tray.amt} mode={tray.mode} onClose={() => setTray(null)}
          onDone={(amt) => (tray.mode === 'change'
            ? changeAmount(amt)
            : logOne(tray.key || `tray:${tray.food.key}`, tray.food, amt).then(() => setTray(null)))} />
      )}
    </div>
  );
}

function SearchResults({ results, q, r, done, onLog, onTray }) {
  if (!results.length) {
    return <p className="nv-rl-empty">Nothing you have logged matches. Return asks Nova to estimate it.</p>;
  }
  const hl = (name) => {
    const sp = matchSpan(name, q);
    if (!sp) return name;
    return <>{name.slice(0, sp[0])}<mark>{name.slice(sp[0], sp[1])}</mark>{name.slice(sp[1])}</>;
  };
  return (
    <>
      <div className="nv-rl-sec">{results.length} {results.length === 1 ? 'food' : 'foods'} <em>newest first</em></div>
      <div className="nv-rl-grp">
        {results.slice(0, 80).map((f) => {
          const k = `s:${f.key}`;
          const chips = f.kind === 'count' || f.dayTotals.size > 1 || new Set(f.occ.map((o) => o.amount)).size > 1 ? usedAmounts(f) : null;
          const m = f.last.macros;
          return (
            <Interactive key={f.key} as="div" className={`nv-rl-it${done.has(k) ? ' done' : ''}`} onClick={chips ? undefined : () => onLog(k, f, f.last.amount)}
              onLongPress={() => onTray(f, f.last.amount)} haptic={chips ? undefined : 'commit'} focusStyle={{}}
              aria-label={`${f.base}. ${chips ? 'Pick an amount' : 'Tap to log it again'}`}>
              <span>
                <b>{hl(f.base)}</b>
                <small>
                  {f.kind === 'count'
                    ? <>per {f.unit} · <i>{g1(f.unitMacros.p)} g</i> · {kc(f.unitMacros.kcal)} kcal · last {whenDay(f.last.date, r.today)}</>
                    : <><i>{Math.round(m.p)} g</i> · {kc(m.kcal)} kcal</>}
                </small>
                {chips && (
                  <span className="nv-rl-chips">
                    {chips.map((a) => <Chip key={a} on={Math.abs(a - f.last.amount) < 1e-9} onClick={(e) => { e?.stopPropagation?.(); onLog(k, f, a); }}>{amountShort(f, a)}</Chip>)}
                    <Chip oth onClick={(e) => { e?.stopPropagation?.(); onTray(f, f.last.amount); }}>Other…</Chip>
                  </span>
                )}
              </span>
              {done.has(k) ? <Tick /> : (!chips || f.kind !== 'count') && <span className="nv-rl-t">{whenDay(f.last.date, r.today)}</span>}
            </Interactive>
          );
        })}
      </div>
      <p className="nv-rl-note">Return still asks Nova to estimate something new.</p>
    </>
  );
}

// the four amounts he has used most for this food, smallest first
function usedAmounts(f) {
  const n = new Map();
  for (const o of f.occ) n.set(o.amount, (n.get(o.amount) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4).map(([a]) => a).sort((a, b) => a - b);
}

