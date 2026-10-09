import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../code.css';
import { CountUp } from '../CountUp.jsx';
import { useFlipList } from '../useFlipList.js';
import { useSheetDrag } from '../useSheetDrag.js';

// CODE, ROUND 3 (design/mockups/89-redesign-code-r3.html, approved 10 Oct
// 2026: "Looking good. Ensure that the models are current … Also ensure that
// committing etc are all actually functional and confirm it's not just for
// show."). The acceptance contract is design/audits/redesign-2026-09/
// 20-code-build-checklist.md.
//
// D refined: the root is the projects as tiles with E's state chips and the
// Needs-you strip (only while something waits on him); Science Atlas and Wren
// are one family tile, Wren on a branch. A project page has ONE focal object,
// the commit review (the diff drawn as file bars, ticks, the 8-character
// rule lighting as he types, Commit and Shelve, a receipt with Undo while
// unpushed), then Sessions and Runs under a sticky anchor bar. The ⋯ sheet
// holds what left the page. On the Mac the root becomes a sidebar and the
// page splits in two columns.
//
// The view model is src/vals/valsCode.js; the arithmetic src/codeModel.js;
// the writes src/codeActions.js (each proven against a temporary repo in
// server/test/codeActionsReal.test.js). One render for every style.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const EOUT = 'cubic-bezier(.23,1,.32,1)';

// ------------------------------------------------------------------ marks --

const PATHS = {
  more: <><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>,
  right: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  left: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  mac: <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  in: <><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" /><path d="M4 14v5h16v-5" /></>,
  nova: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.6" /></>,
  vault: <><path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z" /><path d="M6 18a2 2 0 0 1 2-2h10" /></>,
  atlas: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></>,
  wren: <><path d="M4 15c3 0 5-2 6-5 1.5-3.5 5-5 8-3l2 1-2 1c0 5-4 9-9 9H5z" /><path d="M9 18l-1 3" /></>,
  build: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  folder: <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
};
function Ic({ g, className = 'nv-cd-ic' }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{PATHS[g] || PATHS.folder}</svg>;
}
function Glyph({ p, size = '' }) {
  return <span className={`nv-cd-pgl${p.kin ? ' kin' : ''}${size ? ' ' + size : ''}`} style={{ '--h': p.hue }}><Ic g={p.glyph} /></span>;
}
function Chip({ c, hue }) {
  return (
    <span className={`nv-cd-sc ${c.kind}`} style={hue ? { '--h': hue } : undefined}>
      {c.kind === 'done' ? <Ic g="check" /> : <i />}{c.text}
    </span>
  );
}
function Chips({ chips, hue }) {
  if (!chips?.length) return null;
  return <div className="nv-cd-chips">{chips.map((c) => <Chip key={c.kind + c.text} c={c} hue={hue} />)}</div>;
}

// ------------------------------------------------------------- the reveal --

// cards rise once as they scroll in (opacity + 14 px), staggered; reduced
// motion shows them at once
function useReveal(rootRef, key) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = [...root.querySelectorAll('.nv-cd-rv:not(.in)')];
    if (reduced() || typeof IntersectionObserver !== 'function') { els.forEach((e) => e.classList.add('in')); return undefined; }
    let i = 0;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.style.transitionDelay = `${Math.min(i++, 6) * 60}ms`;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }), { threshold: 0.06 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  });
  // a new page starts its stagger again
  useEffect(() => {}, [key]);
}

function scrollParentOf(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
  }
  return document.scrollingElement || document.documentElement;
}

// ------------------------------------------------------------------- root --

function Needs({ needs }) {
  if (!needs.length) return null;
  return (
    <section className="nv-cd-needs nv-cd-rv" aria-label="Needs you">
      <div className="nh"><span className="cnt"><CountUp value={needs.length} fromZero /></span><b>Needs you</b><span>oldest first</span></div>
      {needs.map((n) => (
        <div className="nrow" key={n.key}>
          <Glyph p={n.glyph} size="s" />
          <div className="t">
            <b>{n.title}</b>
            {n.quote ? (
              <figure className="nv-cd-quote">
                <figcaption>{n.quote.who}{n.quote.when ? `, ${n.quote.when}` : ''}, in <span className="nm">{n.quote.where}</span></figcaption>
                <blockquote>{n.quote.text}</blockquote>
              </figure>
            ) : <span className="nv-cd-k">{n.line}</span>}
          </div>
          <button type="button" className="nv-cd-btn sm" onClick={n.action.run} disabled={n.action.busy || n.action.disabled} aria-label={n.action.aria || n.action.label}>
            {n.action.icon && <Ic g={n.action.icon} />}{n.action.busy ? 'Opening' : n.action.label}
          </button>
        </div>
      ))}
    </section>
  );
}

function MiniDiff({ bars }) {
  if (!bars?.length) return null;
  return (
    <div className="nv-cd-minidiff" aria-hidden="true">
      {bars.map((b, i) => (
        <span key={b.key} style={{ width: `${b.width}%`, animationDelay: `${i * 70}ms` }}>
          <i className="a" style={{ flex: Math.max(b.added, b.removed ? 0 : 1) }} />{b.removed ? <i className="r" style={{ flex: b.removed }} /> : null}
        </span>
      ))}
    </div>
  );
}

function NovaTile({ t, onOpen }) {
  return (
    <button type="button" className={`nv-cd-tile nv-cd-rv${t.selected ? ' sel' : ''}`} style={{ '--h': t.hue }} onClick={onOpen || t.open}
      aria-label={`${t.title}: ${t.chips.map((c) => c.text).join(', ') || 'nothing waiting'}`}>
      <div className="th"><Glyph p={t} /><div className="t"><b>{t.title}</b><span className="nv-cd-k">{t.sub}</span></div><Ic g="right" className="nv-cd-ic chev" /></div>
      <MiniDiff bars={t.bars} />
      <Chips chips={t.chips} hue={t.hue} />
      {t.foot && <div className="tfoot"><i className={`nv-cd-mk${t.foot.mark === 'brk' ? ' crack' : ''}`} />{t.foot.text}</div>}
    </button>
  );
}

function FamilyTile({ atlas, wren }) {
  return (
    <section className={`nv-cd-fam nv-cd-rv${atlas.selected ? ' sel' : ''}`} style={{ '--h': atlas.hue }} aria-label="Science Atlas and its assistant Wren">
      <button type="button" className="famtop" onClick={atlas.open}>
        <div className="th"><Glyph p={atlas} /><div className="t"><b>{atlas.title}</b><span className="nv-cd-k">{atlas.sub}</span></div><Ic g="right" className="nv-cd-ic chev" /></div>
        {atlas.chips.length ? <Chips chips={atlas.chips} hue={atlas.hue} /> : <span className="nv-cd-k none">{atlas.sessions ? '' : 'No session open on your Mac'}</span>}
      </button>
      <div className="kinwrap">
        <svg className="branch" viewBox="0 0 22 46" aria-hidden="true"><path d="M1 0v30c0 6 4 10 10 10h11" /></svg>
        <button type="button" className="kinrow" onClick={wren.open}>
          <div className="th"><Glyph p={wren} size="s" /><div className="t"><span className="rel">its assistant</span><b>{wren.title}</b></div><Ic g="right" className="nv-cd-ic chev" /></div>
          <span className="nv-cd-k line">{wren.sub}</span>
          {wren.chips.length ? <Chips chips={wren.chips} hue={wren.hue} /> : <span className="nv-cd-k none">No session open on your Mac</span>}
        </button>
      </div>
    </section>
  );
}

function SmallTile({ t }) {
  return (
    <button type="button" className={`nv-cd-tile small nv-cd-rv${t.selected ? ' sel' : ''}`} style={{ '--h': t.hue }} onClick={t.open}>
      <Glyph p={t} size="s" />
      <b>{t.title}</b>
      <span className="nv-cd-k clamp">{t.sub}</span>
      <Chips chips={t.chips} hue={t.hue} />
    </button>
  );
}

function DoneToday({ rows }) {
  const ref = useRef(null);
  useFlipList(ref, rows.map((r) => r.key + (r.canUndo ? 1 : 0)).join('|'));
  if (!rows.length) return null;
  return (
    <>
      <div className="nv-cd-sh"><h2>Done today</h2><span>each with a way back</span></div>
      <section className="nv-cd-card nv-cd-rv list" ref={ref}>
        {rows.map((r) => (
          <div className="nv-cd-rcp" key={r.key} data-flip={r.key}>
            <span className="ok"><Ic g="check" /></span>
            <div className="t"><b>{r.title}</b><span className="nv-cd-k">{r.line}</span></div>
            {r.canUndo ? <button type="button" className="nv-cd-btn sm" onClick={r.undo} disabled={r.busy}>Undo</button> : <span />}
          </div>
        ))}
      </section>
    </>
  );
}

function Skeleton() {
  return (
    <div className="nv-cd-card" aria-busy="true" aria-label="Loading projects">
      <div className="nv-cd-skrow"><span className="nv-cd-skel" style={{ width: 40, height: 40, borderRadius: 13 }} /><span style={{ flex: 1 }}><span className="nv-cd-skel" style={{ width: '46%', height: 14 }} /><span className="nv-cd-skel" style={{ width: '70%', height: 11, marginTop: 8 }} /></span></div>
      <span className="nv-cd-skel" style={{ width: '80%', height: 5, marginTop: 14 }} />
      <span className="nv-cd-skel" style={{ width: '55%', height: 5, marginTop: 4 }} />
      <div className="nv-cd-skrow" style={{ marginTop: 12 }}><span className="nv-cd-skel" style={{ width: 76, height: 26, borderRadius: 13 }} /><span className="nv-cd-skel" style={{ width: 92, height: 26, borderRadius: 13 }} /></div>
    </div>
  );
}

function Root({ c, compact = false }) {
  const t = c.tiles;
  return (
    <div className="nv-cd-root">
      <header className="nv-cd-top"><h1>Code</h1>{!compact && <MoreButton c={c} label="More: model, where the Builder works, new session, add to vault, what it can do, connection" />}</header>
      {c.demo ? (
        <div className="nv-cd-card nv-cd-rv" style={{ marginTop: 14 }}>
          <span className="nv-cd-k">Demo data</span>
          <p className="nv-cd-plain">Code reads the sessions on your Mac, the Builder&apos;s runs and your uncommitted work, all from your Mac. In demo there is nothing of yours to show, so nothing is invented here.</p>
        </div>
      ) : (
        <>
          {!compact && !c.loading && <p className="nv-cd-news"><span className="dot" aria-hidden="true" />{c.news}</p>}
          {c.away && (
            <div className="nv-cd-card nv-cd-rv" style={{ marginTop: 14 }}>
              <b className="nv-cd-strong">Your Mac isn&apos;t answering</b>
              <span className="nv-cd-k" style={{ marginTop: 4 }}>The sessions list is live only, so it needs the Mac. {c.seenAt ? `Showing what Nova saw at ${c.seenAt}. ` : ''}Commit, Shelve and Run are paused, not hidden.</span>
            </div>
          )}
          {c.loading ? <div style={{ marginTop: 16 }}><Skeleton /></div> : c.nothing ? (
            <div className="nv-cd-card nv-cd-rv" style={{ marginTop: 16 }}>
              <b className="nv-cd-strong">Nothing is running.</b>
              <span className="nv-cd-k" style={{ marginTop: 4 }}>No session is open on your Mac and every project is committed. The strip comes back the moment something waits on you.</span>
              <div style={{ marginTop: 12 }}><button type="button" className="nv-cd-btn" onClick={c.askNova}><Ic g="plus" />Ask the Builder in Nova OS</button></div>
            </div>
          ) : (
            <div className={c.away ? 'nv-cd-paused' : undefined}>
              <Needs needs={c.needs} />
              <div className="nv-cd-sh"><h2>Projects</h2><span>{c.sessionsWord}</span></div>
              <NovaTile t={t.nova} />
              <FamilyTile atlas={t.atlas} wren={t.wren} />
              <div className="nv-cd-duo"><SmallTile t={t.vault} /><SmallTile t={t.builds} /></div>
              {t.others.length > 0 && <div className="nv-cd-duo">{t.others.map((o) => <SmallTile key={o.key} t={o} />)}</div>}
              <DoneToday rows={c.doneToday} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MoreButton({ c, label }) {
  return <button type="button" className="nv-cd-ib" onClick={c.sheet.show} aria-label={label}><Ic g="more" /></button>;
}

// ------------------------------------------------------------- the review --

function FileRow({ f, i, readOnly }) {
  const peek = f.peek;
  const open = f.open;
  return (
    <>
      <div className={`nv-cd-fr${f.ticked ? '' : ' off'}`} data-flip={f.path} style={{ '--h': 'var(--nv-cy)' }}>
        {readOnly ? <span className="tick none" /> : (
          <button type="button" className={`tick${f.ticked ? '' : ' off'}`} onClick={f.toggle} aria-pressed={f.ticked} aria-label={`${f.ticked ? 'Leave out' : 'Include'} ${f.name}`}><i><Ic g="check" /></i></button>
        )}
        <button type="button" className="fn" onClick={f.showAll} aria-expanded={!!open} title={f.path}><b>{f.name}</b><span>{f.dir}{f.untracked ? ' · new' : f.deleted ? ' · deleted' : ''}</span></button>
        <span className="fcount">{f.count}</span>
        {f.note ? <span className="nv-cd-k note">{f.note}</span>
          : <span className="fbar" aria-hidden="true" style={{ width: `${f.width}%`, animationDelay: `${120 + Math.min(i, 8) * 80}ms` }}>{f.binary ? <i className="b" style={{ flex: 1 }} /> : <><i className="a" style={{ flex: f.added || (f.removed ? 0 : 1) }} />{f.removed ? <i className="r" style={{ flex: f.removed }} /> : null}</>}</span>}
      </div>
      {(peek || open) && (
        <div className="nv-cd-dpeek" aria-label={`The lines of ${f.name}`}>
          {open?.loading && <div className="more"><span>Reading the lines</span></div>}
          {open?.error && <div className="more"><span>{open.error}</span></div>}
          {open?.binary && <div className="more"><span>A binary file, so there are no lines to show</span></div>}
          {(open ? open.lines : peek.lines).map((l, k) => <div className="a" key={k}>+ {l}</div>)}
          {!open?.loading && (
            <div className="more">
              <span>{open ? (open.more ? `${open.more} more lines on disk` : '') : peek.more ? `${peek.more} more line${peek.more === 1 ? '' : 's'}` : ''}</span>
              <button type="button" onClick={f.showAll}>{open ? 'Show less' : 'Show all'}</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const FILES_SHOWN = 12;

function Review({ r }) {
  const bodyRef = useRef(null);
  const listRef = useRef(null);
  const [folding, setFolding] = useState(false);
  // sixty changed files are a long page: the first twelve, then all on a tap
  // (break-ui, 10 Oct 2026); the totals and Commit always count every tick
  const [allFiles, setAllFiles] = useState(false);
  useFlipList(listRef, r.files.map((f) => f.path + (f.ticked ? '+' : '-')).join('|'));

  // the bars fold right to left, the body gives way, and the receipt takes
  // its place once the server has said yes (a refusal plays it back)
  const onCommit = () => {
    if (!r.commit.enabled) return;
    const body = bodyRef.current;
    const anims = [];
    if (body && !reduced()) {
      const bars = [...body.querySelectorAll('.nv-cd-fr:not(.off) .fbar')].reverse();
      bars.forEach((b, k) => anims.push(b.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 300, delay: k * 60, easing: EOUT, fill: 'forwards' })));
      // the files give way; the message and "Committing" stay until the
      // server answers, so a slow Mac never leaves an empty card
      const list = body.querySelector('.files');
      if (list) anims.push(list.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-12px) scale(.98)' }], { duration: 320, delay: 320, easing: EOUT, fill: 'forwards' }));
    }
    setFolding(true);
    const wait = new Promise((res) => setTimeout(res, reduced() ? 0 : 640));
    Promise.all([r.commit.run(), wait]).then(([ok]) => {
      setFolding(false);
      if (!ok) anims.forEach((a) => a.cancel());
    });
  };

  if (r.loading) return <div className="nv-cd-review"><Skeleton /></div>;
  if (r.receipt) {
    const rc = r.receipt;
    return (
      <div className="nv-cd-review">
        <div className="nv-cd-creceipt">
          <span className="ok"><Ic g="check" /></span>
          <div className="t"><b>{rc.title}</b><span className="nv-cd-k">{rc.line}</span></div>
          <div className="row2"><button type="button" className="nv-cd-btn" onClick={rc.undo} disabled={!rc.undoEnabled}>Undo</button></div>
          {rc.left && (
            <div className="leftout">{rc.left.lead}<span className="nm">{rc.left.names}</span>{rc.left.tail}
              {!rc.left.allOther && <button type="button" className="nv-cd-link" onClick={rc.dismiss}>Review the rest</button>}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (r.clean) {
    return (
      <div className="nv-cd-review clean">
        <b className="nv-cd-strong">Nothing to commit.</b>
        <span className="nv-cd-k">Every change here is committed. What the Builder changes next lands here as bars.</span>
      </div>
    );
  }
  const t = r.totals;
  return (
    <div className="nv-cd-review" id="nv-cd-review">
      <div className="rtot" style={folding ? { opacity: 0, transition: 'opacity .3s' } : undefined}>
        <b className="num">+<CountUp value={t.added} fromZero /></b>
        {t.removed > 0 && <b className="num rm">{'−'}<CountUp value={t.removed} fromZero /></b>}
        <span>lines, in the<br />{t.files === 1 ? '1 ticked file' : `${t.files} ticked files`}</span>
      </div>
      <div className="rbody" ref={bodyRef}>
        <div className="files" ref={listRef}>{(allFiles ? r.files : r.files.slice(0, FILES_SHOWN)).map((f, i) => <FileRow key={f.path} f={f} i={i} readOnly={r.readOnly} />)}</div>
        {r.files.length > FILES_SHOWN + 2 && (
          <button type="button" className="nv-cd-more" onClick={() => setAllFiles((x) => !x)}>
            {allFiles ? 'Show fewer files' : `Show all ${r.files.length} files (${r.files.length - FILES_SHOWN} more, ${r.totals.files} ticked in all)`}
          </button>
        )}
        {r.readOnly ? (
          <p className="nv-cd-fine">The vault is read-only from here. Nova never commits your notes for you.</p>
        ) : (
          <>
            <input className="nv-cd-msgf" value={r.msg} onChange={r.setMsg} placeholder="Say why, in a line" aria-label="Commit message" enterKeyHint="done" disabled={r.paused} />
            <p className={`nv-cd-rule${r.rule.met ? ' met' : ''}`}>
              <span className="eight" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} className={i < r.rule.lit ? 'on' : ''} />)}</span>
              <span>{r.rule.met ? 'Long enough to read later' : '8 characters or more'}</span>
              <Ic g="check" className="nv-cd-ic ok" />
            </p>
            <div className="cacts">
              <button type="button" className="commit" disabled={!r.commit.enabled || folding} onClick={onCommit}>{folding || r.commit.busy ? 'Committing' : r.commit.label}</button>
              <button type="button" className="shelve" disabled={!r.shelve.enabled || folding} onClick={r.shelve.run}>Shelve</button>
            </div>
            <p className="nv-cd-fine">Shelve sets the ticked changes aside and keeps them. Restore brings them back.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sessions --

function SessRow({ s, hue }) {
  return (
    <div className="nv-cd-sess" data-flip={s.id}>
      <i className={`pip ${s.state === 'working' ? 'work' : s.state === 'waiting' || s.state === 'blocked' ? 'wait' : 'open'}`} style={{ '--h': hue }} />
      <b>{s.name}</b>
      <span className={`st${s.state === 'waiting' || s.state === 'blocked' ? ' wait' : ''}`}>{s.line}</span>
      <div className="quiet" aria-label={`${s.quiet.words}, against the 12 hours after which a session counts as left open`}>
        {s.quiet.live ? <span className="qt live" style={{ '--h': hue }}><i /></span>
          : <span className={`qt${s.quiet.over ? ' over' : ''}${s.state === 'waiting' || s.state === 'blocked' ? ' wait' : ''}`} style={{ '--q': s.quiet.q }}><i /></span>}
        <span>{s.quiet.words}</span>
      </div>
      {s.canClose ? (
        s.confirming
          ? <span className="acts"><button type="button" className="nv-cd-btn sm" onClick={s.close} disabled={s.busy || s.paused}>Close it</button><button type="button" className="nv-cd-btn sm ghost" onClick={s.cancelClose}>Keep</button></span>
          : <button type="button" className="nv-cd-btn sm" onClick={s.askClose} disabled={s.busy || s.paused}>Close</button>
      ) : s.canShow ? <button type="button" className="nv-cd-btn sm" onClick={s.show} disabled={s.busy || s.paused} aria-label={`Show ${s.name} on your Mac`}>{s.busy ? 'Opening' : 'Show'}</button> : <span />}
    </div>
  );
}

function SessionsCard({ rows, hue, empty }) {
  const ref = useRef(null);
  useFlipList(ref, rows.map((s) => s.id + s.state).join('|'));
  if (!rows.length) return <div className="nv-cd-card nv-cd-rv"><span className="nv-cd-k">{empty}</span></div>;
  return <div className="nv-cd-card nv-cd-rv list" ref={ref}>{rows.map((s) => <SessRow key={s.id} s={s} hue={hue} />)}</div>;
}

// -------------------------------------------------------------------- runs --

// the live run's clock, "0:38": a leaf with its own second, so the page
// around it never re-renders for it (the same reason as Elapsed.jsx), and
// it stops while the app is hidden
function RunClock({ from }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let t = 0;
    const start = () => { if (!t) t = setInterval(() => setNow(Date.now()), 1000); };
    const stop = () => { clearInterval(t); t = 0; };
    const vis = () => { if (document.hidden) stop(); else { setNow(Date.now()); start(); } };
    start();
    document.addEventListener('visibilitychange', vis);
    return () => { stop(); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const s = Math.max(0, Math.floor((now - from) / 1000));
  const label = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return <b className="clock" aria-label={`running for ${label}`}>{label}</b>;
}

function Line({ l, live }) {
  const au = { you: <span className="au you" aria-hidden="true" />, bld: <span className="au bld"><i className="nv-cd-mk" /></span>, brk: <span className="au brk"><i className="nv-cd-mk crack" /></span>, nova: <span className="au nova"><i /></span> }[l.who];
  const fresh = live && l.at && Date.now() - l.at < 4000;
  return (
    <div className={`nv-cd-ln ${l.who}${fresh ? ' land' : ''}`} data-flip={l.key}>
      {au}
      <div className="body">
        <div className="lh">{l.name}<span>{l.detail}</span>{l.streaming && l.startedAt ? <RunClock from={l.startedAt} /> : null}</div>
        <div className="lt">
          {l.blocks.map((b, k) => (b.type === 'ol'
            ? <ol key={k}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ol>
            : b.type === 'gap' ? <div key={k} className="gap" /> : <p key={k} className={l.streaming && k === l.blocks.length - 1 ? 'stream' : undefined}>{b.text}</p>))}
          {l.streaming && !l.blocks.length && <p className="stream">{l.who === 'brk' ? 'Reading, changing nothing' : 'Reading the workspace'}</p>}
          {l.streaming && <div className="prog"><i /></div>}
          {l.action && <div className="acts"><button type="button" className="nv-cd-btn sm" onClick={l.action.run} disabled={!l.action.enabled}>{l.action.label}</button></div>}
        </div>
      </div>
    </div>
  );
}

function Runs({ runs }) {
  const ref = useRef(null);
  useFlipList(ref, runs.lines.map((l) => l.key).join('|'), { exits: false });
  // closed runs stay one tap away without pushing the live run down: the
  // newest shows, the rest fold behind one row (break-ui: twelve of them)
  const [allClosed, setAllClosed] = useState(false);
  const closed = allClosed ? runs.closed : runs.closed.slice(0, 1);
  return (
    <>
      {runs.closed.length > 1 && (
        <button type="button" className="nv-cd-more" style={{ marginBottom: 10 }} onClick={() => setAllClosed((x) => !x)}>
          {allClosed ? 'Show only the newest closed run' : `${runs.closed.length - 1} more closed run${runs.closed.length === 2 ? '' : 's'}`}
        </button>
      )}
      {closed.map((r) => (
        <div className="nv-cd-card nv-cd-closed" key={r.key}>
          <button type="button" className="crow" onClick={r.toggle} aria-expanded={r.open}><span className="nv-cd-mk ghost" /><span className="t"><b>{r.title}</b><span className="nv-cd-k">{r.line}</span></span><Ic g="right" className={`nv-cd-ic chev${r.open ? ' down' : ''}`} /></button>
          {r.open && <div className="nv-cd-thread inset">{r.lines.map((l) => <Line key={l.key} l={l} />)}</div>}
        </div>
      ))}
      {runs.lines.length ? (
        <div className="nv-cd-card nv-cd-rv nv-cd-thread" ref={ref}>{runs.lines.map((l) => <Line key={l.key} l={l} live />)}</div>
      ) : <div className="nv-cd-card nv-cd-rv"><span className="nv-cd-k">No run yet in this session. Ask the Builder below, or send the Breaker for a read-only pass.</span></div>}
    </>
  );
}

function Composer({ cp, inputRef }) {
  return (
    <div className="nv-cd-dock">
      {cp.note && <p className="nv-cd-fine center">{cp.note}</p>}
      <div className="nv-cd-comp">
        <button type="button" className="brk" onClick={cp.breaker.run} disabled={!cp.breaker.enabled} aria-label="Send the Breaker: a read-only pass that changes nothing">
          <i className="nv-cd-mk crack" aria-hidden="true" />{cp.breaker.busy ? 'Reading' : 'Breaker'}
        </button>
        <input ref={inputRef} className="fld" value={cp.value} onChange={cp.set} onKeyDown={cp.key} placeholder={cp.placeholder} aria-label={cp.placeholder} enterKeyHint="send" disabled={cp.busy && !cp.value} />
        <button type="button" className="send" onClick={cp.send} disabled={!cp.canSend} aria-label="Run"><Ic g="up" /></button>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- page --

function Anchors({ page, scroller }) {
  const [on, setOn] = useState(page.anchors[0]?.id);
  useEffect(() => {
    const sc = scroller();
    if (!sc) return undefined;
    const target = sc === document.documentElement || sc === document.body ? window : sc;
    const onScroll = () => {
      let cur = page.anchors[0]?.id;
      for (const a of page.anchors) {
        const el = document.getElementById(`nv-cd-g-${a.id}`);
        if (el && el.getBoundingClientRect().top < 170) cur = a.id;
      }
      setOn(cur);
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [page.anchors, scroller]);
  const go = (id) => {
    const el = document.getElementById(`nv-cd-g-${id}`);
    if (!el) return;
    setOn(id);
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  };
  return (
    <nav className="nv-cd-anchors" aria-label="Groups on this page">
      {page.anchors.map((a) => (
        <button type="button" key={a.id} className={on === a.id ? 'on' : ''} onClick={() => go(a.id)}>
          <span className={`glyph ${a.glyph}`} aria-hidden="true" />{a.label} <span className="n">{typeof a.count === 'number' ? <CountUp value={a.count} fromZero /> : a.count}</span>
        </button>
      ))}
    </nav>
  );
}

function Page({ c, page, wide }) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const scroller = useRef(() => scrollParentOf(rootRef.current)).current;
  useReveal(rootRef, page.key);

  // arriving at a section (Wren's tasks, Runs, the composer)
  useEffect(() => {
    if (!page.section) return undefined;
    const id = page.section === 'compose' ? null : page.section;
    const t = setTimeout(() => {
      if (id) document.getElementById(`nv-cd-g-${id}`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      else inputRef.current?.focus();
      page.clearSection();
    }, 120);
    return () => clearTimeout(t);
  }, [page.section, page]);

  const review = page.review && (
    <section className="nv-cd-grp" id="nv-cd-g-commit">
      <div className="nv-cd-gh"><h2>{page.review.readOnly ? 'Changes' : 'Ready to commit'}</h2><span>{page.review.head}</span></div>
      <Review r={page.review} />
    </section>
  );
  const sessions = page.review && (
    <section className="nv-cd-grp" id="nv-cd-g-sessions">
      <div className="nv-cd-gh"><h2>On your Mac</h2><span>{page.sessionsHead}</span></div>
      <SessionsCard rows={page.sessions} hue={page.hue} empty={`No session is open in ${page.title} on your Mac.`} />
      <p className="nv-cd-fine">The bar is quiet time; past its end, 12 hours, a session counts as left open.</p>
    </section>
  );
  const wrenSec = page.wren && (
    <section className="nv-cd-grp nv-cd-kinsec" id="nv-cd-g-wren" style={{ '--h': page.wren.glyph.hue }}>
      <div className="kinhead"><Glyph p={page.wren.glyph} /><div><span className="rel">its assistant</span><b>Wren</b><span className="nv-cd-k">Tasks that support and guide the Atlas</span></div></div>
      {page.wren.review && (
        <button type="button" className="nv-cd-card nv-cd-rv nv-cd-kinrev" onClick={page.wren.review.open}>
          <span className={`n${page.wren.review.ready ? ' on' : ''}`} aria-hidden="true">{page.wren.review.loading ? '·' : page.wren.review.ready}</span>
          <span className="t"><b>{page.wren.review.ready ? 'Wren’s changes, ready to commit' : 'Wren’s own repository'}</b><span className="nv-cd-k">{page.wren.review.line}</span></span>
          <Ic g="right" className="nv-cd-ic chev" />
        </button>
      )}
      <SessionsCard rows={page.wren.sessions} hue={page.wren.glyph.hue} empty="No Wren session is open on your Mac." />
    </section>
  );
  const runs = page.runs && (
    <section className="nv-cd-grp" id="nv-cd-g-runs">
      <div className="nv-cd-gh"><h2>Runs</h2><span>this session</span></div>
      <Runs runs={page.runs} />
    </section>
  );

  return (
    <div className={`nv-cd-page${wide ? '' : ' push'}`} ref={rootRef} style={{ '--h': page.hue }}>
      {!wide && <button type="button" className="nv-cd-back" onClick={c.back}><Ic g="left" />Code</button>}
      {page.parent && <button type="button" className="nv-cd-crumb" onClick={page.parent.open}><span className="rel">its assistant, under</span> {page.parent.title}<Ic g="right" className="nv-cd-ic chev" /></button>}
      <div className="nv-cd-phead">
        <Glyph p={page.glyph} size="l" />
        <div className="t"><b>{page.title}</b><span className="nv-cd-k">{page.sub}</span></div>
        {page.review && <MoreButton c={c} label="More for this project" />}
      </div>
      <Anchors page={page} scroller={scroller} />

      {page.review ? (
        wide ? (
          <div className="nv-cd-cols"><div>{review}{sessions}{wrenSec}</div><div>{runs}{page.composer && <Composer cp={page.composer} inputRef={inputRef} />}</div></div>
        ) : (
          <>{review}{sessions}{wrenSec}{runs}{page.composer && <Composer cp={page.composer} inputRef={inputRef} />}</>
        )
      ) : (
        <>
          <section className="nv-cd-grp" id={page.wren ? 'nv-cd-g-work' : 'nv-cd-g-sessions'}>
            <div className="nv-cd-gh"><h2>{page.wren ? 'The work' : 'On your Mac'}</h2><span>{page.workSessionsHead}</span></div>
            <SessionsCard rows={page.sessions} hue={page.hue} empty={`No session is open in ${page.title} on your Mac.`} />
          </section>
          {page.wren && (
            <section className="nv-cd-grp nv-cd-kinsec" id="nv-cd-g-wren" style={{ '--h': page.wren.glyph.hue }}>
              <div className="kinhead"><Glyph p={page.wren.glyph} /><div><span className="rel">its assistant</span><b>Wren</b><span className="nv-cd-k">Tasks that support and guide the Atlas</span></div></div>
              <SessionsCard rows={page.wren.sessions} hue={page.wren.glyph.hue} empty="No Wren session is open on your Mac." />
            </section>
          )}
          <section className="nv-cd-grp" id="nv-cd-g-commit">
            <div className="nv-cd-gh"><h2>Files to commit</h2><span>not connected on this Mac</span></div>
            <div className="nv-cd-empty nv-cd-rv"><b>The server on your Mac does not name {page.title} yet.</b>{page.notConnected ? `Its folder is listed in server/data/code-workspaces.json once the server has restarted on this version. Until then its sessions are the whole picture, and Show brings one forward on your Mac.` : 'Its sessions are the whole picture here, and Show brings one forward on your Mac.'}</div>
          </section>
          <p className="nv-cd-fine" style={{ marginTop: 18 }}>No composer here: the Builder does not work in {page.title}. These sessions run in your terminal.</p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- sheet --

function Sheet({ s }) {
  const drag = useSheetDrag(s.close, { threshold: 80 });
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') s.close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [s]);
  return (
    <>
      <div className="nv-cd-scrim" onClick={s.close} aria-hidden="true" />
      <section className="nv-cd-sheet" role="dialog" aria-modal="true" aria-label={s.title} ref={drag.sheetRef}>
        <div className="grabzone" {...drag.handleProps}><span className="grab" aria-hidden="true" /></div>
        <h3>{s.title}</h3>
        <span className={`conn${s.connOn ? '' : ' off'}`}><i />{s.conn}</span>
        <p className="slab">Model for the next message</p>
        <div className={`nv-cd-sseg${s.models.length > 4 || s.models.some((m) => m.label.length > 11) ? ' wrap' : ''}`} role="group" aria-label="Model">
          {s.models.map((m) => <button type="button" key={m.value} className={m.on ? 'on' : ''} aria-pressed={m.on} onClick={() => s.setModel(m.value)}>{m.label}</button>)}
        </div>
        <p className="slab">Where the Builder works</p>
        <div className="nv-cd-sseg" role="group" aria-label="Where the Builder works">
          {s.workspaces.map((w) => <button type="button" key={w.value} className={w.on ? 'on' : ''} aria-pressed={w.on} onClick={() => s.setWorkspace(w.value)}>{w.label}</button>)}
        </div>
        <p className="nv-cd-fine">Switching starts a new session. This one moves into Runs as a closed run, with Undo for 8 seconds.</p>
        <div className="nv-cd-sgroup" style={{ marginTop: 16 }}>
          <button type="button" className="srow" onClick={s.newSession}><Ic g="plus" /><span><b>New session</b><span className="nv-cd-k">Starts clean; this one stays in Runs, with Undo</span></span><Ic g="right" className="nv-cd-ic chev" /></button>
          <button type="button" className="srow" onClick={s.addToVault}><Ic g="in" /><span><b>Add to vault</b><span className="nv-cd-k">Library&apos;s door: a file or a link into your notes</span></span><Ic g="right" className="nv-cd-ic chev" /></button>
        </div>
        <p className="slab">What the Builder can and can&apos;t do</p>
        <div className="nv-cd-sgroup cando">
          <div className="y"><Ic g="check" /><span>Read and edit real files where it works</span></div>
          <div className="y"><Ic g="check" /><span>Remember the conversation until a new session</span></div>
          <div className="n"><Ic g="x" /><span>Run commands, install anything, or use git itself. Commits happen on this screen, by you.</span></div>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- dev only --

const FIXTURES = ['off', 'demo', 'idle', 'worst', 'empty', 'one', 'quotes', 'old', 'away', 'loading'];
function FixtureBar({ f }) {
  return (
    <div className="nv-cd-fx" role="group" aria-label="Dev data">
      {FIXTURES.map((n) => <button type="button" key={n} className={(f.name || 'off') === n ? 'on' : ''} onClick={() => f.set(n === 'off' ? null : n)}>{n}</button>)}
    </div>
  );
}

// ------------------------------------------------------------------ screen --

export function ClaudeCode({ v }) {
  const c = v.code;
  const rootRef = useRef(null);
  const wide = !v.isMobile;
  useReveal(rootRef, c?.page?.key || 'root');
  const [fxBar] = useState(() => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('codefx'));

  // dev only: ?codefx=worst picks a fixture and keeps it across a reload
  useEffect(() => {
    if (!import.meta.env.DEV || !c?.fixture) return;
    const want = new URLSearchParams(location.search).get('codefx');
    if (want && want !== 'off' && c.fixture.name !== want) c.fixture.set(want);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => c?.stopPoll?.(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return null;
  const page = c.page || (wide && !c.demo && !c.loading && !c.nothing ? c.pageFor('nova') : null);
  return (
    <div className={`nv-cd${wide ? ' wide' : ''}`} data-screen-label="Claude Code" ref={rootRef} style={wide ? { padding: '24px 32px 44px' } : v.wrapCode}>
      {wide ? (
        <>
          <aside className="nv-cd-side"><Root c={c} compact={!!page} /></aside>
          <section className="nv-cd-main">{page ? <Page c={c} page={page} wide /> : null}</section>
        </>
      ) : page ? <Page key={page.key} c={c} page={page} /> : <Root c={c} />}
      {c.sheet.open && <Sheet s={c.sheet} />}
      {import.meta.env.DEV && fxBar && c.fixture && <FixtureBar f={c.fixture} />}
    </div>
  );
}
