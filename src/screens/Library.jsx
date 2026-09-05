import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { ChatMarkdown } from '../ChatMarkdown.jsx';

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
    <span style={{ font: `600 ${big ? 9.5 : 8}px ${M}`, letterSpacing: '.14em', color: p.color, border: `1px solid color-mix(in srgb, ${p.color} 40%, transparent)`, borderRadius: '5px', padding: big ? '3px 7px' : '2px 5px', background: `color-mix(in srgb, ${p.color} 09%, transparent)` }}>
      {p.label}
    </span>
  );
}

function ChipRow({ label, chips }) {
  if (!chips.length) return null;
  return (
    <div style={css('margin-top:14px')}>
      <div style={{ font: 'var(--nv-micro-s)', letterSpacing: '.2em', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>{label}</div>
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

function Shelf({ v }) {
  return (
    <>
      <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
        {v.libraryChips.map((c) => (
          <Interactive key={c.key} as="span" onClick={c.pick}
            base={{ cursor: 'pointer', font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', padding: '7px 13px', borderRadius: '9px',
              color: c.active ? 'var(--nv-acc)' : 'color-mix(in srgb, var(--nv-ink) 55%, transparent)',
              border: c.active ? '1px solid var(--nv-acc-border)' : '1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)',
              background: c.active ? 'var(--nv-acc-bg)' : 'none' }}
            hoverStyle="background:rgba(255,255,255,.06)">
            {c.label}
          </Interactive>
        ))}
        <Interactive as="input" value={v.libraryQuery} onChange={v.setLibraryQuery} placeholder="Search the shelf…"
          base={`margin-left:auto;min-width:120px;flex:1 1 120px;max-width:230px;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:8px 13px;color:var(--nv-ink);font:400 12px ${M};outline:none`}
          focusStyle="border-color:var(--nv-acc-border)" />
        {/* The shelf is where you think about books, so it is where you must
            be able to add one. This affordance existed only on the Claude
            Code screen behind "⇪ Add to vault" — findable by nobody, and he
            reasonably reported the feature as missing. Same modal, put where
            the intent actually forms. */}
        <Interactive as="span" onClick={v.openIngestModal}
          base={`flex:0 0 auto;cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);padding:8px 14px;border-radius:9px;color:var(--nv-gold);border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);background:color-mix(in srgb, var(--nv-gold) 06%, transparent);white-space:nowrap`}
          hoverStyle="background:color-mix(in srgb, var(--nv-gold) 14%, transparent)">
          ＋ ADD SOURCE
        </Interactive>
      </div>

      {v.libraryEmpty && (
        <div style={css('margin-top:44px;text-align:center;font-size:13.5px;line-height:1.7;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);max-width:460px;margin-left:auto;margin-right:auto')}>
          {v.libraryEmpty}
        </div>
      )}

      <div style={css('margin-top:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:20px 16px;align-items:end')}>
        {v.libraryShelf.map((b) => (
          <div key={b.id} style={b.entranceStyle}>
            <Interactive onClick={b.open}
              base={{ cursor: 'pointer', transition: 'transform .32s cubic-bezier(.22,1,.36,1), box-shadow .32s ease' }}
              hoverStyle={{ transform: 'translateY(-7px) scale(1.025)', boxShadow: '0 22px 44px -18px rgba(0,0,0,.85)' }}>
              <div style={{ ...b.coverStyle, aspectRatio: b.isBook ? '2/3' : '16/10', borderRadius: b.isBook ? '4px 9px 9px 4px' : '11px', border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 14px 30px -16px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.08)', padding: '13px 13px 11px', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
                {b.jacket && (
                  /* the real jacket, once it has loaded — the generated cover
                     stays underneath as the frame and the permanent fallback */
                  <img src={b.jacket} alt="" loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn .35s ease-out' }} />
                )}
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
              </div>
            </Interactive>
            <div style={css('margin-top:8px;display:flex;align-items:center;gap:7px;min-height:16px')}>
              <ProvenanceBadge p={b.provenance} />
              {b.conceptCount > 0 && <span style={{ font: 'var(--nv-micro-s)', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>{b.conceptCount} idea{b.conceptCount === 1 ? '' : 's'}</span>}
              {b.backlinks > 0 && <span style={{ font: 'var(--nv-micro-s)', color: 'color-mix(in srgb, var(--nv-ink) 35%, transparent)' }}>· {b.backlinks} echo{b.backlinks === 1 ? '' : 'es'}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Detail({ v }) {
  const d = v.libraryDetail;
  return (
    <div style={css('animation:fadeUp .3s ease-out')}>
      <Interactive as="span" onClick={d.close}
        base={`cursor:pointer;display:inline-flex;align-items:center;gap:7px;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 55%, transparent);padding:7px 12px;border:1px solid color-mix(in srgb, var(--nv-ink) 13%, transparent);border-radius:9px`}
        hoverStyle="color:var(--nv-ink);background:rgba(255,255,255,.05)">‹ LIBRARY</Interactive>

      {d.loading && <div style={css('margin-top:40px;text-align:center;font-size:13px;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)')}>Opening…</div>}
      {d.error && (
        <Interactive onClick={d.retry} base={css('margin-top:40px;text-align:center;font-size:13px;color:var(--nv-gold);cursor:pointer')}>{d.error}</Interactive>
      )}

      {d.item && (
        <>
          <div style={css('margin-top:20px;display:flex;gap:24px;flex-wrap:wrap')}>
            <div style={{ ...d.item.coverStyle, width: d.item.isBook ? '150px' : '210px', aspectRatio: d.item.isBook ? '2/3' : '16/10', flex: 'none', borderRadius: d.item.isBook ? '5px 11px 11px 5px' : '12px', border: '1px solid rgba(255,255,255,.1)', boxShadow: '0 26px 54px -20px rgba(0,0,0,.85), inset 0 1px 0 rgba(255,255,255,.08)', padding: '15px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', animation: 'shelfIn .45s cubic-bezier(.22,1,.36,1) both' }}>
              {d.item.jacket && (
                <img src={d.item.jacket} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', animation: 'fadeIn .35s ease-out' }} />
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
              {d.item.author && <div style={{ marginTop: '6px', font: 'var(--nv-micro-l)', letterSpacing: 'var(--nv-micro-track)', color: 'color-mix(in srgb, var(--nv-ink) 60%, transparent)', textTransform: 'uppercase' }}>{d.item.author}</div>}
              <div style={css('margin-top:12px;display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>
                <ProvenanceBadge p={d.item.provenance} big />
                {d.item.updated && <span style={{ font: 'var(--nv-micro-s)', color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>UPDATED {d.item.updated}</span>}
                {d.backlinkCount > 0 && <span style={{ font: 'var(--nv-micro-s)', color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>· ECHOED BY {d.backlinkCount} PAGE{d.backlinkCount === 1 ? '' : 'S'}</span>}
              </div>
              {d.item.provenanceNote && (
                <div style={css('margin-top:10px;font-size:12px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 55%, transparent);max-width:520px')}>{d.item.provenanceNote}</div>
              )}
              <div style={css('margin-top:12px;display:flex;gap:9px;flex-wrap:wrap')}>
                {d.item.url && (
                  <Interactive as="a" href={d.item.url} target="_blank" rel="noreferrer"
                    base={`cursor:pointer;text-decoration:none;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:var(--nv-cy);padding:6px 11px;border:1px solid color-mix(in srgb, var(--nv-cy) 35%, transparent);border-radius:8px`}
                    hoverStyle="background:color-mix(in srgb, var(--nv-cy) 10%, transparent)">OPEN SOURCE ↗</Interactive>
                )}
                {d.raw && (
                  <Interactive as="span" onClick={d.raw.open || undefined}
                    base={`cursor:${d.raw.open ? 'pointer' : 'default'};font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 55%, transparent);padding:6px 11px;border:1px solid color-mix(in srgb, var(--nv-ink) 14%, transparent);border-radius:8px`}
                    hoverStyle={d.raw.open ? 'background:rgba(255,255,255,.06)' : undefined}>⧉ ORIGINAL · {d.raw.label}</Interactive>
                )}
                <Interactive as="span" onClick={d.openGalaxy}
                  base={`cursor:pointer;font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track);color:var(--nv-vi);padding:6px 11px;border:1px solid color-mix(in srgb, var(--nv-vi) 35%, transparent);border-radius:8px`}
                  hoverStyle="background:color-mix(in srgb, var(--nv-vi) 10%, transparent)">✦ SEE IN GALAXY</Interactive>
              </div>

              <ChipRow label={`CONCEPTS · ${d.concepts.length}`} chips={d.concepts} />
              <ChipRow label={`PEOPLE & WORKS · ${d.entities.length}`} chips={d.entities} />
              <ChipRow label={`TOPICS · ${d.topics.length}`} chips={d.topics} />
              <ChipRow label={`ALSO LINKED · ${d.otherLinks.length}`} chips={d.otherLinks} />
            </div>
          </div>

          {d.related.length > 0 && (
            <div style={css('margin-top:30px')}>
              <div style={{ font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track-wide)', color: 'var(--nv-gold)' }}>CONNECTED IN YOUR SECOND BRAIN</div>
              <div style={css('margin-top:12px;display:flex;gap:12px;overflow-x:auto;padding-bottom:8px')}>
                {d.related.map((r, i) => (
                  <Interactive key={r.id} onClick={r.open}
                    base={{ cursor: 'pointer', flex: 'none', width: '190px', animation: 'shelfIn .45s cubic-bezier(.22,1,.36,1) both', animationDelay: `${i * 60}ms`, transition: 'transform .3s cubic-bezier(.22,1,.36,1)' }}
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
            <div style={{ font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track-wide)', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>WHAT NOVA HOLDS</div>
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
        <div style={css('display:flex;align-items:center;gap:14px')}>
          <span style={css('font:var(--nv-micro-l);letter-spacing:var(--nv-micro-track);color:var(--nv-acc)')}>XVI.</span>
          <span style={css('width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)')}></span>
          <span style={css('font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)')}>THE LIBRARY</span>
        </div>
        <span style={{ font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>{v.libraryHeaderLabel}</span>
      </div>
      <div style={css('margin-top:18px')}>
        {v.libraryDetail ? <Detail v={v} /> : <Shelf v={v} />}
      </div>
    </div>
  );
}
