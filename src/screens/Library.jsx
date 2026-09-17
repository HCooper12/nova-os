import { useRef, useLayoutEffect, useEffect, useState, lazy, Suspense } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { ChatMarkdown } from '../ChatMarkdown.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, ScreenHead } from '../Controls.jsx';
import { useLibraryTint } from '../shelf3d/useLibraryTint.js';

// THE TINT, everywhere it is read. Untinted, this resolves to the theme's own
// accent, so the fallback IS the current design and there is no second code
// path to keep in step (see shelf3d/useLibraryTint.js).
const LIB_ACC = 'var(--nv-lib-acc, var(--nv-acc))';
const cap = (s) => String(s || '').toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase());

// THE LIBRARY — the second brain's sources as a shelf you can walk.
// Books stand as generated covers; videos/podcasts/articles lie as cards.
// Opening one shows EVERYTHING Nova holds on it — the woven page, its
// concepts/entities/topics, what echoes it, the raw dossier or transcript,
// and the other sources it shares ideas with.
//
// Motion grammar: the shelf ASSEMBLES on entry (staggered shelfIn, see
// index.css), covers lift under the pointer, and opening a source morphs
// its cover into the detail header via the app-wide view transition. All of
// it degrades to instant-appear under prefers-reduced-motion.

const M = 'var(--nv-font-mono)';
const S = 'var(--nv-font-serif)';

// THE SHELF IS A RENDERER NOW. three.js is 600 KB and the Library is already
// lazy, so this second boundary keeps the renderer out of the screen chunk as
// well: nobody who opens Covers pays for it. Rollup gives Body3D and this one
// the SAME three chunk, which Phase 5 checks in dist/assets by hand.
const Shelf3D = lazy(() => import('../shelf3d/Shelf3D.jsx').then((m) => ({ default: m.Shelf3D })));

// A cheap, synchronous probe — no renderer built, no context taken. If this
// says no, the CSS shelf below is the view, and it says nothing false.
const probeWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
};

function ProvenanceBadge({ p, big }) {
  if (!p) return null;
  return (
    <Tag tone={p.color} style={big ? undefined : { fontSize: '9.5px', padding: '2px 6px' }}>{p.label}</Tag>
  );
}

function ChipRow({ label, chips }) {
  if (!chips.length) return null;
  return (
    <div style={css('margin-top:14px')}>
      <Eyebrow>{label}</Eyebrow>
      <div style={css('margin-top:7px;display:flex;flex-wrap:wrap;gap:7px')}>
        {chips.map((c) => (
          <Interactive key={c.id} as="span" onClick={c.go}
            base={{ cursor: 'pointer', font: `500 11.5px var(--nv-font-ui)`, padding: '5px 11px', borderRadius: '8px', color: c.color, border: `1px solid color-mix(in srgb, ${c.color} 30%, transparent)`, background: `color-mix(in srgb, ${c.color} 07%, transparent)` }}
            hoverStyle={{ background: `color-mix(in srgb, ${c.color} 15%, transparent)` }}>
            {c.title}
          </Interactive>
        ))}
      </div>
    </div>
  );
}

// FLIP, so the toggle MORPHS instead of cutting. Every item keeps its DOM
// node across the two shapes; layout jumps in one frame and this animates
// the difference on transform alone, which composites. Recording rects in a
// layout effect means the map already holds the PREVIOUS positions when the
// next one runs — that is the "first" of first-last-invert-play, for free.
function useShelfFlip(view, count) {
  const prev = useRef(new Map());
  const lastView = useRef(view);
  useLayoutEffect(() => {
    const nodes = [...document.querySelectorAll('[data-flip]')];
    const changed = lastView.current !== view;
    for (const n of nodes) {
      const key = n.dataset.flip;
      const last = n.getBoundingClientRect();
      const first = prev.current.get(key);
      if (changed && first && last.width && first.width) {
        const dx = first.left - last.left, dy = first.top - last.top;
        const sx = first.width / last.width, sy = first.height / last.height;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(sx - 1) > 0.01) {
          n.animate(
            [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.75 },
             { transform: 'none', opacity: 1 }],
            { duration: 520, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'both' },
          );
        }
      }
      prev.current.set(key, last);
    }
    lastView.current = view;
  }, [view, count]);
}

// The shelf's own controls: filters, search, add, and the two-way view
// toggle. Lifted out of Shelf because the 3D stage needs the same row above
// a canvas that must never unmount.
function ChipsRow({ v }) {
  return (
      <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
        {v.libraryChips.map((c) => (
          <Chip key={c.key} tone={c.active ? 'accent' : 'quiet'} active={c.active} onClick={c.pick}>{cap(c.label)}</Chip>
        ))}
        <Interactive as="input" value={v.libraryQuery} onChange={v.setLibraryQuery} placeholder="Search the shelf…"
          base={`margin-left:auto;min-width:120px;flex:1 1 120px;max-width:230px;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:8px 13px;color:var(--nv-ink);font:400 12px ${M};outline:none`}
          focusStyle="border-color:var(--nv-acc-border)" />
        {/* The shelf is where you think about books, so it is where you must
            be able to add one. This affordance existed only on the Claude
            Code screen behind "⇪ Add to vault" — findable by nobody, and he
            reasonably reported the feature as missing. Same modal, put where
            the intent actually forms. */}
        <Chip tone="gold" onClick={v.openIngestModal} style={{ flex: '0 0 auto' }}>＋ Add source</Chip>
        {/* the corner toggle: covers out, or spines on a shelf */}
        <div style={css('flex:0 0 auto;display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)')}>
          {[['grid', '▦', 'Covers'], ['spines', '▥', 'Shelf']].map(([key, glyph, label]) => (
            <Interactive key={key} as="span" onClick={() => v.setLibraryView(key)}
              ariaLabel={label}
              base={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '5px 10px', borderRadius: '7px', font: '600 11.5px var(--nv-font-ui)',
                letterSpacing: '.02em',
                color: v.libraryView === key ? 'var(--nv-acc)' : 'var(--nv-ink40)',
                background: v.libraryView === key ? 'var(--nv-acc-bg)' : 'transparent',
                transition: 'background var(--nv-dur-fast) var(--nv-ease), color var(--nv-dur-fast) var(--nv-ease)' }}
              hoverStyle={{ color: 'var(--nv-acc)' }}>
              <span style={css('font-size:12px')}>{glyph}</span>{label}
            </Interactive>
          ))}
        </div>
      </div>
  );
}

// THE DOM SHELF — the Covers grid, and the CSS shelf that is now only the
// fallback for a device with no WebGL or a lost context (Bar 7). Unchanged
// from what shipped, on purpose: a fallback that drifts is not a fallback.
function Shelf({ v, fellBack }) {
  const spines = v.libraryView === 'spines';
  useShelfFlip(v.libraryView, v.libraryShelf.length);
  return (
    <>
      <ChipsRow v={v} />

      {v.libraryEmpty && (
        <div style={css('margin-top:44px;text-align:center;font-size:13.5px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);max-width:460px;margin-left:auto;margin-right:auto')}>
          {v.libraryEmpty}
        </div>
      )}

      {/* ONE set of nodes, two shapes. The grid and the shelf render the
          SAME elements with different geometry, which is what lets the
          toggle morph rather than cut: React keeps every node, layout
          changes instantly, and useFlip animates the delta on the
          compositor. Two separate trees would have meant an unmount and a
          fade, which is exactly the cut the whole motion contract avoids. */}
      <div style={spines ? { position: 'relative', marginTop: '22px' } : undefined}>
      {spines && fellBack && (
        <div style={css('margin-bottom:12px;text-align:center')}>
          <Meta tone="faint">3D shelf unavailable on this device</Meta>
        </div>
      )}
      <div style={spines
        ? css('display:flex;align-items:flex-end;gap:5px;overflow-x:auto;padding:0 2px 0;min-height:300px')
        : css('margin-top:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:20px 16px;align-items:end')}>
        {v.libraryShelf.map((b) => (
          <div key={b.id} data-flip={b.id}
            style={spines
              ? { flex: 'none', width: `${b.spine.width}px`, height: `${b.spine.heightPct * 2.8}px` }
              : b.entranceStyle}>
            <Interactive onClick={b.open}
              base={{ cursor: 'pointer', height: spines ? '100%' : undefined, display: spines ? 'block' : undefined,
                transition: 'transform .32s cubic-bezier(.22,1,.36,1), box-shadow .32s ease' }}
              hoverStyle={spines
                ? { transform: 'translateY(-12px)', boxShadow: '0 22px 44px -18px rgba(0,0,0,.85)' }
                : { transform: 'translateY(-7px) scale(1.025)', boxShadow: '0 22px 44px -18px rgba(0,0,0,.85)' }}>
              <div style={{ ...b.coverStyle,
                aspectRatio: spines ? undefined : (b.isBook ? '2/3' : '16/10'),
                height: spines ? '100%' : undefined,
                borderRadius: spines ? '2px 4px 4px 2px' : (b.isBook ? '4px 9px 9px 4px' : '11px'),
                border: '1px solid rgba(255,255,255,.09)',
                boxShadow: spines
                  ? 'inset -3px 0 7px -4px rgba(0,0,0,.9), inset 2px 0 0 rgba(255,255,255,.10), 0 12px 26px -14px rgba(0,0,0,.9)'
                  : '0 14px 30px -16px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.08)',
                padding: spines ? '9px 3px' : '13px 13px 11px',
                display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                {b.jacket && (
                  /* the real jacket or poster, once it has loaded — the
                     generated cover stays underneath as the frame and the
                     permanent fallback. On a spine it is the sliver of cover
                     art you would actually see edge-on. */
                  <img src={b.jacket} alt="" loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                      objectFit: 'cover', opacity: spines ? .5 : 1,
                      animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }} />
                )}
                {spines ? (
                  /* a spine is read side-on, so the title runs up it */
                  <div style={{ position: 'relative', writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                    margin: '0 auto', font: `400 12px ${S}`, letterSpacing: '.01em',
                    color: 'rgba(255,255,255,.96)', textShadow: '0 1px 5px rgba(0,0,0,.85)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxHeight: '100%' }}>
                    {b.title}
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {!b.jacket && <span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track-wide)', color: 'rgba(255,255,255,.5)' }}>{b.kindLabel}</span>}
                      {!b.isBook && <span style={css('font-size:13px;color:rgba(255,255,255,.55)')}>{b.glyph}</span>}
                    </div>
                    {!b.jacket && (
                      <>
                        <div style={{ marginTop: 'auto', font: `400 ${b.isBook ? 17 : 14.5}px ${S}`, lineHeight: 1.18, color: 'rgba(255,255,255,.94)', textShadow: '0 1px 6px rgba(0,0,0,.4)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.title}</div>
                        {b.author && <div style={{ marginTop: '7px', font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>{b.author}</div>}
                      </>
                    )}
                  </>
                )}
              </div>
            </Interactive>
            {!spines && b.jacket && (
              <div style={{ marginTop: '9px', font: `400 14.5px ${S}`, lineHeight: 1.2,
                color: 'var(--nv-ink)', display: '-webkit-box', WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.title}</div>
            )}
            {!spines && (
              <div style={css('margin-top:8px;display:flex;align-items:center;gap:7px;min-height:16px')}>
                <ProvenanceBadge p={b.provenance} />
                {b.conceptCount > 0 && <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>{b.conceptCount} idea{b.conceptCount === 1 ? '' : 's'}</Meta>}
                {b.backlinks > 0 && <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0, opacity: .8 }}>· {b.backlinks} echo{b.backlinks === 1 ? '' : 'es'}</Meta>}
              </div>
            )}
          </div>
        ))}
      </div>
      {spines && (
        <>
          {/* the board: a lit edge where the spines meet it, the plank
              beneath, and the shelf's own shadow falling away from it */}
          <div aria-hidden="true" style={css(
            'height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,'
            + 'color-mix(in srgb, var(--nv-spec) 55%, transparent) 6%,'
            + 'color-mix(in srgb, var(--nv-spec) 55%, transparent) 94%,transparent)')} />
          <div aria-hidden="true" style={css(
            'height:11px;border-radius:0 0 4px 4px;background:linear-gradient(180deg,'
            + 'rgba(130,175,255,.14),rgba(6,7,13,.75));'
            + 'box-shadow:0 16px 34px -16px rgba(0,0,0,.95)')} />
          <div aria-hidden="true" style={css(
            'height:26px;background:linear-gradient(180deg,rgba(130,175,255,.05),transparent)')} />
        </>
      )}
      </div>
    </>
  );
}

// Detail, in three pieces, because there are now two ways to arrive at it.
//
// From the Covers grid the flat cover flies in on the DOM view-transition and
// the layout is exactly what shipped. From the shelf the cover slot IS the
// parked 3D volume — the same canvas that was the shelf a second ago, never
// unmounted — and the text arrives beneath it. Both read the same two pieces.

function DetailStatus({ d }) {
  return (
    <>
      {d.loading && <div style={css('margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)')}>Opening…</div>}
      {d.error && (
        <Interactive onClick={d.retry} base={css('margin-top:40px;text-align:center;font-size:13px;color:var(--nv-gold);cursor:pointer')}>{d.error}</Interactive>
      )}
    </>
  );
}

function DetailText({ d }) {
  return (
    <>
        <h2 style={{ margin: 0, font: `400 30px ${S}`, lineHeight: 1.12, color: LIB_ACC, transition: 'color var(--nv-dur-slow) var(--nv-ease)' }}>{d.item.title}</h2>
        {d.item.author && <Meta as="div" tone="quiet" style={{ marginTop: '6px', textTransform: 'none', letterSpacing: 0, fontSize: '13.5px' }}>{d.item.author}</Meta>}
        <div style={css('margin-top:12px;display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>
          <ProvenanceBadge p={d.item.provenance} big />
          {d.item.updated && <Meta tone="faint">Updated {d.item.updated}</Meta>}
          {d.backlinkCount > 0 && <Meta tone="faint">· echoed by {d.backlinkCount} page{d.backlinkCount === 1 ? '' : 's'}</Meta>}
        </div>
        {d.item.provenanceNote && (
          <div style={css('margin-top:10px;font-size:12px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);max-width:520px')}>{d.item.provenanceNote}</div>
        )}
        <div style={css('margin-top:12px;display:flex;gap:9px;flex-wrap:wrap')}>
          {d.item.url && (
            <Chip tone="cyan" onClick={() => window.open(d.item.url, '_blank', 'noopener,noreferrer')}>Open source ↗</Chip>
          )}
          {d.raw && (
            <Chip tone="quiet" disabled={!d.raw.open} onClick={d.raw.open || undefined}>⧉ Original · {cap(d.raw.label)}</Chip>
          )}
          <Chip tone="violet" onClick={d.openGalaxy}>✦ See in Galaxy</Chip>
        </div>

        <ChipRow label={`Concepts · ${d.concepts.length}`} chips={d.concepts} />
        <ChipRow label={`People & works · ${d.entities.length}`} chips={d.entities} />
        <ChipRow label={`Topics · ${d.topics.length}`} chips={d.topics} />
        <ChipRow label={`Also linked · ${d.otherLinks.length}`} chips={d.otherLinks} />
    </>
  );
}

function DetailExtras({ d }) {
  return (
    <>
      {d.related.length > 0 && (
        <div style={css('margin-top:30px')}>
          <Eyebrow tone="gold">Connected in your second brain</Eyebrow>
          <div style={css('margin-top:12px;display:flex;gap:12px;overflow-x:auto;padding-bottom:8px')}>
            {d.related.map((r, i) => (
              <Interactive key={r.id} onClick={r.open}
                base={{ cursor: 'pointer', flex: 'none', width: '190px', animation: 'shelfIn var(--nv-dur-slow) var(--nv-ease) both', animationDelay: `${i * 60}ms`, transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }}
                hoverStyle={{ transform: 'translateY(-4px)' }}>
                <div style={{ ...r.coverStyle, borderRadius: '10px', border: '1px solid rgba(255,255,255,.09)', padding: '12px', minHeight: '76px', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ font: `400 14px ${S}`, lineHeight: 1.2, color: 'rgba(255,255,255,.93)' }}>{r.title}</span>
                  <span style={{ marginTop: 'auto', paddingTop: '8px', font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: 'rgba(255,255,255,.55)' }}>shares: {r.shared}</span>
                </div>
              </Interactive>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '22px 24px', borderRadius: 'var(--nv-radius)',
        border: '1px solid var(--nv-lib-edge, var(--nv-edge))',
        background: 'linear-gradient(160deg, var(--nv-lib-ground, transparent), var(--nv-glass))',
        transition: 'border-color var(--nv-dur-slow) var(--nv-ease), background var(--nv-dur-slow) var(--nv-ease)' }}>
        <Eyebrow style={{ color: LIB_ACC }}>What Nova holds</Eyebrow>
        <div style={css('margin-top:12px;font-size:13.5px;line-height:1.75')}>
          <ChatMarkdown text={d.body} />
        </div>
      </div>
    </>
  );
}

function BackToLibrary({ onClose }) {
  return (
    <TextAction tone="quiet" onClick={onClose}
      style={{ marginLeft: '-8px', color: LIB_ACC, transition: 'color var(--nv-dur-slow) var(--nv-ease)' }}>
      ‹ Library
    </TextAction>
  );
}

function Detail({ v }) {
  const d = v.libraryDetail;
  return (
    <div style={css('animation:fadeUp var(--nv-dur-base) var(--nv-ease)')}>
      <BackToLibrary onClose={d.close} />
      <DetailStatus d={d} />
      {d.item && (
        <>
          <div style={css('margin-top:20px;display:flex;gap:24px;flex-wrap:wrap')}>
            <div style={{ ...d.item.coverStyle, width: d.item.isBook ? '150px' : '210px', aspectRatio: d.item.isBook ? '2/3' : '16/10', flex: 'none', borderRadius: d.item.isBook ? '5px 11px 11px 5px' : '12px', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 26px 54px -20px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.08)', padding: '15px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', animation: 'shelfIn var(--nv-dur-slow) var(--nv-ease) both' }}>
              {d.item.jacket && (
                <img src={d.item.jacket} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }} />
              )}
              {!d.item.jacket && (
                <>
                  <span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track-wide)', color: 'rgba(255,255,255,.5)' }}>{d.item.kindLabel}</span>
                  <span style={{ marginTop: 'auto', font: `400 19px ${S}`, lineHeight: 1.16, color: 'rgba(255,255,255,.95)' }}>{d.item.title}</span>
                  {d.item.author && <span style={{ marginTop: '8px', font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>{d.item.author}</span>}
                </>
              )}
            </div>
            <div style={css('flex:1;min-width:250px')}>
              <DetailText d={d} />
            </div>
          </div>
          <DetailExtras d={d} />
        </>
      )}
    </div>
  );
}

// THE VIEWPORT, as a number this component can lay out against. The canvas is
// a real object in a real room and it needs real room: a 360px strip in a tall
// empty column is the thing he called flat.
function useViewportBox() {
  const [box, setBox] = useState(() => ({
    w: typeof window === 'undefined' ? 375 : window.innerWidth,
    h: typeof window === 'undefined' ? 812 : window.innerHeight,
  }));
  useEffect(() => {
    const on = () => setBox({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return box;
}

const stageHeight = (box) => (box.w < 820
  ? Math.max(380, Math.round(box.h * 0.52))
  : Math.min(620, Math.round(box.h * 0.60)));

// THE STAGE — one canvas, two states.
//
// The whole point of this component is that <Shelf3D> sits at ONE stable
// position in the tree whether a volume is open or not. React reconciles by
// position, so rendering the canvas inside a `shelf` branch and again inside a
// `detail` branch would unmount and remount it — throwing away twenty-one
// volumes' textures and the renderer itself, right in the middle of the
// transition that is supposed to be continuous. Three fixed slots instead:
// what is above the canvas, the canvas, and what is below it.
function Stage({ v, detail, closing, height, wide, shelf, onClose }) {
  const open = !!detail;
  // On a wide screen an open volume takes the left half and its editorial
  // column sits beside it — reel-0011's book page. Below 820 the column goes
  // under it. Only the CSS changes: the canvas stays at the same position in
  // the tree in every state, which is the whole reason it survives the open.
  const beside = open && wide;
  return (
    <>
      <div style={{ minHeight: '34px' }}>
        {open ? <BackToLibrary onClose={onClose} /> : <ChipsRow v={v} />}
      </div>

      <div style={{ marginTop: '14px', display: beside ? 'flex' : 'block',
        gap: '30px', alignItems: 'flex-start' }}>
      <div style={{ flex: beside ? '0 0 52%' : '1 1 auto', minWidth: 0,
        position: 'relative', borderRadius: 'var(--nv-radius)',
        background: open ? 'radial-gradient(120% 90% at 50% 12%, var(--nv-lib-ground, transparent), transparent 72%)' : 'transparent',
        transition: 'background var(--nv-dur-slow) var(--nv-ease)' }}>
        <Suspense fallback={<div style={{ height: `${height}px` }} />}>
          <Shelf3D rows={v.libraryShelf} height={height}
            selectedId={shelf.selectedId} openId={shelf.openId}
            onSelect={shelf.onSelect} onOpen={shelf.onOpen}
            onOpened={shelf.onOpened} onClosed={shelf.onClosed}
            onFallback={shelf.onFallback} />
        </Suspense>
      </div>

      <div style={{ flex: beside ? '1 1 auto' : 'none', minWidth: 0, marginTop: beside ? '0' : (open ? '4px' : '8px') }}>
        {open ? (
          // the text arrives under the parked volume on the existing fadeUp,
          // and leaves the moment the close begins so the book flies back to
          // a shelf rather than out from under a wall of chips
          <div style={{ animation: 'fadeUp var(--nv-dur-base) var(--nv-ease)',
            opacity: closing ? 0 : 1,
            transition: 'opacity var(--nv-dur-fast) var(--nv-ease)' }}>
            <DetailStatus d={detail} />
            {detail.item && (
              <>
                <DetailText d={detail} />
                <DetailExtras d={detail} />
              </>
            )}
          </div>
        ) : (
          <div style={css('text-align:center')}>
            <Meta tone="faint">Drag or scroll the shelf · tap a volume to open it</Meta>
          </div>
        )}
      </div>
      </div>
    </>
  );
}

export function Library({ v }) {
  const wrap = useRef(null);
  const box = useViewportBox();
  // WebGL is probed once, not on every render; a lost context or a missing one
  // falls back for the rest of the session rather than flickering.
  const [webglOk] = useState(probeWebGL);
  const [fellBack, setFellBack] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  // WHICH DOOR HE CAME THROUGH. A volume opened from the shelf parks its 3D
  // object in the detail; one opened from the Covers grid keeps the DOM
  // view-transition morph and the flat cover, exactly as now.
  const [fromShelf, setFromShelf] = useState(false);
  const [tint, setTint] = useState(null);
  const [closing, setClosing] = useState(false);

  const d = v.libraryDetail;
  const use3D = v.libraryView === 'spines' && webglOk && !fellBack;
  const onStage = use3D && (!d || fromShelf);

  // THE FLASH THAT REBUILT THE RENDERER. Clearing `fromShelf` inside the
  // close callback put one render on screen where the detail still existed
  // but the stage no longer claimed it — so `onStage` went false, React
  // unmounted Shelf3D, and the next render mounted a BRAND NEW renderer:
  // twenty-one volumes' textures thrown away and the shelf jumped back to
  // item one. `fromShelf` is only meaningful while a detail exists, so it is
  // reset when the detail is gone and never a frame earlier.
  useEffect(() => { if (!d) setFromShelf(false); }, [!!d]); // eslint-disable-line react-hooks/exhaustive-deps

  // the shelf has no volume open until the detail exists AND we are not
  // already flying home — that null is what runs the closing timeline
  const openId = onStage && d && !closing ? v.libraryDetail.openIdForShelf : null;

  useLibraryTint(wrap, onStage && d && !closing ? tint : null);

  const shelf = {
    selectedId,
    openId,
    onSelect: setSelectedId,
    onOpen: (id, colours) => {
      setTint(colours || null);
      setFromShelf(true);
      setClosing(false);
      v.libraryShelf.find((r) => r.id === id)?.open();
    },
    onOpened: () => {},
    // THE CLOSE LANDS BEFORE THE STATE CHANGES. `libraryOpenId` is cleared
    // only once the book is back on the shelf, which is the ordering that can
    // never leave a stale canvas: the canvas is mounted in both states, so
    // there is no window in which it is showing a pose that belongs to a
    // detail the app has already forgotten. Clearing optimistically at the
    // start would swap the chips back in over a book still in mid-air.
    onClosed: () => {
      setClosing(false);
      setTint(null);
      v.libraryDetail?.close?.();
    },
    onFallback: setFellBack,
  };

  return (
    <div ref={wrap} style={v.wrapLibrary} data-screen-label="Library">
      <div style={css('display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px')}>
        <ScreenHead numeral="XVI." label="The Library" />
        <Meta tone="faint">{v.libraryHeaderLabel}</Meta>
      </div>
      <div style={css('margin-top:18px')}>
        {onStage
          ? <Stage v={v} detail={d} closing={closing} height={stageHeight(box)}
              wide={box.w >= 900} shelf={shelf} onClose={() => setClosing(true)} />
          : (d ? <Detail v={v} /> : <Shelf v={v} fellBack={fellBack} />)}
      </div>
    </div>
  );
}
