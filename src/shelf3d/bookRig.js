// THE RIG — what makes it an object rather than a picture of one.
//
// Boards with real thickness, a straight spine the boards hinge onto, a page
// block set in from the fore-edge, headbands at head and tail, and a contact
// shadow on the board beneath. Turn the camera and you see the fore-edge;
// that is Bar 1.
//
// Geometry is SHARED. Twenty-one volumes is twenty-one sets of textures and
// three box geometries, because every volume of the same proportions is the
// same shape. The cache is ref-counted so the last rig to go releases it —
// the failure mode designed for is "twenty-one becomes two hundred", and a
// per-rig BoxGeometry is how that turns into a stall.

import * as THREE from 'three';
import { createVolumeMaterials } from './materials.js';

const BOARD = 0.0042;       // the board itself: card under cloth
const SPINE_GAP = 0.004;    // the groove between spine and board
const PAGE_INSET = 0.007;   // the fore-edge sits in from the board

const cache = new Map();

function shared(key, build) {
  let entry = cache.get(key);
  if (!entry) { entry = { value: build(), refs: 0 }; cache.set(key, entry); }
  entry.refs += 1;
  return entry.value;
}

function release(keys) {
  for (const key of keys) {
    const entry = cache.get(key);
    if (!entry) continue;
    entry.refs -= 1;
    if (entry.refs <= 0) { entry.value.dispose?.(); cache.delete(key); }
  }
}

const r3 = (n) => n.toFixed(4);

/**
 * createBookRig — one bound volume.
 *
 * @param edition  from editionFor()
 * @param textures { front, spine, back, foil } CanvasTextures (foil is the
 *                 white-on-black mask; it is used as both map and alphaMap)
 * @param sharedMats from createSharedMaterials()
 * @returns { root, frontPivot, contactShadow, setOpacity, dispose }
 */
export function createBookRig(edition, textures, sharedMats) {
  const { width: w, height: h, depth: d } = edition;
  const mats = createVolumeMaterials(edition, textures, sharedMats);

  const keys = [
    `board:${r3(w)}:${r3(h)}`,
    `spine:${r3(h)}:${r3(d)}`,
    `pages:${r3(w)}:${r3(h)}:${r3(d)}`,
    `band:${r3(w)}:${r3(d)}`,
    'shadow',
  ];
  const boardGeo = shared(keys[0], () => new THREE.BoxGeometry(w, h, BOARD));
  const spineGeo = shared(keys[1], () => new THREE.BoxGeometry(SPINE_GAP * 2, h, d));
  const pageGeo = shared(keys[2], () => new THREE.BoxGeometry(w - PAGE_INSET, h - PAGE_INSET, d - BOARD * 2 - 0.002));
  const bandGeo = shared(keys[3], () => new THREE.BoxGeometry(w - PAGE_INSET, 0.0032, d - BOARD * 2 - 0.004));
  const shadowGeo = shared(keys[4], () => new THREE.PlaneGeometry(1, 1));

  const root = new THREE.Group();
  root.name = `nova-volume-${edition.id ?? edition.title}`;

  // BoxGeometry groups run [+x, -x, +y, -y, +z, -z] — the painted face is the
  // one you can see, every other face is plain cloth.
  const faces = (art, index) => {
    const list = [mats.cloth, mats.cloth, mats.cloth, mats.cloth, mats.cloth, mats.cloth];
    list[index] = art;
    return list;
  };

  // THE PAGE BLOCK FADES TOO. It was drawn with the SHARED paper material,
  // which is opaque and belongs to every rig at once — so a volume that had
  // faded to nothing at the end of the shelf still showed a blank cream slab
  // standing there. Seen at 1280, not on the phone. A clone costs one material
  // and no texture: the map is shared, only the opacity is per-volume.
  const paper = sharedMats.paper.clone();
  paper.transparent = true;
  const headband = sharedMats.headband.clone();
  headband.transparent = true;
  mats.fade.push(paper, headband);

  // the page block first, so the boards close onto it
  const pages = new THREE.Mesh(pageGeo, paper);
  pages.name = 'pages';
  pages.castShadow = true;
  pages.receiveShadow = true;
  root.add(pages);

  for (const sign of [1, -1]) {
    const band = new THREE.Mesh(bandGeo, headband);
    band.position.y = sign * ((h - PAGE_INSET) / 2 - 0.0016);
    root.add(band);
  }

  const spine = new THREE.Mesh(spineGeo, faces(mats.spine, 1));
  spine.name = 'spine';
  spine.position.x = -w / 2 + SPINE_GAP;
  spine.castShadow = true;
  root.add(spine);

  const back = new THREE.Mesh(boardGeo, faces(mats.back, 5));
  back.name = 'back';
  back.position.z = -(d / 2 - BOARD / 2);
  back.castShadow = true;
  back.receiveShadow = true;
  root.add(back);

  // THE HINGE. The front board hangs off a pivot at the spine so it can crack
  // open under the pointer — the one gesture that says "this is a book".
  const frontPivot = new THREE.Group();
  frontPivot.position.set(-w / 2, 0, d / 2 - BOARD / 2);
  root.add(frontPivot);

  const front = new THREE.Mesh(boardGeo, faces(mats.front, 4));
  front.name = 'front';
  front.position.x = w / 2;
  front.castShadow = true;
  front.receiveShadow = true;
  frontPivot.add(front);

  // the foil, a fifth of a millimetre proud of the board: metal that catches
  // the key light on its own beat. A cheap binding has no foil mask yet and
  // therefore no foil: an unlettered volume, not a metal slab.
  if (mats.foil) {
    const foil = new THREE.Mesh(
      shared(`foilplane:${r3(w)}:${r3(h)}`, () => new THREE.PlaneGeometry(w, h)),
      mats.foil,
    );
    foil.name = 'foil';
    keys.push(`foilplane:${r3(w)}:${r3(h)}`);
    foil.position.set(w / 2, 0, BOARD / 2 + 0.0002);
    frontPivot.add(foil);
  }

  // the shadow the volume drops on the board it stands on
  const contactShadow = new THREE.Mesh(shadowGeo, sharedMats.contactShadow.clone());
  contactShadow.name = 'contact';
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = -h / 2 + 0.0012;
  contactShadow.scale.set(w * 2.4, d * 4.2, 1);
  contactShadow.renderOrder = -1;
  root.add(contactShadow);

  let opacity = 1;
  // HOW MUCH OF THIS VOLUME IS STILL STANDING ON THE BOARD. 1 on the shelf,
  // 0 in mid-air.
  //
  // THIS IS THE BLACK SLAB HE FILMED. The contact patch is a plane 2.4 boards
  // wide — about 460 CSS px at his stage height, which is WIDER THAN THE
  // WHOLE CANVAS — drawn with MultiplyBlending in --nv-void, and its gradient
  // canvas (512×128) is cut off hard at its own top and bottom edges, so it
  // has no soft boundary there at all. Flat under a standing book it is
  // invisible and does its job. The tumble turns it: at p≈0.65 the book is at
  // rx 0.60, rz -0.24, and the plane tips into the camera as a hard-edged
  // near-black quadrilateral across the room. Found by holding the timeline
  // at p and differencing the frame with the plane forced on against the same
  // frame with it off — the difference IS the slab, edges and all
  // (design/audits/library-2026-09-17/heat-contact-plane.png).
  //
  // The cast shadow goes at the same time and for the same reason: as the
  // volume scales up and lifts it grows and clips against the key light's
  // shadow frustum. A book in mid-air, over a room that is receding, casts
  // neither.
  let grounded = 1;
  const casters = [pages, spine, back, front];
  const applyGround = () => {
    contactShadow.material.opacity = opacity * 0.24 * grounded;
    contactShadow.visible = opacity > 0.02 && grounded > 0.01;
  };
  return {
    root, frontPivot, contactShadow, edition,
    get opacity() { return opacity; },
    get grounded() { return grounded; },
    setGrounded(v) {
      if (v === grounded) return;
      const wasCasting = grounded > 0.5;
      grounded = v;
      applyGround();
      const casting = v > 0.5;
      if (casting !== wasCasting) for (const m of casters) m.castShadow = casting;
    },
    setOpacity(v) {
      opacity = v;
      for (const m of mats.fade) m.opacity = v;
      applyGround();
      root.visible = v > 0.02;
    },
    dispose() {
      // paper and headband are in mats.fade, so mats.dispose() owns them too
      mats.dispose();
      contactShadow.material.dispose();
      for (const t of Object.values(textures)) t?.dispose?.();
      release(keys);
      root.clear();
    },
  };
}

// Only for the tests and the teardown assertion: how many shared geometries
// are still alive. A shelf that has been unmounted should leave none.
export const liveGeometryCount = () => cache.size;
