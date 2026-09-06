import { useEffect, useRef, useState } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { ChatMarkdown } from '../ChatMarkdown.jsx';
import { Eyebrow, TextAction, Tag, Meta } from '../Controls.jsx';
// the material pass (6 Sep 2026): labels and controls through Controls.jsx

// THE LEADER — leadership development as a daily practice, not a shelf of
// theory. The day's idea sits at the top exactly as the homepage and the
// brief carry it; below it, the sit-down: he brings struggles and wins, the
// Leader listens, advises from HIS material, and quietly reshapes what the
// coming days' ideas and Saturday's research go looking for.

const S = 'var(--nv-font-serif)';
const UI = 'var(--nv-font-ui)';

// same behaviour as the Coach log: land at the bottom, follow new messages,
// leave him alone when he has scrolled up to read back
function useAutoScrollBottom(len, busy) {
  const ref = useRef(null);
  const firstPaint = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (!firstPaint.current && !atBottom) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstPaint.current ? 'auto' : 'smooth' });
    firstPaint.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [len, busy]);
  return ref;
}

// Each chip carries its age (what the model already sees) and, for a
// struggle, a "mark handled" affordance: tap the chip to reveal it, tap
// HANDLED to resolve — the reflect route files the undoable receipt.
function ChipList({ label, items, color, hint, resolving }) {
  const [open, setOpen] = useState(null);
  if (!items.length) return null;
  return (
    <div style={css('margin-top:12px')}>
      <div style={css('display:flex;justify-content:space-between;align-items:baseline;gap:10px')}>
        <Eyebrow as="span">{label}</Eyebrow>
        {hint && <Meta tone="faint">{hint}</Meta>}
      </div>
      <div style={css('margin-top:7px;display:flex;flex-wrap:wrap;gap:7px')}>
        {items.map((it, i) => {
          const isOpen = open === it.text;
          const busy = resolving === it.text;
          return (
            <span key={i} onClick={it.resolve ? () => setOpen(isOpen ? null : it.text) : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', font: `450 11.5px ${UI}`, padding: '5px 11px', minHeight: '30px', borderRadius: '8px', color, border: `1px solid color-mix(in srgb, ${color} ${isOpen ? 55 : 28}%, transparent)`, background: `color-mix(in srgb, ${color} 06%, transparent)`, lineHeight: 1.4, cursor: it.resolve ? 'pointer' : 'default', opacity: busy ? 0.6 : 1 }}>
              {it.text}
              {it.age && <Meta tone="faint">· {it.age}</Meta>}
              {isOpen && it.resolve && (
                <TextAction compact tone="good" onClick={(e) => { e.stopPropagation(); if (!busy) it.resolve(); }}>{busy ? 'Marking…' : 'Handled'}</TextAction>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function Leader({ v }) {
  const logRef = useAutoScrollBottom(v.leaderMsgs.length, v.leaderBusy);
  return (
    <div style={v.wrapLibrary} data-screen-label="Leader">
      <div style={css('display:flex;align-items:baseline;gap:12px;flex-wrap:wrap')}>
        <h1 style={{ margin: 0, font: `400 30px ${S}` }}>Leader</h1>
        <Eyebrow as="span">Leadership · daily practice</Eyebrow>
        {v.leaderResearchMeta && <Meta tone="faint" style={{ marginLeft: 'auto' }}>{v.leaderResearchMeta}</Meta>}
      </div>

      {/* the day's idea — the same receipt the homepage card and brief read */}
      {v.leaderToday ? (
        <div style={css('margin-top:18px;border:1px solid color-mix(in srgb, var(--nv-gold) 30%, transparent);border-radius:var(--nv-radius);background:color-mix(in srgb, var(--nv-gold) 05%, transparent);padding:18px 20px')}>
          <Eyebrow as="span" tone="gold">{v.leaderToday.chip}</Eyebrow>
          <div style={{ marginTop: '8px', font: `400 24px/1.25 ${S}`, textWrap: 'pretty' }}>{v.leaderToday.title}</div>
          <p style={{ margin: '9px 0 0', font: `450 14px/1.6 ${UI}` }}>{v.leaderToday.line}</p>
          {v.leaderToday.why && <p style={{ margin: '8px 0 0', font: `450 12.5px/1.5 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 55%, transparent)' }}>{v.leaderToday.why}</p>}
          {v.leaderToday.refs.length > 0 && (
            <Meta as="div" tone="faint" style={{ marginTop: '9px', textTransform: 'none', letterSpacing: 0 }}>
              from: {v.leaderToday.refs.join(' · ')}
            </Meta>
          )}
        </div>
      ) : (
        <div style={css('margin-top:18px;border:1px solid color-mix(in srgb, var(--nv-ink) 10%, transparent);border-radius:var(--nv-radius);padding:18px 20px;color:color-mix(in srgb, var(--nv-ink) 50%, transparent);font-size:13px')}>
          {v.leaderConnected ? 'No idea for today yet — it lands each morning before the brief.' : 'Connect a backend in Settings to meet the Leader.'}
        </div>
      )}

      {/* his standing picture — what the ideas and research steer by */}
      <ChipList label="Working against" items={v.leaderProfile.struggles} color="var(--nv-warn)" hint="Tap one to mark it handled" resolving={v.leaderResolving} />
      <ChipList label="Working for him" items={v.leaderProfile.working} color="var(--nv-good, #5aa87c)" />

      {/* the sit-down */}
      <div style={css('margin-top:20px;display:flex;align-items:center;gap:10px')}>
        <Eyebrow as="span">The sit-down</Eyebrow>
        {v.leaderContinuing && (
          <TextAction compact tone="faint" onClick={v.newLeaderChat}>New conversation</TextAction>
        )}
      </div>
      <div ref={logRef} style={css('margin-top:10px;max-height:46vh;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px')}>
        {v.leaderMsgs.length === 0 && !v.leaderBusy && (
          <div style={css('color:color-mix(in srgb, var(--nv-ink) 40%, transparent);font-size:13px;line-height:1.6')}>
            Bring what you're actually facing — a hard conversation, a team that's drifting, something that worked this week.
            What you share here steers tomorrow's idea and Saturday's research.
          </div>
        )}
        {v.leaderMsgs.map((m, i) => (
          <div key={i} style={m.wrapStyle}>
            <div style={m.bubbleStyle}>
              <span style={m.tagStyle}>{m.tag}</span> <ChatMarkdown text={m.text} />
            </div>
          </div>
        ))}
        {v.leaderBusy && <Meta as="div" tone="gold" style={{ textTransform: 'none', letterSpacing: 0 }}>» Leader thinking it through…▍</Meta>}
      </div>
      <div style={css('margin-top:10px;display:flex;gap:9px')}>
        <Interactive as="input" value={v.leaderInput} onChange={v.setLeaderInput} onKeyDown={v.leaderKey}
          placeholder="What are you facing — or what worked?"
          base={{ flex: 1, boxSizing: 'border-box', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', borderRadius: '10px', padding: '11px 14px', color: 'var(--nv-ink)', fontSize: '13px', fontFamily: UI, outline: 'none' }}
          focusStyle="border-color:color-mix(in srgb, var(--nv-gold) 50%, transparent)" />
        <Interactive as="span" onClick={v.sendLeader}
          base={css('cursor:pointer;font:600 12px var(--nv-font-ui);padding:11px 18px;border-radius:10px;background:var(--nv-gold);color:#1a1322;display:flex;align-items:center')}
          hoverStyle="background:color-mix(in srgb, var(--nv-gold) 85%, white)">Send</Interactive>
      </div>

      {/* the trail — this week's ideas, repetition made visible */}
      {v.leaderRecent.length > 0 && (
        <div style={css('margin-top:22px')}>
          <Eyebrow>Recent ideas</Eyebrow>
          <div style={css('margin-top:8px;display:flex;flex-direction:column;gap:6px')}>
            {v.leaderRecent.map((d) => (
              <div key={d.date} style={css('display:flex;gap:10px;align-items:baseline;font-size:12.5px')}>
                <Meta tone="faint" style={{ flex: 'none' }}>{d.date}</Meta>
                <Tag tone="gold" style={{ flex: 'none' }}>{d.chip}</Tag>
                <span style={{ color: 'color-mix(in srgb, var(--nv-ink) 75%, transparent)' }}>{d.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
