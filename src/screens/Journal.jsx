import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../journal.css';
import { Interactive } from '../Interactive.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { CountUp } from '../CountUp.jsx';

// HIS JOURNAL (mockup 95, his calls of 11 Oct 2026). One page with a quiet
// switch: it always opens to HIS words (Mine), and Nova's log, the agents'
// entries signed, is one tap away and never remembered. One button gives
// three prompts (Deep, Daily review, My life), written at the tap; every
// entry of his wears a tag that says where it came from, and quietly
// whether Notion has it. View model: src/vals/valsJournal.js.

const P = {
  chev: <path d="m9.5 6 6 6-6 6" />,
  close: <path d="M7 7l10 10M17 7 7 17" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  own: <><path d="M5 19l1-4L16 5l3 3L9 18Z" /><path d="m14 7 3 3" /></>,
  life: <><circle cx="12" cy="12" r="3.6" /><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.5 1.5M16.5 16.5 18 18M6 18l1.5-1.5M16.5 7.5 18 6" /></>,
  deep: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  ask: <><path d="M4.5 5.5h15v10.5h-8l-4.5 3.5V16h-2.5Z" /><path d="M10.2 9.2a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.3" /><circle cx="12" cy="14" r=".7" fill="currentColor" stroke="none" /></>,
  another: <><path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.9-3.6M13.1 9.6C14.2 7.6 15.4 7 17 7h3" /><path d="m18 5 2 2-2 2M18 15l2 2-2 2" /></>,
  synced: <><path d="M7 17.5h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 9.2a4.2 4.2 0 0 0 0 8.3Z" /><path d="m9.5 13 2 2 3.5-3.6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  spin: <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />,
  arrive: <><path d="M12 3.5v10M7.5 9 12 13.5 16.5 9" /><path d="M4 14.5V19h16v-4.5" /></>,
  offline: <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a9.5 9.5 0 0 1 4-2.3M19 13a9.5 9.5 0 0 0-2.6-1.8M12 20h.01" />,
  warn: <><path d="M12 4 21 19.5H3Z" /><path d="M12 10v4M12 17h.01" /></>,
  cal: <><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  train: <path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11" />,
  lead: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5M14.5 15.2c.8-.5 1.6-.7 2.5-.7 2 0 3.6 1.4 4.2 4.5" /></>,
  money: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1 2.9.9 2.9 2.2-1.2 2.1-2.9 2.1c-1.4 0-2.5-.6-3-1.6M12 6v1.8M12 16.2V18" /></>,
  review: <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />,
};
export function JrIcon({ name, className = 'nv-jr-ic' }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{P[name]}</svg>;
}

function Press({ className, onClick, children, style, label, ...rest }) {
  return (
    <Interactive as="button" type="button" className={className} onClick={onClick} haptic="tick" aria-label={label} style={style} {...rest}>
      {children}
    </Interactive>
  );
}

function TagChip({ t, onOpen, open, still }) {
  const ref = useRef(null);
  if (still) return <span className="nv-jr-tag" style={{ '--c': t.hue }}><JrIcon name={t.key} />{t.label}</span>;
  return (
    <Press className="nv-jr-tag" style={{ '--c': t.hue }} label={`Tag: ${t.label}. Change it`} aria-expanded={!!open}
      onClick={() => onOpen(ref.current.getBoundingClientRect())} ref={ref}>
      <JrIcon name={t.key} />{t.label}
    </Press>
  );
}

function Sync({ s }) {
  if (!s || s.kind === 'none') return null;
  if (s.kind === 'ok') return <span className="nv-jr-sync ok" role="img" aria-label="In Notion" title="In Notion"><JrIcon name="synced" /></span>;
  if (s.kind === 'busy') return <span className="nv-jr-sync busy" role="img" aria-label="Saving to Notion"><JrIcon name="spin" /></span>;
  if (s.kind === 'from') return <span className="nv-jr-sync from"><JrIcon name="arrive" />{s.words}</span>;
  if (s.kind === 'error') return <span className="nv-jr-sync err"><JrIcon name="warn" />{s.words}</span>;
  return <span className="nv-jr-sync wait"><JrIcon name="clock" />{s.words}</span>;
}

function Entry({ e, j }) {
  return (
    <div className={`nv-jr-ent${e.isNew ? ' new' : ''}`} style={{ '--c': e.tagMeta.hue }}>
      <div className="nv-jr-etop">
        <span className="nv-jr-tm">{e.time}</span>
        <TagChip t={e.tagMeta} open={e.tagOpen} onOpen={e.openTag} still={!e.novaId} />
        <Sync s={e.sync} />
      </div>
      {e.prompt && <p className="nv-jr-eq">{e.prompt}</p>}
      <p className="nv-jr-etx">{e.words}</p>
      {e.isNew && !j.reduced && <span className="nv-jr-ring1" aria-hidden="true" />}
    </div>
  );
}

function DayRow({ d, render }) {
  return (
    <div className={`nv-jr-drow${d.open ? ' open' : ''}`}>
      <Press className="nv-jr-dtop" onClick={d.toggle} aria-expanded={d.open} label={`${d.label}, ${d.count ?? d.beads?.length} entries`}>
        <span className="nv-jr-dd">{d.label}</span>
        <span className="nv-jr-dots" aria-hidden="true">
          {d.dots.map((h, i) => <i key={i} style={{ '--c': h, '--i': i }} />)}
          {d.extra > 0 && <small>+{d.extra}</small>}
        </span>
        <JrIcon name="chev" className="nv-jr-ic nv-jr-chev" />
      </Press>
      {d.open && <div className="nv-jr-dent">{render(d)}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- the ribbon */
function Ribbon({ r, glass }) {
  const tot = r.own + r.life + r.deep || 1;
  let x = 0;
  const seg = ['own', 'life', 'deep'].map((k) => { const w = r[k] / tot; const s = { k, x, w }; x += w; return s; });
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(t); }, []);
  return (
    <div className={`${glass} nv-jr-glass nv-jr-ribbon`} aria-label={`This week by tag: ${r.own} own, ${r.life} life, ${r.deep} deep`}>
      <div className="nv-jr-rbar">
        {seg.map((s) => <span key={s.k} style={{ '--c': `var(--nv-jr-${s.k})`, transform: `translateX(${ready ? s.x * 100 : 0}%) scaleX(${ready ? s.w : 0})` }} />)}
      </div>
      <div className="nv-jr-rkey">
        {['own', 'life', 'deep'].map((k) => (
          <span key={k} style={{ '--c': `var(--nv-jr-${k})` }}><i />{k[0].toUpperCase() + k.slice(1)} <CountUp className="nv-jr-num" value={r[k]} fromZero /></span>
        ))}
        <span className="wk">this week</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- sheets */
function Sheet({ open, onClose, label, className = '', children }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <div className={`nv-jr-scrim${open ? ' on' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`nv-jr-sheet ${className}${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open} inert={!open ? '' : undefined}>
        <div className="nv-jr-grab" aria-hidden="true" />
        {children}
      </div>
    </>,
    document.body,
  );
}

function FilterSheet({ j }) {
  const f = j.filter;
  const Row = ({ r, dot = true }) => (
    <Press className={`nv-jr-srow${r.sel ? ' sel' : ''}`} onClick={r.go} aria-pressed={r.sel}>
      {dot && <span className="wi" style={{ '--c': r.hue }} />}<span className="t">{r.label}</span><JrIcon name="check" className="nv-jr-ic nv-jr-chk" />
    </Press>
  );
  return (
    <Sheet open={f.open} onClose={f.close} label="Show entries">
      <div className="nv-jr-shh"><h5>Show entries</h5><Press className="nv-jr-x" onClick={f.close} label="Done"><JrIcon name="close" /></Press></div>
      {j.view === 'mine' ? <>
        <div className="nv-jr-fh">Tag</div>
        <div className="nv-jr-fgrp">{f.tag.map((r) => <Row key={r.key} r={r} />)}</div>
      </> : <>
        <div className="nv-jr-fh">Who</div>
        <div className="nv-jr-fgrp">{f.who.map((r) => <Row key={r.key} r={r} />)}</div>
      </>}
      <div className="nv-jr-fh">Kind, as today</div>
      <div className="nv-jr-fgrp">{f.kind.map((r) => <Row key={r.key} r={r} dot={false} />)}</div>
    </Sheet>
  );
}

function PromptCard({ c }) {
  const busy = c.status === 'loading';
  return (
    <div className={`nv-jr-pcard${c.used ? ' used' : ''}`} style={{ '--c': c.hue }}>
      <div className="nv-jr-pin">
        <div className="nv-jr-pk"><JrIcon name={c.glyph} />{c.label}{c.demo && <span className="nv-jr-inv">demo example</span>}</div>
        {busy ? (
          <p className="nv-jr-pq" aria-label="Writing this prompt"><span className="nv-jr-loadq" /><span className="nv-jr-loadq" style={{ width: '70%' }} /></p>
        ) : c.status === 'ready' ? (
          <p className="nv-jr-pq" key={c.prompt}>{c.prompt}</p>
        ) : (
          <p className="nv-jr-pq none">{c.error || "Couldn't write this one."}</p>
        )}
        {c.sources && (
          <div className="nv-jr-psrc">
            {c.sources.map((s) => (
              <span key={s.key} className={`nv-jr-sc${s.lit ? ' lit' : ''}${s.gone ? ' gone' : ''}`} title={s.gone ? `${s.label}: nothing readable today, skipped` : s.label}><JrIcon name={s.key} />{s.label}</span>
            ))}
          </div>
        )}
        {c.status === 'ready' && c.from && (
          typeof c.from === 'string' ? <p className="nv-jr-pfrom">{c.from}</p>
            : <p className="nv-jr-pfrom">{c.from.lead}<b>{c.from.bold}</b>{c.from.tail}</p>
        )}
        <div className="nv-jr-pact">
          <Press className="nv-jr-another" onClick={c.status === 'error' ? c.retry : c.another} disabled={busy || c.status === 'off' || c.status === 'empty'}>
            <JrIcon name="another" />{c.status === 'error' ? 'Try again' : 'Another'}
          </Press>
          <Press className="nv-jr-use" onClick={c.toggleUse} aria-pressed={c.used} disabled={c.status !== 'ready'}><JrIcon name="check" />{c.used ? 'Using' : 'Use'}</Press>
        </div>
      </div>
    </div>
  );
}

function PickerSheet({ j }) {
  const p = j.picker;
  const track = useRef(null);
  const start = useRef(null);
  if (!p) return null;
  // a swipe moves the cards, and the switch follows
  const down = (e) => { start.current = { x: e.clientX, y: e.clientY }; };
  const up = (e) => {
    const s = start.current; start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y)) p.setIndex(p.index + (dx < 0 ? 1 : -1));
  };
  const n = p.chosen;
  return (
    <Sheet open={p.open} onClose={p.close} label="Prompts for today" className="pick">
      <div className="nv-jr-shh"><h5>Three prompts for today</h5><Press className="nv-jr-x" onClick={p.close} label="Close"><JrIcon name="close" /></Press></div>
      <div className="nv-jr-kseg" role="tablist" aria-label="Kind of prompt">
        <span className="th" style={{ transform: `translateX(${p.index * 100}%)` }} />
        {p.cards.map((c, i) => (
          <Press key={c.kind} className={`${i === p.index ? 'on' : ''}${c.used ? ' used' : ''}`} role="tab" aria-selected={i === p.index} onClick={() => p.setIndex(i)} style={{ '--c': c.hue }}>
            <i /><JrIcon name="check" className="nv-jr-ic ck" />{c.label}
          </Press>
        ))}
      </div>
      <div className="nv-jr-cards" onPointerDown={down} onPointerUp={up}>
        <div className="nv-jr-track" ref={track} style={{ transform: `translateX(${-p.index * 100}%)` }}>
          {p.cards.map((c) => <PromptCard key={c.kind} c={c} />)}
        </div>
      </div>
      <div className="nv-jr-pfoot">
        <span className="chosen">{n ? <><b>{n} chosen</b>{p.fromHome && n === 1 ? ' from Home' : ', answered in turn'}</> : 'Use one, some or all'}</span>
        <Press className={`nv-jr-write${n ? '' : ' idle'}`} onClick={p.write} disabled={!n}>{n > 1 ? `Write ${n}` : 'Write'}</Press>
      </div>
    </Sheet>
  );
}

function TagPop({ j }) {
  const t = j.tagPop;
  useEffect(() => {
    if (!t) return undefined;
    const k = (e) => { if (e.key === 'Escape') t.close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [t]);
  if (!t || typeof document === 'undefined') return null;
  const left = Math.max(12, Math.min(t.x, (window.innerWidth || 390) - 260));
  return createPortal(
    <>
      <div className="nv-jr-popcatch" onClick={t.close} aria-hidden="true" />
      <div className="nv-jr-tpop" role="menu" aria-label="Change tag" style={{ left, top: t.y + 6, '--ox': `${Math.max(12, t.x - left + 20)}px` }}>
        {['own', 'life', 'deep'].map((k) => (
          <Press key={k} role="menuitemradio" aria-checked={t.current === k} className={t.current === k ? 'sel' : ''} style={{ '--c': j.tags[k].hue }} onClick={() => t.set(k)}>
            <JrIcon name={k} />{j.tags[k].label}
          </Press>
        ))}
      </div>
    </>,
    document.body,
  );
}

/* --------------------------------------------------------------- the pages */
function Skeleton() {
  return (
    <div className="nv-jr-skel" aria-label="Loading your journal">
      <div className="nv-jr-sk" style={{ height: 48 }} />
      <div className="nv-jr-sk" style={{ height: 168, marginTop: 12, borderRadius: 20 }} />
      <div className="nv-jr-sk" style={{ height: 46, marginTop: 12 }} />
      <div className="nv-jr-sk" style={{ height: 200, marginTop: 30, borderRadius: 20 }} />
    </div>
  );
}

function NotionRow({ j }) {
  const n = j.notion;
  if (n.state === 'not-connected') {
    return (
      <div className="nv-jr-setup">
        <span>Notion isn't connected yet<small>Your entries are safe in your vault.</small></span>
        <Press onClick={n.connect}>Connect</Press>
      </div>
    );
  }
  if (n.state === 'error') {
    return (
      <div className="nv-jr-setup err">
        <span>Notion is not taking entries<small>{n.error || 'The last pass failed.'} Your entries are safe in your vault.</small></span>
        <Press onClick={n.retry}>Retry</Press>
      </div>
    );
  }
  if (n.state === 'syncing') return <span className="nv-jr-offl"><JrIcon name="spin" className="nv-jr-ic spin" />Saving to Notion</span>;
  return null;
}

function Composer({ j }) {
  const c = j.composer;
  return (
    <div className={`${j.glass} nv-jr-glass nv-jr-comp`}>
      <div className="nv-jr-chead"><b>{c.dateLabel}</b></div>
      {c.step && (
        <div className="nv-jr-qstep" key={c.step.prompt}>
          <div className="nv-jr-qmeta"><span>{c.step.n}</span><TagChip t={c.step.tag} still /><Press className="nv-jr-qx" onClick={c.step.cancel} label="Stop answering prompts"><JrIcon name="close" /></Press></div>
          <p className="nv-jr-qtext">{c.step.prompt}</p>
        </div>
      )}
      <LocalInput
        multiline submitOnEnter={false}
        value={c.text} onChange={c.setText}
        placeholder="What's on your mind"
        aria-label={c.step ? 'Your answer' : "What's on your mind"}
        autoCorrect="on" autoCapitalize="sentences" spellCheck
        className="nv-jr-field"
      />
      {c.error && <p className="nv-jr-err">{c.error}</p>}
      <div className="nv-jr-crow">
        <Press className="nv-jr-ask" onClick={c.ask}><JrIcon name="ask" />Give me a prompt</Press>
        <Press className={`nv-jr-save${c.canSave ? '' : ' idle'}`} onClick={c.save} disabled={c.busy}>{c.busy ? 'Saving' : c.saveLabel}</Press>
      </div>
    </div>
  );
}

function Mine({ j }) {
  return (
    <div className="nv-jr-body mine">
      <NotionRow j={j} />
      {j.offline && <span className="nv-jr-offl"><JrIcon name="offline" />Offline · entries wait on this phone</span>}
      <p className="nv-jr-news">{j.news.lead} {j.news.bold && <b>{j.news.bold}</b>}</p>
      <Composer j={j} />
      <Ribbon r={j.ribbon} glass={j.glass} />
      {j.filter.active && (
        <div className="nv-jr-fnote">Showing {j.filter.label}. <Press className="nv-jr-link" onClick={j.filter.showAll}>Show all</Press></div>
      )}
      {j.today.length > 0 && <>
        <div className="nv-jr-ghead"><span>Today</span></div>
        <div className={`${j.glass} nv-jr-glass nv-jr-ents`}>{j.today.map((e) => <Entry key={e.key} e={e} j={j} />)}</div>
      </>}
      {j.week.length > 0 && <>
        <div className="nv-jr-ghead"><span>This week</span></div>
        <div className={`${j.glass} nv-jr-glass`}>{j.week.map((d) => <DayRow key={d.key} d={d} render={(x) => x.entries.map((e) => <Entry key={e.key} e={e} j={j} />)} />)}</div>
      </>}
      {j.earlier.length > 0 && <>
        <div className="nv-jr-ghead"><span>Earlier</span></div>
        <div className={`${j.glass} nv-jr-glass`}>{j.earlier.map((d) => <DayRow key={d.key} d={d} render={(x) => x.entries.map((e) => <Entry key={e.key} e={e} j={j} />)} />)}</div>
      </>}
      {j.empty && <p className="nv-jr-lognote">Nothing of yours here yet. The composer is the page: write a line, or ask for a prompt.</p>}
    </div>
  );
}

function Bead({ b }) {
  return (
    <div className="nv-jr-bead" style={{ '--c': b.hue }}>
      <span className="tm">{b.time}</span><span className="dot" />
      <span className="by">{b.who}{b.label && <span>· {b.label}</span>}</span>
      <span className="tx">{b.text}</span>
    </div>
  );
}

function Log({ j }) {
  const L = j.log;
  return (
    <div className="nv-jr-body log">
      <p className="nv-jr-news">{L.news.lead}<b>{L.news.bold}</b>{L.news.tail}</p>
      {L.today.length > 0 ? (
        <div className={`${j.glass} nv-jr-glass`}><div className="nv-jr-rail">{L.today.map((b) => <Bead key={b.key} b={b} />)}</div></div>
      ) : j.filter.active ? (
        <div className="nv-jr-fnote">Nothing today for {j.filter.label}. <Press className="nv-jr-link" onClick={j.filter.showAll}>Show all</Press></div>
      ) : null}
      {L.past.length > 0 && <>
        <div className="nv-jr-ghead"><span>Earlier</span></div>
        <div className={`${j.glass} nv-jr-glass`}>{L.past.map((d) => <DayRow key={d.key} d={d} render={(x) => <div className="nv-jr-rail in">{x.beads.map((b) => <Bead key={b.key} b={b} />)}</div>} />)}</div>
      </>}
      <p className="nv-jr-lognote">Nothing here is yours, and nothing here quotes you. It stays in your vault and does not go to Notion.</p>
    </div>
  );
}

export function Journal({ v }) {
  const j = v.journal;
  const log = j.view === 'log';
  return (
    <div style={v.wrapJournal} className="nv-jr" data-screen-label="Journal">
      <div className="nv-jr-lt">
        <h1>Journal</h1>
        <Press className={`nv-jr-ib${j.filter.active ? ' on' : ''}`} onClick={j.filter.toggle} label="Filter" style={log ? { '--c': 'var(--nv-nova)' } : undefined}><JrIcon name="filter" /></Press>
      </div>
      <div className={`nv-jr-sw${log ? ' log' : ''}`} role="tablist" aria-label="Whose entries">
        <span className="th" />
        <Press role="tab" className={log ? '' : 'on'} aria-selected={!log} onClick={() => j.setView('mine')}>Mine</Press>
        <Press role="tab" className={log ? 'on' : ''} aria-selected={log} onClick={() => j.setView('log')}>Nova's log <span className="nv-jr-num">{j.log.count}</span></Press>
      </div>
      {!j.loaded ? <Skeleton /> : (
        <div key={j.view} className={`nv-jr-view ${log ? 'to-log' : 'to-mine'}`}>
          {log ? <Log j={j} /> : <Mine j={j} />}
        </div>
      )}
      {j.demo && <p className="nv-jr-demo">Demo journal: every entry and prompt here is invented.</p>}
      <FilterSheet j={j} />
      <PickerSheet j={j} />
      <TagPop j={j} />
    </div>
  );
}
