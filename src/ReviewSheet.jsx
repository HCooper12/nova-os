import { useEffect, useRef } from 'react';
import { Meta } from './Controls.jsx';
import { Interactive } from './Interactive.jsx';
import { SkeletonBar } from './Skeleton.jsx';

// THE DAILY REVIEW'S SHEET (mockup 96 Part 3) — the page behind the card,
// opened by "Open the page". The whole note, the connected notes as a small
// map, the source with Play from its moment where one really sits beside it,
// and the history. A history entry of its own (App.jsx openReviewSheet), the
// root marked data-edge-page so the back swipe slides it off like every
// other detail page (ArtifactViewer, RecipeOverlay, NovaFocus), and
// Back/Escape/the backdrop all go back through history rather than around
// it. Transform and opacity only; reduced motion skips the exit entirely
// (the house `nv-materialize` arrival already disables itself under
// prefers-reduced-motion, so the scrim's opacity fade is the whole of what's
// left — a cross-fade, not a cut).

const UI = 'var(--nv-font-ui)';
const SERIF = 'var(--nv-font-serif)';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function timeToSeconds(t) {
  const parts = String(t || '').split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
// Best-effort deep link: YouTube understands &t=; everything else just opens
// at the source, honestly — there is no universal "play from" for a podcast
// app or an arbitrary article, and pretending otherwise would be a lie.
function playFromUrl(url, time) {
  if (!url) return null;
  const secs = timeToSeconds(time);
  if (secs == null) return url;
  try {
    const u = new URL(url);
    if (/youtube\.com|youtu\.be/.test(u.hostname)) { u.searchParams.set('t', `${secs}s`); return u.toString(); }
  } catch { /* fall through to the bare url */ }
  return url;
}

export function ReviewSheet({ v }) {
  const r = v.review;
  const panelRef = useRef(null);
  const closing = useRef(false);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const el = panelRef.current;
    if (!el || reduced() || !el.animate) { r.closeSheet(); return; }
    el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(24px)' }],
      { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
    ).finished.catch(() => {}).then(() => r.closeSheet());
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEffect(() => { r.warmDetail?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const detail = r.sheetDetail; // { paragraphs } | null (loading) | { error: true }
  const history = r.curve?.answers || [];
  const GRADE_WORD = { got: 'Got it', fuzzy: 'Fuzzy', forgot: 'Forgot', read: 'Read' };

  // the small map: the concept centred, its connected notes arranged in a
  // circle around it, a line to each — a map, not a force-directed graph;
  // 2 to 4 nodes never need one
  const N = r.connected.length;
  const R = 74;
  const nodes = r.connected.map((c, i) => {
    const angle = (i / Math.max(1, N)) * Math.PI * 2 - Math.PI / 2;
    return { ...c, x: 110 + R * Math.cos(angle), y: 90 + R * Math.sin(angle) };
  });

  return (
    // data-edge-page: the back swipe pops this like an iOS detail page (src/edgeBack.js)
    <div role="dialog" aria-modal="true" aria-label={`Daily review: ${r.title}`} data-edge-page=""
      onClick={close}
      style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'color-mix(in srgb, var(--nv-void) 70%, transparent)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: v.isMobile ? 'flex-end' : 'center', justifyContent: 'center', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }}>
      <div ref={panelRef} className="nv-liquid nv-liquid-thick nv-materialize" onClick={(e) => e.stopPropagation()} tabIndex={-1}
        style={{
          width: '100%', maxWidth: '560px', maxHeight: v.isMobile ? '88vh' : '80vh', boxSizing: 'border-box', outline: 'none',
          display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          borderRadius: v.isMobile ? 'var(--nv-radius) var(--nv-radius) 0 0' : 'var(--nv-radius)',
          padding: '18px 20px calc(20px + env(safe-area-inset-bottom))',
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
          <Meta tone="faint">Daily review</Meta>
          <Interactive as="span" onClick={close} base={{ cursor: 'pointer', font: `600 13px ${UI}`, color: 'var(--nv-ink60)' }}>Close</Interactive>
        </div>
        <h2 style={{ margin: '6px 0 0', font: `400 22px/1.25 ${SERIF}`, color: 'var(--nv-ink)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{r.title}</h2>

        {/* the source, with Play from its moment only where one really sits
            beside the link */}
        <div style={{ marginTop: '14px', padding: '11px 13px', borderRadius: '12px', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)' }}>
          {r.source ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ minWidth: 0, font: `450 13px ${UI}`, color: 'var(--nv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.source.kind ? `${r.source.kind} · ` : ''}{r.source.title}{r.source.extra > 0 ? ` · +${r.source.extra} more` : ''}
              </span>
              {r.source.url && (
                <Interactive as="a" href={playFromUrl(r.source.url, r.source.time)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  base={{ cursor: 'pointer', flex: 'none', font: `600 12px ${UI}`, color: 'var(--nv-gold)' }}>
                  {r.source.time ? `Play from ${r.source.time}` : 'Open'}
                </Interactive>
              )}
            </div>
          ) : (
            <span style={{ font: `450 13px ${UI}`, color: 'var(--nv-ink60)' }}>No source on this page</span>
          )}
        </div>

        {/* the small map */}
        {nodes.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <Meta tone="faint">Connected</Meta>
            <svg width="100%" height="180" viewBox="0 0 220 180" style={{ marginTop: '6px' }}>
              {nodes.map((n) => (
                <line key={`l-${n.id}`} x1="110" y1="90" x2={n.x} y2={n.y} stroke="color-mix(in srgb, var(--nv-ink) 16%, transparent)" strokeWidth="1" />
              ))}
              <circle cx="110" cy="90" r="20" fill="var(--nv-gold)" opacity="0.9" />
              <text x="110" y="94" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--nv-void)">{(r.title || '').slice(0, 2).toUpperCase()}</text>
              {nodes.map((n) => (
                <g key={n.id} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); n.go(); }}>
                  <circle cx={n.x} cy={n.y} r="13" fill={n.color} />
                  <text x={n.x} y={n.y + 24} textAnchor="middle" fontSize="9.5" fill="var(--nv-ink60)">
                    {n.title.length > 14 ? `${n.title.slice(0, 13)}…` : n.title}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}

        {/* the whole note */}
        <div style={{ marginTop: '14px' }}>
          <Meta tone="faint">The note</Meta>
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {detail === null ? (
              <>
                <SkeletonBar w="92%" h="14px" />
                <SkeletonBar w="78%" h="14px" />
              </>
            ) : detail?.error ? (
              <span style={{ font: `450 13px ${UI}`, color: 'var(--nv-ink60)' }}>Couldn't load this note — try again from Notes.</span>
            ) : (
              (detail?.paragraphs || []).map((p, i) => (
                <p key={i} style={{ margin: 0, font: `400 14.5px/1.55 ${SERIF}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>{p}</p>
              ))
            )}
          </div>
        </div>

        {/* the history */}
        {history.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <Meta tone="faint">History</Meta>
            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', font: `450 12.5px ${UI}`, color: 'var(--nv-ink60)' }}>
                  <span>{h.date}</span><span>{GRADE_WORD[h.grade] || h.grade}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
          <Interactive as="span" onClick={r.writeAboutIt} base={{ cursor: 'pointer', font: `600 13px ${UI}`, padding: '8px 14px', borderRadius: '9px', background: 'color-mix(in srgb, var(--nv-gold) 14%, transparent)', color: 'var(--nv-gold)' }}>Write about it</Interactive>
        </div>
      </div>
    </div>
  );
}
