// The redesigned Train TODAY pane — mockup v2 made real. One component,
// both layouts: the hero row wraps on phones and widens on the MacBook
// (spec: uniform across platforms, never a stretched phone view).
// Every number comes from /api/train/overview in one read; a missing
// overview renders nothing (honest absence, no skeleton fiction).
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { Term } from './Glossary.jsx';
import { Eyebrow, TextAction, Chip, Tag, Meta, isAppleStyle } from './Controls.jsx';

const M = 'var(--nv-font-mono)';
// the material pass (5 Sep 2026): labels through Controls.jsx; a filled
// button is sentence case in the UI face under the Apple styles
const btn = (bg, ink, extra = {}) => (isAppleStyle()
  ? { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', font: '600 15px var(--nv-font-ui)', letterSpacing: '-.01em', padding: '11px 20px', borderRadius: '999px', background: bg, color: ink, ...extra }
  : { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', font: '600 12px var(--nv-font-mono)', letterSpacing: '.14em', textTransform: 'uppercase', padding: '11px 18px', borderRadius: '12px', background: bg, color: ink, ...extra });
const cap = (s) => { const t = String(s || '').toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

function Ring({ score, basis }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = score != null ? c * (1 - score / 100) : c;
  return (
    <div style={css('position:relative;width:118px;height:118px;flex:none')} title={basis || ''}>
      <svg viewBox="0 0 118 118" style={{ width: 118, height: 118, transform: 'rotate(-90deg)' }} aria-label={score != null ? `Readiness ${score}` : 'Readiness unknown'}>
        <circle cx="59" cy="59" r={r} fill="none" stroke="rgba(130,175,255,.10)" strokeWidth="9" />
        <circle cx="59" cy="59" r={r} fill="none" stroke="var(--nv-cy)" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ filter: 'drop-shadow(0 0 6px rgba(89,230,255,.6))', transition: 'stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div style={css('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center')}>
        <b style={css('font-size:26px;font-weight:600;color:var(--nv-cy);text-shadow:0 0 14px rgba(89,230,255,.5);font-variant-numeric:tabular-nums')}>{score != null ? score : '—'}</b>
        <Eyebrow as="span" style={{ fontSize: isAppleStyle() ? '10px' : '8px' }}>Ready</Eyebrow>
      </div>
    </div>
  );
}

const fcardBase = (edge) => `flex:0 0 160px;border-radius:14px;padding:12px;border:1px solid ${edge};background:var(--nv-glass);cursor:pointer;transition:transform .2s,border-color .2s`;

export function TrainToday({ o, actions, resume }) {
  // the RESUME card renders from device state alone — it must appear
  // instantly on reopen, before the overview has even been fetched
  if (!o && !resume) return null;
  const sleepH = o?.recovery?.sleepMin != null ? (o.recovery.sleepMin / 60).toFixed(1) : null;
  const under = (o?.volume || []).filter((v) => v.goalMuscle && v.sets < v.target);
  // sets ticked in the session he is in right now, already folded into the totals
  const liveNow = (o?.volume || []).reduce((n, v) => n + (v.live || 0), 0);
  return (
    <div style={css('display:flex;flex-direction:column;gap:12px;margin-bottom:16px')}>
      {/* hero: ring + facts + today card — widens into one row on desktop */}
      <div style={css('display:flex;gap:14px;flex-wrap:wrap;align-items:stretch')}>
        {o && <div style={css('display:flex;gap:14px;align-items:center;flex:1 1 300px;background:var(--nv-glass);border:1px solid var(--nv-edge);border-radius:18px;padding:14px')}>
          <Ring score={o.readiness?.score} basis={o.readiness?.basis} />
          <div style={css('flex:1;display:flex;flex-direction:column;gap:6px;min-width:0')}>
            <div style={css('display:flex;justify-content:space-between;font-size:13px;color:var(--nv-ink60)')}><span>HRV</span><b style={css('color:var(--nv-ink);font-variant-numeric:tabular-nums')}>{o.recovery?.hrv != null ? `${o.recovery.hrv} ms` : '—'}</b></div>
            <div style={css('display:flex;justify-content:space-between;font-size:13px;color:var(--nv-ink60)')}><span>Sleep</span><b style={css('color:var(--nv-ink);font-variant-numeric:tabular-nums')}>{sleepH != null ? `${sleepH} h` : '—'}</b></div>
            <div style={css('display:flex;justify-content:space-between;font-size:13px;color:var(--nv-ink60)')}><span>Resting HR</span><b style={css('color:var(--nv-ink);font-variant-numeric:tabular-nums')}>{o.recovery?.restingHr ?? '—'}</b></div>
            {o.block && !o.block.ended && (
              <Tag tone="gold" style={{ alignSelf: 'flex-start' }}>
                <Term k={o.block.isDeloadWeek ? 'deload' : o.block.phase}>{`${o.block.phase} · wk ${o.block.week}/${o.block.lengthWeeks}`}</Term>
              </Tag>
            )}
            {o.deload?.advise && <span style={css('font-size:11px;color:var(--nv-warn)')}>{o.deload.reason}</span>}
            {actions?.askTired && (
              <Chip tone="cyan" onClick={actions.askTired} style={{ alignSelf: 'flex-start' }}>Why am I tired?</Chip>
            )}
            {actions?.askPeak && (
              <Chip tone="gold" onClick={actions.askPeak} style={{ alignSelf: 'flex-start' }}>When am I at my best?</Chip>
            )}
            {o.watch?.length > 0 && (
              <div style={css('display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--nv-ink60)')}>
                <span>Watch today</span>
                <b style={css('color:var(--nv-ink);font-variant-numeric:tabular-nums;text-align:right;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>
                  {o.watch.map((w) => `${w.type} ${w.minutes}m`).join(' · ')}
                </b>
              </div>
            )}
          </div>
        </div>}

        {resume && (
          <div style={css('flex:1 1 300px;border-radius:18px;padding:16px;position:relative;overflow:hidden;border:1px solid color-mix(in srgb, var(--nv-gold) 45%, transparent);background:linear-gradient(135deg,color-mix(in srgb, var(--nv-gold) 12%, transparent),transparent)')}>
            <Eyebrow tone="gold">Session in progress</Eyebrow>
            <div style={css('font-size:24px;font-weight:600;letter-spacing:.04em;margin-top:2px')}>{isAppleStyle() ? resume.name : resume.name.toUpperCase()}</div>
            <div style={css('color:var(--nv-ink60);font-size:12.5px;margin-top:2px;font-variant-numeric:tabular-nums')}>
              {resume.done} set{resume.done === 1 ? '' : 's'} ticked — pick up where you left off
            </div>
            <Interactive as="span" onClick={resume.go}
              base={btn('var(--nv-gold)', '#1a1322', { marginTop: '12px', boxShadow: '0 0 26px -8px color-mix(in srgb, var(--nv-gold) 70%, transparent)' })}
              hoverStyle="filter:brightness(1.08)"
            >▶ Resume</Interactive>
          </div>
        )}
        {!resume && (o.today || o.restDay) && (
          <div style={css('flex:1 1 300px;border-radius:18px;padding:16px;position:relative;overflow:hidden;border:1px solid color-mix(in srgb, var(--nv-cy) 35%, transparent);background:linear-gradient(135deg,color-mix(in srgb, var(--nv-cy) 10%, transparent),color-mix(in srgb, var(--nv-vi) 06%, transparent))')}>
            <Eyebrow tone="cyan">{o.today ? "On today's card" : 'Today'}</Eyebrow>
            <div style={css('font-size:24px;font-weight:600;letter-spacing:.04em;margin-top:2px')}>{o.today ? (isAppleStyle() ? o.today.name : o.today.name.toUpperCase()) : (isAppleStyle() ? 'Rest day' : 'REST DAY')}</div>
            {o.today && (
              <div style={css('color:var(--nv-ink60);font-size:12.5px;margin-top:2px;font-variant-numeric:tabular-nums')}>
                {o.today.exerciseCount} exercises{o.today.lastVolume ? ` · last time ${o.today.lastVolume.toLocaleString()} kg` : ''}
              </div>
            )}
            {o.today && actions?.begin && (
              <Interactive as="span" onClick={actions.begin}
                base={btn('var(--nv-cy)', 'var(--nv-on-acc)', { marginTop: '12px', boxShadow: '0 0 22px -6px color-mix(in srgb, var(--nv-cy) 70%, transparent)' })}
                hoverStyle="filter:brightness(1.08)"
              >▶ Begin session</Interactive>
            )}
          </div>
        )}
      </div>

      {/* focus for today — only when something meaningful exists */}
      {o?.focus && (
        <div style={css('border-radius:16px;padding:13px 14px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);background:linear-gradient(135deg,color-mix(in srgb, var(--nv-gold) 10%, transparent),color-mix(in srgb, var(--nv-gold) 2%, transparent))')}>
          <Eyebrow as="span" tone="gold">◈ Focus for today</Eyebrow>
          <div style={css('font-size:13.5px;color:var(--nv-ink);margin-top:5px;line-height:1.5')}>{o.focus.text}</div>
          {o.focus.fix && actions?.applyFocusFix && (
            <div style={css('margin-top:10px')}>
              <Interactive as="span" onClick={() => actions.applyFocusFix(o.focus.fix, o.focus.text)}
                base={btn('var(--nv-gold)', '#1a1322', { padding: isAppleStyle() ? '9px 16px' : '7px 14px' })}
                hoverStyle={{ filter: 'brightness(1.08)' }}>Make the change</Interactive>
            </div>
          )}
        </div>
      )}

      {/* momentum feed */}
      {o && (o.momentum?.prs?.length > 0 || o.momentum?.plateau || o.momentum?.streak >= 2) && (
        <div style={css('display:flex;gap:10px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none')}>
          {o.momentum.prs.map((p) => (
            <div key={p.name + p.kind} style={css(fcardBase('color-mix(in srgb, var(--nv-gold) 50%, transparent)') + ';background:linear-gradient(160deg,color-mix(in srgb, var(--nv-gold) 10%, transparent),var(--nv-glass))')}>
              <Eyebrow tone="gold" style={{ marginBottom: '6px' }}>◆ PR{p.date ? ` · ${p.date.slice(5)}` : ''}</Eyebrow>
              <div style={css('font-size:14.5px;font-weight:600;line-height:1.25')}>{p.name}</div>
              <div style={css('font-size:10.5px;color:var(--nv-ink40);margin-top:4px;font-variant-numeric:tabular-nums')}>
                {p.kind === 'weight' ? `${p.value}kg × ${p.reps} — heaviest ever` : <span><Term k="e1RM">e1RM</Term> {`${p.value}kg`}</span>}{p.previous ? ` · was ${Math.round(p.previous * 10) / 10}` : ''}
              </div>
            </div>
          ))}
          {o.momentum.plateau && (
            <Interactive as="div" onClick={actions?.askPlateau ? () => actions.askPlateau(o.momentum.plateau.name) : undefined}
              base={fcardBase('color-mix(in srgb, var(--nv-warn) 45%, transparent)')} hoverStyle="transform:translateY(-2px);border-color:var(--nv-warn)">
              <Eyebrow tone="warn" style={{ marginBottom: '6px' }}>▲ <Term k="stalled">Stalled</Term> · {o.momentum.plateau.spanDays}d</Eyebrow>
              <div style={css('font-size:14.5px;font-weight:600;line-height:1.25')}>{o.momentum.plateau.name}</div>
              <div style={css('font-size:10.5px;color:var(--nv-ink40);margin-top:4px')}>no strength gain — tap for Coach's fix</div>
            </Interactive>
          )}
          {o.momentum.streak >= 2 && (
            <div style={css(fcardBase('var(--nv-edge)'))}>
              <Eyebrow tone="good" style={{ marginBottom: '6px' }}>● Streak</Eyebrow>
              <div style={css('font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums')}>{o.momentum.streak} sessions</div>
            </div>
          )}
        </div>
      )}

      {/* THE COACH'S OPEN ASK — a proposed program change, on the screen
          where programs are actually decided. Three ways out: take it,
          argue it with Coach, or leave it (and it will ask again, twice). */}
      {o?.coachAsk && (
        <div style={css(`background:color-mix(in srgb, ${o.coachAsk.nudges ? 'var(--nv-warn)' : 'var(--nv-gold)'} 07%, transparent);border:1px solid color-mix(in srgb, ${o.coachAsk.nudges ? 'var(--nv-warn)' : 'var(--nv-gold)'} 40%, transparent);border-radius:16px;padding:14px`)}>
          <Eyebrow tone={o.coachAsk.nudges ? 'warn' : 'gold'}>
            ◆ Coach{o.coachAsk.nudges ? ` · asked ${o.coachAsk.nudges + 1}× · ${o.coachAsk.daysOpen}d open` : ' · a change worth making'}
          </Eyebrow>
          <div style={css('margin-top:7px;font-size:13.5px;line-height:1.5')}>{o.coachAsk.text}</div>
          <div style={css('margin-top:11px;display:flex;gap:8px;flex-wrap:wrap')}>
            {o.coachAsk.applies && actions?.applyCoachAsk && (
              <Interactive as="span" onClick={() => actions.applyCoachAsk(o.coachAsk.recordId, o.coachAsk.fix, o.coachAsk.text)}
                base={btn('var(--nv-gold)', '#1a1322', { padding: isAppleStyle() ? '9px 16px' : '7px 14px' })}
                hoverStyle={{ filter: 'brightness(1.08)' }}>Do it</Interactive>
            )}
            {actions?.askVolume && (
              <TextAction tone="cyan" onClick={() => actions.askVolume(`About your suggestion: ${o.coachAsk.text} — talk me through it.`)}>Discuss it</TextAction>
            )}
            {actions?.dismissCoachAsk && (
              <TextAction tone="faint" onClick={() => actions.dismissCoachAsk(o.coachAsk.recordId)}>Not this</TextAction>
            )}
          </div>
        </div>
      )}

      {/* weekly volume vs goal-aware targets — Monday to Sunday, and the
          session in progress counts toward it as he ticks */}
      {o?.volume?.length > 0 && (
        <div style={css('background:var(--nv-glass);border:1px solid var(--nv-edge);border-radius:16px;padding:14px')}>
          <div style={css('display:flex;justify-content:space-between;align-items:baseline')}>
            <Eyebrow as="span"><Term k="hard sets">Hard sets this week</Term></Eyebrow>
            {liveNow > 0
              ? <Meta tone="gold">◆ {liveNow} live this session</Meta>
              : under.length > 0 && <Meta tone="warn">Goal muscles under ▲</Meta>}
          </div>
          {o.volume.slice(0, 6).map((v) => {
            const pct = Math.min(100, Math.round((v.sets / v.target) * 100));
            const low = v.goalMuscle && v.sets < v.target;
            return (
              <div key={v.muscle} style={css('display:flex;align-items:center;gap:8px;margin-top:7px')}>
                <Meta tone={v.goalMuscle ? 'gold' : 'faint'} style={{ width: '76px', flex: 'none', fontWeight: 600 }}>{cap(v.muscle)}</Meta>
                <div style={css('flex:1;height:8px;border-radius:4px;background:rgba(130,175,255,.08);overflow:hidden;position:relative')}>
                  <i style={css(`display:block;height:100%;width:${pct}%;border-radius:4px;background:${low ? 'linear-gradient(90deg,rgba(224,131,131,.8),rgba(224,131,131,.5))' : 'linear-gradient(90deg,var(--nv-vi),var(--nv-cy))'}`)} />
                  {/* what he has ticked in THIS session, lit at the head of the
                      bar — the part that is happening right now reads as
                      happening right now */}
                  {v.live > 0 && (
                    <i style={css(`position:absolute;top:0;bottom:0;left:${Math.max(0, pct - Math.min(100, Math.round((v.live / v.target) * 100)))}%;width:${Math.min(100, Math.round((v.live / v.target) * 100))}%;background:var(--nv-gold);box-shadow:0 0 8px color-mix(in srgb, var(--nv-gold) 70%, transparent)`)} />
                  )}
                  <span style={css('position:absolute;top:-2px;bottom:-2px;width:2px;background:rgba(232,236,246,.35);left:100%')} />
                </div>
                <span style={css(`width:44px;text-align:right;font:var(--nv-micro-m);color:${low ? 'var(--nv-warn)' : 'var(--nv-ink60)'};font-variant-numeric:tabular-nums`)}>{v.sets}/{v.target}</span>
              </div>
            );
          })}
          {under.length > 0 && actions?.askVolume && (
            <Interactive as="div" onClick={() => actions.askVolume(under.map((u) => u.muscle).join(', '))}
              base="margin-top:9px;font-size:11.5px;color:var(--nv-gold);cursor:pointer" hoverStyle="text-decoration:underline">
              {`${under.map((u) => u.muscle).join(' & ')} under target for your goal — ask Coach how to add sets →`}
            </Interactive>
          )}
        </div>
      )}
    </div>
  );
}
