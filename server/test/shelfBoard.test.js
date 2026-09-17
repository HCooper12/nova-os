// THE BOARD OPENS. bookRig builds a real hinged front board and calls it "the
// one gesture that says 'this is a book'" — and for the life of the shelf that
// gesture was reachable only by HOVER, on the shelf, which the device Nova is
// for does not have: onPointerUp clears hoveredIndex on touch. Meanwhile the
// parked volume in detail had its hinge explicitly zeroed every frame, so the
// one moment you are looking straight at a book it stood shut.
//
// Pinned here: the hinge is driven from the open timeline, it swings toward the
// camera, and nobody puts `frontPivot.rotation.y = 0` back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'src', 'shelf3d', 'Shelf3D.jsx',
);
const src = await readFile(SHELF, 'utf8');

const num = (name) => {
  const m = src.match(new RegExp(`^const ${name} = (-?[0-9.]+);`, 'm'));
  assert.ok(m, `${name} is not declared as a plain constant in Shelf3D.jsx`);
  return Number(m[1]);
};

test('the detail crack swings the board TOWARD the camera', () => {
  // frontPivot sits at the spine with the board at local +x, so a NEGATIVE
  // rotation about y brings the free edge forward. Positive would drive the
  // board back through the page block it is supposed to be lifting off.
  const crack = num('DETAIL_CRACK');
  assert.ok(crack < 0, `DETAIL_CRACK must be negative, got ${crack}`);
  // and it must actually be an opening, not a hover-sized nudge
  assert.ok(Math.abs(crack) > Math.abs(num('HOVER_CRACK')) * 3,
    'DETAIL_CRACK is barely wider than the hover crack — that is not an open book');
  // ~90° turns a solid page block side-on and shows a blank cream slab
  assert.ok(Math.abs(crack) < 1.3, `DETAIL_CRACK is too wide at ${crack} rad`);
});

test('the board waits for the tumble, then opens on the same timeline', () => {
  const from = num('CRACK_FROM');
  assert.ok(from > 0.4 && from < 1,
    `CRACK_FROM must leave the roll to land and still have room to open, got ${from}`);
  // driven off the open's own p, so a close shuts the board on the way home
  // instead of returning it to the shelf hanging open
  assert.match(
    src,
    /rig\.frontPivot\.rotation\.y = DETAIL_CRACK \* smoothstep\(clamp\(\(p - CRACK_FROM\)/,
    'applyTravelPose no longer drives the hinge from the open timeline',
  );
});

test('nothing zeroes the hinge outright any more', () => {
  // The exact line this whole file exists for. `wantCrack` may still resolve
  // to 0 for a volume nobody is pointing at — that is the shelf's business —
  // but a bare assignment is how the board got stuck shut in the first place.
  const bare = [...src.matchAll(/frontPivot\.rotation\.y\s*=\s*0\s*;/g)];
  assert.deepEqual(bare.map((m) => m[0]), [],
    'frontPivot.rotation.y = 0 is back — the parked volume will stand shut again');
});

test('the curve is exact at both ends', () => {
  // the arithmetic the renderer runs, re-derived: no damping, no approach —
  // shut for the whole roll, and fully open at p = 1 to the last decimal, so
  // runTimeline’s hard settle has nothing left to correct.
  const crack = num('DETAIL_CRACK');
  const from = num('CRACK_FROM');
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smoothstep = (v) => v * v * (3 - 2 * v);
  const board = (p) => crack * smoothstep(clamp((p - from) / (1 - from), 0, 1));

  // Math.abs, because crack * 0 is -0 and -0 is not 0 to a strict equal
  assert.equal(Math.abs(board(0)), 0, 'the board is not shut at the start of the open');
  assert.equal(Math.abs(board(from)), 0, 'the board starts opening before the roll lands');
  assert.equal(board(1), crack, 'the board does not reach full open on the settle');
  // and monotonic through the opening, so it never overshoots and comes back
  let prev = 0;
  for (let p = from; p <= 1.0001; p += 0.02) {
    const v = board(Math.min(p, 1));
    assert.ok(v <= prev + 1e-12, `the board un-opens at p=${p.toFixed(2)}`);
    prev = v;
  }
});
