import { useEffect, useRef } from 'react';
import { css } from '../css.js';
import { Interactive } from '../Interactive.jsx';
import { ChatMarkdown } from '../ChatMarkdown.jsx';
import { Eyebrow, Chip, Meta, Tag, TextAction, isAppleStyle } from '../Controls.jsx';

// THE BRIEFING — a report Nova researched, read or performed.
//
// The reference is the Iron Man workshop: things appear on the glass AS the
// voice speaks them, the previous ones recede rather than vanish, and there
// is always a sense of the assistant visibly working. Here: the STAGE holds
// the current beat's visual with the last few sliding into a rail beneath;
// the TRANSCRIPT beside it highlights the sentence being spoken and follows
// it; the DOCUMENT is one tap away for reading without audio.

const S = 'var(--nv-font-serif)';
const UI = 'var(--nv-font-ui)';
const M = 'var(--nv-font-mono)';

/* ------------------------------ the glass -------------------------------- */

// One visual on the glass. `term` and `heading` are phase A/B (built from
// the briefing itself); `image` and `clip` arrive in later phases and
// render here too, so the stage's grammar never changes as it grows.
function Glass({ visual, mini = false }) {
  if (!visual) return null;
  const pad = mini ? '10px 12px' : '20px 22px 18px';
  const accent = visual.kind === 'term' ? 'var(--nv-gold)' : 'var(--nv-cy)';
  const frame = {
    position: 'relative', width: '100%', borderRadius: mini ? '10px' : '16px', padding: pad, boxSizing: 'border-box',
    border: `1px solid color-mix(in srgb, ${accent} ${mini ? 22 : 42}%, transparent)`,
    background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 07%, transparent), color-mix(in srgb, var(--nv-void) 92%, black))`,
    boxShadow: mini ? 'none' : `0 0 34px -10px color-mix(in srgb, ${accent} 55%, transparent), 0 24px 60px -28px rgba(0,0,0,.85)`,
    animation: mini ? 'none' : 'popIn .36s cubic-bezier(.2,.9,.25,1)',
    overflow: 'hidden',
  };
  const eyebrow = (t) => <div style={{ font: `600 ${mini ? 7.5 : 8.5}px ${M}`, letterSpacing: '.22em', color: `color-mix(in srgb, ${accent} 85%, transparent)` }}>{t}</div>;

  if (visual.kind === 'title') {
    return (
      <div style={frame}>
        {eyebrow('BRIEFING')}
        <div style={{ marginTop: mini ? '4px' : '10px', font: `400 ${mini ? 14 : 26}px/1.2 ${S}`, color: 'var(--nv-ink)', textWrap: 'balance' }}>{visual.title}</div>
        {!mini && visual.sub && <div style={{ marginTop: '10px', font: `500 8.5px ${M}`, letterSpacing: '.18em', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>{visual.sub.toUpperCase()}</div>}
      </div>
    );
  }
  if (visual.kind === 'term') {
    return (
      <div style={frame}>
        {eyebrow('IN PLAIN WORDS')}
        <div style={{ marginTop: mini ? '3px' : '8px', font: `600 ${mini ? 13 : 22}px/1.15 ${UI}`, color: accent, letterSpacing: '-.01em' }}>{visual.term}</div>
        {!mini && <div style={{ marginTop: '9px', font: `400 14px/1.55 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 86%, transparent)', textWrap: 'pretty' }}>{visual.plain}</div>}
      </div>
    );
  }
  if (visual.kind === 'heading') {
    return (
      <div style={frame}>
        {eyebrow(`PART ${visual.n} OF ${visual.of}`)}
        <div style={{ marginTop: mini ? '3px' : '10px', font: `400 ${mini ? 13 : 24}px/1.2 ${S}`, color: 'var(--nv-ink)', textWrap: 'balance' }}>{visual.heading}</div>
      </div>
    );
  }
  if (visual.kind === 'image') {
    return (
      <div style={{ ...frame, padding: 0 }}>
        <img src={visual.src} alt={visual.alt || ''} style={{ display: 'block', width: '100%', maxHeight: mini ? '90px' : '46vh', objectFit: 'cover' }} />
        {!mini && (visual.caption || visual.credit) && (
          <div style={{ padding: '10px 14px 12px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
            <span style={{ font: `400 12.5px/1.4 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 80%, transparent)' }}>{visual.caption}</span>
            {visual.credit && <span style={{ flex: 'none', font: `500 8px ${M}`, letterSpacing: '.14em', color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{visual.credit.toUpperCase()}</span>}
          </div>
        )}
      </div>
    );
  }
  if (visual.kind === 'clip') {
    // the rail shows the cached poster; the stage shows the embed itself,
    // paused until he taps — a clip that auto-plays over Nova's voice is
    // two things talking at once
    if (mini) {
      return (
        <div style={{ ...frame, padding: 0, aspectRatio: '16 / 9', background: visual.poster ? `center / cover url(${visual.poster})` : 'color-mix(in srgb, var(--nv-void) 92%, black)' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 16px ${UI}`, color: 'white', textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>▶</div>
        </div>
      );
    }
    return (
      <div style={{ ...frame, padding: 0 }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: 'black' }}>
          <iframe title={visual.title || 'clip'} src={visual.embed} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
        </div>
        <div style={{ padding: '10px 14px 12px', display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
          <span style={{ font: `400 12.5px/1.4 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 80%, transparent)' }}>{visual.caption || visual.title}</span>
          {visual.channel && <span style={{ flex: 'none', font: `500 8px ${M}`, letterSpacing: '.14em', color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)' }}>{String(visual.channel).toUpperCase()}</span>}
        </div>
      </div>
    );
  }
  return null;
}

/* ------------------------------ the screen ------------------------------- */

export default function Briefing({ v }) {
  const b = v.briefing;
  const apple = isAppleStyle();
  const mob = v.isMobile;
  const listRef = useRef(null);

  // the transcript follows the voice: the current beat stays in the middle
  // third of the pane, and a beat he tapped is honoured the same way
  useEffect(() => {
    if (!b || b.current < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-beat="${b.current}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [b?.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // a briefing still in flight re-reads itself every few seconds
  useEffect(() => {
    if (!b?.working) return undefined;
    const t = setInterval(() => b.refresh?.(), 4000);
    return () => clearInterval(t);
  }, [b?.working?.stage, b?.working?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b) return null;

  if (b.loading && !b.working && !b.error) {
    return <div style={css("padding:40px 20px;font:400 14px var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 50%, transparent)")}>Opening the briefing…</div>;
  }

  if (b.working) {
    return (
      <div style={css("padding:26px 20px;max-width:640px")}>
        <Eyebrow tone="cyan">Briefing · in progress</Eyebrow>
        <h1 style={{ margin: '10px 0 0', font: `400 ${mob ? 26 : 32}px/1.15 ${S}`, textWrap: 'balance' }}>{b.title}</h1>
        {b.topic && <Meta as="div" tone="faint" style={{ marginTop: '10px', textTransform: 'none', letterSpacing: 0, lineHeight: 1.5 }}>“{b.topic}”</Meta>}
        <div style={css("margin-top:22px;display:flex;align-items:center;gap:12px")}>
          <span style={css("width:8px;height:8px;border-radius:50%;background:var(--nv-cy);box-shadow:0 0 12px var(--nv-cy);animation:novaPulse 1.4s ease-in-out infinite")} />
          <span style={css("font:500 14px var(--nv-font-ui);color:var(--nv-ink)")}>{b.working.line}</span>
        </div>
        {b.working.angles.length > 0 && (
          <div style={css("margin-top:18px;display:flex;flex-direction:column;gap:8px")}>
            <Eyebrow>The angles being researched</Eyebrow>
            {b.working.angles.map((a, i) => (
              <div key={i} style={css("display:flex;gap:10px;align-items:baseline")}>
                <span style={{ flex: 'none', font: `600 11px ${M}`, color: i < b.working.done ? 'var(--nv-good)' : 'color-mix(in srgb, var(--nv-ink) 35%, transparent)' }}>{i < b.working.done ? '✓' : '◍'}</span>
                <span style={css("font:400 13.5px/1.5 var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 82%, transparent)")}>{a}</span>
              </div>
            ))}
          </div>
        )}
        <Meta as="div" tone="faint" style={{ marginTop: '22px', textTransform: 'none', letterSpacing: 0 }}>You will get a notification when it is ready. Nothing here needs you.</Meta>
      </div>
    );
  }

  if (b.error) {
    return (
      <div style={css("padding:26px 20px;max-width:640px")}>
        <Eyebrow tone="warn">Briefing · did not finish</Eyebrow>
        <div style={css("margin-top:12px;font:400 14px/1.6 var(--nv-font-ui);color:color-mix(in srgb, var(--nv-ink) 80%, transparent)")}>{b.error}</div>
        <div style={css("margin-top:16px")}><TextAction onClick={b.close}>Back</TextAction></div>
      </div>
    );
  }

  const listen = b.mode === 'listen';

  const controls = (
    <div style={css(`display:flex;align-items:center;gap:10px;flex-wrap:wrap`)}>
      {b.playing
        ? <Chip tone="accent" active onClick={b.pause}>❚❚ Pause</Chip>
        : b.resume && !b.atEnd
          ? <Chip tone="accent" active onClick={b.resume}>▶ Resume</Chip>
          : <Chip tone="accent" active onClick={b.play}>▶ {b.atEnd ? 'Play again' : 'Play'}</Chip>}
      {b.current >= 0 && !b.atEnd && <TextAction compact tone="faint" onClick={b.restart}>Restart</TextAction>}
      <span style={{ marginLeft: 'auto', font: `500 8.5px ${M}`, letterSpacing: '.16em', color: 'color-mix(in srgb, var(--nv-ink) 45%, transparent)' }}>
        {b.current >= 0 ? `${b.current + 1} / ${b.total}` : `${b.total} BEATS`}
      </span>
    </div>
  );

  const stagePane = (
    <div style={css(`display:flex;flex-direction:column;gap:12px;${mob ? '' : 'position:sticky;top:12px'}`)}>
      {b.stage
        ? <Glass visual={b.stage} />
        : <Glass visual={{ kind: 'title', title: b.title, sub: `${b.sections.length} parts · ${b.sources.length} sources` }} />}
      {b.rail.length > 0 && (
        <div style={css("display:grid;grid-template-columns:repeat(2, minmax(0,1fr));gap:8px;opacity:.72")}>
          {b.rail.slice(0, mob ? 2 : 4).map((vis, i) => <Glass key={i} visual={vis} mini />)}
        </div>
      )}
      {!mob && controls}
    </div>
  );

  const transcript = (
    <div ref={listRef} style={css(`display:flex;flex-direction:column;gap:2px;${mob ? '' : 'max-height:calc(100vh - 200px);overflow-y:auto;padding-right:6px'}`)}>
      {b.beats.map((bt) => (
        <div key={bt.i} data-beat={bt.i}>
          {bt.heading && (
            <Eyebrow as="div" tone={bt.current ? 'cyan' : 'faint'} style={{ marginTop: bt.i === 0 ? 0 : '18px', marginBottom: '6px' }}>{bt.heading}</Eyebrow>
          )}
          <Interactive as="div" onClick={bt.seek} title="Play from here"
            base={{ cursor: 'pointer', padding: '7px 10px', borderRadius: '10px', transition: 'background .25s, color .25s',
              font: `400 ${mob ? 15 : 15.5}px/1.6 ${UI}`, textWrap: 'pretty',
              background: bt.current ? 'color-mix(in srgb, var(--nv-cy) 10%, transparent)' : 'transparent',
              borderLeft: bt.current ? '2px solid var(--nv-cy)' : '2px solid transparent',
              color: bt.current ? 'var(--nv-ink)' : bt.past ? 'color-mix(in srgb, var(--nv-ink) 48%, transparent)' : 'color-mix(in srgb, var(--nv-ink) 72%, transparent)' }}
            hoverStyle={{ background: 'color-mix(in srgb, var(--nv-ink) 05%, transparent)' }}>
            {bt.say}
          </Interactive>
        </div>
      ))}
    </div>
  );

  const document = (
    <div style={css("max-width:680px;display:flex;flex-direction:column;gap:6px")}>
      {b.summary && <p style={{ margin: '0 0 10px', font: `400 ${mob ? 16 : 17}px/1.65 ${UI}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>{b.summary}</p>}
      {b.incomplete && (
        <div style={css("border:1px solid color-mix(in srgb, var(--nv-warn) 40%, transparent);border-radius:10px;padding:10px 14px;font:400 12.5px/1.5 var(--nv-font-ui);color:var(--nv-warn)")}>
          One angle could not be researched and is missing from this report: {b.incomplete.join('; ')}.
        </div>
      )}
      {b.sections.map((s) => (
        <section key={s.i} style={css("margin-top:18px")}>
          <div style={css("display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
            <h2 style={{ margin: 0, font: `400 ${mob ? 22 : 24}px/1.2 ${S}`, textWrap: 'balance' }}>{s.heading}</h2>
            {s.firstBeat >= 0 && <TextAction compact tone="faint" onClick={() => { b.setMode('listen'); b.beats[s.firstBeat]?.seek(); }}>▶ Listen from here</TextAction>}
          </div>
          {s.paras.map((p, i) => (
            <p key={i} style={{ margin: '12px 0 0', font: `400 ${mob ? 15 : 15.5}px/1.75 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 86%, transparent)', textWrap: 'pretty' }}><ChatMarkdown text={p} /></p>
          ))}
        </section>
      ))}
      {b.glossary.length > 0 && (
        <section style={css("margin-top:28px")}>
          <h2 style={{ margin: 0, font: `400 ${mob ? 22 : 24}px/1.2 ${S}` }}>Terms, in plain words</h2>
          <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:10px")}>
            {b.glossary.map((g, i) => (
              <div key={i} style={css("display:flex;gap:12px;align-items:baseline;flex-wrap:wrap")}>
                <Tag tone="gold">{g.term}</Tag>
                <span style={{ flex: 1, minWidth: '200px', font: `400 14px/1.6 ${UI}`, color: 'color-mix(in srgb, var(--nv-ink) 82%, transparent)' }}>{g.plain}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {b.sources.length > 0 && (
        <section style={css("margin-top:28px")}>
          <h2 style={{ margin: 0, font: `400 ${mob ? 22 : 24}px/1.2 ${S}` }}>Sources</h2>
          <div style={css("margin-top:10px;display:flex;flex-direction:column;gap:8px")}>
            {b.sources.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={css("font:400 13.5px/1.5 var(--nv-font-ui);color:var(--nv-cy);text-decoration:none")}>
                <span style={{ font: `500 9px ${M}`, letterSpacing: '.1em', color: 'color-mix(in srgb, var(--nv-ink) 40%, transparent)', marginRight: '10px' }}>{String(i + 1).padStart(2, '0')}</span>{s.title || s.url}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <div style={css(`padding:${mob ? '14px 16px 110px' : '22px 28px 60px'}`)}>
      {/* the head */}
      <div style={css("display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap")}>
        <div style={css("min-width:0;flex:1")}>
          <div style={css("display:flex;align-items:center;gap:10px;flex-wrap:wrap")}>
            <Eyebrow as="span" tone="cyan">Briefing</Eyebrow>
            {b.filed ? <Tag tone="good">In your vault</Tag> : b.file && <Chip tone="quiet" onClick={b.file} title="Files it to Wiki/Sources so every agent can read it">Keep in vault</Chip>}
          </div>
          <h1 style={{ margin: '6px 0 0', font: `400 ${mob ? 26 : 34}px/1.12 ${S}`, textWrap: 'balance', letterSpacing: apple ? '-.01em' : 0 }}>{b.title}</h1>
          {b.topic && <Meta as="div" tone="faint" style={{ marginTop: '8px', textTransform: 'none', letterSpacing: 0, lineHeight: 1.5, maxWidth: '640px' }}>You asked: “{b.topic}”</Meta>}
        </div>
        <TextAction tone="faint" onClick={b.close}>Close</TextAction>
      </div>

      {/* listen / read */}
      <div style={css("margin-top:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
        <Chip tone={listen ? 'accent' : 'quiet'} active={listen} onClick={() => b.setMode('listen')}>Listen</Chip>
        <Chip tone={!listen ? 'accent' : 'quiet'} active={!listen} onClick={() => b.setMode('read')}>Read</Chip>
        {!b.ttsConfigured && listen && <Meta tone="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>Using the browser voice — set up Nova’s voice in Settings for the real thing</Meta>}
      </div>

      {/* the progress line — a thin rule that fills as the briefing plays */}
      {listen && b.current >= 0 && (
        <div style={css("margin-top:12px;height:2px;border-radius:2px;background:color-mix(in srgb, var(--nv-ink) 08%, transparent);overflow:hidden")}>
          <div style={{ width: `${b.progress}%`, height: '100%', background: 'var(--nv-cy)', transition: 'width .5s ease' }} />
        </div>
      )}

      {listen ? (
        mob ? (
          <div style={css("margin-top:14px;display:flex;flex-direction:column;gap:16px")}>
            {stagePane}
            {transcript}
          </div>
        ) : (
          <div style={css("margin-top:18px;display:grid;grid-template-columns:minmax(300px,420px) minmax(0,1fr);gap:28px;align-items:start")}>
            {stagePane}
            {transcript}
          </div>
        )
      ) : (
        <div style={css("margin-top:20px")}>{document}</div>
      )}

      {/* the phone's controls float above the tab bar — thumb reach, always visible */}
      {mob && listen && (
        <div style={css("position:fixed;left:12px;right:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:30;border-radius:16px;padding:10px 14px;background:color-mix(in srgb, var(--nv-bg2) 90%, black);border:1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent);backdrop-filter:blur(14px);box-shadow:0 12px 40px -18px rgba(0,0,0,.8)")}>
          {controls}
        </div>
      )}
    </div>
  );
}
