import { useRef, useEffect } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { Clock } from '../Clock.jsx';
import { useDictation } from '../useDictation.js';
import { VoicePanel, SourcesPanel } from '../VoicePanels.jsx';
import { TypeText } from '../TypeText.jsx';
import { LocalInput } from '../LocalInput.jsx';
import { VoiceWaveform } from '../VoiceWaveform.jsx';
import { StageCard } from '../StageCard.jsx';
import { SafeVisual } from '../SafeVisual.jsx';

// iOS dictation has no mic tap (SpeechRecognition owns the microphone), so
// its listening indicator stays the state bars; everywhere a real meter
// exists, the waveform draws the actual audio.
const IOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const M = "var(--nv-font-mono)";

// Ask Nova — speak (or type) a question; a read-only session over the real
// vault answers it, and the reply is spoken back (ElevenLabs when the key is
// configured, the browser's own engine otherwise). Demo mode keeps the old
// scripted preview and says so on the banner.

// COMMAND CENTRE (his 20-Aug ask, from the reference reels): the screen
// should read as a station, not a chat page. Every cluster sits in a framed
// panel with corner brackets and a lit header rule; the core sits inside a
// targeting reticle; the transcript carries the same pop-up glow as the
// floating panel. Structure and behaviour are unchanged — this is the frame
// around them.
function Panel({ label, right, children, glow = false, style }) {
  const B = (pos) => (
    <span aria-hidden="true" style={{ position: 'absolute', width: '9px', height: '9px', ...pos, borderColor: 'color-mix(in srgb, var(--nv-cy) 55%, transparent)', borderStyle: 'solid', borderWidth: 0, ...pos.b }} />
  );
  return (
    <div style={{ position: 'relative', border: '1px solid color-mix(in srgb, var(--nv-cy) 18%, transparent)', borderRadius: '12px',
      background: 'linear-gradient(180deg, color-mix(in srgb, var(--nv-cy) 04%, transparent), rgba(0,0,0,.22))',
      boxShadow: glow ? '0 0 26px -8px color-mix(in srgb, var(--nv-cy) 45%, transparent), 0 18px 46px -22px rgba(0,0,0,.8)' : 'none',
      display: 'flex', flexDirection: 'column', minHeight: 0, ...style }}>
      <B pos={{ top: '-1px', left: '-1px', b: { borderTopWidth: '1px', borderLeftWidth: '1px', borderTopLeftRadius: '12px' } }} />
      <B pos={{ top: '-1px', right: '-1px', b: { borderTopWidth: '1px', borderRightWidth: '1px', borderTopRightRadius: '12px' } }} />
      <B pos={{ bottom: '-1px', left: '-1px', b: { borderBottomWidth: '1px', borderLeftWidth: '1px', borderBottomLeftRadius: '12px' } }} />
      <B pos={{ bottom: '-1px', right: '-1px', b: { borderBottomWidth: '1px', borderRightWidth: '1px', borderBottomRightRadius: '12px' } }} />
      {label && (
        <div style={css(`display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid color-mix(in srgb, var(--nv-cy) 14%, transparent)`)}>
          <span style={css(`font:600 8.5px ${M};letter-spacing:.26em;color:color-mix(in srgb, var(--nv-cy) 78%, transparent)`)}>{label}</span>
          <span style={css('flex:1')}></span>
          {right}
        </div>
      )}
      <div style={css('flex:1;min-height:0;display:flex;flex-direction:column;padding:13px 14px')}>{children}</div>
    </div>
  );
}

function RailRow({ label, value, tone, barPct }) {
  return (
    <div>
      <div style={css("display:flex;justify-content:space-between;color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>
        <span style={css('white-space:nowrap')}>{label}</span><span style={{ color: tone || 'color-mix(in srgb, var(--nv-ink) 85%, transparent)', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
      <div style={css("margin-top:6px;height:2px;background:color-mix(in srgb, var(--nv-cy) 14%, transparent)")}>
        <div style={{ width: `${barPct}%`, height: '100%', background: 'var(--nv-cy)', transition: 'width .4s' }}></div>
      </div>
    </div>
  );
}

export function Voice({ v }) {
  const inputRef = useRef('');
  inputRef.current = v.orbInput;
  const sendRef = useRef(v.sendOrb);
  sendRef.current = v.sendOrb;
  const dict = useDictation(
    () => '', // each spoken question starts clean
    (text) => v.setOrbInputValue(text),
    () => { if (inputRef.current.trim()) sendRef.current(); else v.notifyEmptyListen(); }, // recognition end = ask; silence feeds the loop
    {
      continuous: false, // one-shot: silence ends the take (works on iOS)
      onError: (err) => v.dictationError(err),
    },
  );

  // conversation mode: Nova finished speaking → the mic reopens by itself
  const dictRef = useRef(dict);
  dictRef.current = dict;
  // this screen owns its own dictation, so App can't see it — report up, or
  // the wake word would fight this mic for the microphone
  useEffect(() => { v.reportScreenMic?.(dict.on); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dict.on]);
  useEffect(() => () => v.reportScreenMic?.(false), []); // leaving the screen frees it
  useEffect(() => {
    // conversation mode's turn-taking, OR the one-shot reply window that
    // opens whenever Nova finishes speaking — both arrive on the same tick
    if (v.voiceAutoListenTick > 0 && (v.convMode || v.replyListen) && !v.convPaused && dictRef.current.supported && !dictRef.current.on) {
      v.stopSpeaking();
      dictRef.current.toggle();
      v.consumeReplyListen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.voiceAutoListenTick]);

  // The transcript opens where the conversation IS — at the newest line.
  // It continues across days, so landing at the top means scrolling past
  // history every single time. Jumps on mount, animates on new messages,
  // and leaves him alone if he has deliberately scrolled up to read back.
  const logRef = useRef(null);
  const firstPaint = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (!firstPaint.current && !atBottom) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstPaint.current ? 'auto' : 'smooth' });
    firstPaint.current = false;
  }, [v.orbMsgs.length, v.voiceBusy]);

  // one gesture, everything it needs: unlock audio inside the tap (iOS),
  // stop any reply mid-sentence so he can interrupt, and open the mic in
  // conversation mode so the turn comes back to him without another press
  const startTalking = () => {
    v.primeSpeech();
    if (dict.on) { dict.toggle(); return; }
    v.stopSpeaking();
    v.resumeConv();
    if (!v.convMode) v.toggleConvMode(); else dict.toggle();
  };

  // The core is the instrument — it should dominate the station, and take
  // the room the sidebar gives back when it folds away.
  const onGlass = !!v.stageCard;
  const base = v.isMobile ? 244 : (v.showSidebar ? 300 : 372);
  const coreSize = onGlass ? Math.round(base * 0.62) : base;
  const reticle = coreSize + 56;

  const caption = dict.on ? (v.convMode ? 'LISTENING — PAUSE SENDS' : 'LISTENING…')
    : v.voiceBusy ? 'READING THE VAULT…'
    : v.voiceSpeaking ? 'SPEAKING'
    : v.convPaused ? 'PAUSED — TAP THE CORE'
    : v.convMode ? 'CONVERSATION ON — YOUR TURN'
    : v.voiceLive ? (v.wakeWordOn ? 'TAP THE CORE, TYPE, OR SAY “HEY NOVA”' : 'TAP THE CORE OR TYPE') : 'STANDING BY';

  return (
    <div style={v.wrapVoice} data-screen-label="Voice">
      <div style={css("display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px")}>
        <div style={css("display:flex;align-items:center;gap:14px;flex-wrap:wrap")}>
          <span style={css(`font:500 11px ${M};letter-spacing:.14em;color:var(--nv-acc)`)}>II.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css(`font:500 10px ${M};letter-spacing:.32em;color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`)}>NEURAL LINK · VOICE</span>
          <span style={{ font: `500 9px ${M}`, letterSpacing: '.14em', padding: '5px 10px', borderRadius: '7px', border: `1px solid color-mix(in srgb, ${v.voiceBadge.tone} 45%, transparent)`, color: v.voiceBadge.tone, background: `color-mix(in srgb, ${v.voiceBadge.tone} 08%, transparent)` }}>{v.voiceBadge.text}</span>
        </div>
        <div style={css(`font:400 26px ${M};font-variant-numeric:tabular-nums;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)`)}><Clock /></div>
      </div>
      {/* THE GLASS TAKES THE ROOM. His note: the chat beside it is
          distracting when a card pops up — so when Nova puts something on
          the glass, everything else recedes behind a blur, exactly like the
          reel. Click anywhere off the card (or the × on it) to come back. */}
      {v.stageFocus && (
        <div onClick={v.dismissStage}
          style={css('position:fixed;inset:0;z-index:60;background:rgba(4,3,8,.55);backdrop-filter:blur(9px);animation:fadeIn .3s ease-out;display:flex;align-items:center;justify-content:center;padding:24px')}>
          {/* THE CARD MUST BE INSIDE THE SPOTLIGHT.
              The scrim is fixed to the viewport but the card it exists to
              highlight sits in normal flow further down the Voice screen —
              on a phone that is below the fold, so the whole screen blurred
              and spotlighted NOTHING. That is the blank blurred screen he
              recorded and had to tap out of. On mobile the focused card is
              drawn here, in the middle of the scrim, where a spotlight
              belongs; desktop keeps it in the layout where it already fits. */}
          {v.isMobile && v.stageCard && (
            <div onClick={(e) => e.stopPropagation()} style={css('width:min(430px,100%)')}>
              <SafeVisual what="stage-card-focus" resetKey={v.stageCard?.label}>
                <StageCard card={v.stageCard} />
              </SafeVisual>
              <div style={css('margin-top:12px;text-align:center;font:500 9px var(--nv-font-mono);letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)')}>TAP ANYWHERE TO DISMISS</div>
            </div>
          )}
        </div>
      )}
      <div style={css("flex:1;display:flex;flex-wrap:wrap;gap:28px;align-items:center;justify-content:center;margin-top:10px;overflow-y:auto")}>
        <Panel glow
          label={v.voiceContinuing ? 'COMMS LOG · CONTINUES ACROSS DAYS' : 'COMMS LOG'}
          right={v.voiceContinuing ? (
            <Interactive as="span" onClick={v.newVoiceChat} base={`cursor:pointer;font:500 9px ${M};letter-spacing:.1em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`} hoverStyle="color:var(--nv-cy)">NEW CHAT</Interactive>
          ) : null}
          style={{ flex: '1 1 330px', minWidth: '300px', maxWidth: '430px', minHeight: '380px', maxHeight: '600px' }}>
          <div ref={logRef} style={css(`flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:14px;font:400 12.5px/1.7 ${M}`)}>
            {v.orbMsgs.length === 0 && (
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>Ask about anything in your vault — training, fuel, notes, the week. Answers come from what's actually written.</div>
            )}
            {v.orbMsgs.map((m, i) => (
              <div key={i} style={css("animation:fadeUp .4s ease-out")}>
                {m.daySep && (
                  <div style={css(`margin:10px 0 8px;text-align:center;font:500 8.5px ${M};letter-spacing:.14em;color:color-mix(in srgb, var(--nv-ink) 38%, transparent)`)}>— {m.daySep.toUpperCase()} —</div>
                )}
                <span style={m.tagStyle}>{m.tag}</span>{m.time && <span style={css(`margin-left:6px;font:400 8px ${M};color:color-mix(in srgb, var(--nv-ink) 32%, transparent)`)}>{m.time}</span>} <span style={css("color:color-mix(in srgb, var(--nv-ink) 90%, transparent)")}><TypeText text={m.text} active={m.typing} /></span>
                {m.remember && (
                  <Interactive as="span" onClick={m.remember} title="File this into the vault via the Inbox"
                    base={`cursor:pointer;display:inline-block;margin-left:8px;font:500 8px ${M};letter-spacing:.1em;padding:1px 7px;border-radius:5px;border:1px solid color-mix(in srgb, var(--nv-gold) 35%, transparent);color:var(--nv-gold)`}
                    hoverStyle="background:color-mix(in srgb, var(--nv-gold) 08%, transparent)"
                  >REMEMBER</Interactive>
                )}
                {m.research?.status === 'queued' && (
                  <div style={css(`margin-top:8px;font:500 10px ${M};letter-spacing:.1em;color:var(--nv-vi)`)}>◇ QUEUED FOR TONIGHT — THE BRIEF LANDS IN YOUR INBOX BY MORNING</div>
                )}
                {m.research?.status === 'running' && (
                  <div style={css(`margin-top:8px;font:500 10px ${M};letter-spacing:.1em;color:var(--nv-vi);animation:dotBlink 2s ease-in-out infinite`)}>◇ RESEARCHING — THE BRIEF LANDS HERE AND IN YOUR INBOX</div>
                )}
                {m.research?.status === 'error' && (
                  <div style={css(`margin-top:8px;font:500 10px ${M};color:var(--nv-warn)`)}>RESEARCH DIDN’T COMPLETE — {m.research.error || 'check the Inbox'}</div>
                )}
                {m.research?.status === 'done' && <SafeVisual what="sources" resetKey={m.at}><SourcesPanel r={m.research} /></SafeVisual>}
                {m.proposal && (
                  <div style={css("margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);border-radius:9px;padding:8px 12px;background:color-mix(in srgb, var(--nv-gold) 05%, transparent)")}>
                    <span style={css(`font:500 10.5px ${M};color:var(--nv-gold)`)}>◈ {m.proposal.title}</span>
                    {m.proposal.status === 'pending' && (
                      <span style={css("display:flex;gap:8px")}>
                        <Interactive as="span" onClick={m.proposal.approve} base={`cursor:pointer;font:500 9.5px ${M};letter-spacing:.08em;padding:3px 10px;border-radius:6px;background:var(--nv-cy);color:var(--nv-on-acc)`} hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">YES, DO IT</Interactive>
                        <Interactive as="span" onClick={m.proposal.dismiss} base={`cursor:pointer;font:500 9.5px ${M};letter-spacing:.08em;padding:3px 10px;border-radius:6px;border:1px solid color-mix(in srgb, var(--nv-ink) 20%, transparent);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`} hoverStyle="border-color:var(--nv-warn);color:var(--nv-warn)">LEAVE IT</Interactive>
                      </span>
                    )}
                    {m.proposal.status === 'done' && <span style={css(`font:500 9.5px ${M};color:var(--nv-good)`)}>✓ DONE — UNDO IN INBOX</span>}
                    {m.proposal.status === 'dismissed' && <span style={css(`font:500 9.5px ${M};color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>✕ DISMISSED</span>}
                    {m.proposal.status === 'error' && <span style={css(`font:500 9.5px ${M};color:var(--nv-warn)`)}>STILL PENDING IN INBOX</span>}
                  </div>
                )}
                {m.panel && <SafeVisual what={`panel:${m.panel.type}`} resetKey={m.at}><VoicePanel panel={m.panel} /></SafeVisual>}
                {/* the evidence card Nova is referring to, one tap away */}
                {m.evidence && (
                  <Interactive onClick={m.evidence.open}
                    base={css("cursor:pointer;margin-top:9px;display:flex;align-items:center;gap:10px;border:1px solid color-mix(in srgb, var(--nv-cy) 35%, transparent);border-radius:12px;padding:10px 13px;background:color-mix(in srgb, var(--nv-cy) 07%, transparent)")}
                    hoverStyle="background:color-mix(in srgb, var(--nv-cy) 15%, transparent)">
                    <span style={css(`font:600 8.5px ${M};letter-spacing:.16em;color:var(--nv-cy)`)}>◆ EVIDENCE</span>
                    <span style={css("flex:1;min-width:0;font-size:12.5px;color:var(--nv-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{m.evidence.label}</span>
                    <span style={css("flex:none;color:var(--nv-cy)")}>→</span>
                  </Interactive>
                )}
              </div>
            ))}
            {v.voiceBusy && (
              <div style={css("color:var(--nv-cy)")}>» NOVA <span style={css("color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>reading the vault…</span><span style={css("color:var(--nv-cy)")}>▍</span></div>
            )}
          </div>
          <div style={css("display:flex;gap:8px;margin-top:14px")}>
            {/* local echo — see LocalInput.jsx. Enter hands the live text
                straight to sendOrb so nothing can be lost to the debounce;
                dictation still writes in through the value prop. */}
            <LocalInput
              value={v.orbInput}
              onChange={(text) => v.setOrbInputValue(text)}
              onSubmit={(text) => v.sendOrb(text)}
              placeholder="Speak or type to Nova…"
              style={css(`flex:1;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:9px;padding:10px 14px;color:var(--nv-ink);font:400 12.5px ${M};outline:none`)}
            />
            <Interactive as="span" onClick={() => v.sendOrb()} base={`cursor:pointer;display:flex;align-items:center;font:500 11px ${M};padding:0 16px;border-radius:9px;background:var(--nv-cy);color:var(--nv-on-acc)`} hoverStyle="background:color-mix(in srgb, var(--nv-cy) 80%, white)">SEND</Interactive>
          </div>
        </Panel>
        <div style={{ flex: '1 1 420px', minWidth: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
          ...(v.stageFocus ? { position: 'relative', zIndex: 61 } : {}) }}>
          {/* the core in its reticle — a station's centre instrument: two
              counter-rotating rings, a state-lit halo, and tick marks that
              read as calibration rather than decoration */}
          <div style={{ position: 'relative', width: `${reticle}px`, height: `${reticle}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--nv-glow-core)', borderRadius: '50%' }}>
            {/* EVERY decorative ring is pointer-events:none and the core sits
                on its own stacking level. They are absolutely positioned and
                the button was not, so CSS painted them ON TOP and they ate
                every tap — the core looked dead because its clicks never
                reached it. */}
            <div style={css("position:absolute;inset:0;pointer-events:none;border-radius:50%;border:1px dashed color-mix(in srgb, var(--nv-cy) 22%, transparent);animation:ringSpin 44s linear infinite var(--nv-anim)")}></div>
            <div style={{ position: 'absolute', inset: '24px', pointerEvents: 'none', borderRadius: '50%', border: '1px solid color-mix(in srgb, var(--nv-cy) 28%, transparent)', borderTopColor: 'color-mix(in srgb, var(--nv-cy) 85%, transparent)', animation: `ringSpin ${v.voiceBusy ? 3 : 14}s linear infinite reverse var(--nv-anim)` }}></div>
            <div aria-hidden="true" style={{ position: 'absolute', inset: '-14px', pointerEvents: 'none', borderRadius: '50%', border: `1px solid color-mix(in srgb, ${dict.on ? 'var(--nv-vi)' : v.voiceSpeaking ? 'var(--nv-gold)' : 'var(--nv-cy)'} ${dict.on || v.voiceSpeaking ? 40 : 12}%, transparent)`, transition: 'border-color .5s' }}></div>
            {[0, 90, 180, 270].map((deg) => (
              <span key={deg} aria-hidden="true" style={{ position: 'absolute', top: '50%', left: '50%', pointerEvents: 'none', width: '11px', height: '1px', background: 'color-mix(in srgb, var(--nv-cy) 55%, transparent)', transform: `rotate(${deg}deg) translateX(${reticle / 2 + 7}px)` }}></span>
            ))}
            {/* THE CORE IS THE BUTTON (his ask: no ASK BY VOICE / CONVERSATION
                pair, just one thing to press). Tap to start talking, tap
                again to stop. Conversation mode is simply what talking IS
                now — Nova speaks, the mic reopens, a pause sends. */}
            <Interactive onClick={startTalking} aria-label={dict.on ? 'Stop listening' : 'Talk to Nova'}
              title={dict.on ? 'Listening — a pause sends. Tap to stop.' : 'Tap to talk' + (v.wakeWordOn ? ' — or just say “Hey Nova”' : '')}
              base={css('position:relative;z-index:2;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;background:none;border:none;padding:0')}
              activeStyle={{ transform: 'scale(.97)', transition: 'transform .16s cubic-bezier(.32,.72,0,1)' }}>
              <NovaCore size={coreSize} engine={v.coreStyle} speaking={v.voiceSpeaking} listening={dict.on} style={{ pointerEvents: 'none' }} />
            </Interactive>
          </div>
          <div style={css(`font:400 10px ${M};letter-spacing:.42em;color:${dict.on ? 'var(--nv-vi)' : v.voiceSpeaking ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 60%, transparent)'};transition:color .4s`)}>{caption}</div>

          {/* HE HEARD NOTHING — say so, and make one tap fix it. A tap is a
              gesture, which is exactly what the device wants before it will
              make sound. */}
          {/* PINNED ON MOBILE. This lived in the layout below the comms log,
              which on a phone is below the fold — the same mistake as the
              stage card: a notice he can only see by scrolling past the
              thing he is waiting on is not a notice. */}
          {v.speechBlocked && (
            <Interactive onClick={v.speechBlocked.replay} aria-label="Play the reply you didn't hear"
              base={css(`cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;border:1px solid color-mix(in srgb, var(--nv-warn) 55%, transparent);background:${v.isMobile ? 'color-mix(in srgb, var(--nv-void) 94%, black)' : 'color-mix(in srgb, var(--nv-warn) 08%, transparent)'};animation:popIn .3s cubic-bezier(.2,.9,.25,1)${v.isMobile ? ';position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:113;box-shadow:0 14px 40px rgba(0,0,0,.6)' : ''}`)}
              hoverStyle="background:color-mix(in srgb, var(--nv-warn) 16%, transparent)">
              <span style={css(`font:600 9px ${M};letter-spacing:.16em;color:var(--nv-warn);flex:none`)}>▶ TAP TO HEAR</span>
              <span style={css('flex:1;min-width:0;font-size:11.5px;color:color-mix(in srgb, var(--nv-ink) 60%, transparent)')}>{v.speechBlocked.message}</span>
            </Interactive>
          )}

          {/* THE GLASS — the figure for the line being spoken right now,
              centre stage, changing with the narration (his reference:
              "let me put it on the glass"). */}
          {onGlass && !(v.isMobile && v.stageFocus) && (
            <div style={css(`width:min(${v.stageFocus ? 520 : 420}px,100%);position:relative`)}>
              <SafeVisual what="stage-card" resetKey={v.stageCard?.label}><StageCard card={v.stageCard} /></SafeVisual>
              {v.stageFocus && (
                <Interactive as="span" onClick={v.dismissStage} aria-label="Dismiss the card"
                  base={css(`position:absolute;top:8px;right:10px;cursor:pointer;font:400 16px/1 ${M};color:color-mix(in srgb, var(--nv-ink) 35%, transparent);padding:3px 6px`)}
                  hoverStyle="color:var(--nv-ink)">×</Interactive>
              )}
            </div>
          )}
          {/* the REAL waveform wherever a meter exists (Nova speaking via the
              TTS tap on both devices; him dictating on desktop) — motion here
              means sound is genuinely happening. iOS dictation keeps the
              state bars: an indicator, honestly labeled by its uniformity. */}
          {(v.voiceSpeaking || (dict.on && !IOS)) && <VoiceWaveform />}
          {dict.on && IOS && !v.voiceSpeaking && (
            <div style={css("display:flex;gap:3px;align-items:center;height:26px")}>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 80%, transparent);animation:wave 1.1s ease-in-out infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 60%, transparent);animation:wave 1.1s ease-in-out .12s infinite")}></span>
              <span style={css("width:3px;height:22px;background:var(--nv-cy);animation:wave 1.1s ease-in-out .24s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 90%, transparent);animation:wave 1.1s ease-in-out .36s infinite")}></span>
              <span style={css("width:3px;height:22px;background:color-mix(in srgb, var(--nv-cy) 50%, transparent);animation:wave 1.1s ease-in-out .48s infinite")}></span>
            </div>
          )}
          {v.ritualInvite && v.voiceLive && (
            <Interactive as="span" onClick={() => v.startRitual(v.ritualInvite.kind)}
              title="A guided conversation for this time of day — starts only when you tap"
              base={`cursor:pointer;display:inline-block;margin-bottom:10px;font:500 11px ${M};letter-spacing:.06em;padding:10px 18px;border-radius:9px;border:1px solid color-mix(in srgb, ${v.ritualInvite.kind === 'morning' ? 'var(--nv-gold)' : 'var(--nv-vi)'} 45%, transparent);color:${v.ritualInvite.kind === 'morning' ? 'var(--nv-gold)' : 'var(--nv-vi)'};background:color-mix(in srgb, ${v.ritualInvite.kind === 'morning' ? 'var(--nv-gold)' : 'var(--nv-vi)'} 07%, transparent);animation:fadeUp .4s ease-out`}
              hoverStyle={`background:color-mix(in srgb, ${v.ritualInvite.kind === 'morning' ? 'var(--nv-gold)' : 'var(--nv-vi)'} 14%, transparent)`}
            >{v.ritualInvite.label} — TAP TO START</Interactive>
          )}
          <div style={css("display:flex;gap:10px;flex-wrap:wrap;justify-content:center;white-space:nowrap")}>
            <Interactive as="span" onClick={v.briefMe} base={`cursor:pointer;font:500 10.5px ${M};padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);border-radius:8px;color:var(--nv-gold);background:color-mix(in srgb, var(--nv-gold) 06%, transparent)`} hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">☰ BRIEF ME</Interactive>
            {v.voiceLive && (
              <Interactive as="span" onClick={v.goAmbient} title="Fullscreen presence — the core, the time, the day's numbers; tap to exit"
                base={`cursor:pointer;font:500 10.5px ${M};padding:9px 16px;border:1px solid color-mix(in srgb, var(--nv-ink) 16%, transparent);border-radius:8px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent);background:rgba(0,0,0,.25)`}
                hoverStyle="border-color:color-mix(in srgb, var(--nv-cy) 45%, transparent);color:var(--nv-cy)"
              >◐ AMBIENT</Interactive>
            )}
          </div>
        </div>
        <div style={css(`width:246px;flex:none;align-self:stretch;display:flex;flex-direction:column;gap:12px;font:400 10.5px ${M};letter-spacing:.14em`)}>
          <Panel label="STATION · STATUS">
            <div style={css('display:flex;flex-direction:column;gap:15px')}>
              <RailRow label="MIC" value={dict.supported ? (dict.on ? 'LISTENING' : 'READY') : 'NOT AVAILABLE'} tone={dict.on ? 'var(--nv-cy)' : undefined} barPct={dict.on ? 92 : dict.supported ? 12 : 0} />
              <RailRow label="ANSWERS" value={!v.voiceLive ? 'OFFLINE' : v.voiceBusy ? 'THINKING…' : 'VAULT · READ-ONLY'} tone={v.voiceBusy ? 'var(--nv-cy)' : undefined} barPct={v.voiceBusy ? 88 : v.voiceLive ? 46 : 0} />
              <RailRow label="ENGINE" value={v.voiceEngineLabel} tone={v.voiceEngineLabel !== 'BROWSER' && v.voiceEngineLabel !== '—' ? 'var(--nv-cy)' : undefined} barPct={v.voiceSpeaking ? 92 : v.speakOn ? 34 : 0} />
              {v.wakeWordSupported && (
                <RailRow label="“HEY NOVA”" barPct={v.wakeWordOn ? 70 : 0} tone={v.wakeWordOn ? 'var(--nv-cy)' : undefined}
                  value={(
                    <Interactive as="span" onClick={() => v.setWakeWord(!v.wakeWordOn)}
                      aria-label={v.wakeWordOn ? 'Turn the wake word off' : 'Turn the wake word on'}
                      base={{ cursor: 'pointer', font: 'inherit', letterSpacing: 'inherit', color: v.wakeWordOn ? 'var(--nv-cy)' : 'color-mix(in srgb, var(--nv-ink) 85%, transparent)' }}
                      hoverStyle="color:var(--nv-cy);text-decoration:underline">{v.wakeWordOn ? 'ON' : 'OFF'}</Interactive>
                  )} />
              )}
              {v.voiceEngineDetail && (
                <div style={css("font-size:9px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 38%, transparent);letter-spacing:.06em")}>{v.voiceEngineDetail}</div>
              )}
              <div style={css("font-size:9px;line-height:1.6;color:color-mix(in srgb, var(--nv-ink) 32%, transparent);letter-spacing:.06em")}>Voice selection lives in Settings.</div>
            </div>
          </Panel>
          {/* THE GLASS, spent — the figures Nova has already spoken past, stacked
              as history exactly like the reference's side rail */}
          {v.stageHistory?.length > 0 && (
            <Panel label="ON THE GLASS">
              <div style={css('display:flex;flex-direction:column;gap:8px')}>
                {v.stageHistory.map((c, i) => (
                  <Interactive key={i} onClick={() => v.focusCard(c)} aria-label={`Bring “${c.label}” back to the middle`}
                    base={css('cursor:pointer;border-radius:10px;display:block')}
                    hoverStyle="filter:brightness(1.35)">
                    <SafeVisual what="stage-card-mini" resetKey={c?.label}><StageCard card={c} size="mini" /></SafeVisual>
                  </Interactive>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
