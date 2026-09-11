import { useRef, useLayoutEffect } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { ChatMarkdown } from '../ChatMarkdown.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, ScreenHead } from '../Controls.jsx';
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

function Shelf({ v }) {
  const spines = v.libraryView === 'spines';
  useShelfFlip(v.libraryView, v.libraryShelf.length);
  return (
    <>
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

function Detail({ v }) {
  const d = v.libraryDetail;
  return (
    <div style={css('animation:fadeUp var(--nv-dur-base) var(--nv-ease)')}>
      <TextAction tone="quiet" onClick={d.close} style={{ marginLeft: '-8px' }}>‹ Library</TextAction>

      {d.loading && <div style={css('margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)')}>Opening…</div>}
      {d.error && (
        <Interactive onClick={d.retry} base={css('margin-top:40px;text-align:center;font-size:13px;color:var(--nv-gold);cursor:pointer')}>{d.error}</Interactive>
      )}

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
              <h2 style={{ margin: 0, font: `400 30px ${S}`, lineHeight: 1.12 }}>{d.item.title}</h2>
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
            </div>
          </div>

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

          <div style={css('margin-top:30px;border:1px solid var(--nv-edge);border-radius:var(--nv-radius);background:var(--nv-glass);padding:22px 24px')}>
            <Eyebrow>What Nova holds</Eyebrow>
            <div style={css('margin-top:12px;font-size:13.5px;line-height:1.75')}>
              <ChatMarkdown text={d.body} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Library({ v }) {
  return (
    <div style={v.wrapLibrary} data-screen-label="Library">
      <div style={css('display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px')}>
        <ScreenHead numeral="XVI." label="The Library" />
        <Meta tone="faint">{v.libraryHeaderLabel}</Meta>
      </div>
      <div style={css('margin-top:18px')}>
        {v.libraryDetail ? <Detail v={v} /> : <Shelf v={v} />}
      </div>
    </div>
  );
}
