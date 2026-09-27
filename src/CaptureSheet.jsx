import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from './Interactive.jsx';
import { LocalInput } from './LocalInput.jsx';
import { useDictation } from './useDictation.js';
import { useExit } from './useExit.js';
import { Ico } from './InboxSumIcons.jsx';

// CAPTURE, FROM THE NOVA BUTTON (27 Sep 2026, mockup 60 #5). Under the
// `summary` style, holding Nova raises this composer from the button over
// whatever is on screen: type or Dictate, then Capture. It is the Inbox's old
// composer, moved: the same capture path (valsInbox submitInboxCapture →
// App.captureToInbox, the outbox when offline), the same dictation hook, and
// Landed under it, so a thought is seen to land where it was dropped.
//
// An aria-modal root with its z-index inline and a backdrop that closes it
// (the back swipe's contract), and its own history entry
// (App.openCaptureSheet), so the back swipe closes it rather than the tab.

export function CaptureSheet({ c }) {
  const exit = useExit(c.close);
  const closeRef = useRef(exit.close);
  useLayoutEffect(() => { closeRef.current = exit.close; });
  const dict = useDictation(() => c.text, (text) => c.setText(text), null);
  const [dictated, setDictated] = useState(false);
  // a fresh field after each capture: a keystroke still in LocalInput's
  // debounce must not come back as the next draft
  const [round, setRound] = useState(0);
  // the keyboard: iOS keeps a fixed panel on the layout viewport, so the
  // composer is lifted by what the visual viewport lost
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const on = () => setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    on();
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const micToggle = () => { if (!dict.on) setDictated(true); dict.toggle(); };
  // `text` arrives from LocalInput on Cmd+Enter (the live value). The button
  // reads the field itself: on iOS a tap on a button does not blur the field,
  // so the debounced copy in App state can be a keystroke behind, and a lost
  // capture is a lost thought.
  const submit = (text) => {
    if (dict.on) dict.toggle();
    const live = typeof text === 'string' ? text : exit.panelRef.current?.querySelector('textarea')?.value;
    if (!String(live ?? c.text ?? '').trim()) return;
    c.submit(dictated ? 'voice' : 'text', typeof live === 'string' ? live : undefined);
    setDictated(false);
    setRound((n) => n + 1);
  };
  const lift = kb > 0 ? { bottom: `${kb + 12}px` } : undefined;

  return (
    <div ref={exit.scrimRef} role="dialog" aria-modal="true" aria-label="Capture" onClick={exit.close}
      style={{ position: 'fixed', inset: 0, zIndex: 145, background: 'color-mix(in srgb, var(--nv-void) 60%, transparent)', animation: 'fadeIn var(--nv-dur-base) var(--nv-ease)' }}>
      <section ref={exit.panelRef} className="nv-liquid nv-liquid-thick nv-sum-sheet nv-sum-ib-cap" style={lift} onClick={(e) => e.stopPropagation()}>
        <p className="nv-sum-stand nv-sum-ib-capstand">Drop the thought, Nova files it.</p>
        <LocalInput
          key={round}
          multiline
          value={c.text}
          onChange={(text) => c.setText(text)}
          submitWhen={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey)}
          onSubmit={submit}
          placeholder={c.placeholder}
          disabled={!c.connected}
          aria-label="The thought"
          className="nv-sum-ib-ta"
        />
        <div className="nv-sum-ib-caprow">
          {dict.supported && (
            <Interactive as="button" className={`nv-sum-ib-chipbtn${dict.on ? ' on' : ''}`} onClick={c.connected ? micToggle : undefined} haptic="tick"
              aria-pressed={dict.on} base={{ cursor: c.connected ? 'pointer' : 'default' }}>
              <Ico name="mic" />{dict.on ? 'Listening, tap to stop' : 'Dictate'}
            </Interactive>
          )}
          <span style={{ flex: 1 }} />
          <Interactive as="button" className="nv-sum-ib-btn" onClick={!c.connected || c.busy ? undefined : () => submit()} haptic="commit"
            aria-disabled={!c.connected || c.busy ? 'true' : undefined} base={{ cursor: !c.connected || c.busy ? 'default' : 'pointer' }}>
            {c.busy ? 'Routing…' : 'Capture'}
          </Interactive>
        </div>
        <p className="nv-sum-ib-caphint">Links, research and videos: say them to Nova.</p>
        {c.landed.rows.length > 0 && (
          <div className="nv-sum-ib-landed">
            <div className="lhead"><span>Landed</span><span>{c.landed.line}</span></div>
            {c.landed.rows.map((h) => (
              <Interactive key={h.id} as="button" className="nv-sum-ib-lr" onClick={h.open} haptic="tick" aria-label={`Open ${h.title}`} base={{ cursor: 'pointer' }}>
                <span className={`mk ${h.status}`} aria-hidden="true"><Ico name={h.status === 'filed' ? 'check' : h.status === 'error' ? 'bang' : 'x'} /></span>
                <span className="ti">{h.title}</span>
                <span className="dest">{h.analysed && h.status === 'filed' ? <em>Analysed · </em> : null}{h.where}</span>
              </Interactive>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
