import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveMediaSrc } from '../MediaImg.jsx';
import { api, getConnection } from '../api.js';
import { paletteFor, regionVars } from './palette.js';
import { fmt } from './mentorModel.js';
import { wayIn } from './newsModel.js';
import { odo } from './motion.js';
import './mentors.css';
import './news.css';

// LIBRARY › MENTORS (mockup 125 A, the Library view): a sleeve per person he
// follows, in his own colour with his cut-out portrait and his name, and
// "N of M woven" under it from the register; a sleeve per guest who has a
// page. Nova's Library around it keeps its own look.

function useCutout(person) {
  const [url, setUrl] = useState(undefined);
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    resolveMediaSrc(`/api/mentors/${encodeURIComponent(person.id)}/cutout`).then(async (u) => {
      if (u) { if (live) setUrl({ cut: u }); return; }
      // no cut-out: his square portrait, drawn as the mockup draws a square photo
      const a = person.art?.avatar ? await resolveMediaSrc(person.art.avatar) : null;
      if (live) setUrl(a ? { photo: a } : null);
    });
    return () => { live = false; };
  }, [person.id, person.art?.avatar]);
  return url;
}

function Sleeve({ p, onOpen }) {
  const pal = useMemo(() => paletteFor(p.colour), [p.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  const art = useCutout(p);
  const c = p.counts || {};
  return (
    <div>
      <button type="button" className={`slv press${art?.cut ? ' cut' : ''}`} style={vars} onClick={() => onOpen(p.id)} aria-label={`${p.name}, ${fmt(c.woven || 0)} of ${fmt(c.total || 0)} woven`}>
        {art?.cut && <img className="ph" src={art.cut} alt="" />}
        {art?.photo && <img className="ph" src={art.photo} alt="" />}
        <span className="nm">{p.name}</span>
      </button>
      <div className="meta"><b>{fmt(c.woven || 0)}</b> of {fmt(c.total || 0)} woven</div>
    </div>
  );
}

// a guest has no portrait of his own, so no colour of his own: the host's ink,
// the host's colour as the one accent, and the real episode frame
function GuestSleeve({ p, host }) {
  const pal = useMemo(() => paletteFor(host?.colour || p.colour), [host?.colour, p.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  const [frame, setFrame] = useState(null);
  const src = p.art?.banner || p.art?.avatar || null;
  useEffect(() => {
    let live = true;
    if (src) resolveMediaSrc(src).then((u) => { if (live) setFrame(u); });
    return () => { live = false; };
  }, [src]);
  const n = p.counts?.total || 0;
  return (
    <div>
      <div className="slv gst" style={vars}>
        {frame && <img className="fr" src={frame} alt="" />}
        <span className="nm">{p.name}</span>
      </div>
      <div className="meta"><b>{fmt(n)}</b> episode{n === 1 ? '' : 's'}</div>
    </div>
  );
}

// THE WAY IN TO NEWS (slice 2; not drawn in the mockup, built from its own
// vocabulary): an Ink block above the people, the serif "News", the number of
// review items waiting as the large sans numeral (only above zero), and the
// newest video's title as its one line. Read from GET /api/mentors/news.
function NewsWay({ onNews }) {
  const [w, setW] = useState(null);
  const rn = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    let live = true;
    const load = () => {
      const conn = getConnection();
      if (!conn) return;
      api.mentorNews(conn).then((n) => { if (live) setW(wayIn(n)); }).catch(() => { /* the block waits for an answer */ });
    };
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, 60_000);
    return () => { live = false; document.removeEventListener('visibilitychange', onVis); clearInterval(t); };
  }, []);
  const n = w?.n || 0;
  useLayoutEffect(() => {
    if (!rn.current || !n) return;
    odo(rn.current, n, !first.current);
    first.current = false;
  }, [n]);
  const pal = useMemo(() => paletteFor(w?.person?.colour), [w?.person?.colour]);
  const vars = useMemo(() => regionVars(pal, 'now'), [pal]);
  if (!w || !onNews) return null;
  return (
    <button type="button" className="nwi press" style={vars} onClick={onNews} aria-label={n ? `News, ${n} waiting` : 'News'}>
      <h3>News</h3>
      {n > 0 && <span className="rn" ref={rn} />}
      {w.title ? <p>{w.title}</p> : null}
    </button>
  );
}

export function MentorTiles({ people, onOpen, onNews }) {
  const list = people || [];
  const followed = list.filter((p) => p.status !== 'guest');
  const guests = list.filter((p) => p.status === 'guest');
  return (
    <div className="nvmen lgrid">
      {followed.length > 0 && <NewsWay onNews={onNews} />}
      {followed.map((p) => <Sleeve key={p.id} p={p} onOpen={onOpen} />)}
      {guests.map((p) => <GuestSleeve key={p.id} p={p} host={followed.find((f) => f.id === p.hostId) || null} />)}
    </div>
  );
}
