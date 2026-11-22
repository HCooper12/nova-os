import { useEffect, useMemo, useState } from 'react';
import { resolveMediaSrc } from '../MediaImg.jsx';
import { paletteFor, regionVars } from './palette.js';
import { fmt } from './mentorModel.js';
import './mentors.css';

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

export function MentorTiles({ people, onOpen }) {
  const list = people || [];
  const followed = list.filter((p) => p.status !== 'guest');
  const guests = list.filter((p) => p.status === 'guest');
  return (
    <div className="nvmen lgrid">
      {followed.map((p) => <Sleeve key={p.id} p={p} onOpen={onOpen} />)}
      {guests.map((p) => <GuestSleeve key={p.id} p={p} host={followed.find((f) => f.id === p.hostId) || null} />)}
    </div>
  );
}
