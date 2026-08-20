// The redesigned Train TODAY pane — mockup v2 made real. One component,
// both layouts: the hero row wraps on phones and widens on the MacBook
// (spec: uniform across platforms, never a stretched phone view).
// Every number comes from /api/train/overview in one read; a missing
// overview renders nothing (honest absence, no skeleton fiction).
import { css } from './css.js';
import { Interactive } from './Interactive.jsx';
import { Term } from './Glossary.jsx';

const M = 'var(--nv-font-mono)';

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
        <span style={css(`font:600 8px ${M};letter-spacing:.2em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}>READY</span>
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
              <span style={css(`align-self:flex-start;font:600 9px ${M};letter-spacing:.12em;padding:4px 10px;border-radius:99px;border:1px solid color-mix(in srgb, var(--nv-gold) 45%, transparent);color:var(--nv-gold)`)}>
                <Term k={o.block.isDeloadWeek ? 'deload' : o.block.phase}>{`${o.block.phase.toUpperCase()} · WK ${o.block.week}/${o.block.lengthWeeks}`}</Term>
              </span>
            )}
            {o.deload?.advise && <span style={css('font-size:11px;color:var(--nv-warn)')}>{o.deload.reason}</span>}
            {actions?.askTired && (
              <Interactive as="span" onClick={actions.askTired}
                base={`align-self:flex-start;cursor:pointer;font:600 9px ${M};letter-spacing:.12em;padding:5px 11px;border-radius:99px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);color:var(--nv-cy)`}
                hoverStyle="background:color-mix(in srgb, var(--nv-cy) 12%, transparent)">WHY AM I TIRED?</Interactive>
            )}
            {actions?.askPeak && (
              <Interactive as="span" onClick={actions.askPeak}
                base={`align-self:flex-start;cursor:pointer;font:600 9px ${M};letter-spacing:.12em;padding:5px 11px;border-radius:99px;border:1px solid color-mix(in srgb, var(--nv-gold) 42%, transparent);color:var(--nv-gold)`}
                hoverStyle="background:color-mix(in srgb, var(--nv-gold) 12%, transparent)">WHEN AM I AT MY BEST?</Interactive>
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
            <div style={css(`font:600 9px ${M};letter-spacing:.22em;color:var(--nv-gold)`)}>SESSION IN PROGRESS</div>
            <div style={css('font-size:24px;font-weight:600;letter-spacing:.04em;margin-top:2px')}>{resume.name.toUpperCase()}</div>
            <div style={css('color:var(--nv-ink60);font-size:12.5px;margin-top:2px;font-variant-numeric:tabular-nums')}>
              {resume.done} set{resume.done === 1 ? '' : 's'} ticked — pick up where you left off
            </div>
            <Interactive as="span" onClick={resume.go}
              base={`margin-top:12px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;font:600 12px ${M};letter-spacing:.14em;color:#1a1322;padding:11px 18px;border-radius:12px;background:var(--nv-gold);box-shadow:0 0 26px -8px color-mix(in srgb, var(--nv-gold) 70%, transparent)`}
              hoverStyle="filter:brightness(1.08)"
            >▶ RESUME</Interactive>
          </div>
        )}
        {!resume && (o.today || o.restDay) && (
          <div style={css('flex:1 1 300px;border-radius:18px;padding:16px;position:relative;overflow:hidden;border:1px solid color-mix(in srgb, var(--nv-cy) 35%, transparent);background:linear-gradient(135deg,color-mix(in srgb, var(--nv-cy) 10%, transparent),color-mix(in srgb, var(--nv-vi) 06%, transparent))')}>
            <div style={css(`font:600 9px ${M};letter-spacing:.22em;color:var(--nv-cy)`)}>{o.today ? "ON TODAY'S CARD" : 'TODAY'}</div>
            <div style={css('font-size:24px;font-weight:600;letter-spacing:.04em;margin-top:2px')}>{o.today ? o.today.name.toUpperCase() : 'REST DAY'}</div>
            {o.today && (
              <div style={css('color:var(--nv-ink60);font-size:12.5px;margin-top:2px;font-variant-numeric:tabular-nums')}>
                {o.today.exerciseCount} exercises{o.today.lastVolume ? ` · last time ${o.today.lastVolume.toLocaleString()} kg` : ''}
              </div>
            )}
            {o.today && actions?.begin && (
              <Interactive as="span" onClick={actions.begin}
                base={`margin-top:12px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;font:600 12px ${M};letter-spacing:.14em;color:var(--nv-cy);padding:11px 18px;border-radius:12px;border:1px solid color-mix(in srgb, var(--nv-cy) 55%, transparent);background:linear-gradient(180deg,color-mix(in srgb, var(--nv-cy) 18%, transparent),color-mix(in srgb, var(--nv-cy) 4%, transparent));box-shadow:0 0 26px -8px color-mix(in srgb, var(--nv-cy) 70%, transparent)`}
                hoverStyle="box-shadow:0 0 34px -6px color-mix(in srgb, var(--nv-cy) 90%, transparent)"
              >▶ BEGIN SESSION</Interactive>
            )}
          </div>
        )}
      </div>

      {/* focus for today — only when something meaningful exists */}
      {o?.focus && (
        <div style={css('border-radius:16px;padding:13px 14px;border:1px solid color-mix(in srgb, var(--nv-gold) 40%, transparent);background:linear-gradient(135deg,color-mix(in srgb, var(--nv-gold) 10%, transparent),color-mix(in srgb, var(--nv-gold) 2%, transparent))')}>
          <span style={css(`font:600 9px ${M};letter-spacing:.22em;color:var(--nv-gold)`)}>◈ FOCUS FOR TODAY</span>
          <div style={css('font-size:13.5px;color:var(--nv-ink);margin-top:5px;line-height:1.5')}>{o.focus.text}</div>
        </div>
      )}

      {/* momentum feed */}
      {o && (o.momentum?.prs?.length > 0 || o.momentum?.plateau || o.momentum?.streak >= 2) && (
        <div style={css('display:flex;gap:10px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none')}>
          {o.momentum.prs.map((p) => (
            <div key={p.name + p.kind} style={css(fcardBase('color-mix(in srgb, var(--nv-gold) 50%, transparent)') + ';background:linear-gradient(160deg,color-mix(in srgb, var(--nv-gold) 10%, transparent),var(--nv-glass))')}>
              <span style={css(`font:600 8.5px ${M};letter-spacing:.18em;color:var(--nv-gold);display:block;margin-bottom:6px`)}>◆ PR{p.date ? ` · ${p.date.slice(5)}` : ''}</span>
              <div style={css('font-size:14.5px;font-weight:600;line-height:1.25')}>{p.name}</div>
              <div style={css('font-size:10.5px;color:var(--nv-ink40);margin-top:4px;font-variant-numeric:tabular-nums')}>
                {p.kind === 'weight' ? `${p.value}kg × ${p.reps} — heaviest ever` : <span><Term k="e1RM">e1RM</Term> {`${p.value}kg`}</span>}{p.previous ? ` · was ${Math.round(p.previous * 10) / 10}` : ''}
              </div>
            </div>
          ))}
          {o.momentum.plateau && (
            <Interactive as="div" onClick={actions?.askPlateau ? () => actions.askPlateau(o.momentum.plateau.name) : undefined}
              base={fcardBase('color-mix(in srgb, var(--nv-warn) 45%, transparent)')} hoverStyle="transform:translateY(-2px);border-color:var(--nv-warn)">
              <span style={css(`font:600 8.5px ${M};letter-spacing:.18em;color:var(--nv-warn);display:block;margin-bottom:6px`)}>▲ <Term k="stalled">STALLED</Term> · {o.momentum.plateau.spanDays}D</span>
              <div style={css('font-size:14.5px;font-weight:600;line-height:1.25')}>{o.momentum.plateau.name}</div>
              <div style={css('font-size:10.5px;color:var(--nv-ink40);margin-top:4px')}>no strength gain — tap for Coach's fix</div>
            </Interactive>
          )}
          {o.momentum.streak >= 2 && (
            <div style={css(fcardBase('var(--nv-edge)'))}>
              <span style={css(`font:600 8.5px ${M};letter-spacing:.18em;color:var(--nv-good);display:block;margin-bottom:6px`)}>● STREAK</span>
              <div style={css('font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums')}>{o.momentum.streak} sessions</div>
            </div>
          )}
        </div>
      )}

      {/* weekly volume vs goal-aware targets */}
      {o?.volume?.length > 0 && (
        <div style={css('background:var(--nv-glass);border:1px solid var(--nv-edge);border-radius:16px;padding:14px')}>
          <div style={css('display:flex;justify-content:space-between;align-items:baseline')}>
            <span style={css(`font:600 9px ${M};letter-spacing:.22em;color:color-mix(in srgb, var(--nv-ink) 40%, transparent)`)}><Term k="hard sets">HARD SETS THIS WEEK</Term></span>
            {under.length > 0 && <span style={css(`font:600 9px ${M};letter-spacing:.14em;color:var(--nv-warn)`)}>GOAL MUSCLES UNDER ▲</span>}
          </div>
          {o.volume.slice(0, 6).map((v) => {
            const pct = Math.min(100, Math.round((v.sets / v.target) * 100));
            const low = v.goalMuscle && v.sets < v.target;
            return (
              <div key={v.muscle} style={css('display:flex;align-items:center;gap:8px;margin-top:7px')}>
                <span style={css(`width:76px;font:600 9px ${M};letter-spacing:.08em;color:${v.goalMuscle ? 'var(--nv-gold)' : 'color-mix(in srgb, var(--nv-ink) 40%, transparent)'}`)}>{v.muscle.toUpperCase()}</span>
                <div style={css('flex:1;height:8px;border-radius:4px;background:rgba(130,175,255,.08);overflow:hidden;position:relative')}>
                  <i style={css(`display:block;height:100%;width:${pct}%;border-radius:4px;background:${low ? 'linear-gradient(90deg,rgba(224,131,131,.8),rgba(224,131,131,.5))' : 'linear-gradient(90deg,var(--nv-vi),var(--nv-cy))'}`)} />
                  <span style={css('position:absolute;top:-2px;bottom:-2px;width:2px;background:rgba(232,236,246,.35);left:100%')} />
                </div>
                <span style={css(`width:44px;text-align:right;font:600 10px ${M};color:${low ? 'var(--nv-warn)' : 'var(--nv-ink60)'};font-variant-numeric:tabular-nums`)}>{v.sets}/{v.target}</span>
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
