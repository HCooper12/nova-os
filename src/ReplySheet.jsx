import { useEffect, useRef } from 'react';
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { LocalInput } from './LocalInput.jsx';
import { useDictation } from './useDictation.js';
import { Eyebrow, TextAction, Button, Meta } from './Controls.jsx';

// REPLY IN PLACE — his ask, 21 Sep 2026.
//
// The doorman's banner asked him a question ("Sir. The Researcher's briefs
// hit a snag… What would you like to tackle first?") and there was nowhere
// to answer it: tapping took him to the Voice screen with the question gone
// and the context with it. His words: "Communication between nova and I must
// be fluid, seamless, responsive and reliable in terms of it knowing all
// context."
//
// So any banner, nudge or report can open THIS: one composer, over whatever
// screen he is on, with the banner's own words held above it. He speaks (the
// mic opens itself when the banner was spoken to him) or types; the reply
// goes to Nova with the banner's full text as the situation, so she carries
// on rather than starting over. "Not now" is not a dismissal: it files a
// reminder for the morning, deterministically, and says so.
//
// It is the composer from design/ORG-CONVERSATION-PLAN.md §4 — the same one
// the Voice screen and the presence bar use, opened over a banner with that
// banner's context pre-loaded. One composer; this is one of its modes.
export function ReplySheet({ v }) {
  const r = v.replyTo;
  const inputRef = useRef('');
  const sendRef = useRef(null);
  sendRef.current = (text) => {
    const t = String(text ?? inputRef.current).trim();
    if (!t) return;
    r.send(t);
  };
  const dict = useDictation(
    () => '',
    (text) => { inputRef.current = text; r.setDraft(text); },
    () => { if (inputRef.current.trim()) sendRef.current(); },
    {
      holdMs: v.voiceHoldMs,
      leadMs: v.voiceLeadMs,
      onError: (err) => v.dictationError?.(err),
    },
  );
  const dictRef = useRef(dict);
  dictRef.current = dict;

  // he was SPOKEN to, so he answers by speaking: the mic opens with the sheet
  // when the banner arrived aloud. Typed banners open quiet, cursor waiting.
  useEffect(() => {
    if (!r?.speak || !dictRef.current.supported || dictRef.current.on) return;
    v.stopSpeaking?.();
    v.primeSpeech?.();
    dictRef.current.toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.key]);
  // the sheet closing takes the mic with it
  useEffect(() => () => { try { if (dictRef.current.on) dictRef.current.toggle(); } catch { /* already closed */ } }, []);

  if (!r) return null;
  const listening = dict.on;
  return (
    <div role="dialog" aria-modal="false" aria-label="Reply to Nova"
      style={css('position:fixed;left:0;right:0;bottom:calc(96px + env(safe-area-inset-bottom));z-index:115;display:flex;justify-content:center;padding:0 12px;pointer-events:none')}>
      <div style={css(`pointer-events:auto;width:min(560px,100%);border-radius:18px;border:1px solid color-mix(in srgb, var(--nv-cy) 34%, transparent);background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 07%, transparent),color-mix(in srgb, var(--nv-void) 90%, transparent));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:inset 0 1px 0 color-mix(in srgb, var(--nv-cy) 24%, transparent),0 0 30px -8px color-mix(in srgb, var(--nv-cy) 40%, transparent),0 24px 60px -20px rgba(0,0,0,.85);animation:nvGlassIn var(--nv-dur-base) var(--nv-ease) both`)}>
        {/* what he is answering — Nova's own words, held in the serif so
            they read as hers and not as a form label */}
        <div style={css('display:flex;align-items:flex-start;gap:10px;padding:12px 14px 10px')}>
          <div style={css('flex:1;min-width:0')}>
            <Eyebrow as="div" tone="cyan">{r.title ? `Replying · ${r.title}` : 'Replying to Nova'}</Eyebrow>
            <div style={{ marginTop: '5px', font: '400 13.5px/1.5 var(--nv-font-serif)', fontStyle: 'italic', color: 'color-mix(in srgb, var(--nv-ink) 88%, transparent)',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</div>
          </div>
          <Interactive as="span" onClick={r.close} aria-label="Close"
            base={css('cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;margin:-6px -6px 0 0;border-radius:50%;font-size:16px;line-height:1;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)')}
            hoverStyle={{ color: 'var(--nv-ink)', background: 'color-mix(in srgb, var(--nv-ink) 08%, transparent)' }}>×</Interactive>
        </div>

        {/* the composer — speak or type, the same two ways in as everywhere */}
        <div style={css('display:flex;align-items:center;gap:8px;padding:0 12px 10px')}>
          <Interactive as="span" onClick={dict.supported ? () => { v.primeSpeech?.(); if (!dict.on) v.stopSpeaking?.(); dict.toggle(); } : undefined}
            aria-label={listening ? 'Stop listening' : 'Speak your reply'}
            base={css(`cursor:${dict.supported ? 'pointer' : 'default'};flex:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid ${listening ? 'var(--nv-vi)' : 'color-mix(in srgb, var(--nv-cy) 30%, transparent)'};background:color-mix(in srgb, ${listening ? 'var(--nv-vi)' : 'var(--nv-cy)'} ${listening ? 22 : 8}%, transparent);opacity:${dict.supported ? 1 : .4}`)}
            hoverStyle={{ background: 'color-mix(in srgb, var(--nv-cy) 18%, transparent)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={listening ? 'var(--nv-vi)' : 'var(--nv-cy)'} strokeWidth="2.2" style={listening ? { animation: 'novaPulse 1.6s infinite var(--nv-anim)' } : undefined}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </Interactive>
          <LocalInput
            value={r.draft || ''}
            onChange={(t) => { inputRef.current = t; r.setDraft(t); }}
            onSubmit={(t) => sendRef.current(t)}
            placeholder={listening ? 'Listening…' : 'Answer here, or just start talking'}
            autoFocus={!r.speak}
            style={css('flex:1;min-width:0;background:var(--nv-well);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);border-radius:999px;padding:11px 14px;color:var(--nv-ink);font:400 15px var(--nv-font-ui);outline:none')}
          />
          <Button onClick={() => sendRef.current()} disabled={r.busy} style={{ flex: 'none' }}>{r.busy ? '…' : 'Send'}</Button>
        </div>

        {/* NOT NOW IS NOT SILENCE. A reminder is filed for the morning, by
            code, and Nova says so — his rule: never drop it silently. */}
        <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:0 14px 12px')}>
          <TextAction compact tone="quiet" onClick={r.notNow}>Not now — remind me tomorrow</TextAction>
          <span style={css('flex:1')} />
          {r.open && <TextAction compact tone="faint" onClick={r.open} style={{ flex: 'none' }}>Open Voice →</TextAction>}
          {r.status && <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>{r.status}</Meta>}
        </div>
      </div>
    </div>
  );
}
