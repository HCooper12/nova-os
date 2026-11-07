import { useEffect } from 'react';
import '../beliefs.css';
import { Meta, TextAction } from '../Controls.jsx';
import { haptic } from '../haptics.js';

// WHAT NOVA BELIEVES (his approved mockup, Beliefs.dc.html): the large title,
// one line under it, "Worth checking" first, then a group per area. Each row
// is the belief, where it came from and when, a tick and a cross at 44 pt. A
// short list per group, then "Show all N". Built from the settings kit's glass
// card (.nv-set-card), Controls.jsx for every label and action, and only
// --nv-* tokens. The view model is valsSettings.js `beliefs`; the Home card
// (BeliefsHomeCard) reads the same server read.
//
// THE MOTION (keynote-motion §4, one hero): the row that changed is the thing
// that moves. A tick fills its button and draws the tick on a bouncy spring,
// the row holds "Still true" for a beat, then folds out of Worth checking. A
// cross sweeps a strike through the line, says what it did in one sentence
// and offers Undo. Everything else holds still. Reduced motion cuts to the
// state with no sweep or bounce.

const TickMark = () => (
  <svg className="nv-bl-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path className="nv-bl-tick" d="M5.5 12.5l4.2 4.2L18.5 7.5" /></svg>
);
const CrossMark = () => (
  <svg className="nv-bl-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
);
const Go = () => (
  <svg className="nv-bl-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></svg>
);

export function BeliefRow({ r, B, first, i = 0 }) {
  const ph = r.phase;
  const done = ph === 'ticked';
  const crossed = ph === 'crossed' || ph === 'undoing';
  const showReason = r.check && r.reason && !/days old/.test(r.reason);
  const editor = r.editor ? B.editors[r.editor] : null;
  return (
    <div className={`nv-bl-fold${ph === 'leaving' ? ' out' : ''}`}>
      <div className="nv-bl-fi">
        <div className={`nv-bl-row${first ? ' first' : ''}`} data-phase={ph || undefined} style={{ '--i': i }}>
          <div className="nv-bl-txt">
            <div className="nv-bl-t"><span className="nv-bl-strike" data-on={ph === 'crossing' || crossed ? '1' : undefined}>{r.text}</span></div>
            {crossed ? (
              <Meta as="div" style={{ color: 'var(--nv-ink60)' }}>{r.said}</Meta>
            ) : done ? (
              <Meta as="div" style={{ color: 'var(--nv-good)' }}>Still true, checked today</Meta>
            ) : (
              <>
                <Meta as="div" style={{ color: 'var(--nv-ink60)' }}>{r.from}</Meta>
                {showReason ? <Meta as="div" style={{ color: 'var(--nv-gold)' }}>{r.reason}</Meta> : null}
                {!r.check && r.confirmedLabel ? <Meta as="div" style={{ color: 'var(--nv-ink60)' }}>You said it still holds, {r.confirmedLabel}</Meta> : null}
              </>
            )}
            {editor && !crossed && !done ? <div className="nv-bl-link"><TextAction compact onClick={editor.run}>{editor.label}</TextAction></div> : null}
          </div>
          {crossed ? (
            ph === 'undoing' ? null : <div className="nv-bl-undo"><TextAction onClick={() => B.undo(r.id)}>Undo</TextAction></div>
          ) : (
            <div className="nv-bl-btns">
              <button type="button" className={`nv-bl-btn yes${done ? ' on' : ''}`} aria-label="Still true" disabled={!!ph}
                onClick={() => { haptic('tick'); B.tick(r.id); }}><TickMark /></button>
              {r.canCross ? (
                <button type="button" className="nv-bl-btn no" aria-label="Not true any more" disabled={!!ph}
                  onClick={() => { haptic('tick'); B.cross(r.id); }}><CrossMark /></button>
              ) : editor ? (
                <button type="button" className="nv-bl-btn go" aria-label={editor.label} onClick={editor.run}><Go /></button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="nv-set-card nv-bl-card" aria-busy="true" aria-label="Loading what Nova believes">
      {[0, 1, 2].map((k) => (
        <div key={k} className={`nv-bl-row${k === 0 ? ' first' : ''}`}>
          <div className="nv-bl-txt"><span className="nv-set-sk nv-bl-sk" style={{ width: `${86 - k * 14}%` }} /><span className="nv-set-sk nv-bl-sk s" /></div>
        </div>
      ))}
    </div>
  );
}

export function BeliefsPage({ P }) {
  const B = P.beliefs;
  useEffect(() => { if (B.connected) B.load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  let n = 1;
  return (
    <>
      <h1 className="nv-set-lt nv-set-rise" style={{ '--i': 0 }} data-set-hcard="">What Nova believes</h1>
      <p className="nv-bl-sub nv-set-rise" style={{ '--i': 1 }}>What your agents act on right now. Change anything with one tap, and Undo puts it back.</p>
      {!B.connected ? (
        <p className="nv-set-empty">{B.offline ? 'The Mac is offline, so Nova cannot read this right now.' : 'This reads your vault. Connect the Mac and it shows here.'}</p>
      ) : B.error ? (
        <div className="nv-set-card nv-bl-card nv-bl-err" role="alert">
          <div className="nv-bl-t">Could not read what Nova believes. {B.error}</div>
          <TextAction onClick={B.load}>Try again</TextAction>
        </div>
      ) : B.loading ? <Skeleton /> : B.groups.length === 0 ? (
        <p className="nv-set-empty">Nothing yet. As agents learn something about you, or you tell them a rule, it shows here.</p>
      ) : (
        <>
          {B.groups.map((g) => {
            n += 1;
            return (
              <section key={g.key} className="nv-set-card nv-bl-card nv-set-rise" style={{ '--i': n, '--hue': g.hue }} data-bl-group={g.key} aria-label={g.title}>
                <header className="nv-bl-gh">
                  <h2>{g.title}</h2>
                  <Meta>{g.count}</Meta>
                </header>
                {g.items.map((r, k) => <BeliefRow key={r.id} r={r} B={B} first={k === 0} i={k} />)}
              </section>
            );
          })}
          {B.showAllLabel || B.showAll ? (
            <div className="nv-bl-all nv-set-rise" style={{ '--i': n + 1 }}>
              <TextAction onClick={B.toggleAll}>{B.showAll ? 'Show fewer' : B.showAllLabel}</TextAction>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
