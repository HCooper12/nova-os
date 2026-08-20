import { useEffect, useRef } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { NovaCore } from './NovaCore.jsx';
import { useDictation } from './useDictation.js';
import { VerdictCard } from './VerdictCard.jsx';

const M = 'var(--nv-font-mono)';

// NOVA LIVE — his ask: "I want that mini Nova icon to just automatically
// begin the conversation mode... it should work natively in any area of the
// platform, like Siri works natively in any area of iOS."
//
// So: tapping the orb ANYWHERE opens this sheet and the mic, without
// leaving the screen he's on. Same machinery the Voice screen uses (one-shot
// dictation → askNova → spoken reply → mic reopens), rendered as a compact
// overlay instead of a page. He keeps his context; Nova comes to him.
export function NovaLive({ v }) {
  const s = v.liveTalk;
  const inputRef = useRef('');
  inputRef.current = s.input;
  const sendRef = useRef(s.send);
  sendRef.current = s.send;

  const dict = useDictation(
    () => '',
    (text) => s.setInput(text),
    () => { if (inputRef.current.trim()) sendRef.current(); else s.notifyEmpty(); },
    { continuous: false, onError: (err) => s.onError(err) },
  );
  const dictRef = useRef(dict);
  dictRef.current = dict;

  // the turn-taking tick — identical contract to the Voice screen
  useEffect(() => {
    if (s.autoListenTick > 0 && !s.paused && dictRef.current.supported && !dictRef.current.on) {
      v.stopSpeaking();
      dictRef.current.toggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.autoListenTick]);

  // opening the sheet IS the start of the conversation: open the mic on the
  // same gesture (iOS needs the user gesture for both audio and recognition)
  useEffect(() => {
    if (dict.supported && !dict.on && !s.lastReply && !s.busy) dict.toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = dict.on ? 'LISTENING — PAUSE SENDS'
    : s.busy ? 'THINKING…'
    : s.speaking ? 'SPEAKING'
    : 'YOUR TURN — TAP THE ORB';

  const close = () => { try { if (dict.on) dict.toggle(); } catch { /* already closed */ } s.close(); };

  return (
    <>
      {s.verdict && <VerdictCard v={s.verdict} onClose={s.clearVerdict} onSpeak={v.speakText} />}
      <div style={css('position:fixed;inset:0;z-index:118;background:rgba(4,3,8,.55);backdrop-filter:blur(4px);animation:fadeIn .16s ease-out')} onClick={close}>
        <div onClick={(e) => e.stopPropagation()}
          style={css(`position:absolute;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));border-radius:22px;overflow:hidden;border:1px solid color-mix(in srgb, var(--nv-cy) 30%, transparent);background:color-mix(in srgb, var(--nv-bg2) 94%, black);box-shadow:0 24px 70px rgba(0,0,0,.6);animation:sheetUp .24s cubic-bezier(.32,.72,0,1)`)}>

          <div style={css('display:flex;align-items:center;gap:13px;padding:14px 16px 10px')}>
            <div style={css('flex:none;position:relative;width:52px;height:52px;display:flex;align-items:center;justify-content:center')}>
              <NovaCore size={52} variant="mini" style={{ pointerEvents: 'none' }} />
            </div>
            <div style={css('flex:1;min-width:0')}>
              <div style={css(`font:600 9px ${M};letter-spacing:.22em;color:var(--nv-cy)`)}>{state}</div>
              <div style={css('margin-top:3px;font-size:12.5px;color:var(--nv-ink60);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>
                {s.input || 'Ask me anything — or tell me to do something.'}
              </div>
            </div>
            <Interactive as="span" onClick={close} aria-label="End conversation"
              base={css(`cursor:pointer;flex:none;font:600 9.5px ${M};letter-spacing:.1em;padding:8px 12px;border-radius:9px;border:1px solid color-mix(in srgb, var(--nv-ink) 18%, transparent);color:var(--nv-ink60)`)}
              hoverStyle="color:var(--nv-ink)">DONE</Interactive>
          </div>

          {(s.lastAsk || s.lastReply) && (
            <div style={css('max-height:36vh;overflow-y:auto;padding:4px 16px 12px;display:flex;flex-direction:column;gap:9px')}>
              {s.lastAsk && (
                <div style={css('font-size:13px;line-height:1.5;color:var(--nv-ink60)')}><span style={css(`font:600 9px ${M};letter-spacing:.16em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>YOU  </span>{s.lastAsk}</div>
              )}
              {s.lastReply && (
                <div style={css('font-size:14px;line-height:1.55;color:var(--nv-ink)')}><span style={css(`font:600 9px ${M};letter-spacing:.16em;color:var(--nv-cy)`)}>NOVA  </span>{s.lastReply}</div>
              )}
            </div>
          )}

          {/* the reference card, right where the conversation is — his ask:
              "show me the information it is referring to so we're on the
              same page". Tapping opens the full evidence card. */}
          {s.verdictOffer && (
            <Interactive onClick={s.openVerdict}
              base={css('cursor:pointer;margin:0 16px 12px;border:1px solid color-mix(in srgb, var(--nv-cy) 35%, transparent);border-radius:13px;padding:11px 14px;background:color-mix(in srgb, var(--nv-cy) 08%, transparent);display:flex;align-items:center;gap:11px')}
              hoverStyle="background:color-mix(in srgb, var(--nv-cy) 16%, transparent)">
              <span style={css(`font:600 8.5px ${M};letter-spacing:.16em;color:var(--nv-cy)`)}>◆ EVIDENCE</span>
              <span style={css('flex:1;min-width:0;font-size:12.5px;color:var(--nv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{s.verdictOffer.label}</span>
              <span style={css('flex:none;font-size:14px;color:var(--nv-cy)')}>→</span>
            </Interactive>
          )}

          <div style={css('display:flex;gap:8px;align-items:center;padding:0 16px 14px')}>
            <Interactive as="input" value={s.input} onChange={s.onInput}
              onKeyDown={(e) => { if (e.key === 'Enter' && s.input.trim()) s.send(); }}
              placeholder="…or type it"
              base="flex:1;min-width:0;box-sizing:border-box;background:rgba(0,0,0,.3);border:1px solid var(--nv-edge);border-radius:12px;padding:11px 14px;color:var(--nv-ink);font-size:13px;font-family:var(--nv-font-ui);outline:none"
              focusStyle="border-color:color-mix(in srgb, var(--nv-cy) 55%, transparent)" />
            <Interactive as="span" onClick={() => { if (dict.supported) dict.toggle(); }} aria-label={dict.on ? 'Stop listening' : 'Listen'}
              base={css(`cursor:pointer;flex:none;width:44px;height:44px;border-radius:13px;display:flex;align-items:center;justify-content:center;border:1px solid ${dict.on ? 'var(--nv-cy)' : 'var(--nv-edge)'};background:color-mix(in srgb, var(--nv-cy) ${dict.on ? 20 : 8}%, transparent)`)}
              hoverStyle="background:color-mix(in srgb, var(--nv-cy) 18%, transparent)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--nv-cy)" strokeWidth="2.2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </Interactive>
          </div>
        </div>
      </div>
    </>
  );
}
