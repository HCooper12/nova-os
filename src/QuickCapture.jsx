import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Interactive } from './Interactive.jsx';
import { LocalInput } from './LocalInput.jsx';
import { useExit } from './useExit.js';
import { Ico, Tile } from './InboxSumIcons.jsx';
import { TAG_HUE } from './captureTag.js';
import './quickCapture.css';

// QUICK CAPTURE (18 Oct 2026, mockup 103). One box for anything; each capture
// lands as a row whose TAG names where it went, with Undo; the tag opens a
// sheet that moves it. Shared by both Inbox layouts (q = vals/quickCapture.js
// plus the box's own value/submit from the layout's view model).

export function QuickCaptureCard({ q }) {
  const [round, setRound] = useState(0);
  const field = useRef(null);
  const submit = (text) => {
    const live = typeof text === 'string' ? text : field.current?.querySelector('input')?.value;
    if (!String(live ?? q.value ?? '').trim()) return;
    q.submit('text', typeof live === 'string' ? live : undefined);
    setRound((n) => n + 1);
  };
  return (
    <section className="nv-sum-card nv-qc nv-sum-rise" style={{ '--i': 2 }} aria-label="Quick capture">
      <div className="nv-qc-h">
        <Tile tile={{ tone: 'vault', glyph: 'into' }} />
        <span className="nv-qc-lx"><span className="nm">Quick capture</span><span className="sv">Anything: a thing to buy, a to-do, a thought, a link</span></span>
      </div>
      <div className="nv-qc-f" ref={field}>
        <LocalInput key={round} value={q.value} onChange={q.setText} onSubmit={submit} placeholder="Toothpaste, call the bank, a podcast link…"
          aria-label="Capture" disabled={!q.enabled} className="nv-qc-i" autoCapitalize="sentences" />
        <Interactive as="button" type="button" className="nv-qc-go" onClick={() => submit()} disabled={!q.enabled} aria-label="Capture it" haptic="tick">
          <Ico name="arrow" />
        </Interactive>
      </div>
      {q.error && <p className="nv-qc-err" role="alert">{q.error}</p>}
      <CaptureReceipts q={q} />
      {q.links.map((e) => (
        <div key={e.key} className="nv-qc-link" role="status"><Ico name="loop" /><span><b>{e.title}</b><span>{e.sub}</span></span></div>
      ))}
    </section>
  );
}

export function CaptureReceipts({ q }) {
  if (!q.rows.length) return null;
  return (
    <div className="nv-qc-rows">
      {q.rows.map((r) => (
        <div key={r.id} className="nv-qc-item">
          <div className="nv-qc-row">
            <span className="nv-qc-txt">{r.text}</span>
            <TagChip tag={r.tag} onClick={r.onTag} />
            {r.onUndo && <Interactive as="button" type="button" className="nv-qc-undo" onClick={r.onUndo} haptic="tick">Undo</Interactive>}
          </div>
          {r.why && <p className="nv-qc-why" role="alert">{r.why}</p>}
          {r.ask && <AskTaps ask={r.ask} />}
        </div>
      ))}
      <p className="nv-qc-how">{q.unsortedNote || 'Tap a tag to move it somewhere else.'}</p>
      {/* on the page, not in the card: the card's entrance transform would
          otherwise trap a fixed sheet inside it */}
      {q.sheet && typeof document !== 'undefined' && createPortal(<TagSheet s={q.sheet} />, document.body)}
    </div>
  );
}

// A Wishlist add's one open question, as taps: a few up front, the rest
// behind "Show all" (choice overload). The chosen chip answers it in Notion.
function AskTaps({ ask }) {
  const [all, setAll] = useState(false);
  const shown = all ? ask.options : ask.options.slice(0, ask.upFront);
  return (
    <div className="nv-qc-ask" role="group" aria-label={ask.text}>
      <span className="nv-qc-ask-q">{ask.text}</span>
      <div className="nv-qc-ask-opts">
        {shown.map((o) => (
          <Interactive key={o.label} as="button" type="button" className="nv-qc-opt" onClick={o.pick} haptic="tick">{o.label}</Interactive>
        ))}
        {!all && ask.options.length > shown.length && (
          <Interactive as="button" type="button" className="nv-qc-opt more" onClick={() => setAll(true)} haptic="tick">Show all</Interactive>
        )}
      </div>
    </div>
  );
}

function TagChip({ tag, onClick }) {
  const hue = TAG_HUE[tag.tone] || TAG_HUE.quiet;
  return (
    <Interactive as={onClick ? 'button' : 'span'} type={onClick ? 'button' : undefined} onClick={onClick || undefined}
      className={`nv-qc-tag${tag.tone === 'unsorted' ? ' unsorted' : ''}${onClick ? ' movable' : ''}`}
      style={{ '--tag': hue }} haptic={onClick ? 'tick' : undefined} aria-label={onClick ? `${tag.label}. Tap to move it` : tag.label}>
      {tag.label}
    </Interactive>
  );
}

// the move: a 60% scrim behind it (figure/ground), places as a 2-column grid,
// and a detail line that has Nova read it again with his extra words
function TagSheet({ s }) {
  const exit = useExit(s.close);
  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label="Move this capture" onClick={exit.close} className="nv-qc-scrim">
      <section ref={exit.panelRef} data-sheet="" className="nv-liquid nv-liquid-thick nv-sum-sheet nv-qc-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="nv-qc-grab" aria-hidden="true" />
        <h3>Where should this go?</h3>
        <p>{s.where}</p>
        <div className="nv-qc-dest">
          {s.places.map((p) => (
            <Interactive key={p.route} as="button" type="button" className={`nv-qc-place${p.current ? ' current' : ''}`} onClick={p.current ? undefined : p.pick}
              disabled={s.busy} haptic="tick" aria-current={p.current || undefined}>
              <b>{p.label}</b><span>{p.current ? 'it is here now' : p.sub}</span>
            </Interactive>
          ))}
        </div>
        <div className="nv-qc-more">
          <input value={s.detail} onChange={s.setDetail} placeholder="Add more detail, Nova files it again…" aria-label="More detail"
            onKeyDown={(e) => { if (e.key === 'Enter') s.sendDetail(); }} />
          {s.detail.trim() && <Interactive as="button" type="button" className="nv-qc-go" onClick={s.sendDetail} disabled={s.busy} aria-label="File it again" haptic="tick"><Ico name="arrow" /></Interactive>}
        </div>
        {s.error && <p className="nv-qc-err" role="alert">{s.error}</p>}
      </section>
    </div>
  );
}
