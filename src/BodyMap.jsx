import { css } from './css.js';
import { PATTERNS } from './exerciseMotion.js';

// The target-muscle diagram — his ask, from a Lyfta screen recording: an
// exercise should SHOW what it trains, not just name the group it is filed
// under.
//
// Drawn here rather than fetched. An owned SVG costs nothing per view, works
// with no connection, themes correctly in one line, and carries no licence
// question — the alternative was embedding somebody else's rendered anatomy.
// It is deliberately stylised: at the size this renders (about 120px tall in
// a chat card) an accurate écorché reads as brown soup, while a clear blocked
// figure reads instantly, which is the entire job.
//
// Region ids are the vocabulary in server/lib/muscles.js. The two must agree:
// a muscle the server can name and this file cannot draw is invisible, which
// is why muscles.js is a closed list and the atlas test pins every id.

// Mirrored pairs are declared once, on the LEFT of the figure, and reflected
// about x=50. Hand-writing both sides is how a diagram ends up subtly
// lopsided, and nobody can see which half is wrong.
const mirror = (shapes) => shapes.map((s) => ({ ...s, mx: true }));

// Each region: the shapes that make it up, per view.
const FRONT = {
  chest: [
    { d: 'M30 46 Q40 43 48 47 L48 66 Q38 69 31 62 Z' },
    { d: 'M70 46 Q60 43 52 47 L52 66 Q62 69 69 62 Z' },
  ],
  'front-delts': mirror([{ d: 'M33 42 Q26 44 24 54 Q30 57 34 49 Z', limb: 'arm' }]),
  'side-delts': mirror([{ d: 'M25 46 Q20 51 21 62 Q27 62 27 54 Z', limb: 'arm' }]),
  abs: [{ d: 'M42 68 L58 68 L57 106 Q50 110 43 106 Z' }],
  obliques: mirror([{ d: 'M35 72 Q41 71 41 76 L41 102 Q36 100 34 92 Z' }]),
  biceps: mirror([{ d: 'M22 58 Q28 57 28 65 L27 83 Q22 85 20 74 Z', limb: 'arm' }]),
  forearms: mirror([{ d: 'M19 89 Q24 89 24 97 L23 116 Q18 117 17 103 Z', limb: 'arm' }]),
  quads: mirror([{ d: 'M37 118 Q46 116 48 124 L46 166 Q39 167 36 156 Z', limb: 'leg' }]),
  adductors: mirror([{ d: 'M44 120 Q49 119 49 126 L48 150 Q44 149 43 138 Z', limb: 'leg' }]),
};

const BACK = {
  traps: [{ d: 'M38 42 Q50 38 62 42 L58 62 Q50 66 42 62 Z' }],
  'side-delts': mirror([{ d: 'M25 46 Q20 51 21 62 Q27 62 27 54 Z', limb: 'arm' }]),
  'rear-delts': mirror([{ d: 'M33 42 Q26 44 24 54 Q30 57 34 49 Z', limb: 'arm' }]),
  rhomboids: [{ d: 'M41 58 L59 58 L57 76 L43 76 Z' }],
  lats: mirror([{ d: 'M29 62 Q40 60 42 70 L42 96 Q33 94 28 80 Z' }]),
  'lower-back': [{ d: 'M41 92 L59 92 L57 112 Q50 115 43 112 Z' }],
  triceps: mirror([{ d: 'M22 57 Q28 56 28 65 L27 84 Q22 86 20 74 Z', limb: 'arm' }]),
  forearms: mirror([{ d: 'M19 89 Q24 89 24 97 L23 116 Q18 117 17 103 Z', limb: 'arm' }]),
  glutes: mirror([{ d: 'M36 114 Q47 112 49 122 Q48 134 38 134 Q34 126 36 114 Z' }]),
  hamstrings: mirror([{ d: 'M37 137 Q46 135 48 143 L46 172 Q39 173 36 162 Z', limb: 'leg' }]),
  calves: mirror([{ d: 'M36 176 Q44 175 45 184 L43 204 Q37 205 35 194 Z', limb: 'leg' }]),
};

// The silhouette everything sits on, drawn faintly so the lit regions read as
// the figure rather than as shapes floating in space.
//
// Composed of SEPARATE limbs rather than one outline path. The first version
// was a single path and the arms fused into the torso and the legs into each
// other, so a lit bicep looked like a lit ribcage — the diagram has one job
// and that broke it. Gaps between the parts are what make the shape read.
const SILHOUETTE = [
  { part: 'torso', d: 'M50 7 a11.5 11.5 0 1 1 -0.01 0 Z' },                    // head
  { part: 'torso', d: 'M45 30 h10 v9 h-10 Z' },                                // neck
  { part: 'torso', d: 'M50 38 q14 1 19 10 l3 20 q1 22 -3 42 q-19 5 -38 0 q-4 -20 -3 -42 l3 -20 q5 -9 19 -10 Z' },
  { part: 'armL', d: 'M28 50 q-6 4 -7 13 l-3 22 q-1 8 1 15 l1 20 q0 6 3 9 l6 -1 q1 -5 -1 -10 l-2 -19 q-1 -7 1 -14 l4 -21 q1 -8 -3 -14 Z' },
  { part: 'armR', d: 'M72 50 q6 4 7 13 l3 22 q1 8 -1 15 l-1 20 q0 6 -3 9 l-6 -1 q-1 -5 1 -10 l2 -19 q1 -7 -1 -14 l-4 -21 q-1 -8 3 -14 Z' },
  { part: 'legL', d: 'M41 111 q7 2 8 12 l-1 32 q0 8 -2 16 l-2 30 q-1 8 0 14 l-8 1 q-2 -7 -1 -15 l2 -30 q1 -9 0 -17 l-3 -30 q-1 -9 7 -13 Z' },
  { part: 'legR', d: 'M59 111 q-7 2 -8 12 l1 32 q0 8 2 16 l2 30 q1 8 0 14 l8 1 q2 -7 1 -15 l-2 -30 q-1 -9 0 -17 l3 -30 q1 -9 -7 -13 Z' },
];

// Where each group pivots, in the SVG's own coordinates — the shoulder for an
// arm, the hip for a leg. These are the joints exerciseMotion.js rotates
// about; get one wrong and the limb swings from its elbow like a broken doll.
const JOINTS = { armL: '29px 50px', armR: '71px 50px', legL: '44px 112px', legR: '56px 112px', torso: '50px 108px' };

// One limb group: the silhouette part plus every lit muscle that rides on it,
// so a bicep rotates WITH the arm instead of hovering where the arm used to
// be. Everything not on a moving limb stays in the torso group.
function Group({ name, style, children }) {
  return (
    <g style={{ transformOrigin: JOINTS[name] || '50px 110px', transformBox: 'view-box', ...style }}>{children}</g>
  );
}

function shapesFor(regions, id, limb, side) {
  // a mirrored region belongs to BOTH arms — the left copy to armL, the
  // reflected copy to armR — so each side must be emitted separately
  const out = [];
  for (const sh of regions[id] || []) {
    const rides = sh.limb ? sh.limb + (side === 'R' ? 'R' : 'L') : 'torso';
    if (rides !== (limb === 'torso' ? 'torso' : limb)) continue;
    out.push({ d: sh.d, flip: side === 'R' && !!sh.mx });
    }
  return out;
}

function Paint({ shapes, fill, opacity }) {
  return shapes.map((s, i) => (
    <path key={i} d={s.d} fill={fill} opacity={opacity}
      transform={s.flip ? 'translate(100,0) scale(-1,1)' : undefined} />
  ));
}

function Figure({ view, primary, secondary, height, motion, cycle }) {
  const regions = view === 'front' ? FRONT : BACK;
  const GROUPS = [
    ['torso', null], ['armL', 'L'], ['armR', 'R'], ['legL', 'L'], ['legR', 'R'],
  ];
  const anim = (name) => {
    const to = motion?.[name === 'torso' ? 'torso' : name.startsWith('arm') ? (name === 'armL' ? 'armL' : 'armR') : (name === 'legL' ? 'legL' : 'legR')];
    if (!to) return undefined;
    return { animation: `nvLimb-${name}-${cycle} 2.6s ease-in-out infinite alternate` };
  };
  return (
    <div style={css('display:flex;flex-direction:column;align-items:center;gap:4px')}>
      <svg viewBox="0 0 100 220" height={height} role="img"
        aria-label={`${view} view, highlighted: ${[...primary, ...secondary].join(', ') || 'none'}`}
        style={{ display: 'block', overflow: 'visible' }}>
        {GROUPS.map(([g, side]) => {
          const parts = SILHOUETTE.filter((sp) => sp.part === g);
          const sec = secondary.flatMap((id) => shapesFor(regions, id, g, side));
          const pri = primary.flatMap((id) => shapesFor(regions, id, g, side));
          if (!parts.length && !sec.length && !pri.length) return null;
          return (
            <Group key={g} name={g} style={anim(g)}>
              {parts.map((sp, i) => <path key={i} d={sp.d} fill="currentColor" opacity="0.15" />)}
              <Paint shapes={sec} fill="var(--nv-cy)" opacity={0.42} />
              <Paint shapes={pri} fill="var(--nv-mg)" opacity={0.92} />
            </Group>
          );
        })}
      </svg>
      <span style={css('font:500 8px var(--nv-font-mono);letter-spacing:.14em;opacity:.4')}>{view.toUpperCase()}</span>
    </div>
  );
}

// `views` comes from the server (muscles.js decides which sides are worth
// drawing) so a lift that only trains the front never shows an empty back.
//
// `pattern` is optional and may be null — a lift whose movement we cannot
// classify, or an isometric hold, shows the static diagram. A plausible-
// looking wrong animation would be worse than none, because form is exactly
// what he would copy off it.
export function BodyMap({ muscles, height = 128, pattern = null, animate = true }) {
  if (!muscles || !(muscles.views || []).length) return null;
  const { primary = [], secondary = [], views } = muscles;
  const motion = (animate && pattern && PATTERNS[pattern]) || null;
  const cycle = pattern ? String(pattern).replace(/[^a-z0-9]/gi, '') : 'none';

  // Keyframes are emitted per pattern, next to the figure that uses them.
  // Injecting into a global stylesheet would leak across every card on screen
  // and outlive the one that needed it.
  const keyframes = motion ? ['torso', 'armL', 'armR', 'legL', 'legR']
    .filter((g) => motion[g])
    .map((g) => `@keyframes nvLimb-${g}-${cycle}{from{transform:none}to{transform:${motion[g]}}}`)
    .join('') : '';

  return (
    <div style={css('display:flex;gap:14px;align-items:flex-start')}>
      {/* Motion is a nicety, never the information — anyone who has asked
          their system to stop animating gets the diagram standing still, and
          it still answers the question. */}
      {keyframes && <style>{`@media (prefers-reduced-motion:no-preference){${keyframes}}`}</style>}
      {views.map((v) => (
        <Figure key={v} view={v} primary={primary} secondary={secondary} height={height}
          motion={motion} cycle={cycle} />
      ))}
    </div>
  );
}

// The legend that makes the two colours mean something. Without it a viewer
// has to guess whether magenta is "more" or "less" — and the whole point of
// the card is to answer a question, not pose one.
export function MuscleLegend({ muscles }) {
  if (!muscles) return null;
  const chip = (label, colour) => (
    <span key={label} style={css(`display:inline-flex;align-items:center;gap:5px;font:500 10px var(--nv-font-mono);color:${colour}`)}>
      <span style={css(`width:7px;height:7px;border-radius:2px;background:${colour}`)} />{label}
    </span>
  );
  return (
    <div style={css('display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px')}>
      {(muscles.primaryLabels || []).map((l) => chip(l, 'var(--nv-mg)'))}
      {(muscles.secondaryLabels || []).map((l) => chip(l, 'var(--nv-cy)'))}
    </div>
  );
}
