import { metricCard, barsCard, listCard } from './spokenCards.js';

// FINDINGS AS PICTURES.
//
// His problem, in his words: the brief speaks a lot of coach and fuel
// analysis and "it's just a lot of information I don't know what to act on
// and can't remember to refer to". A paragraph read aloud is the worst
// possible container for a comparison — "Upper Body lists 9 exercises but
// you finish about 4.4 of them" is two numbers and a gap, and a gap is a
// picture.
//
// Every detector already computes the numbers it speaks; they were simply
// never drawn. This turns each finding into the shape its own data implies:
// a gap becomes two bars, a share becomes one big figure, a spread becomes a
// ranked comparison.
//
// DOCTRINE, unchanged: a card can never say something the voice did not.
// Every number here comes off the finding object the line was written from,
// so the picture and the sentence cannot disagree. A finding whose numbers
// are missing gets NO card rather than an invented one.

export function findingCard(finding) {
  if (!finding || typeof finding !== 'object') return null;
  const f = finding;
  switch (f.kind) {
    // A plan bigger than the session he trains: listed vs actually finished.
    case 'routine-oversized':
      if (!(f.defined > 0) || !(f.avg >= 0)) return null;
      return barsCard({
        label: `${f.routineName || 'Routine'} · plan vs done`,
        bars: [
          { name: 'Listed', value: f.defined, tone: 'warn' },
          { name: 'You finish', value: f.avg, tone: 'cy' },
        ],
        foot: `across your last ${f.sessions} sessions`,
      });

    // Training at the edge: one share that says it all.
    case 'effort-ceiling':
      if (!(f.pct > 0)) return null;
      return metricCard({
        label: 'Sets at RPE 9-10',
        value: f.pct,
        unit: '%',
        caption: `OF YOUR LAST ${f.sets} WORKING SETS`,
        foot: 'training every set at the edge leaves nothing to progress into',
        tone: 'warn',
      });

    // A muscle short of, or past, its weekly target.
    case 'under-volume':
    case 'junk-volume': {
      const target = f.kind === 'under-volume' ? f.target : f.ceiling;
      if (!(f.avg >= 0) || !(target > 0)) return null;
      const short = f.kind === 'under-volume';
      return barsCard({
        label: `${f.muscle} · hard sets a week`,
        bars: [
          { name: 'You', value: f.avg, tone: short ? 'warn' : 'gold' },
          { name: short ? 'Target' : 'Ceiling', value: target, tone: 'cy' },
        ],
        foot: `${f.weeks} weeks running`,
      });
    }

    // One movement carrying its weight, another not.
    case 'low-value':
      if (f.worstPct == null || f.bestPct == null) return null;
      return barsCard({
        label: `${f.group || 'Group'} · gain per movement`,
        bars: [
          { name: f.name, value: Math.max(0, f.worstPct), tone: 'warn' },
          { name: f.bestName || 'Best in group', value: Math.max(0, f.bestPct), tone: 'good' },
        ],
        foot: 'percent gained since you started logging each',
      });

    // Flat for weeks, or in the program long enough to rotate.
    case 'stale':
    case 'tenure':
      if (!(f.weeks > 0)) return null;
      return metricCard({
        label: f.name || 'Lift',
        value: Math.round(f.weeks),
        unit: 'wks',
        caption: f.kind === 'stale' ? 'WITHOUT MOVING' : 'IN THE PROGRAM',
        foot: f.kind === 'stale' ? 'same stimulus, same result' : 'worth a block on something else',
        tone: f.kind === 'stale' ? 'warn' : 'gold',
      });

    // A lift filed under the wrong muscle — names, not numbers.
    case 'mapping':
      if (!f.name) return null;
      return listCard({
        label: 'Filed under the wrong muscle',
        items: [
          { name: f.name, note: 'the lift' },
          { name: f.actual || 'current group', note: 'filed as', tone: 'warn' },
          { name: f.expected || 'correct group', note: 'should be', tone: 'good' },
        ],
      });

    // FUEL. The numbers live in the prose of the line; they are exposed on
    // the finding so the picture is the same arithmetic, not a second guess.
    case 'fuel:protein-split':
      if (!(f.floor > 0)) return null;
      return barsCard({
        label: 'Protein · training vs rest days',
        bars: [
          { name: 'Training', value: f.trained, tone: f.trained >= f.floor ? 'good' : 'warn' },
          { name: 'Rest', value: f.rest, tone: f.rest >= f.floor ? 'good' : 'warn' },
          { name: 'Floor', value: f.floor, tone: 'cy' },
        ],
        foot: 'the days that need it most are getting the least',
      });

    case 'fuel:protein-floor':
      if (!(f.floor > 0)) return null;
      return barsCard({
        label: 'Your rotation vs your floor',
        bars: [
          { name: 'Rotation', value: f.have, tone: 'warn' },
          { name: 'Floor', value: f.floor, tone: 'cy' },
        ],
        foot: `${Math.max(0, Math.round(f.floor - f.have))}g must come from off-rotation food, every day`,
      });

    case 'fuel:kcal-split':
      if (!(f.target > 0)) return null;
      return barsCard({
        label: 'Calories on training days',
        bars: [
          { name: 'You eat', value: f.trained, tone: 'warn' },
          { name: 'Target', value: f.target, tone: 'cy' },
        ],
        foot: "the surplus that pays for the sessions isn't there",
      });

    // The floor as a ceiling: days missed against days logged.
    case 'fuel:floor-pattern':
      if (!(f.of > 0) || !(f.floor > 0)) return null;
      return barsCard({
        label: `${f.floor}g protein floor · last ${f.of} logged days`,
        bars: [
          { name: 'Missed', value: f.under, tone: 'warn' },
          { name: 'Met', value: Math.max(0, f.of - f.under), tone: 'good' },
        ],
        foot: 'the floor is currently a ceiling',
      });

    // Rest days out-eating training days.
    case 'fuel:kcal-days':
      if (!(f.rest > 0) || !(f.trained > 0)) return null;
      return barsCard({
        label: 'Calories · training vs rest days',
        bars: [
          { name: 'Training', value: f.trained, tone: 'cy' },
          { name: 'Rest', value: f.rest, tone: 'warn' },
        ],
        foot: "the fuel lands on the days that don't use it",
      });

    // Protein after the session: days that missed the window vs days that hit it.
    case 'fuel:post-training':
      if (!(f.of > 0)) return null;
      return barsCard({
        label: `Under ${f.grams}g protein within 3h of training`,
        bars: [
          { name: 'Missed', value: f.low, tone: 'warn' },
          { name: 'Hit', value: Math.max(0, f.of - f.low), tone: 'good' },
        ],
        foot: `of your last ${f.of} timed training days`,
      });

    default:
      return null;
  }
}

// THE WEEKLY AUDIT AS A PICTURE. Eight checks, three states — the
// reassuring part ("six came back clean") is the part a wall of speech
// loses, and it is the part that makes the silences trustworthy.
export function auditCard(audit) {
  const checks = audit?.checks || [];
  if (!checks.length) return null;
  const count = (s) => checks.filter((c) => c.status === s).length;
  const fired = count('fired');
  const clear = count('clear');
  const notYet = count('not-yet');
  const couldntLook = count('couldnt-look');
  return barsCard({
    label: `Program audit · week of ${audit.weekOf}`,
    bars: [
      { name: 'Decide', value: fired, tone: 'warn' },
      { name: 'Clean', value: clear, tone: 'good' },
      { name: 'Not yet', value: notYet, tone: 'cy' },
      // only drawn when it happened — a zero bar would make the normal week noisier
      ...(couldntLook ? [{ name: "Couldn't look", value: couldntLook, tone: 'warn' }] : []),
    ],
    foot: fired ? checks.filter((c) => c.status === 'fired').map((c) => c.label).join(' · ')
      : couldntLook ? `${couldntLook} check${couldntLook === 1 ? '' : 's'} could not run — a source was unreadable`
        : 'nothing needs a decision',
  });
}

// FUEL: the week's protein against his floor, day by day. "The 150g floor
// was missed on 10 of the last 13 days" is a sentence he cannot act on and
// a chart he can read in a second.
export function proteinWeekCard(week) {
  const days = (week?.days || []).filter((d) => d && d.p != null);
  if (days.length < 2) return null;
  const floor = Number(week.floor) || 0;
  const bars = days.slice(-7).map((d) => ({
    name: String(d.label || d.date || '').slice(-5),
    value: Math.round(d.p),
    tone: floor && d.p >= floor ? 'good' : 'warn',
  }));
  const hit = bars.filter((b) => b.tone === 'good').length;
  return barsCard({
    label: floor ? `Protein vs your ${Math.round(floor)}g floor` : 'Protein this week',
    bars,
    foot: floor ? `${hit} of ${bars.length} days cleared it` : `${bars.length} days logged`,
  });
}
