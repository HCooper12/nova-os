import { lazy, Suspense, useState } from 'react';
import { css } from './css.js';
const Body3D = lazy(() => import('./Body3D.jsx'));
import { BodyMap, MuscleLegend } from './BodyMap.jsx';

const M = "var(--nv-font-mono)";
// the UI face — for prose inside a panel, where mono is a label voice
const R = "var(--nv-font-ui)";

// The Companion canvas — panels Nova puts on screen mid-conversation.
// Every number here came from the server's deterministic builders
// (server/lib/panels.js); this file only draws. Missing data renders
// as missing.

const dim = (pct) => `color-mix(in srgb, var(--nv-ink) ${pct}%, transparent)`;

function Card({ label, children }) {
  return (
    <div style={css(`margin-top:10px;border:1px solid ${dim(10)};border-radius:12px;padding:12px 14px;background:${dim(3)};animation:fadeUp .4s ease-out`)}>
      <div style={css(`font:500 9px ${M};letter-spacing:.24em;color:${dim(45)};margin-bottom:9px`)}>{label}</div>
      {children}
    </div>
  );
}

function TrainingWeek({ d }) {
  return (
    <Card label="TRAINING WEEK · LIVE FROM YOUR LOG">
      {(d.days || []).map((day) => (
        <div key={day.date} style={css(`display:flex;align-items:baseline;gap:10px;padding:4px 0;font:400 11.5px ${M};${day.isToday ? 'color:var(--nv-cy)' : `color:${dim(80)}`}`)}>
          <span style={css(`width:34px;flex:none;font-size:9.5px;letter-spacing:.14em;color:${day.isToday ? 'var(--nv-cy)' : dim(45)}`)}>{day.weekday}</span>
          <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{day.planned}</span>
          {day.done.length > 0
            ? <span style={css("flex:none;color:var(--nv-good)")}>✓ {(day.done || []).map((s) => `${s.name} · ${s.sets} sets`).join(' + ')}</span>
            : <span style={css(`flex:none;color:${dim(30)}`)}>—</span>}
        </div>
      ))}
      {d.carryovers.length > 0 && (
        <div style={css(`margin-top:7px;padding-top:7px;border-top:1px solid ${dim(8)};font:400 10.5px ${M};color:var(--nv-gold)`)}>
          {(d.carryovers || []).map((c) => `+ ${c.count} carried from ${c.from} · due ${c.due}`).join(' · ')}
        </div>
      )}
    </Card>
  );
}

function Exercise({ d }) {
  // 2D by default — instant, no bundle cost. 3D on request: a body he can
  // turn, performing the lift, muscles lit. His ask, 5 Sep.
  const [threeD, setThreeD] = useState(false);
  return (
    <Card label={`${d.name.toUpperCase()} · ${d.muscleGroup?.toUpperCase() || ''}`}>
      {/* Anatomy first: the question "what does this actually train" is the
          one he opened the card to answer. Absent when the atlas has no
          entry — a blank silhouette would read as "trains nothing". */}
      {d.muscles && (
        <div style={css('margin-bottom:10px')}>
          <div style={css('display:flex;gap:14px;align-items:center')}>
            {!threeD && <BodyMap muscles={d.muscles} height={118} pattern={d.motion} />}
            <div style={css('flex:1;min-width:0')}>
              {d.equipment && (
                <div style={css(`font:500 10px ${M};letter-spacing:.1em;color:${dim(45)}`)}>EQUIPMENT · {d.equipment.toUpperCase()}</div>
              )}
              <MuscleLegend muscles={d.muscles} />
              <button type="button" onClick={() => setThreeD((v) => !v)}
                style={css(`margin-top:8px;cursor:pointer;font:600 8.5px ${M};letter-spacing:.14em;padding:5px 9px;border-radius:6px;border:1px solid color-mix(in srgb, var(--nv-cy) 40%, transparent);background:transparent;color:var(--nv-cy)`)}>
                {threeD ? '◐ FLAT VIEW' : '◉ TURN IT IN 3D'}
              </button>
            </div>
          </div>
          {threeD && (
            <div style={css('margin-top:10px')}>
              <Suspense fallback={<div style={css(`height:260px;display:flex;align-items:center;justify-content:center;font:500 9px ${M};letter-spacing:.14em;color:${dim(40)}`)}>BUILDING THE FIGURE…</div>}>
                <Body3D muscles={d.muscles} pattern={d.motion} height={260} />
              </Suspense>
            </div>
          )}
        </div>
      )}
      {d.e1rm && (
        <div style={css(`display:flex;align-items:baseline;gap:10px;margin-bottom:8px`)}>
          <span style={css(`font:600 22px ${M};color:var(--nv-cy)`)}>{d.e1rm.value}<span style={css(`font-size:11px;color:${dim(45)}`)}> kg e1RM</span></span>
          {d.e1rm.delta != null && (
            <span style={css(`font:500 11px ${M};color:${d.e1rm.delta >= 0 ? 'var(--nv-good)' : 'var(--nv-warn)'}`)}>{d.e1rm.delta >= 0 ? '▲' : '▼'} {Math.abs(d.e1rm.delta)}kg vs prior block</span>
          )}
        </div>
      )}
      {d.cues && (
        <div style={css(`margin-bottom:6px;font:400 11px ${M};color:var(--nv-gold)`)}>CUES: {d.cues}</div>
      )}
      {d.resourceUrl && (
        <a href={d.resourceUrl} target="_blank" rel="noopener noreferrer" style={css(`display:block;margin-bottom:6px;font:500 11px ${M};color:var(--nv-cy);text-decoration:underline;text-underline-offset:2px`)}>▶ form / technique resource</a>
      )}
      {!(d.recent || []).length && <div style={css(`font:400 11px ${M};color:${dim(40)}`)}>No logged sessions yet for this one.</div>}
      {(d.recent || []).map((r) => (
        <div key={r.date + r.sets} style={css(`display:flex;gap:10px;padding:3px 0;font:400 11px ${M};color:${dim(78)}`)}>
          <span style={css(`flex:none;color:${dim(45)}`)}>{r.date.slice(5)}</span>
          <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{r.sets}</span>
        </div>
      ))}
      {(d.inRoutines || []).length > 0 && (
        <div style={css(`margin-top:7px;font:400 10px ${M};letter-spacing:.06em;color:${dim(40)}`)}>IN: {(d.inRoutines || []).join(' · ')}</div>
      )}
    </Card>
  );
}

function NutritionWeek({ d }) {
  const max = Math.max(d.floor || 0, ...(d.days || []).map((x) => x.p || 0), 1);
  const days = d.days || [];
  // TODAY IS NOT A MISS. It is 09:00 and he has eaten 59 of 150g — counting
  // that as a failed day, in the bar colour and in "met 0 of 7", tells him he
  // has already lost a day that has barely started. The last day in the
  // series is in progress; it is scored, and coloured, differently.
  const todayISO = new Date().toISOString().slice(0, 10);
  const isToday = (day) => day.date === todayISO;
  const settled = days.filter((day) => !isToday(day) && day.p != null);
  const metCount = settled.filter((day) => day.floorMet).length;
  const gap = d.floor != null && d.avgP != null ? d.floor - d.avgP : null;

  const barColour = (day) => {
    if (day.p == null) return dim(12);                       // never logged
    if (isToday(day)) return 'color-mix(in srgb, var(--nv-cy) 45%, transparent)';
    return day.floorMet
      ? 'color-mix(in srgb, var(--nv-good) 62%, transparent)'
      // A missed day used to render as plain dim grey — the same treatment as
      // a day with no data — so a week of misses looked like a week of gaps.
      // Missing the floor is a RESULT and now has a colour of its own.
      : 'color-mix(in srgb, var(--nv-warn) 52%, transparent)';
  };

  return (
    <Card label="PROTEIN · LAST 7 DAYS">
      {days.length === 0 && <div style={css(`font:400 11px ${M};color:${dim(40)}`)}>No tracked days yet.</div>}
      {/* The verdict, before the chart. It used to live in a caption BELOW the
          bars, which meant the chart needed a sentence to explain its own
          result — a table with extra steps. */}
      {days.length > 0 && d.floor != null && (
        <div style={css('display:flex;align-items:baseline;gap:9px;margin-bottom:11px')}>
          <span style={css(`font:600 24px ${M};color:${metCount ? 'var(--nv-good)' : 'var(--nv-warn)'}`)}>
            {metCount}<span style={css(`font-size:13px;color:${dim(45)}`)}>/{settled.length}</span>
          </span>
          <span style={css(`font:400 12px/1.35 ${R};color:${dim(72)}`)}>
            days over the {d.floor}g floor.
            {gap > 0 && <> Average {d.avgP}g — a {gap}g nightly gap.</>}
          </span>
        </div>
      )}
      <div style={css("display:flex;align-items:flex-end;gap:6px;height:64px;position:relative")}>
        {d.floor != null && (
          <div style={css(`position:absolute;left:0;right:0;bottom:${(d.floor / max) * 76}%;border-top:1px dashed color-mix(in srgb, var(--nv-good) 50%, transparent)`)} />
        )}
        {days.map((day) => (
          <div key={day.date} style={css("flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end")}>
            <span style={css(`font:500 9px ${M};color:${day.floorMet ? 'var(--nv-good)' : isToday(day) ? 'var(--nv-cy)' : dim(55)}`)}>{day.p ?? '·'}</span>
            <div style={css(`width:100%;max-width:26px;border-radius:4px 4px 0 0;height:${day.p ? Math.max(6, (day.p / max) * 76) : 3}%;background:${barColour(day)}${isToday(day) ? ';outline:1px solid var(--nv-cy);outline-offset:-1px' : ''}`)} />
          </div>
        ))}
      </div>
      <div style={css("display:flex;gap:6px;margin-top:4px")}>
        {days.map((day) => (
          <span key={day.date} style={css(`flex:1;text-align:center;font:400 8.5px ${M};color:${isToday(day) ? 'var(--nv-cy)' : dim(38)}`)}>{day.date.slice(8)}</span>
        ))}
      </div>
      {d.floor == null && (
        <div style={css(`margin-top:8px;font:400 10.5px ${M};color:${dim(55)}`)}>No protein floor set</div>
      )}
      {days.some((day) => isToday(day)) && (
        <div style={css(`margin-top:7px;font:400 9.5px ${M};color:${dim(42)}`)}>Today is still open — not counted above.</div>
      )}
    </Card>
  );
}

function Note({ d }) {
  return (
    <Card label={`NOTE · ${d.relPath.toUpperCase()}`}>
      <div style={css(`font:600 13px ${M};color:var(--nv-ink);margin-bottom:6px`)}>{d.title}</div>
      <div style={css(`font:400 11.5px/1.65 ${M};color:${dim(72)};white-space:pre-wrap;max-height:260px;overflow-y:auto`)}>{d.excerpt}</div>
      {d.truncated && <div style={css(`margin-top:6px;font:400 9.5px ${M};letter-spacing:.08em;color:${dim(38)}`)}>EXCERPT — THE FULL NOTE LIVES IN YOUR VAULT</div>}
    </Card>
  );
}

// The topic pulse — cached what's-new items, age self-labelled, every card
// a real found URL he opens himself.
function Pulse({ d }) {
  return (
    <Card label={`PULSE · ${d.topic.toUpperCase()} · ${d.ageLabel.toUpperCase()}`}>
      <div style={css("display:flex;flex-direction:column;gap:6px")}>
        {d.freshness && (
          // the refresh ran and found nothing new — these are the last items,
          // said plainly, not reprints wearing a fresh label
          <span style={css(`font:500 8.5px ${M};letter-spacing:.18em;color:var(--nv-gold)`)}>{d.freshness.toUpperCase()}</span>
        )}
        {(d.items || []).map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
            style={css(`display:flex;flex-direction:column;gap:2px;text-decoration:none;border:1px solid ${dim(10)};border-radius:8px;padding:8px 11px;background:${dim(3)}`)}>
            <span style={css(`font:500 11.5px ${M};color:var(--nv-cy)`)}>{l.title}</span>
            {l.note && <span style={css(`font:400 10px/1.5 ${M};color:${dim(55)}`)}>{l.note}</span>}
            <span style={css(`font:400 8.5px ${M};letter-spacing:.06em;color:${dim(35)}`)}>{l.source} ↗</span>
          </a>
        ))}
      </div>
    </Card>
  );
}

// RECENT SESSIONS — the panel that was missing when he asked to see his last
// few Upper Body workouts. Each session is a header (date, routine, set
// count) and the lifts under it with their real sets, so he can read along
// while Nova talks instead of trying to hold numbers in his head.
function Sessions({ d }) {
  const label = d.filter ? `RECENT · ${String(d.filter).toUpperCase()}` : 'RECENT SESSIONS';
  return (
    <Card label={`${label} · LIVE FROM YOUR LOG`}>
      {d.note && <div style={css(`font:400 11px ${M};color:${dim(45)}`)}>{d.note}</div>}
      {(d.sessions || []).map((s) => (
        <div key={s.date + s.routineName} style={css(`padding:7px 0;border-top:1px solid ${dim(7)}`)}>
          <div style={css(`display:flex;align-items:baseline;gap:9px;font:500 10.5px ${M}`)}>
            <span style={css(`flex:none;color:var(--nv-cy)`)}>{s.date.slice(5)}</span>
            <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{s.routineName}</span>
            <span style={css(`flex:none;color:${dim(42)}`)}>{s.totalSets} sets</span>
          </div>
          {(s.exercises || []).map((e, i) => (
            <div key={i} style={css(`display:flex;gap:9px;padding:2px 0 2px 4px;font:400 10.5px ${M};color:${dim(72)}`)}>
              <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{e.name}</span>
              <span style={css(`flex:none;color:${dim(50)}`)}>{e.top || `${e.setCount}\u00d7`}</span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

export function VoicePanel({ panel }) {
  if (!panel || !panel.data) return null;
  if (panel.type === 'training-week') return <TrainingWeek d={panel.data} />;
  if (panel.type === 'exercise') return <Exercise d={panel.data} />;
  if (panel.type === 'nutrition-week') return <NutritionWeek d={panel.data} />;
  if (panel.type === 'note') return <Note d={panel.data} />;
  if (panel.type === 'pulse') return <Pulse d={panel.data} />;
  if (panel.type === 'sessions') return <Sessions d={panel.data} />;
  return null;
}

// The Researcher's brief, rendered as it lands: the summary in the model's
// own reviewed words, and every source as a card HE opens — nothing
// auto-opens, and nothing renders that isn't in the pending record itself.
export function SourcesPanel({ r }) {
  const parts = (r.body || '').split(/\n#{1,3}\s*Sources\s*\n?/i);
  const summary = (parts[0] || '').trim();
  const links = [];
  const urlRe = /(https?:\/\/[^\s)\]>"']+)/;
  for (const line of (parts[1] || '').split('\n')) {
    const m = line.match(urlRe);
    if (!m) continue;
    const label = line.replace(m[1], '').replace(/[[\]()<>|*-]/g, ' ').replace(/^\s*\d+[.:]?\s*/, '').replace(/\s+/g, ' ').trim();
    let host = '';
    try { host = new URL(m[1]).hostname.replace(/^www\./, ''); } catch { /* leave blank */ }
    links.push({ url: m[1], label: label || host || m[1], host });
  }
  return (
    <Card label={`RESEARCH · ${(r.title || '').toUpperCase()}`}>
      <div style={css(`font:400 11.5px/1.65 ${M};color:${dim(78)};white-space:pre-wrap;max-height:220px;overflow-y:auto`)}>{summary}</div>
      {links.length > 0 && (
        <div style={css("display:flex;flex-direction:column;gap:6px;margin-top:10px")}>
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
              style={css(`display:flex;align-items:baseline;gap:8px;text-decoration:none;border:1px solid ${dim(10)};border-radius:8px;padding:7px 10px;background:${dim(3)}`)}>
              <span style={css(`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 11px ${M};color:var(--nv-cy)`)}>{l.label}</span>
              {l.host && <span style={css(`flex:none;font:400 9px ${M};letter-spacing:.06em;color:${dim(40)}`)}>{l.host} ↗</span>}
            </a>
          ))}
        </div>
      )}
      {links.length === 0 && <div style={css(`margin-top:8px;font:400 10px ${M};color:var(--nv-warn)`)}>No parseable source links — read the full brief in your Inbox.</div>}
    </Card>
  );
}
