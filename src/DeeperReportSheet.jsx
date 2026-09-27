import { useEffect, useLayoutEffect, useRef } from 'react';
import { Interactive } from './Interactive.jsx';
import { Eyebrow, TextAction } from './Controls.jsx';
import { useSheetDrag } from './useSheetDrag.js';
import { useExit } from './useExit.js';
import { Ico, Tile } from './InboxSumIcons.jsx';
import { Verbs } from './InboxSumVerbs.jsx';

// THE REPORT, AS A SHEET (27 Sep 2026, mockup 60 #3). Look deeper's brief,
// read in full over the deck: the title, the body as paragraphs, the sources
// as rows that open where they live, and the card's own three verbs pinned at
// the foot, acting on the PARENT card, so he decides from here. A tick files
// the card and the sheet goes back down onto the next one.
//
// The house sheet (PinnedEditSheet.jsx): its own history entry
// (App.openDeeperReport), an aria-modal root with its z-index inline and a
// backdrop that closes it (the back swipe's contract, edgeBack.js), useExit
// for the fall back down, useSheetDrag on the grab zone for the throw.

const onControl = (el) => !!(el && el.closest && el.closest('[role="button"], button, a, input'));

// consecutive list items read as one list
function groupBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'li') {
      const last = out[out.length - 1];
      if (last && last.type === 'ul') last.items.push(b.text);
      else out.push({ type: 'ul', items: [b.text] });
    } else out.push(b);
  }
  return out;
}

export function DeeperReportSheet({ r }) {
  const exit = useExit(r.close);
  const sheet = useSheetDrag(r.close, { threshold: 80 });
  const panelRef = useRef(null);
  const closeRef = useRef(exit.close);
  useLayoutEffect(() => { closeRef.current = exit.close; });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, []);

  // a verb decides on the parent card. The tick files and the sheet falls
  // back onto the deck; Talk and ✕ close it first (Talk leaves the page, and
  // ✕ on a Coach card opens its reasons on the card underneath).
  const verbs = r.verbs ? {
    yes: r.verbs.yes ? { ...r.verbs.yes, run: () => { r.verbs.yes.run(); exit.close(); } } : null,
    talk: r.verbs.talk ? { ...r.verbs.talk, run: () => r.close(r.verbs.talk.run) } : null,
    no: { ...r.verbs.no, run: () => r.close(r.verbs.no.run) },
  } : null;

  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label={`Report: ${r.title}`} onClick={exit.close}
      style={{
        position: 'fixed', inset: 0, zIndex: 145, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        background: 'color-mix(in srgb, var(--nv-void) 70%, transparent)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)',
      }}>
      <div ref={(el) => { sheet.sheetRef.current = el; exit.panelRef.current = el; panelRef.current = el; }}
        className="nv-liquid nv-liquid-thick nv-sum-sheet nv-materialize nv-sum-ib-sheet" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '560px', maxHeight: '86vh', boxSizing: 'border-box', outline: 'none', display: 'flex', flexDirection: 'column', borderRadius: 'var(--nv-radius) var(--nv-radius) 0 0' }}>
        <div {...sheet.handleProps}
          onPointerDown={(e) => { if (!onControl(e.target)) sheet.handleProps.onPointerDown(e); }}
          className="nv-sum-ib-grabzone" style={{ ...sheet.handleProps.style }}>
          <span className="grab" aria-hidden="true" />
          <div className="nv-sum-ib-shead">
            <Tile tile={{ tone: 'new', glyph: 'doc' }} title="Nova's report" />
            <span className="sx"><b>{r.title}</b>{r.meta && <span>{r.meta}</span>}</span>
            <TextAction onClick={exit.close}>Done</TextAction>
          </div>
        </div>
        <div className="nv-sum-ib-rbody">
          {r.onCard && <p className="nv-sum-ib-rfor">On the card <b>{r.onCard}</b></p>}
          {!r.ready ? (
            <p className="nv-sum-ib-rp">The report is not here yet. When the Researcher finishes, it lands on the card.</p>
          ) : (
            <>
              {r.lead && <p className="nv-sum-ib-rp lead">{r.lead}</p>}
              {groupBlocks(r.blocks).map((b, i) => (
                b.type === 'h' ? <h3 key={i} className="nv-sum-ib-rh">{b.text}</h3>
                  : b.type === 'ul' ? <ul key={i} className="nv-sum-ib-rl">{b.items.map((t, k) => <li key={k}>{t}</li>)}</ul>
                    : <p key={i} className="nv-sum-ib-rp">{b.text}</p>
              ))}
              {r.sources.length > 0 && (
                <section className="nv-sum-ib-group" aria-label="Sources">
                  <Eyebrow as="h2" tone="quiet" style={{ margin: '0 0 6px 14px' }}>Sources · {r.sources.length}</Eyebrow>
                  <div className="nv-sum-card nv-sum-ib-rows">
                    {r.sources.map((s) => (
                      <Interactive key={`${s.n}-${s.url || s.label}`} as={s.url ? 'a' : 'div'} className="nv-sum-ib-srow"
                        {...(s.url ? { href: s.url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                        base={{ cursor: s.url ? 'pointer' : 'default', color: 'inherit', textDecoration: 'none' }}
                        activeStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 8%, transparent)' }}>
                        <Tile tile={{ tone: 'vault', glyph: 'web' }} />
                        <span className="nv-sum-ib-lx"><span className="nm">{s.label}</span><span className="sv">{s.host ? `${s.host} · read by the Researcher` : 'No link was given'}</span></span>
                        {s.url ? <Ico name="right" className="nv-sum-ib-ico cv" /> : <span />}
                      </Interactive>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
        {verbs ? (
          <div className="nv-sum-ib-foot"><Verbs verbs={verbs} /></div>
        ) : r.answered ? (
          <div className="nv-sum-ib-foot"><p className="nv-sum-ib-quiet">{r.answered}</p></div>
        ) : null}
      </div>
    </div>
  );
}
