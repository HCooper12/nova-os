import { useEffect, useRef } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { useDictation, reportTurnEnd } from './useDictation.js';
import { StageCard } from './StageCard.jsx';
import { railDepth } from './glassDepth.js';
import { SafeVisual } from './SafeVisual.jsx';

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
    () => v.takeVoiceSeed(),
    // the ref is written here too, not only on render, so nothing that runs
    // before the next render can read it empty
    (text) => { inputRef.current = text; s.setInput(text); },
    // the hook hands over the turn's words; they are sent as given (the
    // 25 Sep race: a transcribed turn was read back as empty and dropped)
    (said) => { const t = String(said ?? inputRef.current ?? '').trim(); if (t) sendRef.current(t); },
    // the same app-owned turn as the Voice screen — this is the mic he
    // actually talks into from anywhere in Nova, so it must not cut him off
    {
      holdMs: v.voiceHoldMs,
      leadMs: v.voiceLeadMs,
      onError: (err) => s.onError(err),
      // same receipt as the Voice screen, tagged to the bar so the two mics
      // can be told apart in the log when they misbehave around each other
      onTurnEnd: (info) => reportTurnEnd('presence', v.voiceHold, info),
    },
  );
  const dictRef = useRef(dict);
  dictRef.current = dict;

  // the mic's true state drives the icon everywhere — App owns it so the
  // orb (which lives in another tree) can colour itself listening-violet
  useEffect(() => { s.reportMic(dict.on); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dict.on]);

  // turn-taking: Nova finishes speaking → the mic reopens by itself. Also
  // honours the REPLY WINDOW, so a one-off spoken line (a brief, a greeting)
  // hands him the turn without conversation mode being on.
  useEffect(() => {
    if (s.autoListenTick > 0 && (s.conversing || s.replyWindow) && !dictRef.current.on && dictRef.current.supported) {
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

  const state = dict.hearing ? 'HEARING' : dict.on ? 'LISTENING' : s.busy ? 'THINKING' : s.speaking ? 'SPEAKING' : 'YOUR TURN';
  const tone = dict.on ? 'var(--nv-vi)' : s.speaking ? 'var(--nv-gold)' : 'var(--nv-cy)';
  if (!s.textOpen && !s.evidence && !s.card && !s.glass && !v.speechBlocked) return null;

  return (
    <div style={css(`position:fixed;left:0;right:0;bottom:${v.isMobile ? 'calc(96px + env(safe-area-inset-bottom))' : '26px'};z-index:112;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:10px;padding:0 12px`)}>

      {/* he heard nothing — one tap plays it, from inside the gesture */}
      {v.speechBlocked && (
        <Interactive onClick={v.speechBlocked.replay} aria-label="Play the reply you didn't hear"
          /* GLASS, LIKE EVERY OTHER FLOATING LAYER. This parked over the
             middle of whatever screen was open as a flat near-black box with
             a hard 1px border, while the pop-up directly beneath it in this
             same component was proper glass with a bright inset edge
             (review finding 6). Material carries hierarchy, and a floating
             layer that is not made of the same stuff as its neighbours reads
             as something that got stuck there. The blur also MATERIALISES on
             arrival rather than fading — apple-design §12. */
          base={css(`pointer-events:auto;cursor:pointer;display:flex;align-items:center;gap:9px;width:min(430px,100%);padding:10px 14px;border-radius:14px;border:1px solid color-mix(in srgb, var(--nv-warn) 30%, transparent);background:linear-gradient(180deg,color-mix(in srgb, var(--nv-warn) 07%, transparent),color-mix(in srgb, var(--nv-void) 82%, transparent));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 color-mix(in srgb, var(--nv-warn) 24%, transparent),0 18px 44px -18px rgba(0,0,0,.75);animation:nvGlassIn var(--nv-dur-base) var(--nv-ease) both`)}
          hoverStyle="background:color-mix(in srgb, var(--nv-warn) 14%, transparent)">
          <span style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:var(--nv-warn);flex:none`)}>▶ TAP TO HEAR</span>
          <span style={css('flex:1;min-width:0;font-size:11.5px;color:color-mix(in srgb, var(--nv-ink) 65%, transparent)')}>{v.speechBlocked.message}</span>
          {v.speechBlocked.dismiss && (
            <Interactive as="span" onClick={(e) => { e.stopPropagation(); v.speechBlocked.dismiss(); }} aria-label="Dismiss"
              base={css('cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;min-width:30px;min-height:30px;margin:-6px -6px -6px 0;border-radius:50%;font-size:15px;line-height:1;color:color-mix(in srgb, var(--nv-ink) 38%, transparent)')}
              hoverStyle={{ color: 'var(--nv-ink)', background: 'color-mix(in srgb, var(--nv-ink) 08%, transparent)' }}>×</Interactive>
          )}
        </Interactive>
      )}

      {/* THE GLASS — the figure for the line being spoken, appearing by
          itself and changing as Nova moves to the next line */}
      {s.card && (
        <div style={css('pointer-events:auto;width:min(430px,100%)')}>
          <SafeVisual what="stage-card" resetKey={s.card?.label}><StageCard card={s.card} /></SafeVisual>
        </div>
      )}

      {/* THE GLASS, 9 Sep 2026 — his ask after a Leader answer he could not
          keep up with by ear, with three Iron Man 2 clips as the reference:
          panels that rise WITH the speech, one hero and a strip of spent
          ones. His 20-Aug rule is untouched — these are pictures, not the
          transcript, and the words still only appear on a long-press. */}
      {s.glass && (
        <div style={css('pointer-events:auto;width:min(560px,100%);display:flex;flex-direction:column;gap:7px;max-height:min(52vh,420px);overflow-y:auto;-webkit-overflow-scrolling:touch')}>
          <SafeVisual what="glass" resetKey={s.glass.hero.label}><StageCard card={s.glass.hero} /></SafeVisual>
          {s.glass.rail.length > 0 && (
            <div style={css('display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch')}>
              {s.glass.rail.map((panel, i) => (
                <div key={`${panel.label}:${i}`} style={railDepth(i)}>
                  <StageCard card={panel} size="mini" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* the card Nova is referring to, arriving mid-conversation */}
      {s.evidence && (
        <Interactive onClick={s.openEvidence}
          base={css('pointer-events:auto;display:flex;align-items:center;gap:10px;width:min(560px,100%);border:1px solid color-mix(in srgb, var(--nv-cy) 34%, transparent);border-radius:14px;padding:11px 15px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 06%, transparent),color-mix(in srgb, var(--nv-void) 82%, transparent));backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:inset 0 1px 0 color-mix(in srgb, var(--nv-cy) 22%, transparent),0 0 22px -8px color-mix(in srgb, var(--nv-cy) 40%, transparent),0 18px 44px -18px rgba(0,0,0,.75);animation:nvGlassIn var(--nv-dur-base) var(--nv-ease) both')}
          hoverStyle="border-color:var(--nv-cy)">
          <span style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:var(--nv-cy);flex:none`)}>◆ EVIDENCE</span>
          <span style={css('flex:1;min-width:0;font-size:12.5px;color:var(--nv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{s.evidence.label}</span>
          <span style={css('flex:none;color:var(--nv-cy)')}>→</span>
        </Interactive>
      )}

      {/* THE POP-UP — only ever on screen because he asked for it (long-press
          the core). The lit border + outward glow is the reference's look. */}
      {s.textOpen && (
        <div style={css(`pointer-events:auto;width:min(620px,100%);border:1px solid color-mix(in srgb, var(--nv-cy) 55%, transparent);border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 06%, transparent),color-mix(in srgb, var(--nv-void) 94%, black));backdrop-filter:blur(16px);box-shadow:0 0 30px -4px color-mix(in srgb, var(--nv-cy) 50%, transparent),inset 0 1px 0 color-mix(in srgb, var(--nv-cy) 22%, transparent),0 24px 60px rgba(0,0,0,.6);animation:popIn var(--nv-dur-base) var(--nv-ease);overflow:hidden`)}>
          <div style={css(`display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid color-mix(in srgb, var(--nv-cy) 20%, transparent);background:color-mix(in srgb, var(--nv-cy) 07%, transparent)`)}>
            <span style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track-wide);color:${tone}`)}>NOVA · {state}</span>
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
            {s.ask && <div style={css(`font:var(--nv-micro-l);letter-spacing:.04em;color:color-mix(in srgb, var(--nv-ink) 42%, transparent);margin-bottom:7px`)}>» {s.ask}</div>}
            <div style={css('font-size:14px;line-height:1.55;color:color-mix(in srgb, var(--nv-ink) 94%, transparent)')}>
              {s.reply || s.input || (s.busy ? 'Reading the vault…' : 'Listening — speak, and it appears here.')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
