import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Interactive } from './Interactive.jsx';
import { api, getConnection } from './api.js';
import { NOTE_TYPE_COLOR } from './vals/shared.js';
import { buildFrame, fmtDay, markedParts, typeLabel, whenLabel, noteParas, readRecents, writeRecent } from './searchModel.js';
import './searchSheet.css';

// SEARCH THAT READS THE NOTE (mockup 117, K1 in design/NEOMAS-ARK-STUDY.md).
// The moment: he remembers a phrase and not where it lives. Rows lead with the
// line that holds it, the phrase marked; exact-words hits come first and hits
// by meaning sit under their own label. The two halves are two requests, so the
// words are on screen while the embedder is still thinking. Everything the
// sheet says (no match, meaning down, the Mac out of reach) is said from what
// the server actually answered; src/searchModel.js decides which frame that is.
//
// One DOM for both idioms: summary draws the house glass, cupertino turns the
// sections into inset groups (searchSheet.css).

const ICONS = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  x: <><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" /><path d="m9 9 6 6M15 9l-6 6" stroke="#141a2c" strokeWidth="2.2" /></>,
  chev: <path d="m9.5 6 6 6-6 6" />,
  down: <path d="m6 9.5 6 6 6-6" />,
  recent: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v4.5H8" /><path d="M12 8v4.5l3 2" /></>,
  offline: <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a9.5 9.5 0 0 1 4-2.3M19 13a9.5 9.5 0 0 0-2.6-1.8M12 20h.01" />,
  words: <><path d="M4 7h16M4 12h10M4 17h7" /><path d="m16 15 2.5 2.5L22 13" /></>,
  concept: <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />,
  source: <><path d="M5 5.5h9.5a4 4 0 0 1 4 4V19" /><path d="M5 5.5V19h13.5" /><path d="M9 10h5M9 14h5" /></>,
  journal: <><path d="M15.5 4.5 19.5 8.5 9 19H5v-4Z" /><path d="m13 7 4 4" /></>,
  analysis: <path d="M5 19V11M12 19V5M19 19v-6" />,
  topic: <path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16" />,
};
const TYPE_GLYPH = { concept: 'concept', source: 'source', raw: 'source', journal: 'journal', analysis: 'analysis', topic: 'topic', entity: 'concept' };

function Ic({ n, className, style }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[n]}
    </svg>
  );
}

const hueOf = (type) => NOTE_TYPE_COLOR[String(type || '').toLowerCase()] || 'var(--nv-ink)';
const glyphOf = (type) => TYPE_GLYPH[String(type || '').toLowerCase()] || 'concept';

function Marked({ line, marks }) {
  return markedParts(line, marks).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>));
}

function Row({ r, mean, anim, i, onOpen }) {
  const T = typeLabel(r.type);
  const plain = r.line;
  return (
    <li className={anim || undefined} style={{ '--i': i }}>
      <Interactive as="button" type="button" className={mean ? 'nv-sr-row mean' : 'nv-sr-row'} haptic="tick" onClick={() => onOpen(r)}
        aria-label={`${plain}. ${r.title}, ${T}, ${fmtDay(r.date)}${mean ? '. Close in meaning' : '. Has these words'}`}>
        <span className="nv-sr-tile" style={{ '--h': hueOf(r.type) }}><Ic n={glyphOf(r.type)} /></span>
        <span className="nv-sr-tx">
          <span className="nv-sr-line">{mean ? plain : <Marked line={r.line} marks={r.marks} />}</span>
          <span className="nv-sr-rmeta"><b>{r.title}</b><span>{` · ${T}${r.date ? ` · ${fmtDay(r.date)}` : ''}`}</span></span>
        </span>
        <Ic n="chev" className="chev" />
      </Interactive>
    </li>
  );
}

function Skeleton({ k }) {
  const w1 = [92, 84, 88]; const w2 = [70, 52, 60];
  return (
    <div className="nv-sr-grp" role="status" aria-label="Searching">
      {Array.from({ length: k }, (_, j) => (
        <div className="nv-sr-sk" key={j} aria-hidden="true">
          <i className="t" />
          <span><i style={{ width: `${w1[j % 3]}%`, height: 15 }} /><i style={{ width: `${w2[j % 3]}%`, height: 15 }} /><i style={{ width: '46%', height: 11, marginTop: 2 }} /></span>
        </div>
      ))}
    </div>
  );
}

function Sec({ kind, label, n }) {
  return <div className={`nv-sr-sec ${kind}`}><span className="dot" aria-hidden="true" />{label}<span className="n">{n}</span></div>;
}

function Say({ icon, big, children, small }) {
  return (
    <p className={big ? 'nv-sr-say big' : 'nv-sr-say'}>
      {icon ? <Ic n={icon} /> : null}
      <span>{children}{small ? <small>{small}</small> : null}</span>
    </p>
  );
}

function Recent({ items, disabled, onPick }) {
  if (!items.length) return null;
  return (
    <>
      <Sec kind="rc" label="Recent" n="" />
      <ul className="nv-sr-ul">
        {items.map((r) => (
          <li key={r.q}>
            <Interactive as="button" type="button" className="nv-sr-rec" haptic="tick" aria-disabled={disabled ? 'true' : undefined} tabIndex={disabled ? -1 : undefined}
              onClick={() => { if (!disabled) onPick(r.q); }}>
              <Ic n="recent" /><span>{r.q}</span><span className="when">{whenLabel(r.at)}</span>
            </Interactive>
          </li>
        ))}
      </ul>
    </>
  );
}

function List({ f, recents, onPick, onOpen, onShowAll }) {
  const lex = f.freshWords ? 'lexin' : '';
  const late = f.lateMeaning ? 'late' : '';
  const body = [];
  switch (f.kind) {
    case 'offline':
      body.push(<Say key="say" icon="offline" small={f.lastReached ? `Last reached at ${f.lastReached}` : null}>Search needs the Mac. Nova cannot reach it right now.</Say>);
      body.push(<Recent key="rc" items={recents} disabled onPick={onPick} />);
      break;
    case 'error':
      body.push(<Say key="say" icon="offline" small={f.detail}>The Mac did not answer the search.</Say>);
      break;
    case 'recent':
      body.push(<Recent key="rc" items={recents} onPick={onPick} />);
      break;
    case 'loading':
      body.push(<Sec key="s" kind="ex" label="Has these words" n="" />, <Skeleton key="k" k={3} />);
      break;
    default: {
      // words, then meaning
      body.push(<Sec key="sx" kind="ex" label="Has these words" n={`${f.words.length}${f.plus}`} />);
      if (f.words.length) {
        body.push(<ul key="rx" className="nv-sr-ul nv-sr-rows">{f.wordsShown.map((r, i) => <Row key={r.id} r={r} anim={lex} i={i} onOpen={onOpen} />)}</ul>);
      } else {
        body.push(<Say key="nx" big>No note has these words.</Say>);
      }
      body.push(<div key="rule" className="nv-sr-rule" />);
      if (f.meaningState === 'pending') {
        body.push(<Sec key="sm" kind="mn" label="Close in meaning" n="searching" />, <Skeleton key="km" k={1} />);
      } else if (f.meaningState === 'ok') {
        body.push(<Sec key="sm" kind="mn" label="Close in meaning" n={f.meaning.length} />);
        if (f.meaning.length) body.push(<ul key="rm" className="nv-sr-ul nv-sr-rows">{f.meaningShown.map((r, i) => <Row key={r.id} r={r} mean anim={late} i={i} onOpen={onOpen} />)}</ul>);
        else body.push(<Say key="nm" big>Nothing close either.</Say>);
      } else {
        body.push(<Say key="down" icon="words">{f.words.length ? 'Exact words only right now. ' : ''}{f.meaningDownText}</Say>);
      }
      if (f.showAll) body.push(<Interactive key="all" as="button" type="button" className="nv-sr-show" haptic="tick" onClick={onShowAll}>Show all <b>{f.showAll}{f.plus}</b><Ic n="down" /></Interactive>);
    }
  }
  return body;
}

function NotePage({ note, query, onBack }) {
  const litRef = useRef(null);
  const layerRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const d = note.detail;
  const paras = useMemo(() => (d ? noteParas(d.paragraphs, note.row) : []), [d, note.row]);
  const T = typeLabel(note.row.type);
  // open AT the line: a line already in view leaves the page at its top (as
  // the mockup draws it); one further down brings its paragraph up under the bar
  useEffect(() => {
    const layer = layerRef.current;
    const lit = litRef.current;
    if (!d || !layer || !lit) return;
    const r = lit.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.55) layer.scrollTop += r.top - 150;
  }, [d]);
  return (
    <article ref={layerRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 24)} className="nv-sr-note" role="dialog" aria-modal="true" aria-label={`${note.row.title}, opened at the matching line`} data-edge-page="" style={{ zIndex: 60 }}>
      <div className="nv-sr-nin">
        <div className="nv-sr-nbar" data-scrolled={scrolled ? 'true' : 'false'}>
          <Interactive as="button" type="button" className="nv-sr-back" haptic="tick" data-edge-close="" onClick={onBack}><Ic n="chev" />Search</Interactive>
        </div>
        <div className="nv-sr-nchip"><span className="nv-sr-tile" style={{ '--h': hueOf(note.row.type) }}><Ic n={glyphOf(note.row.type)} /></span>{T}{note.row.date ? ` · ${fmtDay(note.row.date)}` : ''}</div>
        <h2 className="nv-sr-ntitle">{note.row.title}</h2>
        <p className="nv-sr-nfrom">Opened from your search <b>{query}</b></p>
        <div className="nv-sr-nbody">
          {note.status === 'loading' ? <Skeleton k={2} /> : null}
          {note.status === 'error' ? <Say icon="offline" small={note.error}>This note could not be read from the Mac.</Say> : null}
          {paras.map((p, i) => (
            <p key={i} ref={p.lit ? litRef : undefined} className={p.lit ? 'lit' : undefined}>
              {p.parts.map((x, j) => (x.mark ? <mark key={j}>{x.text}</mark> : <span key={j}>{x.text}</span>))}
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

const SearchSheetImpl = forwardRef(function SearchSheet({ total = null, lastReached = null, isOffline = false, demoMode = false, onStage }, ref) {
  const sheetRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const seq = useRef(0);
  const returnTo = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [note, setNote] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [recents, setRecents] = useState(() => readRecents());
  const trimmed = q.trim().replace(/\s+/g, ' ');
  const up = open && !note;

  useImperativeHandle(ref, () => ({
    open() {
      // The keyboard only rises for a focus() inside the tap that asked for
      // it (iOS), so the sheet is made focusable and focused BEFORE React
      // has drawn it open.
      returnTo.current = document.activeElement;
      const el = sheetRef.current;
      if (el) { el.inert = false; el.style.visibility = 'visible'; }
      try { inputRef.current?.focus({ preventScroll: true }); } catch { /* focus refused */ }
      setRecents(readRecents());
      setOpen(true);
    },
  }), []);

  useLayoutEffect(() => { if (sheetRef.current) sheetRef.current.style.visibility = ''; }, [open]);
  useEffect(() => { onStage?.(!open ? 'closed' : note ? 'note' : 'up'); }, [open, note, onStage]);

  const close = useCallback(() => {
    seq.current++;
    setOpen(false); setNote(null); setShowAll(false);
    inputRef.current?.blur();
    const back = returnTo.current;
    returnTo.current = null;
    try { back?.focus?.({ preventScroll: true }); } catch { /* gone */ }
  }, []);

  // the sheet shrinks to what the keyboard leaves
  useEffect(() => {
    const vv = window.visualViewport;
    const el = sheetRef.current;
    if (!vv || !el || !open) return undefined;
    const fit = () => { el.style.setProperty('--sr-vh', `${Math.round(vv.height)}px`); el.style.setProperty('--sr-vt', `${Math.round(vv.offsetTop)}px`); };
    fit();
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); el.style.removeProperty('--sr-vh'); el.style.removeProperty('--sr-vt'); };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); if (note) setNote(null); else close(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, note, close]);

  // ask: both halves at once; the words answer first and is drawn first
  useEffect(() => {
    if (!open) return undefined;
    if (trimmed.length < 2) { seq.current++; setRes(null); return undefined; }
    const conn = getConnection();
    if (!conn || demoMode) { seq.current++; setRes(null); return undefined; }
    const mine = ++seq.current;
    const t = setTimeout(() => {
      const upd = (patch) => { if (seq.current === mine) setRes((r) => ({ ...(r && r.q === trimmed ? r : { q: trimmed, words: null, meaning: null, total: null, error: null, wordsAt: 0 }), ...patch })); };
      const fail = (e) => {
        const offline = e instanceof TypeError || /offline/i.test(e?.message || '');
        return { offline, message: offline ? null : (e?.message || 'unknown error') };
      };
      api.recallNotes(conn, trimmed, 'words').then((r) => upd({ words: { rows: r.words?.results || [], more: !!r.words?.more, ms: r.words?.ms ?? null }, total: r.total ?? null, wordsAt: Date.now() }))
        .catch((e) => upd({ error: fail(e) }));
      api.recallNotes(conn, trimmed, 'meaning').then((r) => upd({ meaning: { rows: r.meaning?.results || [], ms: r.meaning?.ms ?? null, state: r.meaning?.state || 'ok' }, total: r.total ?? null, meaningAt: Date.now() }))
        .catch((e) => { const f = fail(e); if (f.offline) upd({ error: f }); else upd({ meaning: { rows: [], ms: null, state: 'error' } }); });
    }, 160);
    return () => clearTimeout(t);
  }, [trimmed, open, demoMode]);

  useEffect(() => { setShowAll(false); }, [trimmed]);

  const conn = getConnection();
  const reachable = !!conn && !demoMode && !isOffline && !(typeof navigator !== 'undefined' && navigator.onLine === false);
  const f = useMemo(() => buildFrame({ q: trimmed, res, reachable, total, lastReached, showAll }), [trimmed, res, reachable, total, lastReached, showAll]);

  const remember = (text) => { setRecents(writeRecent(text)); };
  const openRow = (r) => {
    inputRef.current?.blur();
    remember(trimmed);
    const mine = { row: r, status: 'loading', detail: null, error: null };
    setNote(mine);
    const c = getConnection();
    api.noteDetail(c, r.id)
      .then((d) => setNote((n) => (n && n.row === r ? { ...n, status: 'ok', detail: d } : n)))
      .catch((e) => setNote((n) => (n && n.row === r ? { ...n, status: 'error', error: e?.message || 'unknown error' } : n)));
  };
  const pick = (text) => { setQ(text); try { inputRef.current?.focus({ preventScroll: true }); } catch { /* */ } };
  const doShowAll = () => { inputRef.current?.blur(); setShowAll(true); };

  return (
    <>
      <div className="nv-sr-scrim" data-up={up ? 'true' : 'false'} aria-hidden="true" onClick={close} />
      <section ref={sheetRef} className="nv-sr nv-liquid nv-sum-sheet nv-sr-sheet" data-up={up ? 'true' : 'false'} role="dialog" aria-modal={up ? 'true' : undefined}
        aria-label="Search your notes" inert={up ? undefined : true} style={{ zIndex: 141 }}>
        <div className="nv-sr-grab" aria-hidden="true" />
        <div className="nv-sr-frow">
          <div className="nv-sr-field">
            <Ic n="search" />
            <input ref={inputRef} className="nv-sr-q" type="search" role="searchbox" aria-label="Search your notes" placeholder="Search your notes" value={q}
              onChange={(e) => setQ(e.target.value)} enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (trimmed.length >= 2) remember(trimmed); inputRef.current?.blur(); } }} />
            <button type="button" className="nv-sr-clear" aria-label="Clear the search" hidden={!q}
              onClick={() => { setQ(''); try { inputRef.current?.focus({ preventScroll: true }); } catch { /* */ } }}><Ic n="x" /></button>
          </div>
          <button type="button" className="nv-sr-cancel" data-edge-close="" onClick={close}>Cancel</button>
        </div>
        <p className="nv-sr-meta" aria-live="polite">{f.meta}</p>
        <div ref={listRef} className="nv-sr-list" data-stale={f.stale ? 'true' : 'false'} onScroll={() => { if (document.activeElement === inputRef.current && listRef.current.scrollTop > 24) inputRef.current.blur(); }}>
          <List f={f} recents={recents} onPick={pick} onOpen={openRow} onShowAll={doShowAll} />
        </div>
      </section>
      {note ? <NotePage note={note} query={trimmed} onBack={() => setNote(null)} /> : null}
    </>
  );
});

export const SearchSheet = SearchSheetImpl;
