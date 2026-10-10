import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TextAction } from '../Controls.jsx';
import { Interactive } from '../Interactive.jsx';
import { NovaCore } from '../NovaCore.jsx';
import { TabIcon } from '../TabIcon.jsx';
import { HAPTIC_WORDS } from '../haptics.js';
import { hours, quietLength, lengthLabel, quietNowLine } from '../settingsModel.js';
import {
  Ico, Tile, Val, NavRow, SwitchRow, MenuRow, SegBlock, ActRow, Group, HeaderCard, Stages, MenuPill, Switch, Seg,
} from './SettingsKit.jsx';
import { Mini, Disc, MaterialPatch } from './SettingsMini.jsx';
import { say, refuse, lightRow } from '../settingsToast.js';
import { PUSH_MS, FADE_MS, reducedMotion } from '../settingsNav.js';

// THE PAGES A ROW OPENS (mockup 72, direction A). Each one opens with a
// header card, holds its settings in groups of rows, and says in words when
// the Mac has not said anything yet. Every value is read off the view model
// (src/vals/valsSettings.js); nothing here makes one up.

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----------------------------------------------------------------- voice --

// THE PAUSE AS A TIMELINE: the chosen wait drawn against five seconds, and
// when it changes the fill runs its real length, so he feels 4.2 s
function Timeline({ seconds }) {
  const fill = useRef(null);
  const first = useRef(true);
  const p = Math.min(1, seconds / 5);
  useLayoutEffect(() => {
    const f = fill.current;
    if (!f) return;
    if (first.current || reduced()) { first.current = false; f.style.transition = 'none'; f.style.transform = `scaleX(${p})`; return; }
    f.style.transition = 'none';
    f.style.transform = 'scaleX(0)';
    void f.offsetWidth;
    f.style.transition = `transform ${seconds}s linear`;
    f.style.transform = `scaleX(${p})`;
  }, [seconds, p]);
  return (
    <div className="nv-set-tl" aria-hidden="true">
      <div className="nv-set-tltrack">
        {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="nv-set-tltick" style={{ left: `${i * 20}%` }} />)}
        <span ref={fill} className="nv-set-tlfill" />
        <span className="nv-set-tlmark" style={{ left: `${p * 100}%` }}>{seconds.toFixed(1)} s</span>
      </div>
      <div className="nv-set-tllab"><span>You stop</span><span>Nova answers</span><span>5 s</span></div>
    </div>
  );
}

export function VoicePage({ P, open }) {
  const V = P.voice;
  return (
    <>
      <HeaderCard tile={<Tile lg icon="wave" hue="var(--nv-cy)" />} title="Voice" text="How Nova speaks to you, and how he hears you." />
      <Group label="Speaking" i={1} foot={V.foot}>
        <SwitchRow k="speak" label="Speak replies" sub={V.speak.sub} on={V.speak.on} onToggle={() => V.speak.toggle()} />
        {V.voicePick && (
          <MenuRow k="voicepick" label="Voice" title={V.voicePick.title} options={V.voicePick.options} value={V.voicePick.value} onPick={V.voicePick.pick} />
        )}
        <SegBlock k="silent" label="When the phone is on silent" sub={V.silent.sub} options={V.silent.options} value={V.silent.value} onPick={V.silent.pick} />
        <SwitchRow k="sfx" label="Sound effects" sub="Ticks and a chime when something is revealed. They play alongside your music." on={V.sfx.on} onToggle={(on) => V.sfx.set(on)} />
      </Group>
      <Group label="Listening" i={2}>
        <SwitchRow k="wake" label="“Hey Nova”" aria="Hey Nova" sub={V.wake.text} on={V.wake.on} disabled={V.wake.disabled} why={V.wake.why}
          onToggle={(on) => { V.wake.set(on); if (on) setTimeout(() => lightRow('barge'), 60); }} />
        <SwitchRow k="barge" label="Talk over Nova" sub={V.barge.sub} on={V.barge.checked} disabled={V.barge.disabled} dim={V.barge.disabled} why={V.barge.why}
          onToggle={(on) => V.barge.set(on)} />
        <SegBlock k="hearing" label="How Nova hears you" sub={V.hearing.sub} options={V.hearing.options} value={V.hearing.value} onPick={V.hearing.pick} />
        {V.hold && (
          <SegBlock k="hold" label="Pause before Nova answers" sub={V.hold.sub} options={V.hold.options} value={V.hold.value} onPick={V.hold.pick}
            after={<Timeline seconds={V.hold.seconds} />} />
        )}
      </Group>
      <Group i={3}>
        <NavRow k="check" tile={<Tile icon="checkc" hue="var(--nv-good)" />} label="Test the voice and the microphone" value={P.rows.check.value} onOpen={() => open('check')} />
      </Group>
    </>
  );
}

// --------------------------------------------------------- notifications --

// QUIET HOURS AS A RING OF THE NIGHT: the 24 hours round a dial, the window
// drawn on it in the night's own hue, and a dot where now is
function QuietRing({ prefs }) {
  const C = 2 * Math.PI * 88;
  const s = hours(prefs?.start) ?? 22;
  const len = quietLength(prefs?.start, prefs?.end) ?? 0;
  const now = new Date();
  const n = now.getHours() + now.getMinutes() / 60;
  const na = (n / 24) * 2 * Math.PI - Math.PI / 2;
  const ticks = [];
  for (let h = 0; h < 24; h += 1) {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    const r1 = h % 6 ? 70 : 66;
    ticks.push(<line key={h} x1={(107 + r1 * Math.cos(a)).toFixed(1)} y1={(107 + r1 * Math.sin(a)).toFixed(1)} x2={(107 + 75 * Math.cos(a)).toFixed(1)} y2={(107 + 75 * Math.sin(a)).toFixed(1)}
      stroke="var(--nv-ink)" strokeOpacity={h % 6 ? 0.18 : 0.4} strokeWidth="1.5" strokeLinecap="round" />);
  }
  const labs = [[0, '00'], [6, '06'], [12, '12'], [18, '18']].map(([h, t]) => {
    const a = (h / 24) * 2 * Math.PI - Math.PI / 2;
    return <text key={t} x={(107 + 55 * Math.cos(a)).toFixed(1)} y={(107 + 55 * Math.sin(a) + 4).toFixed(1)} textAnchor="middle" fill="var(--nv-ink60)" style={{ font: '600 12px var(--s-round)' }}>{t}</text>;
  });
  return (
    <div className="nv-set-qring">
      <div className={`nv-set-qwrap${prefs?.enabled ? '' : ' off'}`}>
        <svg viewBox="0 0 214 214" role="img" aria-label={prefs?.enabled ? `Quiet from ${prefs.start} to ${prefs.end}, ${lengthLabel(len)}` : 'Quiet hours are off'}>
          <circle cx="107" cy="107" r="88" fill="none" stroke="var(--nv-ink)" strokeOpacity=".08" strokeWidth="16" />
          {ticks}{labs}
          <circle className="nv-set-qarc" cx="107" cy="107" r="88" fill="none" stroke="var(--s-night)" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={`${((len / 24) * C).toFixed(1)} ${C.toFixed(1)}`}
            style={{ transform: `rotate(${(s / 24) * 360 - 90}deg)`, filter: 'drop-shadow(0 0 7px color-mix(in srgb, var(--s-night) 60%, transparent))' }} />
          <circle cx={(107 + 88 * Math.cos(na)).toFixed(1)} cy={(107 + 88 * Math.sin(na)).toFixed(1)} r="6" fill="var(--s-acc)" stroke="var(--nv-void)" strokeWidth="2.5" />
        </svg>
        <div className="nv-set-qc"><b>{lengthLabel(len)}</b><span>quiet</span></div>
      </div>
      <p className="nv-set-qnow"><i /><span>{quietNowLine(prefs, now)}</span></p>
    </div>
  );
}

export function NotifPage({ P }) {
  const N = P.notif;
  const Q = N.quiet;
  const q = Q.prefs;
  return (
    <>
      <HeaderCard tile={<Tile lg icon="bell" hue="var(--nv-ink60)" />} title="Notifications" text="Nova pushes to this phone and your Watch when something needs your call." />
      <Group i={1}>
        <SwitchRow k="push" label="Allow notifications" sub={N.push.sub} on={N.push.on} disabled={N.push.disabled} why={N.push.why} onToggle={() => N.push.enable()} />
        {N.test && <ActRow label="Send a test"><TextAction onClick={N.test}>Send</TextAction></ActRow>}
      </Group>
      <Group label="Quiet hours" k="quiet" i={2}
        foot={q ? `A push inside the window waits on the Mac, a test too, and the test says when it will arrive.${Q.stale && P.staleAt ? ` Offline: as the Mac last said it, at ${P.staleAt}.` : ''}` : ''}>
        {Q.error ? (
          <ActRow label="Quiet hours" sub="Could not read them from the Mac."><TextAction onClick={Q.retry}>Try again</TextAction></ActRow>
        ) : Q.loading || !q ? (
          <ActRow label="Quiet hours" sub={Q.loading ? '' : 'Quiet hours live on the Mac. Connect it to set them.'}>{Q.loading ? <span className="nv-set-sk" role="img" aria-label="Loading" /> : null}</ActRow>
        ) : (
          <>
            <SwitchRow k="quietsw" label="Quiet hours" sub={q.enabled ? `Pushes wait on the Mac and arrive together at ${q.end}.` : 'Every push arrives when it happens.'}
              on={q.enabled} disabled={Q.locked || Q.busy} why={Q.busy ? 'Saving the last change' : Q.why} onToggle={(on) => Q.set({ enabled: on })} />
            <div className="nv-set-blk"><QuietRing prefs={q} /></div>
            <MenuRow k="qs" label="From" title="Quiet from" options={Q.times} value={q.start} onPick={(t) => Q.set({ start: t })} locked={Q.locked} why={Q.why} />
            <MenuRow k="qe" label="To" title="Quiet until" options={Q.times} value={q.end} onPick={(t) => Q.set({ end: t })} locked={Q.locked} why={Q.why} />
          </>
        )}
      </Group>
    </>
  );
}

// ------------------------------------------------------------ appearance --

// THE PREVIEWS ARRIVE AFTER THE PAGE DOES (9 Oct 2026, motion step 2). The
// push used to mount four live miniatures of his Home and three NovaCore
// canvases in the same frame the slide began: 44 to 75 ms at 4x CPU, most
// of it this page's own render and the layout it forced. The page now slides
// in with same-size empty frames where they go, and they mount once the
// slide has landed, one group a frame (the large preview, then the style
// thumbnails, then the cores), each fading in. Nothing moves when they do:
// every frame is held at its final size from the start.
const PREVIEW_STAGES = 3;
function useStaged(stages = PREVIEW_STAGES) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    let raf = 0;
    const step = (n) => {
      setStage(n);
      if (n < stages) raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => step(n + 1)); });
    };
    const t = setTimeout(() => step(1), (reducedMotion() ? FADE_MS : PUSH_MS) + 40);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [stages]);
  return stage;
}

export function AppearancePage({ P }) {
  const A = P.app;
  const look = A.look;
  const stage = useStaged();
  return (
    <>
      <HeaderCard tile={<Tile lg className={`disc nv-set-d-${look.theme}`}><span /></Tile>} title="Appearance" text={`How Nova looks on this ${P.isMobile ? 'phone' : 'Mac'}. Your other devices keep their own.`} />
      <div className="nv-set-pvw nv-set-rise" style={{ '--i': 1 }}>
        {stage >= 1 ? <span className="nv-set-later"><Mini look={look} k={0.86} label={`Your Home as ${A.name}`} /></span> : <span className="nvm-wrap" style={{ '--k': 0.86 }} aria-hidden="true" />}
        <p className="nv-set-cap">Your Home, as it would look (demo)</p>
      </div>
      <Group label="Style" k="style" i={2}>
        <div className="nv-set-thumbs">
          {A.styles.map((s) => (
            <button key={s.value} type="button" className="nv-set-pick nv-set-thumb" aria-pressed={s.on}
              onClick={() => { if (s.on) return; const back = A.fallsBack(s.value); s.pick(); if (back) say('Daylight and Sky are drawn for the Apple styles, so the theme is Command again'); }}>
              {stage >= 2 ? <span className="nv-set-later"><Mini look={{ ...look, style: s.value }} k={0.34} /></span> : <span className="nvm-wrap" style={{ '--k': 0.34 }} aria-hidden="true" />}
              <span className="nv-set-tn">{s.label}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group label="Theme" k="theme" i={3}>
        <div className="nv-set-discs">
          {A.themes.map((t) => (
            <button key={t.value} type="button" className="nv-set-pick" aria-pressed={t.on} aria-disabled={t.disabled ? 'true' : undefined}
              onClick={(e) => { if (t.disabled) { refuse(e.currentTarget, A.themeSub); return; } if (!t.on) t.pick(); }}>
              <Disc theme={t.value} />
              <span className="nv-set-tn">{t.label}</span>
            </button>
          ))}
        </div>
        {A.themeSub ? <p className="nv-set-rs" style={{ margin: 0, padding: '0 14px 14px' }}>{A.themeSub}</p> : null}
      </Group>
      <Group label="Material" k="mat" i={4}>
        <div className="nv-set-mats">
          {A.materials.map((m) => (
            <button key={m.value} type="button" className="nv-set-pick" aria-pressed={m.on && !m.disabled} aria-disabled={m.disabled ? 'true' : undefined}
              onClick={(e) => { if (m.disabled) { refuse(e.currentTarget, A.materialSub); return; } if (!m.on) m.pick(); }}>
              <MaterialPatch theme={look.theme} material={m.value} />
              <span className="nv-set-tn">{m.label}</span>
            </button>
          ))}
        </div>
        {A.materialSub ? <p className="nv-set-rs" style={{ margin: 0, padding: '0 14px 14px' }}>{A.materialSub}</p> : null}
      </Group>
      <Group label="Nova core" k="core" i={5}>
        <div className="nv-set-cores">
          {A.cores.map((c) => (
            <button key={c.value} type="button" className="nv-set-pick" aria-pressed={c.on} onClick={() => { if (!c.on) c.pick(); }}>
              <span className="nv-set-cbox">{stage >= 3 && <span className="nv-set-later"><NovaCore size={104} engine={c.value} style={{ pointerEvents: 'none' }} /></span>}<i className="nv-set-cring" /></span>
              <span className="nv-set-tn">{c.label}</span>
              <span className="nv-set-th2">{c.line}</span>
            </button>
          ))}
        </div>
      </Group>
      <Group i={6}>
        <SwitchRow k="calm" label="Calm mode" sub={A.calm.on ? 'The glow is dimmed and the sky is still.' : 'Dims the glow and stills the sky. Same layout.'} on={A.calm.on} onToggle={() => A.calm.toggle()} />
      </Group>
    </>
  );
}

// ------------------------------------------------------------ check nova --

function earsStages(t) {
  if (!t || t.running) return null;
  const secs = Number.isFinite(t.ms) ? `${(t.ms / 1000).toFixed(1)} s` : '';
  if (t.error) return [{ ok: false, stage: 'It did not work', detail: t.error }];
  if (t.text) return [{ ok: true, stage: 'Recorded you', detail: '' }, { ok: true, stage: 'The Mac wrote it down', detail: `“${t.text}”${secs ? `, back in ${secs}` : ''}` }];
  if (t.meter === 'heard') return [{ ok: true, stage: 'Recorded you', detail: 'the mic picked up sound' }, { ok: false, stage: 'No words came back', detail: 'Try again a little closer.' }];
  return [{ ok: false, stage: 'Nothing reached the microphone', detail: 'Check that Nova is allowed the mic in iOS Settings.' }];
}

function TestBlock({ k, label, sub, run, running, ran, children }) {
  return (
    <div className="nv-set-blk" data-set-key={k}>
      <ActRow label={label} sub={sub}>
        <TextAction onClick={running ? undefined : run} disabled={running}>{running ? 'Running' : ran ? 'Run again' : 'Run'}</TextAction>
      </ActRow>
      {children}
    </div>
  );
}

export function CheckPage({ P }) {
  const K = P.check;
  const [swipeRun, setSwipeRun] = useState(null);
  const vt = K.voiceTest;
  const mc = K.micCheck;
  const et = K.earsTest;
  const H = K.haptics;
  const copy = () => {
    const t = K.copyLine;
    try { navigator.clipboard.writeText(t).then(() => say('Copied the build line'), () => say(t)); } catch { say(t); }
  };
  return (
    <>
      <HeaderCard tile={<Tile lg icon="checkc" hue="var(--nv-good)" />} title="Check Nova" text="Five tests for when something stops working. Nothing here files anything." />
      <Group label="Sound" i={1}>
        <TestBlock k="hear" label="Can you hear Nova?" sub="Walks the whole path, Mac to speaker, and names whatever fails." run={K.runVoiceTest} running={!!vt?.running} ran={!!vt?.stages?.length}>
          <Stages stages={vt?.stages} />
        </TestBlock>
        <TestBlock k="mic" label="Can Nova hear you?" sub="Run it on the phone you talk to. It asks you to speak three times." run={K.runMicCheck} running={!!mc?.running} ran={!!mc?.stages?.length}>
          {mc?.prompt ? <p className="nv-set-ask" role="status">{mc.prompt}</p> : null}
          <Stages stages={mc?.stages} />
          {mc?.verdict ? (
            <div className={`nv-set-verdict${mc.verdict.settled ? ' settled' : ''}`}>
              <b>{mc.verdict.settled ? 'What is wrong' : 'Not settled'}</b>{mc.verdict.cause}<p>{mc.verdict.fix}</p>
            </div>
          ) : null}
        </TestBlock>
        <TestBlock k="ears" label="Nova’s ears" sub="Records you once and shows what your Mac heard." run={K.runEarsTest} running={!!et?.running} ran={!!et && !et.running}>
          {et?.running ? <p className="nv-set-ask" role="status">{et.stage}</p> : <Stages stages={earsStages(et)} />}
        </TestBlock>
      </Group>
      <Group label="Touch" i={2}>
        <div className="nv-set-blk" data-set-key="haptics">
          <div className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rl">Haptics</span><span className="nv-set-rs">{H.label}</span></span></div>
          {H.path !== 'none' && (
            <div className="nv-set-chips">
              {HAPTIC_WORDS.map((w) => (
                <Interactive key={w} as="span" className="nv-set-chip" haptic={w} onClick={() => {}} aria-label={`Feel ${w}`} focusStyle={{}}>{w[0].toUpperCase() + w.slice(1)}</Interactive>
              ))}
            </div>
          )}
          {H.path !== 'none' && H.path !== 'native' && H.setTiers ? (
            <>
              <div className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rl">Do tick and warn feel different?</span></span></div>
              <Seg label="Do tick and warn feel different?" options={[{ value: 'yes', label: 'Different' }, { value: 'no', label: 'The same' }]}
                value={H.tiers === true ? 'yes' : H.tiers === false ? 'no' : ''}
                onPick={(val) => { H.setTiers(val === 'yes'); say(val === 'yes' ? 'Noted: the five feel different on this phone' : 'Noted: they feel the same here, which is what the native shell would fix'); }} />
            </>
          ) : null}
        </div>
        <TestBlock k="swipe" label="Swipe back" sub="Whether the edge gesture is listening, and the last swipe it saw." run={() => setSwipeRun(K.swipeStages.map((s) => ({ ...s })))} running={false} ran={!!swipeRun}>
          <Stages stages={swipeRun} />
        </TestBlock>
      </Group>
      <Group label="This build" i={3} foot="Send this line with any report, so the fix starts from facts.">
        <ActRow label={`Build ${K.build}`} sub={K.buildLine} mono>
          <TextAction onClick={copy}><span className="nv-set-tb"><Ico n="copy" />Copy</span></TextAction>
        </ActRow>
      </Group>
    </>
  );
}

// ------------------------------------------------------------------- you --

const ABOUT = [['focus', 'Focus'], ['priorities', 'Priorities'], ['bestSelf', 'At your best'], ['notes', 'Context']];

export function YouPage({ P }) {
  const Y = P.you;
  const n = Y.numbers;
  return (
    <>
      <HeaderCard tile={<NovaCore size={64} variant="mini" engine={P.coreStyle} style={{ pointerEvents: 'none' }} />} title={Y.name} text="The root context every Nova agent reasons from. It lives in your vault." />
      {!Y.connected ? <p className="nv-set-empty">About you lives in your vault. Connect the Mac and it shows here.</p> : (
        <>
          <Group label="Your numbers" k="numbers" i={1} foot={Y.demo ? 'Demo numbers.' : ''}>
            {n ? (
              <>
                <div className="nv-set-nums">
                  <span><b>{Number(n.plan?.targetKcal).toLocaleString('en-AU')}</b><span>kcal a day</span></span>
                  <span><b>{n.plan?.proteinG} g</b><span>protein floor</span></span>
                  <span><b>{Number(n.plan?.tdee).toLocaleString('en-AU')}</b><span>TDEE</span></span>
                </div>
                <ActRow sub={`From the Intake on ${n.on}: ${n.facts?.weightKg} kg, ${n.facts?.activity}, ${n.facts?.goal}.`}>
                  <TextAction onClick={Y.setNumbers}>Redo</TextAction>
                </ActRow>
              </>
            ) : (
              <ActRow sub="No Intake yet. Every calorie target in Fuel rests on numbers typed once: seven questions, by voice or typing, and code works out the rest.">
                <TextAction onClick={Y.setNumbers}>Set</TextAction>
              </ActRow>
            )}
          </Group>
          <AboutGroup Y={Y} staleAt={P.staleAt} />
          {(Y.ladder.length > 0 || Y.noticed.length > 0) && (
            <Group label="What Nova has noticed" k="ladder" i={3} foot={`Learned from what you kept and dismissed, and it decides what Nova does without asking.${Y.demo ? ' Demo figures.' : ''}`}>
              {Y.ladder.length ? Y.ladder.map((l) => {
                const p = Math.round((l.kept / l.total) * 100);
                const name = l.label.charAt(0).toUpperCase() + l.label.slice(1);
                return (
                  <div key={l.kind} className="nv-set-lad">
                    <div className="nv-set-ladh"><b>{name}</b><span>{l.kept} of {l.total} kept</span></div>
                    <div className="nv-set-split" role="img" aria-label={`${l.kept} kept of ${l.total}`}><i className="k" style={{ width: `${p}%` }} /><i className="d" style={{ width: `${100 - p}%` }} /></div>
                    {l.verdict === 'skips' ? <span className="nv-set-ease">Worth easing off</span> : null}
                  </div>
                );
              }) : Y.noticed.map((t, i) => <div key={i} className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rs" style={{ color: 'var(--s-ink2)' }}>{t}</span></span></div>)}
            </Group>
          )}
        </>
      )}
    </>
  );
}

function AboutGroup({ Y, staleAt }) {
  const a = Y.about;
  const editing = Y.editing;
  const btn = editing
    ? <TextAction onClick={Y.saving ? undefined : Y.save} disabled={Y.saving}>Done</TextAction>
    : <TextAction onClick={Y.startEdit}>{Y.aboutSet ? 'Edit' : 'Set up'}</TextAction>;
  const foot = `Nova reads this before every answer, coaching session and brief.${Y.readOnly && staleAt ? ` Offline: as your vault said it at ${staleAt}, read only.` : ''}`;
  return (
    <Group label="About you" k="about" i={2} btn={btn} foot={foot}>
      {editing && Y.draft ? (
        <>
          {ABOUT.map(([key, name]) => (
            <label key={key} className="nv-set-fl" htmlFor={`set-ab-${key}`}>
              <span>{name}</span>
              {key === 'focus'
                ? <input className="nv-set-fin" id={`set-ab-${key}`} value={Y.draft.focus} onChange={Y.setField('focus')} style={{ fontFamily: 'var(--nv-font-ui)' }} />
                : <textarea className="nv-set-fin" id={`set-ab-${key}`} rows={key === 'priorities' ? 4 : 2} value={Y.draft[key]} onChange={Y.setField(key)} />}
            </label>
          ))}
          <div className="nv-set-row nx" style={{ borderTop: '1px solid var(--s-sep)' }}>
            <span className="nv-set-rt" />
            <span style={{ display: 'flex' }}>
              <TextAction onClick={Y.cancelEdit}>Cancel</TextAction>
              <TextAction onClick={Y.saving ? undefined : Y.save} disabled={Y.saving}>{Y.saving ? 'Saving' : 'Save'}</TextAction>
            </span>
          </div>
        </>
      ) : a && Y.aboutSet ? (
        ABOUT.map(([key, name]) => {
          const val = key === 'priorities' ? (a.priorities || []).join(', ') : a[key];
          if (!val) return null;
          return <div key={key} className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rl">{name}</span><span className="nv-set-rs" style={{ whiteSpace: 'pre-wrap' }}>{val}</span></span></div>;
        })
      ) : (
        <div className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rs">Nova knows your data but not yet your intentions. Tell him what you are working toward and he reasons through it in every answer, coaching session and brief.</span></span></div>
      )}
    </Group>
  );
}

// ------------------------------------------------------------- calendars --

export function CalendarsPage({ P }) {
  const C = P.cals;
  return (
    <>
      <HeaderCard tile={<Tile lg icon="cal" hue="var(--nv-ink60)" />} title="Calendars" text="Turn off any calendar you don’t want Nova reading." />
      {!C.connected ? <p className="nv-set-empty">Your calendars are read on the Mac. Connect it and they show here.</p> : (
        <Group label="On the Mac" i={1} btn={<TextAction onClick={C.locked && !C.error ? undefined : C.refresh} disabled={C.locked && !C.error}>Refresh</TextAction>}
          foot={`Hidden calendars are skipped everywhere: today’s view, dispatches and the daily review. Apple Calendar’s own checkboxes don’t reach Nova, so set them here.${C.stale && P.staleAt ? ` Offline: as the Mac said at ${P.staleAt}.` : ''}`}>
          {C.error ? (
            <div className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rs cost">Couldn’t read the calendar list. That is a connection problem, not “no calendars”.</span></span></div>
          ) : C.loading ? (
            [0, 1, 2].map((i) => <div key={i} className="nv-set-row"><span className="nv-set-tile" /><span className="nv-set-rt"><span className="nv-set-sk" role="img" aria-label="Loading" /></span><span /></div>)
          ) : C.empty ? (
            <div className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rs">No calendars found. Check that iCloud calendar access is set up on the Mac.</span></span></div>
          ) : C.list.map((c) => (
            <div key={c.url} className="nv-set-row">
              <Tile hue={c.color || undefined}><span className="nv-set-dot" /></Tile>
              <span className="nv-set-rt"><span className="nv-set-rl" style={{ overflowWrap: 'anywhere' }}>{c.name}</span></span>
              <Switch on={c.on} onToggle={() => c.toggle?.()} label={`Show ${c.name}`} disabled={C.locked} why={C.why} />
            </div>
          ))}
        </Group>
      )}
    </>
  );
}

// ---------------------------------------------------------------- models --

export function ModelsPage({ P, open }) {
  const M = P.models;
  const reset = () => {
    const undo = M.resetAll?.();
    say('Every lane on, each on its default model', typeof undo === 'function' ? undo : undefined);
  };
  return (
    <>
      <HeaderCard tile={<Tile lg icon="chip" hue="var(--nv-ink60)" />} title="Claude models" text="Every agent and feature that talks to Claude, the model it runs on, and a switch to stop it." />
      {!M.connected ? <p className="nv-set-empty">The model board lives on the Mac. Connect it and every lane shows here.</p> : M.error ? (
        <p className="nv-set-empty bad">Couldn’t read the model board. That is a connection problem, not “no lanes”, and nothing has changed on the Mac. <TextAction onClick={M.retry}>Try again</TextAction></p>
      ) : (
        <>
          <div className="nv-set-card nv-set-total nv-set-rise" style={{ '--i': 1 }}>
            {M.loading ? <span className="nv-set-sk" role="img" aria-label="Loading" style={{ width: 120, height: 28 }} />
              : M.total ? <b className={M.stale ? 'nv-set-rv stale' : ''} style={M.stale ? { font: 'inherit', fontSize: 'calc(34px * var(--ts))', fontWeight: 700 } : undefined}>{M.total}</b> : null}
            <span>{M.loading ? 'Reading the board from the Mac' : M.total
              ? `spent across all ${M.laneCount} lanes in the last 7 days, as the Mac measured it${M.demo ? ' (demo figures)' : ''}${M.stale && P.staleAt ? `, as of ${P.staleAt}` : ''}`
              : 'Spend is measured from each run’s own numbers. Nothing has run in the last 7 days.'}</span>
          </div>
          <Group label="Groups" i={2} foot={M.watchLine ? `${M.watchLine}. A pinned model stays on one version; the rest follow the newest.${M.outdated.length ? ` Pinned to an older version: ${M.outdated.join(', ')}.` : ''}` : ''}>
            {M.loading ? [0, 1, 2].map((i) => <div key={i} className="nv-set-row nx"><span className="nv-set-rt"><span className="nv-set-sk" role="img" aria-label="Loading" /></span><span /></div>)
              : M.groups.map((g) => (
                <button key={g.id} type="button" className="nv-set-row nx" data-set-key={`mg:${g.id}`} onClick={() => open(`mg:${g.id}`)}>
                  <span className="nv-set-rt">
                    <span className="nv-set-rl">{g.label}</span>
                    <Val v={{ text: [`${g.count} lanes`, g.usd, g.offCount ? `${g.offCount} off` : ''].filter(Boolean).join(' · '), stale: M.stale }} staleAt={P.staleAt} />
                    <span className="nv-set-sbar"><i style={{ width: `${Math.round((g.share || 0) * 100)}%` }} /></span>
                  </span>
                  <Ico n="chev" className="nv-set-cv" />
                </button>
              ))}
          </Group>
          {M.anyChanged && M.resetAll ? (
            <div className="nv-set-center"><TextAction onClick={M.locked || M.busyAll ? undefined : reset} disabled={M.locked || M.busyAll}>{M.busyAll ? 'Resetting' : 'Reset every lane to its default'}</TextAction></div>
          ) : null}
        </>
      )}
    </>
  );
}

export function ModelGroupPage({ P, id }) {
  const M = P.models;
  const g = M.groups.find((x) => x.id === id);
  if (!g) return <p className="nv-set-empty">{M.loading ? 'Reading the board from the Mac.' : 'This group is not on the board any more.'}</p>;
  return (
    <>
      <h1 className="nv-set-lt nv-set-rise" style={{ '--i': 0 }} data-set-hcard="">{g.label}</h1>
      <p className="nv-set-spoken" style={{ marginTop: -6 }}>{g.hint}.{g.usd ? ` ${g.usd} this week${M.demo ? ' (demo)' : ''}.` : ''}</p>
      <Group i={1}>
        {g.lanes.map((l) => (
          <div key={l.id} className="nv-set-row nx" data-set-key="lane">
            <span className="nv-set-rt">
              <span className="nv-set-rl">{l.label}</span>
              {!l.enabled ? <span className="nv-set-rs cost">{l.offEffect}</span>
                : l.deterministic ? <span className="nv-set-rs">Deterministic. No model runs; the switch is the setting.</span>
                  : (
                    <span className="nv-set-rs">
                      <MenuPill label={l.label} title={l.label} options={l.options} value={l.model} shown={l.modelLabel} onPick={l.pick} locked={M.locked || l.busy} why={M.why} />
                      {l.spend ? <span style={{ display: 'block', marginTop: 6 }}>{l.spend.usd} this week · {l.spend.detail}</span> : null}
                    </span>
                  )}
            </span>
            <Switch on={l.enabled} onToggle={() => l.toggle?.()} label={l.label} disabled={M.locked || l.busy} why={M.why} />
          </div>
        ))}
      </Group>
    </>
  );
}

// ------------------------------------------------------------- snapshots --

export function SnapshotsPage({ P }) {
  const S = P.snap;
  const [confirm, setConfirm] = useState(null);
  // the list is read when the page opens, once
  const asked = useRef(false);
  const { loaded, connected, locked, load } = S;
  useEffect(() => {
    if (loaded || !connected || locked || !load || asked.current) return;
    asked.current = true;
    load();
  }, [loaded, connected, locked, load]);
  return (
    <>
      <HeaderCard tile={<Tile lg icon="clock" hue="var(--nv-ink60)" />} title="Snapshots" text="Every write to your vault keeps a copy first. Restore any file, and the restore keeps a copy too." />
      {!S.connected ? <p className="nv-set-empty">Snapshots live with your vault on the Mac. Connect it and they show here.</p> : (
        <Group label={S.demo ? 'Today (demo)' : 'The latest copies'} i={1}
          foot={S.files.length ? `A restore files a receipt in the Inbox, and its undo puts the file back as it was.${S.stale && P.staleAt ? ` Offline: as the Mac listed them at ${P.staleAt}.` : ''}` : ''}>
          {S.loading || !S.loaded ? [0, 1, 2].map((i) => <div key={i} className="nv-set-row nx"><span className="nv-set-rt"><span className="nv-set-sk" role="img" aria-label="Loading" /></span><span /></div>)
            : !S.files.length ? <div className="nv-set-row nx3"><span className="nv-set-rt"><span className="nv-set-rs">No snapshots yet. They appear with the first write to your vault.</span></span></div>
              : S.files.map((f) => (
                <div key={f.key} className="nv-set-blk">
                  <ActRow label={f.file} sub={`${f.older ? 'Earlier copy' : 'Copy'} from ${f.stamp}${f.exists ? '' : ' · the file was deleted'}`}>
                    <TextAction onClick={S.locked ? () => say(S.why) : () => setConfirm(f.key)}>Restore</TextAction>
                  </ActRow>
                  {confirm === f.key ? (
                    <div className="nv-set-row nx">
                      <span className="nv-set-rt"><span className="nv-set-rs" style={{ color: 'var(--s-ink2)' }}>Overwrite the current file with the {f.stamp} copy?</span></span>
                      <span style={{ display: 'flex' }}>
                        <TextAction tone="quiet" onClick={() => setConfirm(null)}>Cancel</TextAction>
                        <TextAction tone="warn" onClick={() => { setConfirm(null); S.restore(f.rel); }}>Restore</TextAction>
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
        </Group>
      )}
    </>
  );
}

// ------------------------------------------------------- research browser --

export function BrowserPage({ P }) {
  const B = P.browser;
  return (
    <>
      <HeaderCard tile={<Tile lg icon="globe" hue="var(--nv-ink60)" />} title="Research browser" text="Instagram, TikTok, X and LinkedIn refuse an anonymous reader. Sign in once and the Scout reads them as you." />
      <Group i={1} foot="It uses its own browser profile, never your everyday Chrome, and only ever reads. You type the password; Nova never sees it.">
        <div className="nv-set-row nx">
          <span className="nv-set-rt"><span className="nv-set-rl">On the Mac</span><Val v={B.value} staleAt={P.staleAt} /></span>
          <TextAction onClick={B.busy ? undefined : (B.locked ? () => say(B.why) : B.signIn)} disabled={B.busy}>{B.busy ? 'Opening' : 'Sign in'}</TextAction>
        </div>
      </Group>
    </>
  );
}

// --------------------------------------------------------------- notion --

// HIS KEY, PASTED FROM HIS PHONE. The field clears the moment Save is
// pressed, whatever Notion answers: it is a one-time paste, never a value
// this page keeps showing back at him (unlike The Mac's token, which he may
// come back to read). server/lib/notionAuth.js is the only place the key
// itself ever lands.
export function NotionPage({ P }) {
  const N = P.notion;
  const [input, setInput] = useState('');
  const save = () => {
    const val = input.trim();
    if (!val || N.saving) return;
    N.save(val);
    setInput('');
  };
  return (
    <>
      <HeaderCard tile={<Tile lg icon="notion" hue="var(--nv-ink60)" />} title="Notion" text="Give Nova your Notion integration key so he can back your Journal up there later." />
      <Group i={1} foot="Find the key: Notion › Settings › Connections › Nova › Configuration › Internal integration secret › Copy. Share the Journal: on the connection, Content access › Edit access › tick Journal.">
        <label className="nv-set-fl" htmlFor="nv-set-notion-tok">
          <span>Internal integration secret</span>
          <input className="nv-set-fin" id="nv-set-notion-tok" type="password" value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="secret_…" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </label>
        <ActRow>
          <TextAction onClick={N.saving || !input.trim() ? undefined : save} disabled={N.saving || !input.trim()}>{N.saving ? 'Saving' : 'Save'}</TextAction>
        </ActRow>
        {N.saveError ? <p className="nv-set-rs cost" style={{ margin: '0 14px 14px' }}>{N.saveError}</p> : null}
        <div className="nv-set-row nx">
          <span className="nv-set-rt"><span className="nv-set-rl">Status</span><Val v={N.value} staleAt={P.staleAt} /></span>
          <span />
        </div>
        {N.connected ? (
          <ActRow sub={N.workspaceName ? `Connected to ${N.workspaceName}.` : ''}>
            <TextAction tone="warn" onClick={N.disconnect}>Disconnect</TextAction>
          </ActRow>
        ) : null}
      </Group>
    </>
  );
}

// ---------------------------------------------------------------- tab bar --

// THE ORDER, DRAGGED BY ITS GRIP: the row lifts and the others slide aside
// (each measured before and after, then eased from where it was); arrow keys
// move a focused grip. The line where the bar ends is drawn, not described
// (finding 4: the copy said three).
export function TabsPage({ P }) {
  const T = P.tabs;
  const [order, setOrder] = useState(T.items);
  const [drag, setDrag] = useState(null);
  const list = useRef(null);
  const dg = useRef(null);
  useEffect(() => { if (!dg.current) setOrder(T.items); }, [T.items]);
  const commit = (next) => T.setOrder(next.map((t) => t.key));

  const rowsTop = () => {
    const m = {};
    list.current?.querySelectorAll('.nv-set-tor').forEach((r) => { m[r.dataset.k] = r.getBoundingClientRect().top; });
    return m;
  };
  const slide = (before) => {
    if (reduced()) return;
    requestAnimationFrame(() => {
      list.current?.querySelectorAll('.nv-set-tor').forEach((r) => {
        if (r.dataset.k === dg.current?.key) return;
        const b = before[r.dataset.k];
        const a = r.getBoundingClientRect().top;
        if (b == null || Math.abs(b - a) < 1) return;
        r.animate([{ transform: `translateY(${b - a}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.32,.72,0,1)' });
      });
    });
  };
  const onDown = (e, key) => {
    e.preventDefault();
    const row = e.currentTarget.closest('.nv-set-tor');
    dg.current = { id: e.pointerId, key, y0: e.clientY, top0: row.getBoundingClientRect().top, order };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ }
    setDrag(key);
  };
  const onMove = (e) => {
    const d = dg.current;
    if (!d || e.pointerId !== d.id) return;
    const want = d.top0 + (e.clientY - d.y0);
    const rows = Array.from(list.current.querySelectorAll('.nv-set-tor'));
    const others = rows.filter((r) => r.dataset.k !== d.key);
    let idx = others.findIndex((r) => { const b = r.getBoundingClientRect(); return want + 26 < b.top + b.height / 2; });
    if (idx < 0) idx = others.length;
    const cur = d.order.findIndex((t) => t.key === d.key);
    if (idx !== cur) {
      const before = rowsTop();
      const next = d.order.slice();
      const [moved] = next.splice(cur, 1);
      next.splice(idx, 0, moved);
      d.order = next;
      setOrder(next);
      slide(before);
    }
    const row = rows.find((r) => r.dataset.k === d.key);
    if (row) { row.style.transform = 'none'; row.style.transform = `translateY(${want - row.getBoundingClientRect().top}px)`; }
  };
  const onUp = (e) => {
    const d = dg.current;
    if (!d || e.pointerId !== d.id) return;
    dg.current = null;
    const row = list.current?.querySelector(`.nv-set-tor[data-k="${CSS.escape(d.key)}"]`);
    if (row) row.animate([{ transform: row.style.transform || 'none' }, { transform: 'none' }], { duration: reduced() ? 0 : 220, easing: 'cubic-bezier(.32,.72,0,1)' });
    if (row) row.style.transform = '';
    setDrag(null);
    commit(d.order);
  };
  const onKey = (e, key) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = order.findIndex((t) => t.key === key);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= order.length) return;
    const before = rowsTop();
    const next = order.slice();
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    setOrder(next);
    commit(next);
    slide(before);
    requestAnimationFrame(() => list.current?.querySelector(`.nv-set-tor[data-k="${CSS.escape(key)}"] .nv-set-grip`)?.focus());
  };
  const slots = T.slots;
  return (
    <>
      <HeaderCard tile={<Tile lg icon="dock" hue="var(--nv-ink60)" />} title="Tab bar" text={T.copy} />
      <section className="nv-set-grp nv-set-rise" style={{ '--i': 2 }} data-set-key="tabs">
        <div className="nv-set-gh"><span style={{ font: '600 var(--t13)/1.2 var(--nv-font-ui)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--nv-ink60)' }}>{slots ? 'In the tab bar' : 'In the sidebar'}</span></div>
        <div className="nv-set-tlist" ref={list}>
          {order.map((t, i) => {
            const first = i === 0 || (slots && i === slots);
            const last = i === order.length - 1 || (slots && i === slots - 1);
            return (
              <div key={t.key} data-k={t.key} data-more={slots && i === slots ? 'In More' : undefined}
                className={`nv-set-tor${first ? ' first' : ''}${last ? ' last' : ''}${slots && i === slots ? ' more' : ''}${drag === t.key ? ' drag' : ''}`}>
                <span className="nv-set-tile"><TabIcon name={t.key} size={20} /></span>
                <span className="nv-set-rl">{t.label}</span>
                <button type="button" className="nv-set-grip" aria-label={`Move ${t.label}; arrow keys move it`}
                  onPointerDown={(e) => onDown(e, t.key)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={(e) => onKey(e, t.key)}>
                  <Ico n="grip" />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ train --

function RestRing({ train }) {
  const C = 2 * Math.PI * 26;
  const off = C * (1 - (train.on ? train.seconds / 180 : 0));
  return (
    <div className="nv-set-rring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--nv-ink)" strokeOpacity=".12" strokeWidth="7" />
        <circle className="rr" cx="32" cy="32" r="26" fill="none" stroke="var(--s-acc)" strokeWidth="7" strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={off.toFixed(1)} />
      </svg>
      <p><b>{train.on ? train.label : 'Off'}</b>on the tick’s spot after each set</p>
    </div>
  );
}

export function TrainPage({ P }) {
  const R = P.train;
  return (
    <>
      <HeaderCard tile={<Tile lg icon="dumbbell" hue="var(--nv-cy)" />} title="Train" text="The live session." />
      {!R ? <p className="nv-set-empty">The rest timer belongs to the Summary style’s live session.</p> : (
        <Group label="Live session" i={1}>
          <SwitchRow k="rest" label="Rest timer" sub={R.sub} on={R.on} onToggle={() => R.toggle()} />
          <SegBlock k="restLen" label="Length" options={R.options} value={R.on ? String(R.seconds) : ''} onPick={R.pick} after={<RestRing train={R} />} />
        </Group>
      )}
    </>
  );
}
