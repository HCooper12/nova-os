import { useEffect, useRef } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { useDictation } from './useDictation.js';

const M = 'var(--nv-font-mono)';

// VOICE PRESENCE — the conversation's non-visual machinery plus the ONE
// thing that may appear on screen: the transcript pop-up.
//
// His 20-Aug correction, second pass: "I would rather the mini icon itself
// be the ONLY thing displayed when I press that button to communicate with
// it. I don't want this text popping up unless I hold on the Nova icon."
// So the icon is the whole interface — it already lives on screen (the tab
// orb on the phone, the floating core on the Mac) and simply comes alive.
// This component renders NOTHING while a conversation runs, and mounts only
// to drive dictation and the turn-taking loop.
//
// LONG-PRESS the icon and the words appear, as the pop-up panel from his
// reference: floating clear of the bottom edge, dark glass, a lit cyan
// border with an outward glow. Same treatment on both platforms.
// Evidence cards are the exception — a card Nova is referring to appears on
// its own, because that was the whole point of the second reel.
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

  // the mic's true state drives the icon everywhere — App owns it so the
  // orb (which lives in another tree) can colour itself listening-violet
  useEffect(() => { s.reportMic(dict.on); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dict.on]);

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

  // stop the mic when the conversation ends, so the OS gets its session back
  useEffect(() => () => { try { if (dictRef.current.on) dictRef.current.toggle(); } catch { /* already closed */ } }, []);

  const state = dict.on ? 'LISTENING' : s.busy ? 'THINKING' : s.speaking ? 'SPEAKING' : 'YOUR TURN';
  const tone = dict.on ? 'var(--nv-vi)' : s.speaking ? 'var(--nv-gold)' : 'var(--nv-cy)';
  if (!s.textOpen && !s.evidence) return null;

  return (
    <div style={css(`position:fixed;left:0;right:0;bottom:${v.isMobile ? 'calc(96px + env(safe-area-inset-bottom))' : '26px'};z-index:112;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:10px;padding:0 12px`)}>

      {/* the card Nova is referring to, arriving mid-conversation */}
      {s.evidence && (
        <Interactive onClick={s.openEvidence}
          base={css('pointer-events:auto;display:flex;align-items:center;gap:10px;width:min(560px,100%);border:1px solid color-mix(in srgb, var(--nv-cy) 45%, transparent);border-radius:13px;padding:11px 15px;background:color-mix(in srgb, var(--nv-void) 92%, black);box-shadow:0 0 22px -6px color-mix(in srgb, var(--nv-cy) 45%, transparent),0 16px 40px rgba(0,0,0,.55);animation:popIn .3s cubic-bezier(.2,.9,.25,1)')}
          hoverStyle="border-color:var(--nv-cy)">
          <span style={css(`font:600 8.5px ${M};letter-spacing:.16em;color:var(--nv-cy);flex:none`)}>◆ EVIDENCE</span>
          <span style={css('flex:1;min-width:0;font-size:12.5px;color:var(--nv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{s.evidence.label}</span>
          <span style={css('flex:none;color:var(--nv-cy)')}>→</span>
        </Interactive>
      )}

      {/* THE POP-UP — only ever on screen because he asked for it (long-press
          the core). The lit border + outward glow is the reference's look. */}
      {s.textOpen && (
        <div style={css(`pointer-events:auto;width:min(620px,100%);border:1px solid color-mix(in srgb, var(--nv-cy) 55%, transparent);border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 06%, transparent),color-mix(in srgb, var(--nv-void) 94%, black));backdrop-filter:blur(16px);box-shadow:0 0 30px -4px color-mix(in srgb, var(--nv-cy) 50%, transparent),inset 0 1px 0 color-mix(in srgb, var(--nv-cy) 22%, transparent),0 24px 60px rgba(0,0,0,.6);animation:popIn .32s cubic-bezier(.2,.9,.25,1);overflow:hidden`)}>
          <div style={css(`display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);background:color-mix(in srgb, var(--nv-cy) 07%, transparent)`)}>
            <span style={css(`font:600 8.5px ${M};letter-spacing:.22em;color:${tone}`)}>NOVA · {state}</span>
            <span style={css('flex:1')}></span>
            <Interactive as="span" onClick={dict.supported ? () => { v.primeSpeech(); dict.toggle(); } : undefined} aria-label={dict.on ? 'Stop listening' : 'Listen'}
              base={css(`cursor:pointer;flex:none;width:30px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;border:1px solid ${dict.on ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-cy) 25%, transparent)'};background:color-mix(in srgb, var(--nv-cy) ${dict.on ? 20 : 5}%, transparent)`)}
              hoverStyle="background:color-mix(in srgb, var(--nv-cy) 18%, transparent)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--nv-cy)" strokeWidth="2.2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
            </Interactive>
            <Interactive as="span" onClick={s.closeText} aria-label="Hide the transcript"
              base={css(`cursor:pointer;flex:none;font:400 15px/1 ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent);padding:2px 4px`)}
              hoverStyle="color:var(--nv-ink)">×</Interactive>
          </div>
          <div style={css('padding:13px 16px 15px;max-height:38vh;overflow-y:auto')}>
            {s.ask && <div style={css(`font:400 11px ${M};letter-spacing:.04em;color:color-mix(in srgb, var(--nv-ink) 42%, transparent);margin-bottom:7px`)}>» {s.ask}</div>}
            <div style={css('font-size:14px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 94%, transparent)')}>
              {s.reply || s.input || (s.busy ? 'Reading the vault…' : 'Listening — speak, and it appears here.')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
