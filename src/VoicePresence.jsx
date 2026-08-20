import { useEffect, useRef } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { NovaCore } from './NovaCore.jsx';
import { useDictation } from './useDictation.js';

const M = 'var(--nv-font-mono)';

// VOICE PRESENCE — his 20-Aug brief, from two reference reels:
//   "the voice icon popping up on the screen when communicating verbally so
//    I know it's talking, while it dynamically pulls up data cards…"
//   "the mini icon showing the same dynamic animation WITHOUT opening a
//    separate text box and interrupting the flow of what I'm currently doing"
//
// So this is deliberately NOT a modal: no backdrop, no page takeover, no
// pointer capture except on the strip itself. The reactor core appears,
// bristling with the voice; the line Nova is saying rides beneath it; and
// evidence cards arrive as chips right there. He keeps working the screen
// he was on. Same component both platforms — it docks bottom-right on the
// Mac and above the tab bar on the phone.
export function VoicePresence({ v }) {
  const s = v.presence;
  const inputRef = useRef('');
  inputRef.current = s.input;
  const sendRef = useRef(s.send);
  sendRef.current = s.send;

  const dict = useDictation(
    () => '',
    (text) => s.setInput(text),
    () => { if (inputRef.current.trim()) sendRef.current(); },
    { continuous: false, onError: (err) => s.onError(err) },
  );
  const dictRef = useRef(dict);
  dictRef.current = dict;

  // turn-taking: Nova finishes speaking → the mic reopens by itself
  useEffect(() => {
    if (s.autoListenTick > 0 && s.conversing && !dictRef.current.on && dictRef.current.supported) {
      v.stopSpeaking();
      dictRef.current.toggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.autoListenTick]);

  // tapping the orb IS the start of the conversation — open the mic on the
  // same gesture iOS requires for both audio and recognition
  useEffect(() => {
    if (s.conversing && dict.supported && !dict.on && !s.busy && !s.reply) dict.toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.conversing]);

  const state = dict.on ? 'LISTENING' : s.busy ? 'THINKING' : s.speaking ? 'SPEAKING' : s.conversing ? 'YOUR TURN' : 'NOVA';
  const line = s.reply || s.input || (s.conversing ? 'Ask me anything.' : '');
  const stop = () => { try { if (dict.on) dict.toggle(); } catch { /* already closed */ } s.end(); };

  return (
    <div style={css(`position:fixed;${v.isMobile ? 'left:10px;right:10px;bottom:calc(84px + env(safe-area-inset-bottom))' : 'right:20px;bottom:20px;width:min(430px,42vw)'};z-index:112;pointer-events:none;display:flex;flex-direction:column;gap:9px;align-items:${v.isMobile ? 'stretch' : 'flex-end'}`)}>

      {/* evidence chips — the cards Nova pulls up as it talks */}
      {s.evidence && (
        <Interactive onClick={s.openEvidence}
          base={css('pointer-events:auto;display:flex;align-items:center;gap:10px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);border-radius:14px;padding:11px 14px;background:color-mix(in srgb, var(--nv-bg2) 92%, black);box-shadow:0 14px 40px rgba(0,0,0,.5);animation:sheetUp .28s cubic-bezier(.32,.72,0,1);max-width:100%')}
          hoverStyle="border-color:var(--nv-cy)">
          <span style={css(`font:600 8.5px ${M};letter-spacing:.16em;color:var(--nv-cy);flex:none`)}>◆ EVIDENCE</span>
          <span style={css('flex:1;min-width:0;font-size:12.5px;color:var(--nv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{s.evidence.label}</span>
          <span style={css('flex:none;color:var(--nv-cy)')}>→</span>
        </Interactive>
      )}

      {/* the presence strip: reactor core + the live line */}
      <div style={css(`pointer-events:auto;display:flex;align-items:center;gap:12px;border:1px solid color-mix(in srgb, var(--nv-cy) ${s.speaking || dict.on ? 45 : 22}%, transparent);border-radius:18px;padding:10px 14px 10px 10px;background:color-mix(in srgb, var(--nv-bg2) 90%, black);backdrop-filter:blur(14px);box-shadow:0 16px 44px rgba(0,0,0,.5);animation:sheetUp .26s cubic-bezier(.32,.72,0,1)`)}>
        <div style={css('flex:none;width:54px;height:54px;position:relative;display:flex;align-items:center;justify-content:center')}>
          <NovaCore size={54} variant="mini" engine="reactor" speaking={s.speaking} listening={dict.on} style={{ pointerEvents: 'none' }} />
        </div>
        <div style={css('flex:1;min-width:0')}>
          <div style={css(`font:600 8.5px ${M};letter-spacing:.22em;color:${dict.on ? 'var(--nv-vi)' : s.speaking ? 'var(--nv-gold)' : 'var(--nv-cy)'}`)}>{state}</div>
          <div style={css('margin-top:3px;font-size:13px;line-height:1.4;color:var(--nv-ink);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden')}>{line}</div>
        </div>
        <Interactive as="span" onClick={dict.supported ? () => dict.toggle() : undefined} aria-label={dict.on ? 'Stop listening' : 'Listen'}
          base={css(`cursor:pointer;flex:none;width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;border:1px solid ${dict.on ? 'var(--nv-cy)' : 'var(--nv-edge)'};background:color-mix(in srgb, var(--nv-cy) ${dict.on ? 20 : 6}%, transparent)`)}
          hoverStyle="background:color-mix(in srgb, var(--nv-cy) 18%, transparent)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--nv-cy)" strokeWidth="2.2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </Interactive>
        <Interactive as="span" onClick={stop} aria-label="Dismiss"
          base={css(`cursor:pointer;flex:none;font:400 17px/1 ${M};color:color-mix(in srgb, var(--nv-ink) 38%, transparent);padding:2px 5px`)}
          hoverStyle="color:var(--nv-ink)">×</Interactive>
      </div>
    </div>
  );
}
