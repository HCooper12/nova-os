import { lazy, Suspense, useState } from 'react';
import { css } from './css.js';
const Body3D = lazy(() => import('./Body3D.jsx'));
import { BodyMap, MuscleLegend } from './BodyMap.jsx';
import { Eyebrow, Chip, Meta } from './Controls.jsx';
import { muscleVar } from './muscleHue.js';

const M = "var(--nv-font-mono)";
// the UI face — for prose inside a panel, where mono is a label voice
const R = "var(--nv-font-ui)";

// The Companion canvas — panels Nova puts on screen mid-conversation.
// Every number here came from the server's deterministic builders
// (server/lib/panels.js); this file only draws. Missing data renders
// as missing.

const dim = (pct) => `color-mix(in srgb, var(--nv-ink) ${pct}%, transparent)`;

// `head` replaces the eyebrow entirely for a card whose title deserves the
// serif news line rather than a mono label (§2b rule 7).
function Card({ label, head, children }) {
  return (
    <div style={css(`margin-top:10px;min-width:0;max-width:100%;box-sizing:border-box;overflow:hidden;border:1px solid ${dim(10)};border-radius:12px;padding:12px 14px;background:${dim(3)};animation:fadeUp var(--nv-dur-base) var(--nv-ease)`)}>
      {head || (label != null && <Eyebrow style={{ marginBottom: '9px' }}>{label}</Eyebrow>)}
      {children}
    </div>
  );
}

// THE LOAD RAIL — six weeks of a lift, drawn rather than printed.
//
// The aesthetic review, 22 Sep 2026, finding 5: this card listed
// `09-15 25×7@10 25×7@10 25×7@10` six times over. The data underneath was a
// clean 22.5kg→25kg progression across six sessions and the card said nothing
// about it — the one question he opens the card to answer ("is this moving?")
// was the one thing it refused to show. The weight column did not even align,
// because the sets arrived pre-joined into one string.
//
// So: one row per session, newest first. The weight is a serif numeral — the
// number he is actually tracking, set like a figure rather than a token in a
// log line. Each set is a bar whose HEIGHT is its reps and whose OPACITY is
// its RPE, so a session that got heavier reads taller and a session that
// ground out at RPE 10 reads darker, both at a glance and without a legend.
// The bars are the muscle's own hue (src/muscleHue.js), the same colour the
// figure above lights and the volume bars on Train wear.
//
// The session carrying the heaviest load is ringed: on a six-row rail the
// top set is the thing worth finding, and finding it should not require
// reading six numbers.
function LoadRail({ recent, group }) {
  const rows = (recent || []).filter((r) => (r.setRows || []).length);
  // No structured sets (an older server, or a tracking type with no weight):
  // fall back to exactly what was there before rather than drawing nothing.
  if (!rows.length) {
    return (recent || []).map((r) => (
      <div key={r.date + r.sets} style={css(`display:flex;gap:10px;padding:3px 0;font:var(--nv-micro-l);color:${dim(78)}`)}>
        <span style={css(`flex:none;color:${dim(45)}`)}>{r.date.slice(5)}</span>
        <span style={css('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{r.sets}</span>
      </div>
    ));
  }
  const hue = muscleVar(group);
  const best = Math.max(...rows.map((r) => r.topWeight || 0));
  // Only the MOST RECENT session at the best weight is ringed. Two sessions
  // tie often (he repeats a load before adding to it) and ringing both says
  // "these two are special", which is not the question — "when did this last
  // go up" is.
  const bestKey = (rows.find((r) => (r.topWeight || 0) === best) || {}).date;
  // The bars scale across the RANGE he actually worked in, not from zero: his
  // sets sit between 7 and 10 reps, and a zero-based scale renders that as
  // three bars of near-identical height, which is a chart that shows nothing.
  const allReps = rows.flatMap((r) => r.setRows.map((x) => x.reps));
  const lo = Math.min(...allReps, 1);
  const hi = Math.max(...allReps, lo + 1);
  const barPct = (reps) => 34 + Math.round(((reps - lo) / (hi - lo)) * 66);
  return (
    <div style={css('display:flex;flex-direction:column;gap:2px')}>
      {rows.map((r) => {
        const isBest = best > 0 && r.date === bestKey;
        return (
          <div key={r.date + r.sets} title={`${r.date} · ${r.sets}`}
            style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '6px 8px', borderRadius: '10px',
              background: isBest ? `color-mix(in srgb, ${hue} 09%, transparent)` : 'transparent',
              boxShadow: isBest ? `inset 0 0 0 1px color-mix(in srgb, ${hue} 32%, transparent)` : 'none' }}>
            <span style={css(`flex:none;width:38px;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:${dim(42)};font-variant-numeric:tabular-nums`)}>{r.date.slice(5)}</span>
            <span style={{ flex: 'none', display: 'flex', alignItems: 'baseline', gap: '3px', minWidth: '62px' }}>
              <span style={{ font: `400 20px var(--nv-font-serif)`, lineHeight: 1, color: isBest ? hue : 'var(--nv-ink)', fontVariantNumeric: 'tabular-nums' }}>{r.topWeight}</span>
              <span style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:${dim(40)}`)}>kg</span>
            </span>
            {/* the sets themselves: height is reps, opacity is how hard it was */}
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: '3px', height: '26px' }}>
              {r.setRows.map((x, i) => (
                <i key={i} aria-hidden="true"
                  style={{ display: 'block', width: '7px', flex: 'none', borderRadius: '2px 2px 1px 1px',
                    height: `${barPct(x.reps)}%`,
                    background: hue,
                    opacity: x.rpe ? Math.min(1, 0.32 + (x.rpe / 10) * 0.68) : 0.6 }} />
              ))}
            </span>
            <span style={css(`flex:none;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:${dim(38)};font-variant-numeric:tabular-nums`)}>{r.totalReps} reps</span>
          </div>
        );
      })}
      <Meta as="div" tone="faint" style={{ marginTop: '5px', textTransform: 'none', letterSpacing: 0 }}>
        Bar height is reps ({lo}–{hi}), depth is RPE{best > 0 ? ` · ringed is the latest at ${best}kg` : ''}
      </Meta>
    </div>
  );
}

function TrainingWeek({ d }) {
  return (
    <Card label="Training week · live from your log">
      {(d.days || []).map((day) => (
        <div key={day.date} style={css(`display:flex;align-items:baseline;gap:10px;padding:4px 0;font:var(--nv-micro-l);${day.isToday ? 'color:var(--nv-cy)' : `color:${dim(80)}`}`)}>
          <span style={css(`width:34px;flex:none;font-size:9.5px;letter-spacing:.14em;color:${day.isToday ? 'var(--nv-cy)' : dim(45)}`)}>{day.weekday}</span>
          <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{day.planned}</span>
          {day.done.length > 0
            ? <span style={css("flex:none;color:var(--nv-good)")}>✓ {(day.done || []).map((s) => `${s.name} · ${s.sets} sets`).join(' + ')}</span>
            : <span style={css(`flex:none;color:${dim(30)}`)}>—</span>}
        </div>
      ))}
      {d.carryovers.length > 0 && (
        <div style={css(`margin-top:7px;padding-top:7px;border-top:1px solid ${dim(8)};font:var(--nv-micro-m);color:var(--nv-gold)`)}>
          {(d.carryovers || []).map((c) => `+ ${c.count} carried from ${c.from} · due ${c.due}`).join(' · ')}
        </div>
      )}
    </Card>
  );
}

// WAYS TO CHANGE IT (25 Sep 2026): the variations Coach's research found for
// this lift, led by tempo and pauses (his ask: "slower eccentric movements,
// pausing"). Each row wears the muscle's hue on its edge; what to do is the
// line he reads, why it helps sits under it. The sources say where it came
// from, by site, so a claim is never unowned.
function Variations({ list, hue, researched }) {
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
  const sources = (researched?.sources || []).map((u) => ({ u, h: host(u) })).filter((x) => x.h);
  return (
    <div style={css('margin:10px 0 4px')}>
      <Eyebrow>Ways to change it</Eyebrow>
      <div style={css('margin-top:6px;display:flex;flex-direction:column;gap:6px')}>
        {list.map((v, i) => (
          <div key={v.name} style={{ ...css(`padding:7px 10px;border-radius:10px;background:color-mix(in srgb, ${hue} 6%, transparent);border-left:2px solid color-mix(in srgb, ${hue} 70%, transparent)`),
            animation: `fadeUp var(--nv-dur-base) var(--nv-ease) ${i * 50}ms backwards` }}>
            <div style={css('font:600 13px/1.3 var(--nv-font-ui);color:var(--nv-ink)')}>{v.name}</div>
            <div style={css('margin-top:2px;font:500 12.5px/1.4 var(--nv-font-ui);color:var(--nv-ink60)')}>{v.how}</div>
            {v.why && <div style={css('margin-top:2px;font:400 11.5px/1.4 var(--nv-font-ui);color:var(--nv-ink50)')}>{v.why}</div>}
          </div>
        ))}
      </div>
      {sources.length > 0 && (
        <div style={css('margin-top:6px;font:500 11px/1.4 var(--nv-font-ui);color:var(--nv-ink50)')}>
          From Coach's research{researched?.at ? ` (${researched.at.slice(0, 10)})` : ''}:{' '}
          {sources.map((x, i) => (
            <span key={x.u}>{i ? ' · ' : ''}<a href={x.u} target="_blank" rel="noopener noreferrer" style={css('color:var(--nv-ink60);text-decoration:underline;text-underline-offset:2px')}>{x.h}</a></span>
          ))}
        </div>
      )}
    </div>
  );
}

function Exercise({ d }) {
  // 2D by default — instant, no bundle cost. 3D on request: a body he can
  // turn, performing the lift, muscles lit. His ask, 5 Sep.
  const [threeD, setThreeD] = useState(false);
  // SKIN OR MUSCLE. The same figure doing the same lift, read two ways: as a
  // body, or with the skin off and every belly, tendon and fibre showing. His
  // instruction, 12 Sep, against an anatomical reference — the detail the
  // model should have.
  const [layer, setLayer] = useState('skin');
  return (
    <Card label={null} head={
      /* A MONO LABEL IN A CORNER ENDING IN AN ORPHAN `·` (review finding 5).
         A card's headline is the serif news line, and the group it belongs to
         is a fact about it, not a continuation of its name — so the group
         wears its own hue and stands apart. */
      <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'baseline', gap: '9px', flexWrap: 'wrap' }}>
        <span style={{ font: '400 19px var(--nv-font-serif)', lineHeight: 1.15, color: 'var(--nv-ink)', minWidth: 0 }}>{d.name}</span>
        {d.muscleGroup && (
          <span style={{ flex: 'none', font: '600 11px var(--nv-font-ui)', letterSpacing: '.06em', textTransform: 'uppercase',
            color: muscleVar(d.muscleGroup), padding: '2px 8px', borderRadius: '6px',
            background: `color-mix(in srgb, ${muscleVar(d.muscleGroup)} 13%, transparent)` }}>{d.muscleGroup}</span>
        )}
      </div>
    }>
      {/* Anatomy first: the question "what does this actually train" is the
          one he opened the card to answer. Absent when the atlas has no
          entry — a blank silhouette would read as "trains nothing". */}
      {d.muscles && (
        <div style={css('margin-bottom:10px')}>
          <div style={css('display:flex;gap:14px;align-items:center')}>
            {!threeD && <BodyMap muscles={d.muscles} height={118} pattern={d.motion} />}
            <div style={css('flex:1;min-width:0')}>
              {d.equipment && (
                <Meta as="div" tone="faint">Equipment · {d.equipment}</Meta>
              )}
              <MuscleLegend muscles={d.muscles} />
              <div style={css('margin-top:8px')}>
                <Chip tone="cyan" active={threeD} onClick={() => setThreeD((v) => !v)}>{threeD ? '◐ Flat view' : '◉ Turn it in 3D'}</Chip>
                {threeD && (
                  <Chip
                    tone="warn"
                    active={layer === 'muscle'}
                    onClick={() => setLayer((v) => (v === 'muscle' ? 'skin' : 'muscle'))}
                    title="Take the skin off — every muscle belly, its tendon and which way its fibres run"
                  >
                    {layer === 'muscle' ? '◍ Skin on' : '◍ Skin off'}
                  </Chip>
                )}
              </div>
            </div>
          </div>
          {threeD && (
            <div style={css('margin-top:10px')}>
              <Suspense fallback={<Meta as="div" tone="faint" style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Building the figure…</Meta>}>
                <Body3D muscles={d.muscles} pattern={d.motion3d || d.motion} name={d.name || d.title || ''} height={300} layer={layer} />
              </Suspense>
            </div>
          )}
        </div>
      )}
      {d.e1rm && (
        <div style={css(`display:flex;align-items:baseline;gap:10px;margin-bottom:8px`)}>
          <span style={css(`font:600 22px ${M};color:var(--nv-cy)`)}>{d.e1rm.value}<span style={css(`font-size:11px;color:${dim(45)}`)}> kg e1RM</span></span>
          {d.e1rm.delta != null && (
            <span style={css(`font:var(--nv-micro-l);color:${d.e1rm.delta >= 0 ? 'var(--nv-good)' : 'var(--nv-warn)'}`)}>{d.e1rm.delta >= 0 ? '▲' : '▼'} {Math.abs(d.e1rm.delta)}kg vs prior block</span>
          )}
        </div>
      )}
      {d.cues && (
        <Meta as="div" tone="gold" style={{ marginBottom: '6px', ...{ textTransform: 'none', letterSpacing: 0 } }}>Cues: {d.cues}</Meta>
      )}
      {d.resourceUrl && (
        <a href={d.resourceUrl} target="_blank" rel="noopener noreferrer" style={css(`display:block;margin-bottom:6px;font:var(--nv-micro-l);color:var(--nv-cy);text-decoration:underline;text-underline-offset:2px`)}>▶ form / technique resource</a>
      )}
      {(d.variations || []).length > 0 && <Variations list={d.variations} hue={muscleVar(d.muscleGroup)} researched={d.researched} />}
      {!(d.recent || []).length && <div style={css(`font:var(--nv-micro-l);color:${dim(40)}`)}>No logged sessions yet for this one.</div>}
      {(d.recent || []).length > 0 && <LoadRail recent={d.recent} group={d.muscleGroup} />}
      {(d.inRoutines || []).length > 0 && (
        <Meta as="div" tone="faint" style={{ marginTop: '7px', ...{ textTransform: 'none', letterSpacing: 0 } }}>In: {(d.inRoutines || []).join(' · ')}</Meta>
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
    <Card label="Protein · last 7 days">
      {days.length === 0 && <div style={css(`font:var(--nv-micro-l);color:${dim(40)}`)}>No tracked days yet.</div>}
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
            <span style={css(`font:var(--nv-micro-s);color:${day.floorMet ? 'var(--nv-good)' : isToday(day) ? 'var(--nv-cy)' : dim(55)}`)}>{day.p ?? '·'}</span>
            <div style={css(`width:100%;max-width:26px;border-radius:4px 4px 0 0;height:${day.p ? Math.max(6, (day.p / max) * 76) : 3}%;background:${barColour(day)}${isToday(day) ? ';outline:1px solid var(--nv-cy);outline-offset:-1px' : ''}`)} />
          </div>
        ))}
      </div>
      <div style={css("display:flex;gap:6px;margin-top:4px")}>
        {days.map((day) => (
          <span key={day.date} style={css(`flex:1;text-align:center;font:var(--nv-micro-s);color:${isToday(day) ? 'var(--nv-cy)' : dim(38)}`)}>{day.date.slice(8)}</span>
        ))}
      </div>
      {d.floor == null && (
        <div style={css(`margin-top:8px;font:var(--nv-micro-m);color:${dim(55)}`)}>No protein floor set</div>
      )}
      {days.some((day) => isToday(day)) && (
        <div style={css(`margin-top:7px;font:var(--nv-micro-m);color:${dim(42)}`)}>Today is still open — not counted above.</div>
      )}
    </Card>
  );
}

function Note({ d }) {
  return (
    <Card label={`Note · ${d.relPath}`}>
      <div style={css(`font:600 13px ${M};color:var(--nv-ink);margin-bottom:6px`)}>{d.title}</div>
      <div style={css(`font:var(--nv-micro-l);color:${dim(72)};white-space:pre-wrap;max-height:260px;overflow-y:auto`)}>{d.excerpt}</div>
      {d.truncated && <Meta as="div" tone="faint" style={{ marginTop: '6px', ...{ textTransform: 'none', letterSpacing: 0 } }}>Excerpt — the full note lives in your vault</Meta>}
    </Card>
  );
}

// The topic pulse — cached what's-new items, age self-labelled, every card
// a real found URL he opens himself.
function Pulse({ d }) {
  return (
    <Card label={`Pulse · ${d.topic} · ${d.ageLabel}`}>
      <div style={css("display:flex;flex-direction:column;gap:6px")}>
        {d.freshness && (
          // the refresh ran and found nothing new — these are the last items,
          // said plainly, not reprints wearing a fresh label
          <Meta tone="gold" style={{ textTransform: 'none', letterSpacing: 0 }}>{d.freshness}</Meta>
        )}
        {(d.items || []).map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
            style={css(`display:flex;flex-direction:column;gap:2px;text-decoration:none;border:1px solid ${dim(10)};border-radius:8px;padding:8px 11px;background:${dim(3)}`)}>
            <span style={css(`font:var(--nv-micro-l);color:var(--nv-cy)`)}>{l.title}</span>
            {l.note && <span style={css(`font:var(--nv-micro-m);color:${dim(55)}`)}>{l.note}</span>}
            <span style={css(`font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:${dim(35)}`)}>{l.source} ↗</span>
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
  const label = d.filter ? `Recent · ${String(d.filter)}` : 'Recent sessions';
  return (
    <Card label={`${label} · live from your log`}>
      {d.note && <div style={css(`font:var(--nv-micro-l);color:${dim(45)}`)}>{d.note}</div>}
      {(d.sessions || []).map((s) => (
        <div key={s.date + s.routineName} style={css(`padding:7px 0;border-top:1px solid ${dim(7)}`)}>
          <div style={css(`display:flex;align-items:baseline;gap:9px;font:var(--nv-micro-m)`)}>
            <span style={css(`flex:none;color:var(--nv-cy)`)}>{s.date.slice(5)}</span>
            <span style={css("flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap")}>{s.routineName}</span>
            <span style={css(`flex:none;color:${dim(42)}`)}>{s.totalSets} sets</span>
          </div>
          {(s.exercises || []).map((e, i) => (
            <div key={i} style={css(`display:flex;gap:9px;padding:2px 0 2px 4px;font:var(--nv-micro-m);color:${dim(72)}`)}>
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
    <Card label={`Research · ${r.title || ''}`}>
      <div style={css(`font:var(--nv-micro-l);color:${dim(78)};white-space:pre-wrap;max-height:220px;overflow-y:auto`)}>{summary}</div>
      {links.length > 0 && (
        <div style={css("display:flex;flex-direction:column;gap:6px;margin-top:10px")}>
          {links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
              style={css(`display:flex;align-items:baseline;gap:8px;text-decoration:none;border:1px solid ${dim(10)};border-radius:8px;padding:7px 10px;background:${dim(3)}`)}>
              <span style={css(`flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:var(--nv-micro-l);color:var(--nv-cy)`)}>{l.label}</span>
              {l.host && <span style={css(`flex:none;font:var(--nv-micro-s);letter-spacing:var(--nv-micro-track);color:${dim(40)}`)}>{l.host} ↗</span>}
            </a>
          ))}
        </div>
      )}
      {links.length === 0 && <div style={css(`margin-top:8px;font:var(--nv-micro-m);color:var(--nv-warn)`)}>No parseable source links — read the full brief in your Inbox.</div>}
    </Card>
  );
}
