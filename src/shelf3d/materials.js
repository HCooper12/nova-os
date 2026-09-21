// THE PBR SET — built once per renderer, shared by every volume.
//
// Twenty-one books is twenty-one draw calls, not twenty-one material systems.
// The weave normal map, the page paper, the fore-edge, the headband, the
// walnut board and the contact-shadow gradient are made ONCE and handed to
// every rig; only the three painted faces (front, spine, back) and the cloth
// colour are per-volume, because only those actually differ.
//
// Every colour in here arrives as a token READ, never a literal: the caller
// resolves `--nv-acc`, `--nv-ink`, `--nv-void` from the mount element's
// computed style and passes them in, so the four themes recolour the room for
// free and the "no palette in the styles" rule keeps holding.
//
// The numbers are the reference implementation's, which studied Stripe Press:
// cloth sheen .34 at roughness .98 (bookcloth is matte but catches a rim),
// cover art clearcoat .06 (a jacket's varnish, not a phone screen), foil
// metalness .94 / roughness .2 with a polygon offset so the metal sits proud
// of the board instead of z-fighting it.

import * as THREE from 'three';

function noiseCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

// A deterministic generator — the weave and the grain must be the same on
// every device or two phones render two different shelves.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeWeaveNormal() {
  const size = 128;
  const c = noiseCanvas(size, (ctx, n) => {
    ctx.fillStyle = 'rgb(128,128,255)';
    ctx.fillRect(0, 0, n, n);
    const rnd = seeded(20260917);
    // warp and weft: two perpendicular runs of slightly wandering threads
    for (let i = 0; i < n; i += 3) {
      ctx.strokeStyle = `rgba(${150 + rnd() * 24},128,255,.5)`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + (rnd() - 0.5) * 2, n); ctx.stroke();
      ctx.strokeStyle = `rgba(128,${150 + rnd() * 24},255,.42)`;
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(n, i + (rnd() - 0.5) * 2); ctx.stroke();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 10);
  t.name = 'nova-cloth-weave';
  return t;
}

function makePaperTexture() {
  const c = noiseCanvas(256, (ctx, n) => {
    ctx.fillStyle = '#efe7d6';
    ctx.fillRect(0, 0, n, n);
    const rnd = seeded(8814);
    // the fore-edge is a stack of sheets, so it is LINES, not noise. Without
    // them a page block reads as a solid cream brick — but at a grazing angle
    // a hard 1px line every 2px aliased into white dashes, which is what the
    // spine side of the detail capture was showing. Wider pitch, lower
    // contrast, and mipmaps so distance resolves it to paper instead of morse.
    for (let x = 0; x < n; x += 3) {
      ctx.fillStyle = `rgba(126,112,90,${0.04 + rnd() * 0.07})`;
      ctx.fillRect(x, 0, 2, n);
    }
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(150,132,104,${rnd() * 0.10})`;
      ctx.fillRect(rnd() * n, rnd() * n, 1, 1);
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.name = 'nova-paper';
  return t;
}

function makeWalnutTexture(base) {
  const c = noiseCanvas(512, (ctx, n) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, n, n);
    const rnd = seeded(556677);
    for (let i = 0; i < 46; i++) {
      const y = rnd() * n;
      ctx.strokeStyle = `rgba(0,0,0,${0.05 + rnd() * 0.16})`;
      ctx.lineWidth = 0.6 + rnd() * 3.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= n; x += 32) ctx.lineTo(x, y + Math.sin((x / n) * Math.PI * (1 + rnd() * 2)) * (3 + rnd() * 9));
      ctx.stroke();
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.name = 'nova-walnut';
  return t;
}

// The reference's radial gradient (index.html:3301). A book with no contact
// shadow floats a millimetre above the board and the eye sees it instantly.
function makeContactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(256, 64, 10, 256, 64, 254);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.38, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  const t = new THREE.CanvasTexture(c);
  t.name = 'nova-contact-shadow';
  return t;
}

/**
 * createSharedMaterials — one call per renderer.
 * @param tokens { woodColour, shadowColour } resolved hex/rgb strings read
 *               from the mount's computed --nv-* tokens.
 */
export function createSharedMaterials(tokens = {}) {
  const weave = makeWeaveNormal();
  const paperTex = makePaperTexture();
  const walnutTex = makeWalnutTexture(tokens.woodColour || '#3a2418');
  const contactShadowMap = makeContactShadowTexture();

  const paper = new THREE.MeshPhysicalMaterial({
    color: 0xf3ecdd, map: paperTex, bumpMap: paperTex, bumpScale: 0.0022,
    roughness: 0.93, metalness: 0, sheen: 0.02, sheenRoughness: 1,
  });
  const headband = new THREE.MeshPhysicalMaterial({
    color: 0xd8c9a8, roughness: 0.7, metalness: 0, sheen: 0.4, sheenRoughness: 0.6,
  });
  // Oiled, not lacquered. At roughness .62 with a clearcoat the board's TOP
  // face blew out under the key and read as a white ledge — obvious in the
  // Daylight capture, present in all four. Wood this old does not gloss.
  // envMapIntensity, not roughness, was the answer: the board's UP-facing top
  // gathers the RoomEnvironment's ceiling almost head-on and clipped to a
  // white ledge under Daylight. A shelf board sits under a shelf above it, so
  // taking a third of the sky is also the physically honest number.
  const walnut = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: walnutTex, roughness: 0.82, metalness: 0.02,
    clearcoat: 0.06, clearcoatRoughness: 0.8, envMapIntensity: 0.3,
    // the whole room recedes when a volume opens, so the board has to be able
    // to fade like everything else
    transparent: true,
  });
  // THE PLANK'S TOP FACE, alone, takes a third of the sky the sides take. It
  // points straight up into the RoomEnvironment's ceiling, which is the
  // brightest thing in the room, and under Daylight it clipped to white. The
  // sides are unchanged, so the wood still reads as one piece.
  const walnutTop = new THREE.MeshPhysicalMaterial({
    color: 0xbdbdbd, map: walnutTex, roughness: 0.9, metalness: 0.02,
    clearcoat: 0, envMapIntensity: 0.1, transparent: true,
  });
  // The lip along the plank's front edge. A board with no lit edge reads as a
  // painted stripe; this is the two millimetres that make it a plank.
  const walnutLip = new THREE.MeshPhysicalMaterial({
    color: 0x4e3620, roughness: 0.68, metalness: 0.03,
    clearcoat: 0.08, envMapIntensity: 0.35, transparent: true,
  });
  const contactShadow = new THREE.MeshBasicMaterial({
    color: new THREE.Color(tokens.shadowColour || '#000000'),
    map: contactShadowMap, transparent: true, opacity: 0.24,
    depthWrite: false, blending: THREE.MultiplyBlending,
  });

  const owned = [weave, paperTex, walnutTex, contactShadowMap, paper, headband, walnut, walnutTop, walnutLip, contactShadow];
  return {
    weave, paper, headband, walnut, walnutTop, walnutLip, contactShadow, contactShadowMap,
    dispose() { for (const o of owned) o.dispose?.(); },
  };
}

/**
 * createVolumeMaterials — the three painted faces and the cloth, for ONE
 * volume. `textures` are the CanvasTextures the caller built from coverArt.
 * Returns `fade`, the list whose opacity the shelf animates as a volume
 * leaves the visible window.
 */
export function createVolumeMaterials(edition, textures, shared) {
  const clothColour = new THREE.Color(edition.cloth);
  const foilColour = new THREE.Color(edition.foil);

  const clothBase = {
    normalMap: shared.weave,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughness: 0.98, metalness: 0.02,
    sheen: 0.34, sheenRoughness: 0.76, sheenColor: foilColour,
    transparent: true,
  };

  const cloth = new THREE.MeshPhysicalMaterial({ ...clothBase, color: clothColour });
  // AN UNPAINTED FACE IS THE CLOTH ITSELF, not a second material with no map
  // on it. A volume built ahead of its canvases (the cheap binding the shelf
  // puts up while a finger is down) is then three materials rather than six,
  // and it is a bound volume in its own colour rather than a grey box.
  const front = textures.front
    ? new THREE.MeshPhysicalMaterial({
      ...clothBase, map: textures.front,
      roughness: 0.92, metalness: 0.035,
      // a jacket's varnish: enough to carry a moving highlight, not enough to
      // look like glass
      clearcoat: 0.06, clearcoatRoughness: 0.72,
      sheen: 0.26, sheenRoughness: 0.78,
    })
    : null;
  // no back texture means plain cloth, which is exactly what it should be
  const back = textures.back
    ? new THREE.MeshPhysicalMaterial({ ...clothBase, map: textures.back, roughness: 0.96, metalness: 0.025, sheen: 0.25 })
    : null;
  const spine = textures.spine
    ? new THREE.MeshPhysicalMaterial({
      ...clothBase, map: textures.spine, roughness: 0.95, metalness: 0.025, sheen: 0.27,
    })
    : null;
  // THE FOIL. A second mesh a fraction proud of the board, alpha-masked from
  // the type: metal that flashes on its own beat, separately from the cloth.
  // THE FOIL READS AS METAL OR IT READS AS A SMUDGE. His p2 note — "muddy
  // pink-grey on brown cloth" — was not the colour: the hex is a near-white
  // and clears 8:1 on its own cloth. It was the PHYSICS. A metal at
  // metalness .94 takes essentially all of its brightness from the
  // environment, and at the scene's 0.66 it had almost none to take, so the
  // metal mesh sitting on top of the painted title made the title DARKER.
  // envMapIntensity is the dial that was missing.
  // NO MASK, NO FOIL. The alphaMap is what cuts the type out of the plane; a
  // foil material without one is a solid metal sheet over the whole board,
  // which is what a cheap binding would have shown. It gets no foil mesh at
  // all instead (bookRig skips it when this is null).
  const foil = textures.foil
    ? new THREE.MeshPhysicalMaterial({
      color: foilColour, map: textures.foil, alphaMap: textures.foil,
      roughness: 0.22, metalness: 0.86, clearcoat: 0.18, clearcoatRoughness: 0.12,
      envMapIntensity: 2.6,
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    })
    : null;
  const groove = new THREE.MeshPhysicalMaterial({
    color: clothColour.clone().multiplyScalar(0.42),
    roughness: 0.9, metalness: 0, transparent: true,
  });

  const list = [cloth, front, back, spine, foil, groove].filter(Boolean);
  return {
    cloth,
    front: front || cloth,
    back: back || cloth,
    spine: spine || cloth,
    foil, groove,
    fade: list,
    dispose() { for (const m of list) m.dispose(); },
  };
}
