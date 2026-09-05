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
import { TextAction, Chip, Tag, Meta, isAppleStyle } from '../Controls.jsx';

// THE STATION FRAME STAYS — the bracketed panels and the reticle were his
// explicit ask (20 Aug: "a station, not a chat page"). What changes in the
// material pass (5–6 Sep) is what he READS and TAPS inside the frame: the
// transcript and the composer in the UI face at reading size under the Apple
// styles, and the controls as sentence-case chips and text actions.
// sentence case for a label the view model hands up in caps — the first LETTER
// (a leading glyph like ◈ is left alone) and the product name kept as a name
const cap = (s) => String(s || '').toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase()).replace(/\bnova\b/g, 'Nova');

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
          <span style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-cy) 78%, transparent)`)}>{label}</span>
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
          <span style={css(`font:var(--nv-micro-l);letter-spacing:var(--nv-micro-track);color:var(--nv-acc)`)}>II.</span>
          <span style={css("width:50px;height:1px;background:linear-gradient(90deg,var(--nv-acc-border),transparent)")}></span>
          <span style={css(`font:var(--nv-micro-m);letter-spacing:var(--nv-micro-track-wide);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`)}>NEURAL LINK · VOICE</span>
          <span style={{ font: 'var(--nv-micro-s)', letterSpacing: 'var(--nv-micro-track)', padding: '5px 10px', borderRadius: '7px', border: `1px solid color-mix(in srgb, ${v.voiceBadge.tone} 45%, transparent)`, color: v.voiceBadge.tone, background: `color-mix(in srgb, ${v.voiceBadge.tone} 08%, transparent)` }}>{v.voiceBadge.text}</span>
        </div>
        <div style={css(`font:400 26px ${M};font-variant-numeric:tabular-nums;color:color-mix(in srgb, var(--nv-ink) 85%, transparent)`)}><Clock /></div>
      </div>
      {/* THE GLASS TAKES THE ROOM. His note: the chat beside it is
          distracting when a card pops up — so when Nova puts something on
          the glass, everything else recedes behind a blur, exactly like the
          reel. Click anywhere off the card (or the × on it) to come back. */}
      {v.stageFocus && (
        <div onClick={v.briefQueue ? undefined : v.dismissStage}
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
              {/* During the close, the QUESTION belongs beside its chart. It
                  is spoken, but it also lives in the comms log behind this
                  blur — so a man reading rather than listening had the
                  picture and no idea what he was being asked. */}
              {v.briefQueue?.question ? (
                <div style={css('margin-top:14px')}>
                  <div style={css(`font:var(--nv-micro-s);letter-spacing:.2em;color:var(--nv-acc)`)}>{v.briefQueue.label}</div>
                  <div style={css('margin-top:6px;font-size:14px;line-height:1.5;color:var(--nv-ink)')}>{v.briefQueue.question}</div>
                </div>
              ) : (
                <div style={css('margin-top:12px;text-align:center;font:var(--nv-micro-s);letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)')}>TAP ANYWHERE TO DISMISS</div>
              )}
            </div>
          )}
        </div>
      )}
      <div style={css("flex:1;display:flex;flex-wrap:wrap;gap:28px;align-items:center;justify-content:center;margin-top:10px;overflow-y:auto")}>
        <Panel glow
          label={v.voiceContinuing ? 'COMMS LOG · CONTINUES ACROSS DAYS' : 'COMMS LOG'}
          right={v.voiceContinuing ? (
            <TextAction compact tone="faint" onClick={v.newVoiceChat}>New chat</TextAction>
          ) : null}
          style={{ flex: '1 1 330px', minWidth: '300px', maxWidth: '430px', minHeight: '380px', maxHeight: '600px',
            // ON A PHONE THE TRANSCRIPT GOES LAST. flex-wrap stacks these in
            // source order, which put the log and its text box ABOVE the core
            // — so the first thing on screen during a brief was an input he
            // wasn't using, pushing what Nova was actually saying down the
            // page. order:2 puts the core first and lands the composer at the
            // bottom, where a chat input belongs. Desktop is a real two-column
            // layout and keeps reading left-to-right.
            ...(v.isMobile ? { order: 3 } : {}) }}>
          <div ref={logRef} style={css(`flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:14px;font:${isAppleStyle() ? '400 15px/1.55 var(--nv-font-ui)' : `400 12.5px/1.7 ${M}`}`)}>
            {v.orbMsgs.length === 0 && (
              <div style={css("color:color-mix(in srgb, var(--nv-ink) 35%, transparent)")}>Ask about anything in your vault — training, fuel, notes, the week. Answers come from what's actually written.</div>
            )}
            {v.orbMsgs.map((m, i) => (
              <div key={i} style={css("animation:fadeUp .4s ease-out")}>
                {m.daySep && (
                  <div style={css(`margin:10px 0 8px;text-align:center;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:color-mix(in srgb, var(--nv-ink) 38%, transparent)`)}>— {m.daySep.toUpperCase()} —</div>
                )}
                <span style={m.tagStyle}>{m.tag}</span>{m.time && <span style={css(`margin-left:6px;font:var(--nv-micro-s);color:color-mix(in srgb, var(--nv-ink) 32%, transparent)`)}>{m.time}</span>} <span style={css("color:color-mix(in srgb, var(--nv-ink) 90%, transparent)")}><TypeText text={m.text} active={m.typing} /></span>
                {m.remember && (
                  <TextAction compact tone="gold" onClick={m.remember} title="File this into the vault via the Inbox" style={{ marginLeft: '6px' }}>Remember</TextAction>
                )}
                {m.research?.status === 'queued' && (
                  <Meta as="div" tone="violet" style={{ marginTop: '8px' }}>◇ Queued for tonight — the brief lands in your Inbox by morning</Meta>
                )}
                {m.research?.status === 'running' && (
                  <Meta as="div" tone="violet" style={{ marginTop: '8px', animation: 'dotBlink 2s ease-in-out infinite' }}>◇ Researching — the brief lands here and in your Inbox</Meta>
                )}
                {m.research?.status === 'error' && (
                  <Meta as="div" tone="warn" style={{ marginTop: '8px' }}>Research didn’t complete — {m.research.error || 'check the Inbox'}</Meta>
                )}
                {m.research?.status === 'done' && <SafeVisual what="sources" resetKey={m.at}><SourcesPanel r={m.research} /></SafeVisual>}
                {m.proposal && (
                  <div style={css("margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);border-radius:9px;padding:8px 12px;background:color-mix(in srgb, var(--nv-gold) 05%, transparent)")}>
                    <span style={css(`font:${isAppleStyle() ? '600 13.5px var(--nv-font-ui)' : 'var(--nv-micro-m)'};color:var(--nv-gold)`)}>◈ {m.proposal.title}</span>
                    {m.proposal.status === 'pending' && (
                      <span style={css("display:flex;gap:8px")}>
                        <Chip tone="cyan" active onClick={m.proposal.approve}>Yes, do it</Chip>
                        <TextAction compact tone="quiet" onClick={m.proposal.dismiss}>Leave it</TextAction>
                      </span>
                    )}
                    {m.proposal.status === 'done' && <Meta tone="good">✓ Done — undo in Inbox</Meta>}
                    {m.proposal.status === 'dismissed' && <Meta tone="faint">✕ Dismissed</Meta>}
                    {m.proposal.status === 'error' && <Meta tone="warn">Still pending in Inbox</Meta>}
                  </div>
                )}
                {m.panel && <SafeVisual what={`panel:${m.panel.type}`} resetKey={m.at}><VoicePanel panel={m.panel} /></SafeVisual>}
                {/* The chat started a job instead of answering. Say which lane
                    and why, and offer the one way back — his decision was that
                    routing stays invisible until it matters, which only works
                    if it is unmissable the moment it is wrong. */}
                {m.notice && (
                  <div style={css(`margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 11px;border-radius:9px;border:1px solid color-mix(in srgb, var(--nv-cy) 30%, transparent);background:color-mix(in srgb, var(--nv-cy) 6%, transparent)`)}>
                    <Tag tone="cyan" style={{ flex: 'none' }}>{m.notice.label}</Tag>
                    <span style={css(`flex:1;min-width:0;font:400 ${isAppleStyle() ? '13px' : '11.5px'}/1.4 var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 55%, transparent)`)}>{m.notice.why}</span>
                    <TextAction compact tone="quiet" onClick={m.notice.undo} style={{ flex: 'none' }}>Just answer it</TextAction>
                  </div>
                )}
                {/* the evidence card Nova is referring to, one tap away */}
                {m.evidence && (
                  <Interactive onClick={m.evidence.open}
                    base={css("cursor:pointer;margin-top:9px;display:flex;align-items:center;gap:10px;border:1px solid color-mix(in srgb, var(--nv-cy) 35%, transparent);border-radius:12px;padding:10px 13px;background:color-mix(in srgb, var(--nv-cy) 07%, transparent)")}
                    hoverStyle="background:color-mix(in srgb, var(--nv-cy) 15%, transparent)">
                    <Tag tone="cyan">◆ Evidence</Tag>
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
            {/* Where this will go, before Enter sends it — the one thing worth
                keeping from the command palette. Only shown when the answer is
                not "Ask Nova": a question needs no label, and a chip on every
                keystroke would be noise. */}
            {(() => { const r = v.routePreview?.(v.orbInput); return r && r.lane !== 'ask' ? (
              <Meta title={r.why} tone="cyan" style={{ position: 'absolute', top: '-22px', left: '2px', opacity: .85 }}>→ {cap(r.label)}</Meta>
            ) : null; })()}
            <LocalInput
              value={v.orbInput}
              onChange={(text) => v.setOrbInputValue(text)}
              onSubmit={(text) => v.sendOrb(text)}
              placeholder="Speak or type to Nova…"
              style={css(`flex:1;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:${isAppleStyle() ? '999px' : '9px'};padding:10px 14px;color:var(--nv-ink);font:400 ${isAppleStyle() ? '15px var(--nv-font-ui)' : `12.5px ${M}`};outline:none`)}
            />
            <Interactive as="span" onClick={() => v.sendOrb()} base={`cursor:pointer;display:flex;align-items:center;font:${isAppleStyle() ? '600 15px var(--nv-font-ui)' : 'var(--nv-micro-l)'};padding:0 18px;border-radius:${isAppleStyle() ? '999px' : '9px'};background:var(--nv-cy);color:var(--nv-on-acc)`} hoverStyle="filter:brightness(1.08)">{isAppleStyle() ? 'Send' : 'SEND'}</Interactive>
          </div>
        </Panel>
        <div style={{ flex: '1 1 420px', minWidth: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
          ...(v.isMobile ? { order: 1 } : {}),
          // LIFTING THE CORE ABOVE THE SCRIM IS A DESKTOP-ONLY IDEA.
          // On desktop the focused card sits BESIDE the core, so raising the
          // core above the blur keeps it visible and tappable. On mobile the
          // card is drawn INSIDE the scrim, centred — so the same z-index put
          // the orb, the BRIEF ME / AMBIENT row and everything else in this
          // column directly on top of the card being spotlit. That is both
          // glitches he photographed: buttons printed across the calendar
          // card, and the orb painted through the Coach card's text.
          ...(v.stageFocus && !v.isMobile ? { position: 'relative', zIndex: 61 } : {}) }}>
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
          <div style={css(`font:var(--nv-micro-m);letter-spacing:${isAppleStyle() ? '.14em' : '.42em'};text-align:center;color:${dict.on ? 'var(--nv-vi)' : v.voiceSpeaking ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 60%, transparent)'};transition:color .4s`)}>{caption}</div>

          {/* HE HEARD NOTHING — say so, and make one tap fix it. A tap is a
              gesture, which is exactly what the device wants before it will
              make sound. */}
          {/* THE CLOSE — the live question's answer bar. Pinned on mobile for
              the same reason as everything else here: a control below the
              comms log is a control he cannot reach mid-brief. Spoken "yes"
              / "no" / "later" work too; these are for when he would rather
              not talk. */}
          {v.briefQueue && (
            <div style={css(`display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 14px;border-radius:12px;border:1px solid var(--nv-acc-border);background:${v.isMobile ? 'color-mix(in srgb, var(--nv-void) 95%, black)' : 'var(--nv-acc-bg)'}${v.isMobile ? ';position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:114;box-shadow:0 14px 40px rgba(0,0,0,.6)' : ''}`)}>
              <Meta tone="accent" style={{ flex: 'none' }}>{v.briefQueue.idx}/{v.briefQueue.total}</Meta>
              <Chip tone="cyan" active onClick={() => v.briefQueue.answer('yes')}>Yes</Chip>
              <Chip tone="quiet" onClick={() => v.briefQueue.answer('no')}>No</Chip>
              <TextAction compact tone="faint" onClick={() => v.briefQueue.answer('later')}>Later</TextAction>
              <span style={css('flex:1')}></span>
              <TextAction compact tone="faint" onClick={v.briefQueue.stop}>Stop</TextAction>
            </div>
          )}

          {/* PINNED ON MOBILE. This lived in the layout below the comms log,
              which on a phone is below the fold — the same mistake as the
              stage card: a notice he can only see by scrolling past the
              thing he is waiting on is not a notice. */}
          {v.speechBlocked && (
            <Interactive onClick={v.speechBlocked.replay} aria-label="Play the reply you didn't hear"
              base={css(`cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;border:1px solid color-mix(in srgb, var(--nv-warn) 55%, transparent);background:${v.isMobile ? 'color-mix(in srgb, var(--nv-void) 94%, black)' : 'color-mix(in srgb, var(--nv-warn) 08%, transparent)'};animation:popIn .3s cubic-bezier(.2,.9,.25,1)${v.isMobile ? ';position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:113;box-shadow:0 14px 40px rgba(0,0,0,.6)' : ''}`)}
              hoverStyle="background:color-mix(in srgb, var(--nv-warn) 16%, transparent)">
              <Tag tone="warn" style={{ flex: 'none' }}>▶ Tap to hear</Tag>
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
            <Chip tone={v.ritualInvite.kind === 'morning' ? 'gold' : 'violet'} onClick={() => v.startRitual(v.ritualInvite.kind)}
              title="A guided conversation for this time of day — starts only when you tap" style={{ marginBottom: '10px' }}>
              {cap(v.ritualInvite.label)} — tap to start
            </Chip>
          )}
          <div style={css("display:flex;gap:10px;flex-wrap:wrap;justify-content:center;white-space:nowrap")}>
            <Chip tone="gold" onClick={v.briefMe}>≡ Brief me</Chip>
            {v.voiceLive && (
              <Chip tone="quiet" onClick={v.goAmbient} title="Fullscreen presence — the core, the time, the day's numbers; tap to exit">◐ Ambient</Chip>
            )}
          </div>
        </div>
        <div style={{ width: '246px', flex: 'none', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: '12px',
          font: 'var(--nv-micro-m)', letterSpacing: 'var(--nv-micro-track)',
          // His order, explicitly: the core, then the station status beneath
          // it, then the conversation. Without an order this rail defaulted
          // to 0 and sorted ABOVE the two columns I had numbered — which is
          // how the status panel ended up at the very top of the phone.
          ...(v.isMobile ? { order: 2 } : {}) }}>
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
