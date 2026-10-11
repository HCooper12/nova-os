import { useEffect, useRef } from 'react';
import './review.css';
import { Interactive } from './Interactive.jsx';
import { TextAction } from './Controls.jsx';
import { SkeletonBar } from './Skeleton.jsx';
import { RvIcon, CurveBlock, AnswerSlot } from './ReviewCard.jsx';
import { NOTE_TYPE_COLOR } from './vals/shared.js';

// THE PAGE BEHIND THE CARD (mockup 96 Part 5), raised by "Open the page":
// the whole note, its neighbourhood as a small map, the source with Play
// from the moment where one really sits beside the link, and every answer
// he has given it. The answer bar stays at the foot, so the page can be
// answered from here too, acted out the same way as on the card.
//
// A history entry of its own (App.jsx openReviewSheet), the root marked
// data-edge-page so the back swipe slides it off like every other detail
// page; Close, Escape and the scrim all go back through history. It rises
// on the iOS drawer curve and leaves faster than it came; reduced motion
// gives a cross-fade (review.css).

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SRC = NOTE_TYPE_COLOR.source;

// the map: the page at the centre ringed in the review's violet, the source
// and up to four connected pages around it in the Galaxy's colours. Only
// links the page really has; nothing is drawn beyond them.
const SLOTS = [
  { x: 58, y: 46, lx: 46, ly: 28, a: 'start' },
  { x: 270, y: 66, lx: 284, ly: 92, a: 'end' },
  { x: 266, y: 182, lx: 280, ly: 208, a: 'end' },
  { x: 58, y: 150, lx: 44, ly: 176, a: 'start' },
];
const clip = (t, n = 20) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

function mapNodes(r) {
  return [
    ...(r.source ? [{ id: 'src', title: `${r.source.title}${r.source.ep ? `, ${r.source.ep}` : ''}`, color: SRC, r: 7, go: r.source.open }] : []),
    ...r.connected.map((c) => ({ id: c.id, title: c.title, color: c.color, r: c.kind === 'topic' ? 8 : 7, go: c.go })),
  ].slice(0, SLOTS.length);
}

function MapSVG({ r }) {
  const nodes = mapNodes(r);
  const cx = 163, cy = 112;
  return (
    <svg className="nv-rv-map" viewBox="0 0 326 230" role="img" aria-label={`Map of ${r.title}: linked to ${nodes.length} ${nodes.length === 1 ? 'page' : 'pages'}`}>
      {nodes.map((n, i) => <path key={`e${n.id}`} className="e" style={{ '--i': i }} d={`M${cx},${cy} L${SLOTS[i].x},${SLOTS[i].y}`} />)}
      {nodes.map((n, i) => (
        <g key={n.id} className="nd tap" style={{ '--i': i }} onClick={n.go} role="button" aria-label={`Open ${n.title}`}>
          <circle cx={SLOTS[i].x} cy={SLOTS[i].y} r="22" fill="transparent" />
          <circle cx={SLOTS[i].x} cy={SLOTS[i].y} r={n.r} fill={n.color} />
          <text x={SLOTS[i].lx} y={SLOTS[i].ly} textAnchor={SLOTS[i].a}>{clip(n.title, 24)}</text>
        </g>
      ))}
      <g className="nd" style={{ '--i': 0 }}>
        <circle cx={cx} cy={cy} r="17" fill="none" stroke="var(--nv-vi)" strokeWidth="1.5" opacity=".7" />
        <circle cx={cx} cy={cy} r="10" fill={r.typeColor} />
        <text className="c" x={cx} y={cy + 36} textAnchor="middle">{clip(r.title, 26)}</text>
      </g>
    </svg>
  );
}

export function ReviewSheet({ v }) {
  const r = v.review;
  const sheetRef = useRef(null);
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = sheetRef.current;
    if (!el || reduced() || !el.animate) { r.closeSheet(); return; }
    el.animate([{ transform: 'none' }, { transform: 'translateY(102%)' }], { duration: 280, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
      .finished.catch(() => {}).then(() => r.closeSheet());
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { r.warmDetail?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const detail = r.sheetDetail; // { paragraphs } | null (loading) | { error: true }
  const kinds = [...new Map([
    ...r.connected.map((c) => [c.kind, c.color]),
    ...(r.source ? [['source', SRC]] : []),
  ]).entries()];
  const s = r.source;

  return (
    <div className="nv-rv" data-edge-page="" role="dialog" aria-modal="true" aria-label={`${r.title}, the review page`}>
      <div className="nv-rv-scrim" onClick={close} />
      <div ref={sheetRef} className="nv-rv-sheet">
        <div className="nv-rv-grab" />
        <div className="nv-rv-shead">
          <b><RvIcon name="review" />Daily review</b>
          <Interactive as="button" type="button" className="nv-rv-x" onClick={close} aria-label="Close" haptic="tick"><RvIcon name="close" /></Interactive>
        </div>
        <div className="nv-rv-sscroll">
          <p className="nv-rv-kick">
            {r.kicker?.isNew ? <><span className="new">New</span> · {r.kicker.text}</> : r.kicker?.text}{r.demo ? ' · demo' : ''}
          </p>
          <h3 className="nv-rv-ct">{r.title}</h3>
          <CurveBlock r={r} big />

          <p className="nv-rv-sh3">The note</p>
          <div className="nv-rv-note">
            {detail === null ? (
              <div style={{ display: 'grid', gap: '9px' }}><SkeletonBar w="96%" h="15px" /><SkeletonBar w="88%" h="15px" /><SkeletonBar w="64%" h="15px" /></div>
            ) : detail?.error ? (
              <p style={{ font: '400 15px var(--nv-font-ui)', color: 'var(--nv-ink60)' }}>This note did not load. Open it in Notes to try again.</p>
            ) : (
              (detail?.paragraphs || []).map((p, i) => <p key={i}>{p}</p>)
            )}
            {r.openInNotes
              ? <TextAction compact tone="quiet" onClick={r.openInNotes} style={{ marginLeft: '-8px' }}>Open in Notes ›</TextAction>
              : <span className="dl">Demo note, invented for the demo</span>}
          </div>

          <p className="nv-rv-sh3">Connected</p>
          {(r.connected.length || s) ? (
            <>
              <MapSVG r={r} />
              <div className="nv-rv-mapk">
                {kinds.map(([k, c]) => <span key={k} style={{ '--rv-k': c }}><i />{k[0].toUpperCase() + k.slice(1)}</span>)}
                <span>{(() => { const drawn = mapNodes(r).length; const links = Math.max(r.linkCount || 0, drawn); return links > drawn ? `${links} links on the page; the ${drawn} nearest drawn` : `${links} ${links === 1 ? 'link' : 'links'} on the page, all drawn`; })()}</span>
              </div>
            </>
          ) : <p className="nv-rv-empty">This page links to nothing yet.</p>}

          <p className="nv-rv-sh3">Source</p>
          {s ? (
            <div className="nv-rv-sbox" style={{ '--rv-k': SRC }}>
              <div className="st">{s.title}{s.ep ? `, ${s.ep}` : ''}</div>
              <div className="sm">
                {s.kind ? `${s.kind[0].toUpperCase()}${s.kind.slice(1)}` : 'Source'}{r.demo ? ' · demo' : ''}
                {s.time ? ` · the page places this idea at ${s.time}` : ' · the page gives no time for this idea'}
                {s.extra > 0 ? ` · and ${s.extra} more` : ''}
              </div>
              {s.time
                ? <Interactive as="button" type="button" className="nv-rv-playb" onClick={s.open} haptic="tick"><RvIcon name="play" />Play from {s.time}</Interactive>
                : <Interactive as="button" type="button" className="nv-rv-openb" onClick={s.open} haptic="tick">Open the source ›</Interactive>}
            </div>
          ) : <p className="nv-rv-empty">No source on this page. Nothing is guessed.</p>}

          <p className="nv-rv-sh3">History</p>
          {r.history.length ? (
            <ul className="nv-rv-hist">
              {r.history.map((h) => (
                <li key={h.key} className={h.date === 'Today' ? 'new' : ''} style={{ '--g': h.hue }}>
                  <span className="g"><RvIcon name={h.grade} /></span>
                  <span className="d">{h.date}</span>
                  <span className="w">{h.label} · {h.where}</span>
                </li>
              ))}
            </ul>
          ) : <p className="nv-rv-empty">Not seen yet. Your first answer starts its schedule.</p>}
          <p className="nv-rv-foot2">Dots on the curve are these answers. The line is the forgetting idea drawn to the gaps; it measures nothing about you.</p>
        </div>
        <div className="nv-rv-sbar">
          <AnswerSlot r={r} afterLabel="Close" onAfter={close} />
          <div className="nv-rv-foot" style={{ justifyContent: 'center' }}>
            <TextAction tone="violet" onClick={() => { r.closeSheet(); r.writeAboutIt(); }} style={{ gap: '4px' }}><RvIcon name="pen" />{r.writtenToday ? 'Written · write again' : 'Write on it'}</TextAction>
          </div>
        </div>
      </div>
    </div>
  );
}
