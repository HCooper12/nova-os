// THE MOTION CHECK — every pattern, every phase, on one page.
//
// Standing rule, his instruction 9 Sep 2026: no version of the figure ships
// without watching it MOVE through every exercise it can be asked to perform.
// "It needs to work flawlessly so you need to be making sure that you are
// screen recording and checking the fluid movement of every version of the
// model that is incorporated for any exercise. There are no exceptions."
//
// A still can hide a lot. A filmstrip cannot: a limb that stretches, a joint
// that pinches, a bar that leaves the hands, a body that floats off the pad —
// all of it shows the moment you put ten phases of the same rep side by side.
// This page renders exactly that, through the SAME component the app uses
// (`Body3D` with a frozen `phase`), so what passes here is what he sees.
//
//   npm run dev
//   open http://localhost:5173/nova-os/tools/motion/harness.html          → all patterns
//   ...harness.html?ex=squat&frames=12                                    → one, finely
//   ...harness.html?view=side                                             → from the side
//
// `tools/motion/record.mjs` drives this with Chrome and writes an animated
// GIF per exercise, which is the recording itself.

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Body3D from '../../src/Body3D.jsx';
import { PATTERNS } from '../../src/exercise3d.js';

const q = new URLSearchParams(location.search);
const only = q.get('ex');
const frames = Math.max(2, Math.min(24, Number(q.get('frames') || 8)));
const view = q.get('view') || 'three-quarter';
// Body3D resolves an exercise NAME to a pattern first, and that resolution
// wins over the `pattern` prop. Passing the pattern id as the name meant
// `row-bent` resolved through the /row/ rule back to `row`, and the sheet
// showed the same lift twice while labelling them differently. So the sheet
// names nothing unless asked to — `?name=` exists to test the resolver itself.
const asName = q.get('name') || '';
// `at` pins the sheet to a single phase — the recorder steps it frame by frame
// to build a real recording rather than a contact sheet.
const at = q.has('at') ? Number(q.get('at')) : null;
const focus = q.get('focus') || null;
const size = Number(q.get('size') || 200);
// A browser keeps only ~16 live WebGL contexts. Ask for all 26 patterns at
// once and the oldest silently lose theirs and render pure white — which
// looks exactly like a broken model and is not. So the sheet pages.
const per = Math.max(1, Number(q.get('per') || Math.max(1, Math.floor(12 / frames))));
const page = Math.max(0, Number(q.get('page') || 0));

// Every pattern lights something, so the highlight path is exercised too — a
// muscle group that paints the wrong region is a fault of the same family.
const LIT = { primary: ['quads', 'chest', 'lats'], secondary: ['abs', 'triceps'] };

function Strip({ id }) {
  const p = PATTERNS[id];
  return (
    <div className="row">
      <div className="lbl">{id} — {p.label}</div>
      <div className="strip">
        {Array.from({ length: frames }, (_, i) => {
          const phase = at != null ? at : i / Math.max(1, frames - 1);
          return (
            <div key={i} style={{ width: size }}>
              <Body3D
                muscles={LIT}
                pattern={id}
                name={asName}
                height={size}
                phase={phase}
                view={view}
                focus={focus}
                chrome={false}
              />
              {at == null && <div className="ph">{phase.toFixed(2)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// FILM MODE — one figure, one canvas, and a phase the recorder drives from
// outside. Relaunching a browser per frame took three seconds a frame, which
// made recording all 26 patterns a half-hour job and therefore a job nobody
// would do. One page, stepped, is a minute.
function Film({ id }) {
  const [phase, setPhase] = useState(0);
  window.__setPhase = (p) => setPhase(p);
  window.__filmReady = true;
  return (
    <Body3D muscles={LIT} pattern={id} name={asName} height={size}
      phase={phase} view={view} focus={focus} chrome={false} />
  );
}

const all = Object.keys(PATTERNS);
const ids = only ? [only] : all.slice(page * per, page * per + per);
const pages = only ? 1 : Math.ceil(all.length / per);

if (q.get('film') === '1' && only) {
  document.body.style.background = '#0a0d16';
  createRoot(document.getElementById('root')).render(
    <div style={{ width: size, height: size }}><Film id={only} /></div>,
  );
} else {
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <h1>
      Motion check · {ids.length} of {all.length} · page {page + 1}/{pages} · {frames} phases · {view}
    </h1>
    {ids.map((id) => <Strip key={id} id={id} />)}
  </StrictMode>,
);
}
