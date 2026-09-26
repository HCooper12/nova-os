import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Interactive } from '../Interactive.jsx';
import { Pill } from '../AppleLayout.jsx';
import { Button, Eyebrow, Meta, Rail, Tag, TextAction } from '../Controls.jsx';
import { glowPanel } from '../glowPanel.js';
import { useDictation, reportTurnEnd } from '../useDictation.js';
import { Lamp, LampRow } from '../PracticeLamps.jsx';

// PRACTICE — the rehearsal room (design/PRACTICE-PLAN.md).
//
// Him, on his phone, in a quiet moment, trying a sentence out loud against
// someone who pushes back. So the screen is a lit stage in a dark house:
// warm, private, a little theatrical. Three states, one screen:
//
//   THE SHELF    no scene live — his skills on a rail, one opened below it,
//                and the one input that asks Nova to prepare another.
//   THE STAGE    a scene live — the scenario, the cast, one lamp per move he
//                is practising, the dialogue as a script (not bubbles), and
//                the mic at the foot.
//   THE DEBRIEF  the scene ended — the stage stays, the lamps settle (lit
//                with his own words, or dashed with the line he could have
//                used), and "How it went" rises under them.
//
// The lamp (PracticeLamps.jsx) is the signature object and the only
// progress picture: the same one sits on Home and in the history.

const S = 'var(--nv-font-serif)';
const UI = 'var(--nv-font-ui)';

const arrive = (delay = 0) => ({ animation: `nvGlassArrive var(--nv-dur-slow) var(--nv-ease) ${delay}ms both` });
const rise = (i = 0) => ({ animation: `fadeUp var(--nv-dur-base) var(--nv-ease) ${Math.min(i, 7) * 40}ms both` });

const liveDot = (color = 'var(--nv-or)') => (
  <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, marginTop: '0.55em', borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}`, animation: 'novaPulse 2s infinite var(--nv-anim)' }} />
);

const hairline = '1px solid color-mix(in srgb, var(--nv-ink) 08%, transparent)';

function MicGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

// ---------------------------------------------------------------- the shelf

function SkillCard({ s, i }) {
  const lit = s.open ? glowPanel('--nv-or', { animate: false }) : null;
  return (
    <Interactive as="div" onClick={s.select} role="button" aria-expanded={s.open ? 'true' : 'false'} aria-label={`${s.title}${s.open ? ', open' : ''}`}
      className={lit ? `nv-pane ${lit.className}` : 'nv-pane'}
      style={{ animation: `shelfIn var(--nv-dur-slow) var(--nv-ease) ${i * 40}ms both` }}
      base={{ flex: 'none', width: 'min(74vw, 250px)', minWidth: 0, boxSizing: 'border-box', padding: '14px 15px 12px', cursor: 'pointer', scrollSnapAlign: 'start',
        display: 'flex', flexDirection: 'column', gap: '10px', ...(lit ? lit.style : {}) }}
      hoverStyle={{ filter: 'brightness(1.06)' }}>
      <span style={{ font: `400 18px/1.25 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty', overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{s.title}</span>
      <LampRow lamps={s.lamps} size={15} gap={7} />
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
        <Meta tone="faint">{s.last}</Meta>
        {s.statusTag && <Tag tone={s.statusTag === 'landed' ? 'good' : 'faint'}>{s.statusTag}</Tag>}
      </span>
    </Interactive>
  );
}

function Section({ label, children, trailing, delay = 0 }) {
  return (
    <section style={{ marginTop: '22px', ...rise(delay) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', margin: '0 2px 8px' }}>
        <Eyebrow as="span">{label}</Eyebrow>
        {trailing || null}
      </div>
      {children}
    </section>
  );
}

function SkillDetail({ d }) {
  return (
    <div key={d.slug} style={{ marginTop: '18px', ...arrive() }}>
      <div style={{ font: `400 24px/1.2 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>{d.title}</div>
      {d.summary && <p style={{ margin: '8px 0 0', font: `450 14.5px/1.55 ${UI}`, color: 'var(--nv-ink)' }}>{d.summary}</p>}
      {d.why && <p style={{ margin: '8px 0 0', font: `italic 400 15px/1.5 ${S}`, color: 'var(--nv-ink60)', borderLeft: '2px solid color-mix(in srgb, var(--nv-or) 45%, transparent)', paddingLeft: '11px' }}>{d.why}</p>}

      {/* the next scene, as the news line */}
      {d.next && (
        <div className="nv-pane" style={{ marginTop: '16px', padding: '13px 15px', display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', ...glowPanel('--nv-or', { edge: 16, bloom: 38, animate: false }).style }}>
          <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
            {liveDot()}
            <div style={{ minWidth: 0, font: `400 16px/1.45 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>
              Next: <em style={{ color: 'var(--nv-or)' }}>{d.next.scenario}</em>
              {d.next.why ? <span style={{ color: 'var(--nv-ink60)' }}> — {d.next.why}</span> : null}
            </div>
          </div>
          <Pill label="Rehearse" accent="--nv-or" onClick={d.next.rehearse} />
        </div>
      )}
      {d.noScene && (
        <Meta as="div" tone="faint" style={{ marginTop: '12px' }}>No scenario on the page yet, so there is nothing to rehearse. Add one to the page, or ask Nova to prepare the skill again.</Meta>
      )}

      {d.moves.length > 0 && (
        <Section label="Moves" trailing={<Meta tone="faint">{d.moves.filter((m) => m.lit).length} of {d.moves.length} landed</Meta>} delay={1}>
          <div className="nv-pane" style={{ padding: '2px 0', overflow: 'hidden' }}>
            {d.moves.map((m, i) => (
              <div key={m.name} style={{ display: 'flex', gap: '13px', padding: '13px 15px', borderTop: i ? hairline : 'none', ...rise(i) }}>
                <Lamp lit={m.lit} size={24} title={m.name} arrive={false} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ font: `600 15px ${UI}`, color: 'var(--nv-ink)' }}>{m.name}</div>
                  {m.line && <div style={{ marginTop: '5px', font: `400 16.5px/1.4 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>“{m.line.replace(/^["“]|["”]$/g, '')}”</div>}
                  {m.when && <div style={{ marginTop: '5px', font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}><span style={{ color: 'var(--nv-or)', fontWeight: 600 }}>When </span>{m.when}</div>}
                  {m.tell && <div style={{ marginTop: '3px', font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}><span style={{ color: 'var(--nv-or)', fontWeight: 600 }}>Tell </span>{m.tell}</div>}
                  <div style={{ marginTop: '6px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {m.source && <Meta tone="faint" style={{ overflowWrap: 'anywhere' }}>{m.source.replace(/^\[\[|\]\]$/g, '')}</Meta>}
                    <Meta tone={m.lit ? 'var(--nv-or)' : 'faint'}>{m.tally}</Meta>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.scenarios.length > 0 && (
        <Section label="Scenes" delay={2}>
          <div className="nv-pane" style={{ padding: '2px 0', overflow: 'hidden' }}>
            {d.scenarios.map((sc, i) => (
              <div key={sc.name} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '12px 15px', borderTop: i ? hairline : 'none', flexWrap: 'wrap', ...rise(i) }}>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ font: `400 17px/1.3 ${S}`, color: 'var(--nv-ink)' }}>{sc.name}</span>
                    {sc.isNext && <Tag tone="var(--nv-or)">next</Tag>}
                  </div>
                  {sc.setting && <div style={{ marginTop: '3px', font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>{sc.setting}</div>}
                </div>
                <TextAction tone="var(--nv-or)" onClick={sc.rehearse}>Rehearse</TextAction>
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.gaps.length > 0 && (
        <Section label="What would make the feedback surer" delay={3}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 2px' }}>
            {d.gaps.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Meta tone="quiet" style={{ flex: '1 1 220px', minWidth: 0 }}>{g.text}</Meta>
                {g.book && <TextAction compact tone="var(--nv-or)" onClick={d.openLibrary}>Upload the book in Library</TextAction>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {d.sessions.length > 0 && (
        <Section label="Rehearsals" trailing={<Meta tone="faint">{d.sessions.length}</Meta>} delay={4}>
          <div style={{ position: 'relative', paddingLeft: '16px' }}>
            {/* the thread the sessions hang on — history with depth, newest first */}
            <span aria-hidden="true" style={{ position: 'absolute', left: '4px', top: '8px', bottom: '8px', width: '1px', background: 'linear-gradient(180deg, color-mix(in srgb, var(--nv-or) 45%, transparent), transparent)' }} />
            {d.sessions.map((x, i) => (
              <div key={x.key} style={{ position: 'relative', padding: '8px 0 12px', ...rise(i) }}>
                <span aria-hidden="true" style={{ position: 'absolute', left: '-15px', top: '14px', width: '7px', height: '7px', borderRadius: '50%', background: i === 0 ? 'var(--nv-or)' : 'color-mix(in srgb, var(--nv-or) 40%, transparent)' }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px', flexWrap: 'wrap' }}>
                  <Meta tone="faint">{x.date}</Meta>
                  <span style={{ font: `400 15.5px/1.35 ${S}`, color: 'var(--nv-ink)', minWidth: 0 }}>{x.scenario}</span>
                </div>
                <LampRow lamps={x.lamps} size={12} gap={6} style={{ marginTop: '7px' }} />
                {x.work && <div style={{ marginTop: '6px', font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>Work on: {x.work}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '18px', ...rise(5) }}>
        {d.openPage && <TextAction tone="var(--nv-or)" onClick={d.openPage}>Open the page</TextAction>}
        <TextAction tone="faint" onClick={d.toggleStatus}>{d.toggleLabel}</TextAction>
        <TextAction tone="faint" onClick={d.close}>Close</TextAction>
      </div>
    </div>
  );
}

function AddSkill({ add }) {
  return (
    <section className="nv-pane" style={{ marginTop: '30px', padding: '15px 16px' }}>
      <Eyebrow as="div">Add a skill</Eyebrow>
      <p style={{ margin: '6px 0 10px', font: `450 13px/1.5 ${UI}`, color: 'var(--nv-ink60)' }}>
        Say what you want to practise, in your own words. Nova builds the page from your sources; say “research it” and it searches the web too.
      </p>
      <div style={{ display: 'flex', gap: '9px', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <Interactive as="textarea" value={add.value} onChange={add.set} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add.send(); } }}
          placeholder="I love the ideas in chapter 8 of The Next Conversation — I want to practise them"
          base={{ flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box', resize: 'vertical', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', borderRadius: '11px', padding: '10px 13px', color: 'var(--nv-ink)', font: `450 16px/1.45 ${UI}`, outline: 'none' }}
          focusStyle="border-color:color-mix(in srgb, var(--nv-or) 55%, transparent)" />
        <Button tone="var(--nv-or)" onClick={add.busy || !add.value.trim() ? undefined : add.send} disabled={add.busy || !add.value.trim()}>{add.busy ? 'Sending…' : 'Prepare'}</Button>
      </div>
      {add.research && <Meta as="div" tone="var(--nv-or)" style={{ marginTop: '8px' }}>Nova will search the web for this one, and every move from the web carries its link.</Meta>}
    </section>
  );
}

function Shelf({ p }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, font: `400 30px ${S}` }}>Practice</h1>
        <Eyebrow as="span">{p.skillsLabel}</Eyebrow>
      </div>
      {!p.connected && (
        <Meta as="div" tone="faint" style={{ marginTop: '14px' }}>Connect a backend in Settings to open the rehearsal room.</Meta>
      )}

      {p.preparing.map((x) => (
        <div key={x.id} className="nv-pane" style={{ marginTop: '14px', padding: '12px 14px', display: 'flex', gap: '10px', alignItems: 'flex-start', ...arrive() }}>
          {x.error ? <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, marginTop: '0.55em', borderRadius: '50%', background: 'var(--nv-warn)' }} /> : liveDot()}
          <div style={{ minWidth: 0 }}>
            <div style={{ font: `italic 400 16px/1.45 ${S}`, color: 'var(--nv-ink)', overflowWrap: 'anywhere' }}>
              {x.error ? 'Could not put together' : 'Putting together'} “{x.text}”
            </div>
            <Meta tone={x.error ? 'warn' : 'faint'}>{x.error || 'Nova is reading your sources for the moves. The page appears here when it is written.'}</Meta>
          </div>
        </div>
      ))}

      {p.skills.length > 0 ? (
        <Rail gap="12px" ariaLabel="Your skills" style={{ marginTop: '18px', padding: '4px 2px 10px', alignItems: 'stretch' }}>
          {p.skills.map((s, i) => <SkillCard key={s.slug} s={s} i={i} />)}
        </Rail>
      ) : p.connected && !p.preparing.length ? (
        <p style={{ margin: '18px 0 0', font: `400 17px/1.5 ${S}`, color: 'var(--nv-ink60)', textWrap: 'pretty' }}>
          Nothing on the shelf yet. Name a skill below and Nova sets the stage.
        </p>
      ) : null}

      {p.detail && <SkillDetail d={p.detail} />}
      {p.connected && <AddSkill add={p.add} />}
    </>
  );
}

// ---------------------------------------------------------------- the stage

function ScriptLine({ l, i }) {
  const label = l.speaker ? (
    <span style={{ display: 'block', font: `600 11px ${UI}`, letterSpacing: '.1em', textTransform: 'uppercase',
      color: l.who === 'partner' ? 'var(--nv-or)' : l.who === 'nova' ? 'var(--nv-cy)' : 'var(--nv-ink50)' }}>{l.speaker}</span>
  ) : null;
  if (l.who === 'system') {
    return (
      <div style={{ font: `italic 450 13.5px/1.5 ${UI}`, color: 'var(--nv-ink60)', padding: '2px 0', ...rise(0) }}>{l.text}</div>
    );
  }
  const partner = l.who === 'partner' || l.who === 'nova';
  return (
    <div data-i={i} style={{ ...rise(0), ...(l.who === 'you' ? { paddingLeft: '14px', borderLeft: '2px solid color-mix(in srgb, var(--nv-ink) 14%, transparent)' } : {}) }}>
      {label}
      <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...(partner
        ? { font: `400 17px/1.45 ${S}`, color: 'var(--nv-ink)' }
        : { font: `450 15px/1.5 ${UI}`, color: 'var(--nv-ink)' }) }}>
        {l.text}{l.streaming ? <span aria-hidden="true" style={{ color: 'var(--nv-or)', animation: 'dotBlink 1s infinite var(--nv-anim)' }}>▍</span> : null}
      </div>
    </div>
  );
}

// A compact lamp, once the scene is under way: the lamp and its name side by
// side in a 44px row, so three sit on one line at 375 and the dialogue keeps
// the screen. The lamp is the same element, so a move landing now still
// blooms where he is looking.
function StageLampChip({ m }) {
  return (
    <div title={m.quote ? `${m.name} — “${m.quote}”` : m.name}
      style={{ flex: '1 1 0', minWidth: 0, height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 3px' }}>
      <Lamp lit={m.lit} missed={!!m.missed} size={20} title={m.name} arrive={false} />
      {/* two short lines rather than one cut word: "Question of / intent" */}
      <span style={{ minWidth: 0, font: `600 11.5px/1.15 ${UI}`, color: m.lit ? 'var(--nv-ink)' : 'var(--nv-ink60)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', textAlign: 'left' }}>{m.name}</span>
    </div>
  );
}

function StageLamp({ m, i }) {
  return (
    <div style={{ flex: '0 1 96px', minWidth: '84px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '7px', ...rise(i) }}>
      <Lamp lit={m.lit} missed={!!m.missed} size={34} title={m.name} arrive={false} />
      <span style={{ font: `600 12.5px/1.3 ${UI}`, color: m.lit ? 'var(--nv-ink)' : 'var(--nv-ink60)', overflowWrap: 'anywhere' }}>{m.name}</span>
      {m.quote && (
        <span style={{ font: `italic 450 14px/1.4 ${UI}`, color: 'var(--nv-or)', overflowWrap: 'anywhere', animation: 'fadeUp var(--nv-dur-slow) var(--nv-ease) both' }}>“{m.quote}”</span>
      )}
      {m.missed && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', animation: 'fadeUp var(--nv-dur-slow) var(--nv-ease) both' }}>
          {m.missed.instead && <span style={{ font: `400 14px/1.4 ${S}`, color: 'var(--nv-ink)' }}>instead: “{m.missed.instead}”</span>}
          {m.missed.source && <Meta tone="faint" style={{ overflowWrap: 'anywhere' }}>{String(m.missed.source).replace(/^\[\[|\]\]$/g, '')}</Meta>}
        </span>
      )}
    </div>
  );
}

function Stage({ s, v }) {
  // THE SCRIPT FOLLOWS THE SCENE. The room scrolls in the app's own <main>,
  // so the newest line is kept in view by following main's foot — but only
  // while he is already near it: scrolled up to read back, he is left alone.
  const logRef = useRef(null);
  const last = s.script[s.script.length - 1];
  const follow = `${s.script.length}:${last?.text?.length || 0}:${s.waiting ? 1 : 0}:${s.debrief ? 1 : 0}`;
  useEffect(() => {
    const main = logRef.current?.closest('main');
    if (!main) return;
    if (main.scrollHeight - main.scrollTop - main.clientHeight < 420) main.scrollTop = main.scrollHeight;
  }, [follow]);
  // THE BAR IS MEASURED, NOT GUESSED. On a phone the controls float above the
  // dock (fixed, like Voice's composer); the script carries bottom padding of
  // the bar's own height so the last line always clears it, whatever the
  // bar's rows wrap to.
  const barRef = useRef(null);
  const [barH, setBarH] = useState(120);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const read = () => { const h = Math.ceil(el.getBoundingClientRect().height); setBarH((p) => (Math.abs(p - h) > 1 ? h : p)); };
    read();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(read) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [!!s.debrief]); // eslint-disable-line react-hooks/exhaustive-deps
  const [settingOpen, setSettingOpen] = useState(false);
  const inputRef = useRef('');
  inputRef.current = s.input;
  const sendRef = useRef(s.send);
  sendRef.current = s.send;
  const dict = useDictation(
    () => '',
    (text) => { inputRef.current = text; s.setInput(text); },
    // the end of his turn is the send, with the words that came with it
    (said) => { const t = String(said ?? inputRef.current ?? '').trim(); if (t) sendRef.current(t); else v.notifyEmptyListen?.(); },
    {
      holdMs: v.voiceHoldMs,
      leadMs: v.voiceLeadMs,
      onError: (err) => v.dictationError?.(err),
      onTurnEnd: (info) => reportTurnEnd('practice', v.voiceHold, info),
    },
  );
  // this screen owns a microphone: say so, or the wake word fights it for
  // the mic; and the App keeps its own flag for anything that asks
  const setListening = s.setListening;
  useEffect(() => { v.reportScreenMic?.(dict.on); setListening(dict.on); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dict.on]);
  useEffect(() => () => { v.reportScreenMic?.(false); setListening(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mic = () => {
    if (!s.canTalk && !dict.on) return;
    if (!dict.on) v.stopSpeaking?.(); // his turn: the partner stops talking
    dict.toggle();
  };
  const d = s.debrief;

  return (
    <>
      {/* one row: where he is, and the way out */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', minHeight: '32px' }}>
        <Eyebrow as="span" tone="var(--nv-or)">{d ? 'Debrief' : 'On stage'}</Eyebrow>
        {!d && <TextAction compact tone="faint" onClick={s.leave} title="Nothing is filed without a debrief">Leave</TextAction>}
      </div>

      {/* the stage: scenario, cast, setting — the lit part of the dark house.
          Full while the scene is being set and again for the debrief; once
          the partner has opened it gives way to the conversation (the
          conversation is the living part, the head is context). */}
      <section className="nv-pane" style={{ marginTop: '8px', padding: s.compact ? '12px 14px 6px' : '18px 18px 16px', position: 'relative', overflow: 'hidden', ...arrive(),
        background: 'radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--nv-or) 13%, transparent), var(--nv-glass2) 62%)' }}>
        <div style={{ font: `400 ${s.compact ? 20 : 24}px/1.2 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>{s.scenario}</div>
        {s.cast && (
          <Meta as="div" tone="quiet" style={{ marginTop: '5px', ...(s.compact ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}) }}>with {s.cast}</Meta>
        )}
        {s.setting && (s.compact ? (
          <Interactive as="div" onClick={() => setSettingOpen((o) => !o)} role="button" aria-expanded={settingOpen ? 'true' : 'false'}
            aria-label={settingOpen ? 'Collapse the setting' : 'Show the whole setting'}
            base={{ cursor: 'pointer', marginTop: '6px', font: `italic 400 15px/1.4 ${S}`, color: 'var(--nv-ink60)',
              ...(settingOpen ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}
            hoverStyle={{ color: 'var(--nv-ink)' }}>{s.setting}</Interactive>
        ) : (
          <div style={{ marginTop: '9px', font: `italic 400 16px/1.45 ${S}`, color: 'var(--nv-ink60)', textWrap: 'pretty' }}>{s.setting}</div>
        ))}
        {s.lamps.length > 0 && (s.compact ? (
          <>
            <div style={{ marginTop: '8px', borderTop: hairline, display: 'flex', alignItems: 'center', justifyContent: 'space-evenly', gap: '4px' }}>
              {s.lamps.map((m) => <StageLampChip key={m.name} m={m} />)}
            </div>
            {s.latestQuote && (
              <div key={s.latestQuote} style={{ padding: '0 4px 6px', font: `italic 450 13.5px/1.4 ${UI}`, color: 'var(--nv-or)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', animation: 'fadeUp var(--nv-dur-slow) var(--nv-ease) both' }}>“{s.latestQuote}”</div>
            )}
          </>
        ) : (
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: hairline, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-evenly', gap: '14px 8px' }}>
            {s.lamps.map((m, i) => <StageLamp key={m.name} m={m} i={i} />)}
          </div>
        ))}
      </section>

      {/* the script */}
      <div ref={logRef} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0,
        paddingBottom: !d && v.isMobile ? `${barH + 12}px` : 0 }}>
        {s.script.map((l, i) => <ScriptLine key={l.key} l={l} i={i} />)}
        {s.waiting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...rise(0) }} aria-live="polite">
            <span style={{ font: `italic 450 13.5px ${UI}`, color: 'var(--nv-ink60)' }}>{s.starting ? 'Setting the scene' : s.waitingLabel}</span>
            {[0, 0.2, 0.4].map((t) => <span key={t} aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--nv-or)', animation: `dotBlink 1s ${t}s infinite var(--nv-anim)` }} />)}
          </div>
        )}
      </div>

      {/* how it went */}
      {d && (
        <section className="nv-glow" style={{ marginTop: '22px', padding: '18px 18px 16px', ...glowPanel('--nv-or').style }}>
          <Eyebrow as="div" tone="var(--nv-or)">How it went</Eyebrow>
          {d.best && (
            <div style={{ marginTop: '10px', font: `400 22px/1.3 ${S}`, color: 'var(--nv-ink)', textWrap: 'pretty' }}>“{d.best.replace(/^["“]|["”]$/g, '')}”</div>
          )}
          {d.work && (
            <div style={{ marginTop: '14px', display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
              {liveDot()}
              <div style={{ minWidth: 0, font: `400 16px/1.45 ${S}`, color: 'var(--nv-ink)' }}>
                <span style={{ color: 'var(--nv-or)' }}>Work on </span>{d.work}
              </div>
            </div>
          )}
          {(d.landedCount > 0 || d.missedCount > 0) && (
            <Meta as="div" tone="faint" style={{ marginTop: '10px' }}>
              {d.landedCount} landed · {d.missedCount} missed{d.filed ? ' · on the page' : ''}
            </Meta>
          )}
          {!d.parsed && (
            <Meta as="div" tone="warn" style={{ marginTop: '10px' }}>Nova could not write this debrief as a receipt, so nothing was filed. What it said is in the script above.</Meta>
          )}
          {d.notes.map((n, i) => <Meta key={i} as="div" tone="faint" style={{ marginTop: '6px' }}>{n}</Meta>)}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px', marginTop: '16px' }}>
            {d.rehearseNext && <Pill label={`Rehearse ${d.next}`} accent="--nv-or" onClick={d.rehearseNext} />}
            <Pill label="Done" tone="quiet" onClick={d.done} />
          </div>
        </section>
      )}

      {/* the controls — translucent, the script scrolls under them */}
      {!d && (
        <div ref={barRef} className="nv-liquid nv-liquid-thin" style={{ zIndex: 50, display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 10px 4px', ...arrive(80),
          ...(v.isMobile
            ? { position: 'fixed', left: '12px', right: '12px', bottom: 'calc(96px + env(safe-area-inset-bottom))' }
            : { position: 'sticky', bottom: '14px', marginTop: '22px' }) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {dict.supported && (
              <span className="nv-practice-mic" role="button" tabIndex={0} data-on={dict.on ? 'true' : 'false'}
                aria-disabled={!s.canTalk && !dict.on ? 'true' : undefined}
                aria-label={dict.on ? 'Stop — send what you said' : 'Speak your line'}
                onClick={mic} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mic(); } }}>
                <MicGlyph />
              </span>
            )}
            <Interactive as="input" value={s.input} onChange={s.setInput}
              onKeyDown={(e) => { if (e.key === 'Enter' && s.canTalk) s.send(); }}
              placeholder={dict.on ? (dict.hearing ? 'Hearing you…' : 'Listening…') : s.canTalk ? 'Say your line…' : 'Their turn…'}
              base={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: 'var(--nv-well)', border: '1px solid color-mix(in srgb, var(--nv-ink) 12%, transparent)', borderRadius: '12px', padding: '12px 14px', color: 'var(--nv-ink)', font: `450 16px ${UI}`, outline: 'none' }}
              focusStyle="border-color:color-mix(in srgb, var(--nv-or) 55%, transparent)" />
            <Button compact tone="var(--nv-or)" disabled={!s.canTalk || !s.input.trim()} onClick={() => s.send()}>Send</Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <TextAction compact tone="quiet" disabled={!s.canTalk} onClick={s.pause} title="Step out of the scene for one exchange">Pause</TextAction>
            <TextAction compact tone="var(--nv-or)" disabled={s.busy || s.starting} onClick={s.end}>End scene</TextAction>
          </div>
        </div>
      )}
    </>
  );
}

export function Practice({ v }) {
  const p = v.practice;
  return (
    <div style={v.wrapLibrary} data-screen-label="Practice">
      {p.stage ? <Stage s={p.stage} v={v} /> : <Shelf p={p} />}
    </div>
  );
}
