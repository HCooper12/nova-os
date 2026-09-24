// THE NINE — one species, nine beings.
//
// The single source for Nova's agent characters. Two things draw them: the
// character sheet (design/mockups/49-agent-characters.html, where he judges
// them) and the Org Map (src/orgmap/, where they stand on their districts).
// Refine a being here and both change; there is no second copy to drift.
//
// It takes THREE as an argument rather than importing it, because the sheet
// runs three r160 from a CDN (an artifact page can load nothing else) and the
// app runs r170 from npm. Everything used here exists in both.
//
// Pure scene-building: geometry, materials, poses. No network, no model, no
// storage. server/test/agentWorldNoModel.test.js holds that line.

export function createBeingKit(T, TK) {
  'use strict';
  // COLOUR HELPERS
  // ---------------------------------------------------------------
  function darker(col, k) { var c = col.clone(); c.multiplyScalar(k); return c; }
  function lighter(col, k) { var c = col.clone(); c.lerp(new T.Color(0xffffff), k); return c; }
  function hueOf(a) { return TK.hue[a.hue] || TK.hue.cy; }
  function accOf(a) { return TK.hue[a.accent] || TK.hue.gold; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var EMISSIVES = [];
  function emissiveMat(col, inten, opts) {
    var o = opts || {};
    var k = inten * (o.lamp ? 1 : 0.4);
    var m = new T.MeshStandardMaterial({
      color: darker(col, o.lamp ? 0.3 : 0.62), emissive: col, emissiveIntensity: k * TK.em,
      roughness: o.rough != null ? o.rough : 0.3, metalness: 0
    });
    m.userData.baseEm = k;
    EMISSIVES.push(m);
    return m;
  }
  // ADD LIGHT, NOT ALPHA. The canvas is alpha:true; plain AdditiveBlending
  // also accumulates alpha, which paints a grey disc over the page gradient
  // (measured). Custom blending adds colour and leaves alpha alone.
  function addBlend(m) {
    m.blending = T.CustomBlending;
    m.blendSrc = T.SrcAlphaFactor; m.blendDst = T.OneFactor;
    m.blendSrcAlpha = T.ZeroFactor; m.blendDstAlpha = T.OneFactor;
    m.toneMapped = false;
    return m;
  }

  var GLOW_TEX = null;
  function glowTex() {
    if (GLOW_TEX) return GLOW_TEX;
    var n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    GLOW_TEX = new T.CanvasTexture(c);
    return GLOW_TEX;
  }
  function halo(col, r, op) {
    var m = addBlend(new T.SpriteMaterial({ map: glowTex(), color: lighter(col, 0.35), transparent: true, opacity: op, depthWrite: false }));
    m.userData.baseOp = op;
    var sp = new T.Sprite(m);
    sp.scale.setScalar(r * 3.2);
    sp.renderOrder = 2;
    return sp;
  }
  // CONTACT SHADOW. The shadow map alone leaves a being looking posed on
  // the deck rather than standing on it; a soft dark disc right under the
  // base is what actually sells the contact.
  var CONTACT_TEX = null;
  function contactTex() {
    if (CONTACT_TEX) return CONTACT_TEX;
    var n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(0,0,0,.85)');
    g.addColorStop(0.35, 'rgba(0,0,0,.42)');
    g.addColorStop(0.72, 'rgba(0,0,0,.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    CONTACT_TEX = new T.CanvasTexture(c);
    return CONTACT_TEX;
  }
  function contactShadow(r) {
    var m = new T.Mesh(new T.PlaneGeometry(r * 2, r * 2),
      new T.MeshBasicMaterial({ map: contactTex(), transparent: true, depthWrite: false, opacity: 0.8 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.021; m.renderOrder = 1;
    return m;
  }

  var GEO = {
    sph: new T.SphereGeometry(1, 28, 20),
    sphLo: new T.SphereGeometry(1, 16, 12),
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 28),
    cone: new T.ConeGeometry(1, 1, 22),
    tor: new T.TorusGeometry(1, 0.12, 12, 36),
    plane: new T.PlaneGeometry(1, 1, 1, 1)
  };
  function mesh(geo, mat, sx, sy, sz, x, y, z) {
    var m = new T.Mesh(geo, mat);
    m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }


  // ---------------------------------------------------------------
  // THE NINE (§3g, in table order).
  // `hue` is the department's, and is dominant. `accent` is this pass's
  // addition: a SECOND hue per being, so no two read alike even with the
  // silhouette taken away. Both are --nv-* tokens; neither is invented.
  // `skin` picks the procedural grain; `face` is the expression set.
  // ---------------------------------------------------------------
  var AGENTS = [
    { id: 'commander', name: 'Commander', dept: 'Logistics', hue: 'cy', accent: 'gold', skin: 'brushed',
      line: 'Sets the order of the day and points the fleet at the next thing.',
      work: 'Working: the arm comes up to point, and the compass rose swings to find the heading.',
      wait: 'Waiting: hand on hip, a marker over its head, eyes blinking slow.' },
    { id: 'coach', name: 'Coach', dept: 'Train', hue: 'chest', accent: 'abs', skin: 'knit',
      line: 'Reads the program, calls the session, and holds you to the lift.',
      work: 'Working: it curls the bar, and grins at the top of every rep.',
      wait: 'Waiting: hands on hips, the bar set down on the floor in front.' },
    { id: 'cfo', name: 'CFO', dept: 'Money', hue: 'good', accent: 'gold', skin: 'ruled',
      line: 'Counts what came in and what went out, and says so plainly.',
      work: 'Working: it flips a coin and watches it all the way up and back.',
      wait: 'Waiting: the ledger held in its arm, the month’s stack beside it.' },
    { id: 'guardian', name: 'Guardian', dept: 'Platform', hue: 'vi', accent: 'gold', skin: 'hex',
      line: 'Keeps the backups landing and the quiet loops from staying quiet.',
      work: 'Working: the lantern comes up bright as a backup lands.',
      wait: 'Waiting: the lantern hangs low at amber; something went quiet.' },
    { id: 'researcher', name: 'Researcher', dept: 'Knowledge', hue: 'quads', accent: 'cy', skin: 'brushed',
      line: 'Reads the thing you asked about and comes back with the page.',
      work: 'Working: the lens reads along the lines, a page turns, the idea bulb glows.',
      wait: 'Waiting at the budget: the page hangs half-turned and it looks up at you.' },
    { id: 'watcher', name: 'Watcher', dept: 'Knowledge', hue: 'calves', accent: 'vi', skin: 'scan',
      line: 'Watches the whole video so you only see the two minutes that matter.',
      work: 'Working: a scanline plays across the screen and the film’s light flickers over it.',
      wait: 'Waiting: paused, head tilted, the popcorn held.' },
    { id: 'librarian', name: 'Librarian', dept: 'Knowledge', hue: 'back', accent: 'shoulders', skin: 'paper',
      line: 'Files every note where you will find it again, and says where.',
      work: 'Working: a drawer slides out and an index card rises from it.',
      wait: 'Waiting: the drawer stands open with nothing filed.' },
    { id: 'mealprep', name: 'Meal Prep', dept: 'Fuel', hue: 'shoulders', accent: 'chest', skin: 'glaze',
      line: 'Works out what to eat tonight from what is actually in the kitchen.',
      work: 'Working: it stirs, the steam curls up, and the eyes go to happy crescents.',
      wait: 'Waiting: the pot held off the heat, a warm smile.' },
    { id: 'leader', name: 'Leader', dept: 'Mind', hue: 'mg', accent: 'vi', skin: 'glaze',
      line: 'Listens back over the struggle, then asks the question you avoided.',
      work: 'Working: it nods as it listens, and a ripple goes out from the question.',
      wait: 'Waiting: head tilted to its listening ear, holding the question.' }
  ];


  // PROCEDURAL SKIN. One canvas pair per being: a colour map that carries
  // the seam and the two panel lines as slightly darker BANDS (drawn, not
  // a separate trim mesh — that is the whole point of this pass) and a
  // roughness map that carries the grain. The colour map is near-white so
  // the material's own per-department colour still does the colouring.
  // LatheGeometry gives u around the body and v up the profile, which is
  // exactly the coordinate system a seam and a belt line want.
  // ---------------------------------------------------------------
  var SKIN_CACHE = {};
  function skin(style, bands, seams) {
    var key2 = style + '|' + (bands || []).join(',') + '|' + (seams === false ? 0 : 1);
    if (SKIN_CACHE[key2]) return SKIN_CACHE[key2];
    var W = 512, H = 512;
    var cc = document.createElement('canvas'); cc.width = W; cc.height = H;
    var rc = document.createElement('canvas'); rc.width = W; rc.height = H;
    var x = cc.getContext('2d'), r = rc.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    r.fillStyle = '#b9b9b9'; r.fillRect(0, 0, W, H);

    function grain(fn) { fn(x, r); }
    if (style === 'brushed') {
      grain(function (x, r) {
        for (var i = 0; i < 2600; i++) {
          var y = Math.random() * H, w = 20 + Math.random() * 130, xx = Math.random() * W;
          var a = 0.018 + Math.random() * 0.03;
          x.strokeStyle = 'rgba(0,0,0,' + a + ')'; x.lineWidth = 1;
          x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + w, y + (Math.random() - .5)); x.stroke();
          r.strokeStyle = 'rgba(' + (Math.random() > .5 ? '255,255,255' : '0,0,0') + ',' + (a * 6) + ')';
          r.beginPath(); r.moveTo(xx, y); r.lineTo(xx + w, y); r.stroke();
        }
      });
    } else if (style === 'hex') {
      // a hexagonal micro-plate: Guardian is armour, and armour is plated
      var s = 26, h = s * 0.866;
      for (var row = 0; row * h < H + h; row++) {
        for (var col = 0; col * s * 1.5 < W + s * 2; col++) {
          var cx = col * s * 1.5, cy = row * h * 2 + (col % 2 ? h : 0);
          x.beginPath(); r.beginPath();
          for (var k = 0; k < 6; k++) {
            var ang = Math.PI / 180 * (60 * k), px = cx + s * Math.cos(ang), py = cy + s * Math.sin(ang);
            if (k === 0) { x.moveTo(px, py); r.moveTo(px, py); } else { x.lineTo(px, py); r.lineTo(px, py); }
          }
          x.closePath(); r.closePath();
          x.strokeStyle = 'rgba(0,0,0,.14)'; x.lineWidth = 2.2; x.stroke();
          x.fillStyle = 'rgba(255,255,255,.55)'; x.fill();
          r.strokeStyle = 'rgba(255,255,255,.5)'; r.lineWidth = 2.6; r.stroke();
          r.fillStyle = 'rgba(0,0,0,.1)'; r.fill();
        }
      }
    } else if (style === 'knit') {
      // a soft knit: Coach wears something, it is not bare plastic
      for (var yy = 0; yy < H; yy += 7) {
        for (var xx2 = 0; xx2 < W; xx2 += 7) {
          var d = ((xx2 / 7 + yy / 7) % 2) ? 0.06 : 0.02;
          x.fillStyle = 'rgba(0,0,0,' + d + ')'; x.fillRect(xx2, yy, 6, 6);
          r.fillStyle = 'rgba(255,255,255,' + (d * 3) + ')'; r.fillRect(xx2 + 1, yy + 1, 4, 4);
        }
      }
      for (var i2 = 0; i2 < 900; i2++) {
        var a2 = 0.02 + Math.random() * 0.03;
        x.fillStyle = 'rgba(0,0,0,' + a2 + ')';
        x.fillRect(Math.random() * W, Math.random() * H, 3, 1.5);
      }
    } else if (style === 'paper') {
      for (var i3 = 0; i3 < 5200; i3++) {
        var a3 = 0.012 + Math.random() * 0.04, l = 3 + Math.random() * 14, an = Math.random() * Math.PI;
        var sx = Math.random() * W, sy = Math.random() * H;
        x.strokeStyle = 'rgba(0,0,0,' + a3 + ')'; x.lineWidth = 1;
        x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(an) * l, sy + Math.sin(an) * l); x.stroke();
        r.strokeStyle = 'rgba(255,255,255,' + (a3 * 5) + ')';
        r.beginPath(); r.moveTo(sx, sy); r.lineTo(sx + Math.cos(an) * l, sy + Math.sin(an) * l); r.stroke();
      }
    } else if (style === 'glaze') {
      // ceramic: broad soft mottling and a low, even roughness
      r.fillStyle = '#5a5a5a'; r.fillRect(0, 0, W, H);
      for (var i4 = 0; i4 < 90; i4++) {
        var gx = Math.random() * W, gy = Math.random() * H, gr = 30 + Math.random() * 110;
        var gg = x.createRadialGradient(gx, gy, 0, gx, gy, gr);
        gg.addColorStop(0, 'rgba(0,0,0,.05)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gg; x.beginPath(); x.arc(gx, gy, gr, 0, 7); x.fill();
        var rg = r.createRadialGradient(gx, gy, 0, gx, gy, gr);
        rg.addColorStop(0, 'rgba(255,255,255,.18)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        r.fillStyle = rg; r.beginPath(); r.arc(gx, gy, gr, 0, 7); r.fill();
      }
    } else if (style === 'satin') {
      for (var i5 = 0; i5 < 340; i5++) {
        var vx = Math.random() * W, wv = 1 + Math.random() * 5, av = 0.012 + Math.random() * 0.035;
        x.fillStyle = 'rgba(0,0,0,' + av + ')'; x.fillRect(vx, 0, wv, H);
        r.fillStyle = 'rgba(255,255,255,' + (av * 7) + ')'; r.fillRect(vx, 0, wv, H);
      }
    } else if (style === 'ruled') {
      for (var yy2 = 0; yy2 < H; yy2 += 11) {
        x.fillStyle = 'rgba(0,0,0,.055)'; x.fillRect(0, yy2, W, 1.4);
        r.fillStyle = 'rgba(255,255,255,.2)'; r.fillRect(0, yy2, W, 1.4);
      }
      for (var i6 = 0; i6 < 1400; i6++) {
        x.fillStyle = 'rgba(0,0,0,' + (0.01 + Math.random() * 0.02) + ')';
        x.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
    } else if (style === 'spines') {
      // the Librarian's body is a stack, so its grain is book spines:
      // bands of varying width, each with a tiny title mark on it
      var px = 0;
      while (px < W) {
        var bw = 12 + Math.floor(Math.random() * 26);
        var sh = 0.04 + Math.random() * 0.2;
        x.fillStyle = 'rgba(0,0,0,' + sh + ')'; x.fillRect(px, 0, bw, H);
        x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(px + bw - 2, 0, 2, H);
        x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(px + 1, 0, 1.5, H);
        r.fillStyle = 'rgba(255,255,255,' + (sh * 2) + ')'; r.fillRect(px, 0, bw, H);
        // title marks, a few up each spine
        for (var ty2 = 30; ty2 < H; ty2 += 60 + Math.random() * 90) {
          x.fillStyle = 'rgba(255,255,255,.4)';
          x.fillRect(px + 3, ty2, Math.max(3, bw - 8), 3);
          x.fillRect(px + 3, ty2 + 7, Math.max(2, (bw - 8) * 0.6), 2);
        }
        px += bw;
      }
    } else if (style === 'scan') {
      for (var yy3 = 0; yy3 < H; yy3 += 4) {
        x.fillStyle = 'rgba(0,0,0,.07)'; x.fillRect(0, yy3, W, 2);
        r.fillStyle = 'rgba(0,0,0,.16)'; r.fillRect(0, yy3, W, 2);
      }
    }

    // THE SEAM AND THE PANEL LINES — drawn, never a mesh.
    (bands || []).forEach(function (v) {
      var y = (1 - v) * H;
      x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, y - 2, W, 4);
      x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(0, y + 2, W, 1.5);
      r.fillStyle = 'rgba(0,0,0,.4)'; r.fillRect(0, y - 2, W, 4);
    });
    // two vertical seams, quarter-turn apart
    (seams === false ? [] : [0.25, 0.75]).forEach(function (u) {
      var px2 = u * W;
      x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(px2 - 1.4, 0, 2.8, H);
      r.fillStyle = 'rgba(0,0,0,.3)'; r.fillRect(px2 - 1.4, 0, 2.8, H);
    });

    var mt = new T.CanvasTexture(cc); mt.colorSpace = T.SRGBColorSpace;
    var rt = new T.CanvasTexture(rc);
    [mt, rt].forEach(function (t2) { t2.wrapS = t2.wrapT = T.RepeatWrapping; t2.anisotropy = 4; });
    SKIN_CACHE[key2] = { map: mt, rough: rt };
    return SKIN_CACHE[key2];
  }

  function latheGeo(pts, seg, squ, depth) {
    var v = pts.map(function (p) { return new T.Vector2(Math.max(p[0], 0.0004), p[1]); });
    var curve = new T.SplineCurve(v);
    var s = curve.getPoints(Math.max(56, pts.length * 9));
    for (var i = 0; i < s.length; i++) if (s[i].x < 0.0004) s[i].x = 0.0004;
    s[0].x = 0.0004; s[s.length - 1].x = 0.0004;
    var g = new T.LatheGeometry(s, seg || 72);
    if (squ && squ > 2) {
      // superellipse the cross-section: |cos|^n + |sin|^n = 1
      var pos = g.attributes.position, n = squ;
      for (var j = 0; j < pos.count; j++) {
        var x = pos.getX(j), z = pos.getZ(j), rr = Math.hypot(x, z);
        if (rr < 1e-5) continue;
        var ca = Math.abs(x / rr), sa = Math.abs(z / rr);
        var f = 1 / Math.pow(Math.pow(ca, n) + Math.pow(sa, n), 1 / n);
        pos.setX(j, x * f); pos.setZ(j, z * f * (depth || 1));
      }
      g.computeVertexNormals();
    } else if (depth && depth !== 1) {
      var p2 = g.attributes.position;
      for (var k = 0; k < p2.count; k++) p2.setZ(k, p2.getZ(k) * depth);
      g.computeVertexNormals();
    }
    return g;
  }

  var CATCH_MAT = addBlend(new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
  var CATCH_GEO = new T.CircleGeometry(1, 12);

  // the "1" in the bubble, drawn on a canvas in the UI face
  var numeralTex = null;
  function numeralPlate(ch) {
    if (!numeralTex) {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var x = c.getContext('2d');
      x.fillStyle = '#0a2830';
      x.font = '700 86px Rajdhani, system-ui, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(ch, 64, 70);
      numeralTex = new T.CanvasTexture(c);
      numeralTex.colorSpace = T.SRGBColorSpace;
      numeralTex.anisotropy = 4;
    }
    var m = new T.Mesh(GEO.plane, new T.MeshBasicMaterial({ map: numeralTex, transparent: true, depthWrite: false }));
    m.scale.setScalar(0.135); m.position.z = 0.062;
    return m;
  }


  // ---- small procedural textures for the artefacts ---------------
  var TEXC = {};
  function tex(nameKey, draw, w, h, rep) {
    if (TEXC[nameKey]) return TEXC[nameKey];
    var c = document.createElement('canvas'); c.width = w || 256; c.height = h || 256;
    draw(c.getContext('2d'), c.width, c.height);
    var t2 = new T.CanvasTexture(c); t2.colorSpace = T.SRGBColorSpace;
    t2.wrapS = t2.wrapT = T.RepeatWrapping; t2.anisotropy = 4;
    if (rep) t2.repeat.set(rep[0], rep[1]);
    TEXC[nameKey] = t2; return t2;
  }
  function knurlTex() {
    return tex('knurl', function (x, w, h) {
      x.fillStyle = '#d8dee8'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2.4;
      for (var i = -h; i < w + h; i += 9) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke();
        x.beginPath(); x.moveTo(i + h, 0); x.lineTo(i, h); x.stroke();
      }
    }, 256, 64, [8, 1]);
  }
  function pageTex() {
    return tex('page', function (x, w, h) {
      x.fillStyle = '#f2f6ff'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(30,50,90,.55)';
      var y = 26;
      // lines of "text" — ragged right, a short last line per paragraph,
      // because that is what a page of writing actually looks like
      while (y < h - 20) {
        var lw = w * (0.45 + Math.random() * 0.4);
        x.fillRect(22, y, lw, 5);
        y += 17;
        if (Math.random() < 0.18) y += 12;
      }
      x.fillStyle = 'rgba(30,50,90,.8)'; x.fillRect(22, 10, w * 0.4, 8);
    }, 192, 256);
  }
  function chipTex() {
    return tex('chip', function (x, w) {
      var c = w / 2;
      x.fillStyle = '#e9eef6'; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 5;
      for (var i = 0; i < 24; i++) {
        var a = i / 24 * Math.PI * 2;
        x.beginPath();
        x.moveTo(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78);
        x.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c);
        x.stroke();
      }
      x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 6;
      x.beginPath(); x.arc(c, c, c * 0.66, 0, 7); x.stroke();
      x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.arc(c, c, c * 0.3, 0, 7); x.fill();
    }, 128, 128);
  }
  // =================================================================
  // PASS 3 — ONE SPECIES.
  // His note on pass 2 was about three faces; looking at all nine from
  // every side said the fault was shared: a small ball head on a bottle
  // body, a black band across every face (the bandit mask), rods for
  // arms, and eyes that stood proud of the head in profile. So the
  // species is rebuilt once and every being is drawn from it:
  //   a big rounded helmet (a superquadric, not a sphere) on a compact
  //   body, stubby boots, a face SCREEN set into the helmet's own
  //   surface with a moulded rim (a face, not a band), eyes that carry
  //   lids, smiles and brows, noodle arms that bend at a real elbow and
  //   end in mittens, and a gem set flush into the chest.
  // Personality lives in the brow, the lid, the tilt and the artefact —
  // never in shrinking an eye to a slot (his pass-2 note).
  // =================================================================
  var ZV = new T.Vector3(0, 0, 1), YV = new T.Vector3(0, 1, 0);
  function spow(v, n) { return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), n); }

  // ---- the helmet -------------------------------------------------
  function makeHelmet(hx, hy, hz, n) {
    var g = new T.SphereGeometry(1, 72, 54), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      var t = 1 / Math.pow(Math.pow(Math.abs(x / hx), n) + Math.pow(Math.abs(y / hy), n) + Math.pow(Math.abs(z / hz), n), 1 / n);
      p.setXYZ(i, x * t, y * t, z * t);
    }
    g.computeVertexNormals();
    return { hx: hx, hy: hy, hz: hz, n: n, geo: g };
  }
  // a point on the FRONT of the helmet at (x, y), pushed out along the
  // surface normal by `off` — everything on the face is placed by this,
  // which is why nothing can stand proud of the head in profile again
  function onHelmet(H, x, y, off, P, N) {
    var n = H.n;
    var k = 1 - Math.pow(Math.abs(x / H.hx), n) - Math.pow(Math.abs(y / H.hy), n);
    var z = k > 0 ? H.hz * Math.pow(k, 1 / n) : 0;
    N.set(
      spow(x, n - 1) / Math.pow(H.hx, n),
      spow(y, n - 1) / Math.pow(H.hy, n),
      Math.pow(Math.max(z, 1e-6), n - 1) / Math.pow(H.hz, n)
    ).normalize();
    P.set(x, y, z).addScaledVector(N, off);
    return P;
  }
  // a superellipse patch of the helmet's own surface: the face screen,
  // and (as an annulus) its moulded rim
  function helmetPatch(H, fw, fh, fy, m, r0, r1, off0, off1, R, S) {
    var pos = [], nor = [], uv = [], idx = [], P = new T.Vector3(), N = new T.Vector3();
    for (var i = 0; i <= R; i++) {
      var f = i / R, r = r0 + (r1 - r0) * f, off = off0 + (off1 - off0) * Math.sin(f * Math.PI * (r0 > 0 ? 1 : 0.5));
      if (r0 === 0) off = off0 + (off1 - off0) * f;
      for (var j = 0; j <= S; j++) {
        var a = j / S * Math.PI * 2;
        var x = fw * r * spow(Math.cos(a), 2 / m), y = fy + fh * r * spow(Math.sin(a), 2 / m);
        onHelmet(H, x, y, off, P, N);
        pos.push(P.x, P.y, P.z); nor.push(N.x, N.y, N.z);
        uv.push(0.5 + x / (2.2 * fw), 0.5 + (y - fy) / (2.2 * fh));
      }
    }
    for (i = 0; i < R; i++) for (var j2 = 0; j2 < S; j2++) {
      var A = i * (S + 1) + j2, B = A + S + 1;
      idx.push(A, B, A + 1, A + 1, B, B + 1);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // ---- the eye: one fan whose outline is recomputed from its lid, its
  // smile and its roundness, so an expression is a number that eases
  function eyeFan(N) {
    var g = new T.BufferGeometry(), idx = [];
    for (var k = 0; k < N; k++) idx.push(0, 1 + k, 1 + (k + 1) % N);
    g.setAttribute('position', new T.BufferAttribute(new Float32Array((N + 1) * 3), 3));
    g.setIndex(idx);
    return g;
  }
  function lidAt(e, x) { return e.h * (1 - 2 * e.lid) + e.slope * x; }
  function shapeEye(g, e) {
    var p = g.attributes.position, N = p.count - 1, sy = 0, w = e.w, h = e.h;
    for (var k = 0; k < N; k++) {
      var a = k / N * Math.PI * 2;
      var x = w * spow(Math.cos(a), 2 / e.round), y = h * spow(Math.sin(a), 2 / e.round);
      var yt = lidAt(e, x);
      var q = Math.max(0, 1 - (x / w) * (x / w));
      var yb = -h + e.smile * 2.1 * h * Math.pow(q, 0.7);
      if (yb > yt - 0.24 * h) yb = yt - 0.24 * h;
      if (y > yt) y = yt; if (y < yb) y = yb;
      p.setXYZ(1 + k, x, y, 0); sy += y;
    }
    p.setXYZ(0, 0, sy / N, 0);
    p.needsUpdate = true; g.computeBoundingSphere();
  }
  function browGeo(w, t) {
    var s = new T.Shape(), r = t / 2;
    s.moveTo(-w / 2 + r, -r); s.lineTo(w / 2 - r, -r);
    s.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(-w / 2 + r, r);
    s.absarc(-w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    return new T.ShapeGeometry(s, 8);
  }

  // ---- limbs: a tapered tube swept along a curve through a real elbow
  var _tn = new T.Vector3(), _tb = new T.Vector3(), _tt = new T.Vector3(), _tp = new T.Vector3();
  function taperTube(nS, nR) {
    var cnt = (nS + 1) * (nR + 1), g = new T.BufferGeometry(), idx = [];
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(cnt * 3), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(cnt * 3), 3));
    for (var i = 0; i < nS; i++) for (var j = 0; j < nR; j++) {
      var a = i * (nR + 1) + j, b = a + nR + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    g.setIndex(idx);
    var pts = []; for (var k = 0; k <= nS; k++) pts.push(new T.Vector3());
    return {
      geo: g, pts: pts,
      build: function (rad) {
        var P = g.attributes.position, Nn = g.attributes.normal;
        for (var i2 = 0; i2 <= nS; i2++) {
          var a0 = pts[Math.max(0, i2 - 1)], a1 = pts[Math.min(nS, i2 + 1)];
          _tt.subVectors(a1, a0).normalize();
          if (i2 === 0) {
            _tn.set(0, 0, 1); if (Math.abs(_tt.z) > 0.9) _tn.set(1, 0, 0);
          }
          _tn.addScaledVector(_tt, -_tn.dot(_tt)).normalize();
          _tb.crossVectors(_tt, _tn);
          var r = rad(i2 / nS);
          for (var j2 = 0; j2 <= nR; j2++) {
            var th = j2 / nR * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
            _tp.set(_tn.x * c + _tb.x * s, _tn.y * c + _tb.y * s, _tn.z * c + _tb.z * s);
            var v = i2 * (nR + 1) + j2;
            Nn.setXYZ(v, _tp.x, _tp.y, _tp.z);
            P.setXYZ(v, pts[i2].x + _tp.x * r, pts[i2].y + _tp.y * r, pts[i2].z + _tp.z * r);
          }
        }
        P.needsUpdate = true; Nn.needsUpdate = true; g.computeBoundingSphere();
      }
    };
  }
  var _ad = new T.Vector3(), _ae = new T.Vector3(), _ap = new T.Vector3(), _ax = new T.Vector3(),
      _ay = new T.Vector3(), _az = new T.Vector3(), _am = new T.Matrix4();
  // An arm is a shoulder, an elbow solved from two bone lengths and a
  // pole (which way the elbow points), and a mitten. The mitten's palm
  // faces `palm`; `side` puts the thumb on the correct side.
  function makeArm(parent, mat, handMat, o) {
    var tube = taperTube(20, 12);
    var mesh = new T.Mesh(tube.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false; parent.add(mesh);
    var shoulder = new T.Mesh(GEO.sph, mat); shoulder.scale.setScalar(o.r0 * 1.12);
    shoulder.castShadow = true; parent.add(shoulder);
    var rh = o.rh || o.r1 * 1.9;
    var hand = new T.Group(); parent.add(hand);
    var cuff = new T.Mesh(GEO.tor, handMat); cuff.scale.set(o.r1 * 1.3, o.r1 * 1.3, o.r1 * 2.2);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -rh * 0.05; cuff.castShadow = true; hand.add(cuff);
    var palm = new T.Mesh(GEO.sph, handMat);
    palm.scale.set(rh * 0.92, rh * 1.08, rh * 0.74); palm.position.y = rh * 0.62;
    palm.castShadow = true; hand.add(palm);
    var thumb = new T.Mesh(GEO.sph, handMat);
    thumb.scale.set(rh * 0.36, rh * 0.5, rh * 0.36);
    thumb.position.set(rh * 0.7 * (o.side || 1), rh * 0.52, rh * 0.28); thumb.rotation.z = -0.5 * (o.side || 1);
    thumb.castShadow = true; hand.add(thumb);
    var finger = null;
    if (o.point) {
      finger = new T.Mesh(new T.CapsuleGeometry(rh * 0.3, rh * 0.85, 6, 12), handMat);
      finger.position.set(0, rh * 1.6, rh * 0.06); finger.castShadow = true; hand.add(finger);
      palm.scale.set(rh * 0.88, rh * 0.9, rh * 0.8);
    }
    var curve = new T.CatmullRomCurve3([new T.Vector3(), new T.Vector3(), new T.Vector3()], false, 'centripetal');
    var L1 = o.L1, L2 = o.L2, r0 = o.r0, r1 = o.r1;
    var arm = {
      mesh: mesh, hand: hand, palm: palm, thumb: thumb, finger: finger, shoulder: shoulder, elbow: new T.Vector3(),
      set: function (S, H, pole, palmDir) {
        _ad.subVectors(H, S); var d = _ad.length() || 1e-4; _ad.divideScalar(d);
        var l1 = L1, l2 = L2;
        // never locked straight: a noodle arm with no elbow reads as a stick
        var MAXR = o.maxReach || 0.9;
        if (d > (l1 + l2) * MAXR) { var k = d / ((l1 + l2) * MAXR); l1 *= k; l2 *= k; }
        var a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
        var hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
        _ap.copy(pole).addScaledVector(_ad, -pole.dot(_ad));
        if (_ap.lengthSq() < 1e-6) _ap.set(0, 0, -1);
        _ap.normalize();
        _ae.copy(S).addScaledVector(_ad, a).addScaledVector(_ap, hh);
        arm.elbow.copy(_ae);
        curve.points[0].copy(S); curve.points[1].copy(_ae); curve.points[2].copy(H);
        for (var i = 0; i <= 20; i++) curve.getPoint(i / 20, tube.pts[i]);
        tube.build(function (t) { return r0 + (r1 - r0) * Math.pow(t, 0.85); });
        shoulder.position.copy(S);
        // the mitten: y along the forearm, z toward where the palm faces
        _ay.subVectors(H, tube.pts[17]).normalize();
        _az.copy(palmDir || _ap).addScaledVector(_ay, -(palmDir || _ap).dot(_ay));
        if (_az.lengthSq() < 1e-6) _az.set(0, 0, 1);
        _az.normalize(); _ax.crossVectors(_ay, _az);
        _am.makeBasis(_ax, _ay, _az);
        hand.quaternion.setFromRotationMatrix(_am);
        hand.position.copy(H);
      }
    };
    return arm;
  }

  // raycast onto a body to seat things flush in it
  var _rc = new T.Raycaster(), _ro = new T.Vector3(), _rd = new T.Vector3();
  function onBody(mesh, x, y, fromZ) {
    mesh.updateMatrixWorld(true);
    var z = fromZ == null ? 1 : fromZ;
    _ro.set(x, y, 3 * Math.sign(z)); _rd.set(0, 0, -Math.sign(z));
    _rc.set(_ro, _rd);
    var h = _rc.intersectObject(mesh, false)[0];
    if (!h) return { p: new T.Vector3(x, y, 0), n: new T.Vector3(0, 0, Math.sign(z)) };
    return { p: h.point.clone(), n: h.face.normal.clone() };
  }
  var _sq = new T.Quaternion(), _sm = new T.Matrix4();
  function seat(obj, hit, off) {
    obj.position.copy(hit.p).addScaledVector(hit.n, off || 0);
    // a look-at keeps the roll at zero: setFromUnitVectors picks an
    // arbitrary axis when the normal is exactly behind, and the plate rolls
    _sm.lookAt(hit.n, new T.Vector3(0, 0, 0), YV);
    obj.quaternion.setFromRotationMatrix(_sm);
    return obj;
  }

  // HUGGING. A strap, a towel or a cape has to lie ON the body; a curve
  // through a few control points cuts straight through it in between (the
  // Researcher's first strap came out of its own chest). So every sample is
  // projected onto the surface: a ray from outside toward an interior
  // centre C, the first hit, pushed back out along the surface normal.
  var _hro = new T.Vector3(), _hrd = new T.Vector3(), _hnm = new T.Matrix3();
  function hug(meshes, p, C, off) {
    _hrd.subVectors(p, C);
    if (_hrd.lengthSq() < 1e-8) _hrd.set(0, 0, 1);
    _hrd.normalize();
    _hro.copy(C).addScaledVector(_hrd, 3);
    _rc.set(_hro, _hrd.clone().negate());
    var h = _rc.intersectObjects(meshes, false)[0];
    if (!h) return { p: p.clone(), n: _hrd.clone() };
    var n = h.face.normal.clone();
    _hnm.getNormalMatrix(h.object.matrixWorld); n.applyMatrix3(_hnm).normalize();
    if (n.dot(_hrd) < 0) n.negate();
    return { p: h.point.clone().addScaledVector(n, off || 0), n: n };
  }
  // A strap swept along a hugged path: a rounded-rectangle section whose
  // width lies along the surface and whose thickness stands off it, capped
  // at both ends. `o`: { w, t, off, n, mat }.
  function strap(meshes, ctrl, C, o) {
    meshes.forEach(function (m) { m.updateMatrixWorld(true); });
    var N = o.n || 44, M = 14, curve = new T.CatmullRomCurve3(ctrl, false, 'centripetal');
    var P = [], NN = [], s0 = new T.Vector3(), i, j;
    for (i = 0; i <= N; i++) {
      curve.getPoint(i / N, s0);
      var hh = hug(meshes, s0, C, (o.off || 0.003) + o.t / 2);
      P.push(hh.p); NN.push(hh.n);
    }
    // a light smoothing pass: face normals of a faceted body would twist it
    for (var pass = 0; pass < 2; pass++) {
      var sm = NN.map(function (n, k) { return n.clone().add(NN[Math.max(0, k - 1)]).add(NN[Math.min(N, k + 1)]).normalize(); });
      NN = sm;
    }
    var pos = [], nor = [], uv = [], idx = [], Tg = new T.Vector3(), W = new T.Vector3(), Nn = new T.Vector3();
    var ends = [];
    for (i = 0; i <= N; i++) {
      Tg.subVectors(P[Math.min(N, i + 1)], P[Math.max(0, i - 1)]).normalize();
      Nn.copy(NN[i]).addScaledVector(Tg, -NN[i].dot(Tg)).normalize();
      W.crossVectors(Tg, Nn).normalize();
      if (i === 0 || i === N) ends.push({ c: P[i].clone(), t: Tg.clone(), ring: [] });
      for (j = 0; j <= M; j++) {
        var an = j / M * Math.PI * 2, c = Math.cos(an), sn = Math.sin(an);
        var ex = spow(c, 0.35) * o.w / 2, ey = spow(sn, 0.35) * o.t / 2;
        var q = new T.Vector3().copy(P[i]).addScaledVector(W, ex).addScaledVector(Nn, ey);
        var nq = new T.Vector3().addScaledVector(W, spow(c, 1.65) / (o.w / 2)).addScaledVector(Nn, spow(sn, 1.65) / (o.t / 2)).normalize();
        pos.push(q.x, q.y, q.z); nor.push(nq.x, nq.y, nq.z); uv.push(i / N, j / M);
        if ((i === 0 || i === N) && j < M) ends[ends.length - 1].ring.push(q);
      }
    }
    for (i = 0; i < N; i++) for (j = 0; j < M; j++) {
      var A = i * (M + 1) + j, B = A + M + 1;
      idx.push(A, B, A + 1, A + 1, B, B + 1);
    }
    ends.forEach(function (e, k) {
      var base = pos.length / 3, sgn = k === 0 ? -1 : 1;
      pos.push(e.c.x, e.c.y, e.c.z); nor.push(e.t.x * sgn, e.t.y * sgn, e.t.z * sgn); uv.push(k, 0.5);
      e.ring.forEach(function (q) { pos.push(q.x, q.y, q.z); nor.push(e.t.x * sgn, e.t.y * sgn, e.t.z * sgn); uv.push(k, 0.5); });
      for (var r = 0; r < M; r++) {
        var r0 = base + 1 + r, r1 = base + 1 + (r + 1) % M;
        if (k === 0) idx.push(base, r0, r1); else idx.push(base, r1, r0);
      }
    });
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    var m = new T.Mesh(g, o.mat); m.castShadow = true; m.receiveShadow = true;
    m.userData.path = P; m.userData.normals = NN;
    return m;
  }

  function bodyProfile(o) {
    // foot of the body rides just above the boots; one smooth pear
    return [
      [0.001, o.y0], [o.baseR * 0.55, o.y0 + 0.004], [o.baseR * 0.9, o.y0 + 0.03], [o.baseR, o.y0 + 0.08],
      [o.bellyR, o.bellyY], [o.chestR, o.chestY], [o.shR, o.shY],
      [o.topR * 1.45, o.topY - 0.035], [o.topR, o.topY], [0.001, o.topY + 0.004]
    ];
  }

  // The eased pose store: every tell moves toward a target instead of
  // jumping, so switching Working/Waiting is acted out, not cut. A frozen
  // clock (the studio capture) snaps straight to the target.
  function poser() {
    var st = {}, last = null, k = 1, moving = false;
    return {
      frame: function (t) {
        var dt = last == null ? 0 : clamp(t - last, 0, 0.1), first = last == null; last = t;
        // no time passed means no movement; only the first frame, or a
        // studio still that asks for it, jumps straight to the pose
        k = (first || SNAP) ? 1 : (dt > 0 ? 1 - Math.exp(-dt * 7) : 0); moving = false;
      },
      v: function (name, x, y, z) {
        var c = st[name];
        if (!c) { c = st[name] = new T.Vector3(x, y, z); return c; }
        c.x += (x - c.x) * k; c.y += (y - c.y) * k; c.z += (z - c.z) * k;
        if (Math.abs(c.x - x) + Math.abs(c.y - y) + Math.abs(c.z - z) > 1e-4) moving = true;
        return c;
      },
      s: function (name, x) { return this.v(name, x, 0, 0).x; },
      moving: function () { return moving; }
    };
  }
  var V = function (x, y, z) { return new T.Vector3(x, y, z); };
  var SNAP = false;

  // ---- makeBot ----------------------------------------------------
  function makeBot(a, o) {
    var hue = hueOf(a), acc = accOf(a), g = new T.Group();
    var sk = skin(a.skin, o.bands || [], false), skHead = skin(a.skin, [], false);
    function vinyl(col, x) {
      x = x || {};
      var tx = x.sk || sk;
      var m = new T.MeshPhysicalMaterial({
        color: col, map: x.plain ? null : tx.map, roughnessMap: x.plain ? null : tx.rough,
        roughness: x.rough != null ? x.rough : 0.46, metalness: x.metal != null ? x.metal : 0.04,
        clearcoat: x.coat != null ? x.coat : 0.62, clearcoatRoughness: x.coatR != null ? x.coatR : 0.2,
        sheen: 0.5, sheenColor: lighter(acc, 0.4), sheenRoughness: 0.6
      });
      if (m.map) { m.map.repeat.set(o.rep || 1.4, 1); m.roughnessMap.repeat.set(o.rep || 1.4, 1); }
      return m;
    }
    var bodyMat = vinyl(o.bodyCol || darker(hue, 0.62), o.bodyMat);
    bodyMat.emissive = hue.clone(); bodyMat.emissiveIntensity = 0.05 * TK.em; bodyMat.userData.baseEm = 0.05;
    EMISSIVES.push(bodyMat);
    if (o.irid) { bodyMat.iridescence = o.irid; bodyMat.iridescenceIOR = 1.3; }
    var headMat = vinyl(o.headCol || darker(hue, 0.9).lerp(TK.shell, 0.1), { coat: 0.8, coatR: 0.12, rough: 0.38, sk: skHead });
    var trimMat = vinyl(o.trimCol || darker(hue, 0.74).lerp(TK.shell, 0.06), { plain: true, rough: 0.42 });
    var handMat = vinyl(o.handCol || lighter(TK.shell, 0.45), { plain: true, rough: 0.5, coat: 0.5 });
    var jointMat = new T.MeshPhysicalMaterial({ color: darker(hue, 0.3).lerp(new T.Color(0x151a26), 0.55), roughness: 0.55, metalness: 0.2, clearcoat: 0.3 });

    // BODY
    var body = new T.Mesh(latheGeo(bodyProfile(o.body), 72, o.squ, o.depth), bodyMat);
    if (o.tweak) o.tweak(body.geometry);
    body.castShadow = true; body.receiveShadow = true; g.add(body);

    // BOOTS
    var feet = [];
    if (!o.noFeet) [-1, 1].forEach(function (s) {
      var f = o.feet || {};
      var boot = mesh(GEO.sph, handMat, f.sx || 0.085, f.sy || 0.058, f.sz || 0.118,
        s * (f.x || 0.12), (f.sy || 0.058) * 0.92, f.z || 0.05);
      boot.rotation.y = s * (f.yaw != null ? f.yaw : 0.2); g.add(boot); feet.push(boot);
    });

    // NECK — a short dark joint, so the helmet reads as seated, not stuck
    var headY = o.head.y;
    var neckH = headY - o.head.hy * 0.62 - o.body.topY + 0.05;
    if (neckH > 0.01) {
      var neck = mesh(GEO.cyl, jointMat, o.body.topR * 0.95, neckH, o.body.topR * 0.95, 0, o.body.topY - 0.03 + neckH / 2, 0);
      g.add(neck);
    }

    // HEAD
    var head = new T.Group(); head.position.y = headY; g.add(head);
    var H = makeHelmet(o.head.hx, o.head.hy, o.head.hz, o.head.n || 2.6);
    var helmet = new T.Mesh(H.geo, headMat); helmet.castShadow = true; helmet.receiveShadow = true;
    head.add(helmet);

    // FACE SCREEN, set into the helmet, and its moulded rim
    var sc = o.screen;
    var scrCol = o.screenCol || new T.Color(0x060a14).lerp(darker(hue, 0.3), 0.22);
    var screenMat = new T.MeshPhysicalMaterial({
      color: scrCol, roughness: o.mirror ? 0.05 : 0.14, metalness: o.mirror ? 0.85 : 0.1,
      clearcoat: 1, clearcoatRoughness: 0.03
    });
    if (o.mirror) { screenMat.iridescence = 0.8; screenMat.iridescenceIOR = 1.6; }
    screenMat.envMapIntensity = o.mirror ? 1.6 : 0.85;
    var screen = new T.Mesh(helmetPatch(H, sc.w, sc.h, sc.y, sc.m || 3, 0, 1, 0.004, 0.004, 10, 72), screenMat);
    screen.renderOrder = 2; head.add(screen);
    var rimMat = vinyl(o.rimCol || lighter(hue, 0.55).lerp(TK.shell, 0.35), { plain: true, rough: 0.3, coat: 0.9 });
        var rim = new T.Mesh(helmetPatch(H, sc.w, sc.h, sc.y, sc.m || 3, 1, 1 + (sc.rim || 0.1), 0.004, 0.016, 5, 72), rimMat);
    rim.castShadow = true; head.add(rim);

    var face = makeFace3(head, H, a, o.face, sc, hue, acc);

    // EAR PODS — the helmet's profile: a set-in disc and a lit ring in the
    // accent, so the head is never a blank ball from the side or behind
    var ears = [];
    if (o.ears !== false) [-1, 1].forEach(function (s) {
      var eg = new T.Group(), b_earY = (o.earY != null ? o.earY : -0.01);
      eg.position.set(s * o.head.hx * 0.955, b_earY, -0.015); eg.rotation.z = -s * Math.PI / 2; head.add(eg);
      var er = o.earR || 0.085;
      eg.add(mesh(GEO.cyl, rimMat, er, 0.05, er, 0, 0.012, 0));
      var ring = mesh(GEO.tor, emissiveMat(lighter(acc, 0.25), 1.5, { lamp: true }), er * 0.72, er * 0.72, 0.3, 0, 0.038, 0);
      ring.rotation.x = Math.PI / 2; ring.castShadow = false; eg.add(ring);
      eg.add(mesh(GEO.cyl, jointMat, er * 0.52, 0.02, er * 0.52, 0, 0.034, 0));
      ears.push(eg);
    });

    // CORE — a gem seated flush in the chest
    var coreHit = onBody(body, 0, o.coreY);
    var core = new T.Group(); seat(core, coreHit, 0.002); g.add(core);
    var bez = new T.Mesh(GEO.tor, trimMat); bez.scale.set(0.052, 0.052, 0.09); core.add(bez);
    var gemMat = emissiveMat(lighter(acc, 0.2), 1.6, { lamp: true });
    var gem = new T.Mesh(GEO.sph, gemMat); gem.scale.set(0.044, 0.044, 0.02); core.add(gem);
    var coreGlow = halo(acc, 0.12, 0.3); coreGlow.position.z = 0.02; core.add(coreGlow);

    var rimL = new T.PointLight(lighter(hue, 0.25).getHex(), 1.4, 2.6, 2);
    rimL.position.set(0.1, headY * 0.8, -0.6); g.add(rimL);

    var marker = new T.Group();
    var markerY = o.markerY;
    var bub = mesh(GEO.sph, emissiveMat(TK.gold, 1.5), 0.15, 0.112, 0.055);
    bub.castShadow = false; marker.add(bub);
    var tail = mesh(GEO.cone, emissiveMat(TK.gold, 1.5), 0.048, 0.1, 0.042, -0.04, -0.115, 0);
    tail.rotation.z = Math.PI; tail.castShadow = false; marker.add(tail);
    marker.add(halo(TK.gold, 0.25, 0.13));
    marker.add(numeralPlate('1'));
    marker.position.y = markerY; marker.visible = false; g.add(marker);

    var cs = contactShadow(o.footR || 0.42); g.add(cs);

    // THE BACK PLATE — a service hatch with a lit bar in the accent, so the
    // back of a being is a designed surface and not a blank. Every being
    // has one; the beings that carry something on the back add it on top.
    var bpHit = onBody(body, 0, o.body.chestY - 0.02, -1);
    var bp = new T.Group(); seat(bp, bpHit, 0.002); if (o.backPlate !== false) g.add(bp);
    var plate = new T.Mesh(badgeGeo(rrect(0.19, 0.15, 0.03), 0.008, 0.005, o.body.chestR), trimMat);
    plate.castShadow = true; bp.add(plate);
    bp.add(mesh(GEO.box, jointMat, 0.13, 0.014, 0.004, 0, 0.03, 0.013));
    var bpBar = mesh(GEO.box, emissiveMat(lighter(acc, 0.2), 1.6, { lamp: true }), 0.11, 0.012, 0.005, 0, -0.02, 0.013);
    bpBar.castShadow = false; bp.add(bpBar);
    [-1, 1].forEach(function (s) { bp.add(mesh(GEO.sph, jointMat, 0.008, 0.008, 0.006, s * 0.07, -0.05, 0.013)); });

    return {
      group: g, body: body, head: head, H: H, face: face, marker: marker, markerY: markerY,
      hue: hue, acc: acc, headY: headY, headR: o.head.hy,
      skinMat: bodyMat, bodyMat: bodyMat, headMat: headMat, trimMat: trimMat, handMat: handMat,
      jointMat: jointMat, visorMat: screenMat, rimMat: rimMat, rimL: rimL, core: core, gem: gemMat,
      spec: null, contact: cs, feet: feet, ears: ears, pose: poser(),
      arm: function (side, x) {
        return makeArm(g, x.mat || trimMat, handMat, {
          side: side, r0: x.r0 || 0.05, r1: x.r1 || 0.034, L1: x.L1 || 0.2, L2: x.L2 || 0.2,
          rh: x.rh, point: x.point, maxReach: x.maxReach
        });
      },
      onHelmet: function (x, y, off) { var P = new T.Vector3(), N = new T.Vector3(); onHelmet(H, x, y, off || 0, P, N); return { p: P, n: N }; }
    };
  }

  // ---- the face ---------------------------------------------------
  var BLUSH_TEX = null;
  function blushTex() {
    if (BLUSH_TEX) return BLUSH_TEX;
    var n = 128, c = document.createElement('canvas'); c.width = c.height = n;
    var x = c.getContext('2d'), g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.85)');
    g.addColorStop(0.8, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, n, n);
    BLUSH_TEX = new T.CanvasTexture(c); return BLUSH_TEX;
  }
  var FACE_KEYS = ['w', 'h', 'lid', 'slope', 'smile', 'tilt', 'browY', 'browA', 'cheek', 'dx', 'dy'];
  function makeFace3(head, H, a, spec, sc, hue, acc) {
    var eyeCol = spec.col ? spec.col : lighter(hue, 0.62).lerp(new T.Color(0xffffff), 0.12);
    var lensMat = addBlend(new T.MeshBasicMaterial({ color: eyeCol, transparent: true, opacity: 1, depthWrite: false, side: T.DoubleSide }));
    lensMat.userData.baseOp = 1;
    var coreMat = addBlend(new T.MeshBasicMaterial({ color: lighter(eyeCol, 0.7), transparent: true, opacity: 0.75, depthWrite: false, side: T.DoubleSide }));
    coreMat.userData.baseOp = 0.75;
    var browMat = addBlend(new T.MeshBasicMaterial({ color: eyeCol, transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide }));
    browMat.userData.baseOp = 0.85;
    var wait = {}, work = {};
    FACE_KEYS.forEach(function (k) { wait[k] = spec.wait[k] != null ? spec.wait[k] : 0; });
    FACE_KEYS.forEach(function (k) { work[k] = (spec.work && spec.work[k] != null) ? spec.work[k] : wait[k]; });
    var cur = {}; FACE_KEYS.forEach(function (k) { cur[k] = wait[k]; });
    var eyes = [], n = spec.n || 2;
    for (var i = 0; i < n; i++) {
      var side = n === 1 ? 0 : (i ? 1 : -1);
      var gE = new T.Group(); head.add(gE);
      var piv = new T.Group(); gE.add(piv);
      var geo = eyeFan(48);
      var lens = new T.Mesh(geo, lensMat); lens.renderOrder = 4; piv.add(lens);
      var inner = new T.Mesh(geo, coreMat); inner.scale.setScalar(0.56); inner.position.z = 0.001; inner.renderOrder = 5; piv.add(inner);
      var cl = new T.Mesh(CATCH_GEO, CATCH_MAT); cl.renderOrder = 6; cl.position.z = 0.002; piv.add(cl);
      var cl2 = new T.Mesh(CATCH_GEO, CATCH_MAT); cl2.renderOrder = 6; cl2.position.z = 0.002; piv.add(cl2);
      var hl = halo(eyeCol, (spec.wait.w || 0.05) * 0.9, 0.4); hl.position.z = -0.002; piv.add(hl);
      var e = { side: side, g: gE, piv: piv, geo: geo, lens: lens, inner: inner, cl: cl, cl2: cl2, halo: hl };
      if (spec.brow) {
        var bg = new T.Group(); head.add(bg);
        var bm = new T.Mesh(browGeo(spec.brow.w, spec.brow.t), browMat); bm.renderOrder = 4; bg.add(bm);
        e.brow = bg; e.browM = bm;
      }
      if (spec.iris) {
        var irisMat = new T.MeshBasicMaterial({ color: spec.irisCol || acc, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
        var iris = new T.Mesh(new T.CircleGeometry(1, 40), irisMat); iris.position.z = 0.0015; iris.renderOrder = 5; piv.add(iris);
        var pupil = new T.Mesh(CATCH_GEO, new T.MeshBasicMaterial({ color: 0x04060c, transparent: true, depthWrite: false }));
        pupil.position.z = 0.0018; pupil.renderOrder = 5; piv.add(pupil);
        var ring = new T.Mesh(new T.RingGeometry(0.86, 1, 40), new T.MeshBasicMaterial({ color: darker(spec.irisCol || acc, 0.45), transparent: true, depthWrite: false, toneMapped: false }));
        ring.position.z = 0.0016; ring.renderOrder = 5; piv.add(ring); e.irisRing = ring;
        e.iris = iris; e.pupil = pupil;
      }
      eyes.push(e);
    }
    var cheeks = [];
    if (spec.cheekCol) [-1, 1].forEach(function (s) {
      var cm = new T.MeshBasicMaterial({ map: blushTex(), color: spec.cheekCol, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      var c = new T.Mesh(GEO.plane, cm); c.scale.set(0.075, 0.045, 1); c.renderOrder = 4; head.add(c); cheeks.push({ s: s, sp: c });
    });
    return {
      v3: true, eyes: eyes, cheeks: cheeks, spec: spec, sc: sc, H: H, wait: wait, work: work, cur: cur,
      add: { dx: 0, dy: 0, lid: 0, smile: 0, browY: 0, h: 1 },
      mat: lensMat, blink: 0, nextBlink: 2 + Math.random() * 5,
      sacc: new T.Vector2(), saccT: new T.Vector2(), nextSacc: 1 + Math.random() * 3
    };
  }
  var _fP = new T.Vector3(), _fN = new T.Vector3();
  function face3(face, working, dt) {
    var tgt = working ? face.work : face.wait, cur = face.cur, live = false;
    var k = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
    FACE_KEYS.forEach(function (key) {
      var d = tgt[key] - cur[key];
      if (Math.abs(d) > 1e-4) { cur[key] += d * k; live = true; } else cur[key] = tgt[key];
    });
    var spec = face.spec, sc = face.sc, H = face.H, ad = face.add;
    var gap = spec.gap || 0, ey = sc.y + (spec.ey || 0);
    var shape = { w: cur.w, h: cur.h * ad.h, lid: clamp(cur.lid + ad.lid, 0, 0.8), slope: 0,
                  smile: clamp(cur.smile + ad.smile, 0, 0.95), round: spec.round || 2.2 };
    var close = 1;
    for (var i = 0; i < face.eyes.length; i++) {
      var e = face.eyes[i], s = e.side;
      if (face.blink > 0) {
        var p = clamp((face.blink - i * 0.04) / 0.22, 0, 1);
        close = 1 - Math.sin(p * Math.PI) * 0.93;
      } else close = 1;
      var x = s * gap + face.sacc.x * 0.55 + cur.dx + ad.dx, y = ey + face.sacc.y * 0.5 + cur.dy + ad.dy;
      onHelmet(H, x, y, 0.009, _fP, _fN);
      e.g.position.copy(_fP); e.g.quaternion.setFromUnitVectors(ZV, _fN);
      shape.slope = cur.slope * s;
      shapeEye(e.geo, shape);
      e.piv.rotation.z = cur.tilt * s;
      e.piv.scale.y = close;
      var w = shape.w, h = shape.h;
      var ytop = lidAt(shape, -0.3 * w);
      e.cl.position.set(-0.3 * w, Math.min(0.36 * h, ytop - 0.3 * h), 0.002);
      e.cl.scale.setScalar(Math.min(w, h) * 0.24);
      e.cl2.visible = shape.smile < 0.35;
      e.cl2.position.set(0.32 * w, -0.34 * h, 0.002); e.cl2.scale.setScalar(Math.min(w, h) * 0.11);
      if (e.iris) {
        var ir = Math.min(w, h) * (spec.irisR || 0.62);
        e.iris.scale.setScalar(ir); e.pupil.scale.setScalar(ir * (spec.pupil || 0.46)); e.irisRing.scale.setScalar(ir);
        e.cl.scale.setScalar(ir * 0.26); e.cl.position.set(-ir * 0.34, ir * 0.36, 0.003); e.cl2.visible = true; e.cl2.position.set(ir * 0.3, -ir * 0.3, 0.003); e.cl2.scale.setScalar(ir * 0.12);
      }
      if (e.brow) {
        onHelmet(H, x + s * (spec.brow.x || 0), y + h + cur.browY - (1 - close) * 0.012, 0.009, _fP, _fN);
        e.brow.position.copy(_fP); e.brow.quaternion.setFromUnitVectors(ZV, _fN);
        e.browM.rotation.z = cur.browA * s;
      }
    }
    for (var c = 0; c < face.cheeks.length; c++) {
      var ch = face.cheeks[c];
      onHelmet(H, ch.s * (gap + shape.w * 0.6), ey - shape.h * 1.15, 0.01, _fP, _fN);
      ch.sp.position.copy(_fP); ch.sp.quaternion.setFromUnitVectors(ZV, _fN);
      ch.sp.material.opacity = cur.cheek;
    }
    return live;
  }

  var BUILD = {};

  // ===============================================================
  // THE NINE, PASS 3
  // ===============================================================
  function starGeo(R1, R2, r0, depth, bevel) {
    var s = new T.Shape();
    for (var k = 0; k < 16; k++) {
      var ang = Math.PI / 2 + k * Math.PI / 8;
      var rr = (k % 4 === 0) ? R1 : (k % 2 === 0 ? R2 : r0);
      if (k) s.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else s.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    s.closePath();
    var g = new T.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
    g.center(); g.computeVertexNormals();
    return g;
  }
  function metalMat(col, rough) {
    return new T.MeshPhysicalMaterial({ color: col, roughness: rough != null ? rough : 0.28, metalness: 0.85, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  }

  // 1 · COMMANDER — the captain. Gold epaulettes, a compass rose worn as
  //     a crest, one hand on the hip; working, the other arm points ahead
  //     and the rose swings to find the heading.
  BUILD.commander = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.2, bellyR: 0.245, bellyY: 0.22, chestR: 0.24, chestY: 0.38, shR: 0.205, shY: 0.5, topR: 0.1, topY: 0.585 },
      head: { hx: 0.33, hy: 0.28, hz: 0.3, n: 2.6, y: 0.81 },
      screen: { w: 0.245, h: 0.165, y: -0.02, m: 3.4, rim: 0.09 },
      face: {
        n: 2, gap: 0.092, ey: 0.004, round: 2.3, brow: { w: 0.056, t: 0.017, x: 0.004 },
        wait: { w: 0.047, h: 0.062, lid: 0, slope: 0.05, smile: 0, tilt: 0.03, browY: 0.024, browA: 0.1 },
        work: { h: 0.066, browY: 0.034, browA: 0.22, dy: 0.004 }
      },
      coreY: 0.34, markerY: 1.56, footR: 0.4, backPlate: false
    });
    var g = b.group, hue = b.hue;
    var gold = metalMat(lighter(TK.gold, 0.18), 0.24);
    gold.emissive = TK.gold.clone(); gold.emissiveIntensity = 0.12;
    // epaulettes: a padded gold dome on each shoulder, with a lit edge
    [-1, 1].forEach(function (s) {
      var ep = new T.Group(); ep.position.set(0.185 * s, 0.548, -0.005); ep.rotation.z = -0.42 * s; g.add(ep);
      ep.add(mesh(GEO.sph, gold, 0.105, 0.036, 0.092));
      var edge = mesh(GEO.tor, emissiveMat(lighter(TK.gold, 0.2), 1.4, { lamp: true }), 0.094, 0.084, 0.06, 0, -0.004, 0);
      edge.rotation.x = Math.PI / 2; edge.castShadow = false; ep.add(edge);
    });
    // THE ROSE — an eight-point star standing on the crown on a short post
    var roseG = new T.Group(); roseG.position.set(0, 0.405, -0.02); roseG.scale.setScalar(1.25); b.head.add(roseG);
    var post = mesh(GEO.cyl, b.jointMat, 0.02, 0.09, 0.02, 0, -0.085, 0); roseG.add(post);
    var card = new T.Group(); roseG.add(card);
    var star = new T.Mesh(starGeo(0.125, 0.07, 0.03, 0.016, 0.007), gold);
    star.castShadow = true; card.add(star);
    var back = new T.Mesh(starGeo(0.085, 0.085, 0.028, 0.01, 0.005), metalMat(lighter(hue, 0.25), 0.3));
    back.rotation.z = Math.PI / 4; back.position.z = -0.012; back.castShadow = true; card.add(back);
    var hubMat = emissiveMat(lighter(hue, 0.3), 2.2, { lamp: true });
    var hub = mesh(GEO.sph, hubMat, 0.026, 0.026, 0.022, 0, 0, 0.012); hub.castShadow = false; card.add(hub);
    var north = mesh(GEO.sph, emissiveMat(lighter(TK.gold, 0.3), 2.6, { lamp: true }), 0.014, 0.014, 0.014, 0, 0.1, 0.014);
    north.castShadow = false; card.add(north);
    var roseGlow = halo(TK.gold, 0.14, 0.16); roseGlow.position.z = -0.02; roseG.add(roseGlow);

    // THE CAPE — laid ON the back. Pass 4's cape was a sheet bent round a
    // guessed cylinder: from behind it read as a stiff pale board, flaring
    // off the body. Now every grid point is projected onto the body (and
    // over the shoulder joints) and the cloth only stands off it by a hair
    // at the collar and a little more at the hem, which is where a cape
    // actually swings. The top edge tucks under the helmet; the epaulettes
    // cover its corners.
    var capeU = 16, capeV = 12, capeBase = [], capeNorm = [];
    var SLc = V(-0.215, 0.475, 0), SRc = V(0.215, 0.475, 0);
    var armLc = b.arm(-1, { r0: 0.05, r1: 0.034, L1: 0.21, L2: 0.2 });
    var armRc = b.arm(1, { r0: 0.05, r1: 0.034, L1: 0.21, L2: 0.2, point: true });
    var hugOn = [b.body, armLc.shoulder, armRc.shoulder];
    armLc.set(SLc, V(-0.285, 0.29, 0.05), V(-1, 0.15, -0.25), V(1, 0, 0.2));
    armRc.set(SRc, V(0.29, 0.17, 0.07), V(0.25, 0, -1), V(-1, 0, 0.1));
    hugOn.forEach(function (m) { m.updateMatrixWorld(true); });
    for (var cv = 0; cv <= capeV; cv++) {
      for (var cu = 0; cu <= capeU; cu++) {
        var uu = cu / capeU - 0.5, vv = cv / capeV;
        var spread = 2.1 - vv * 0.25;
        var an = uu * spread;
        // rounded hem corners: the bottom edge rises toward the sides
        var yy = 0.575 - vv * 0.4 * (1 - 0.22 * Math.pow(2 * uu, 4));
        var Cc = V(0, yy, 0), dir = V(Math.sin(an), 0, -Math.cos(an));
        var hc = hug(hugOn, Cc.clone().add(dir), Cc, 0);
        capeBase.push(hc.p); capeNorm.push(hc.n);
      }
    }
    var capeGeo = new T.BufferGeometry(), capePos = new Float32Array(capeBase.length * 3), capeUv = [], capeIdx = [];
    for (cv = 0; cv <= capeV; cv++) for (cu = 0; cu <= capeU; cu++) capeUv.push(cu / capeU, 1 - cv / capeV);
    for (cv = 0; cv < capeV; cv++) for (cu = 0; cu < capeU; cu++) {
      var q0 = cv * (capeU + 1) + cu, q1 = q0 + 1, q2 = q0 + capeU + 1, q3 = q2 + 1;
      capeIdx.push(q0, q2, q1, q1, q2, q3);
    }
    capeGeo.setAttribute('position', new T.BufferAttribute(capePos, 3));
    capeGeo.setAttribute('uv', new T.Float32BufferAttribute(capeUv, 2));
    capeGeo.setIndex(capeIdx);
    // navy, not a darker cyan: in the body's own hue it read as a hump
    var capeM = new T.MeshPhysicalMaterial({ color: darker(hue, 0.2).lerp(new T.Color(0x121a3d), 0.82), roughness: 0.58, sheen: 0.18, sheenColor: lighter(hue, 0.1), sheenRoughness: 0.6, clearcoat: 0.15 });
    var capeIn = new T.MeshPhysicalMaterial({ color: lighter(TK.gold, 0.05), roughness: 0.5, metalness: 0.1, emissive: TK.gold.clone(), emissiveIntensity: 0.08 });
    var cape = new T.Group(); g.add(cape);
    var capeMesh = new T.Mesh(capeGeo, capeM); capeMesh.castShadow = true; capeMesh.receiveShadow = true; cape.add(capeMesh);
    var capeLining = new T.Mesh(capeGeo, capeIn); cape.add(capeLining);
    // gold piping along the hem, so the edge of the cloth is drawn
    var hemPipe = taperTube(capeU, 8);
    var hemM = new T.Mesh(hemPipe.geo, metalMat(lighter(TK.gold, 0.12), 0.3)); hemM.castShadow = true; cape.add(hemM);
    // the rolled collar along the top edge
    var collar = taperTube(capeU, 8);
    var collarM = new T.Mesh(collar.geo, capeM); collarM.castShadow = true; cape.add(collarM);
    var _cq = new T.Vector3();
    function drape(lift) {
      for (var k = 0; k < capeBase.length; k++) {
        var vv2 = Math.floor(k / (capeU + 1)) / capeV, uu2 = (k % (capeU + 1)) / capeU - 0.5;
        var off = 0.012 + vv2 * vv2 * (0.035 + lift * 0.06);
        _cq.copy(capeBase[k]).addScaledVector(capeNorm[k], off);
        _cq.y += lift * vv2 * vv2 * 0.03;
        _cq.x += Math.sin(vv2 * 3 + uu2 * 4) * 0.006 * vv2 * (1 + lift);
        capePos[k * 3] = _cq.x; capePos[k * 3 + 1] = _cq.y; capePos[k * 3 + 2] = _cq.z;
      }
      capeGeo.attributes.position.needsUpdate = true; capeGeo.computeVertexNormals();
      for (var c2 = 0; c2 <= capeU; c2++) {
        collar.pts[c2].set(capePos[c2 * 3], capePos[c2 * 3 + 1], capePos[c2 * 3 + 2]).addScaledVector(capeNorm[c2], 0.008);
      }
      collar.build(function () { return 0.016; });
      var hb = capeV * (capeU + 1);
      for (var c3 = 0; c3 <= capeU; c3++) hemPipe.pts[c3].set(capePos[(hb + c3) * 3], capePos[(hb + c3) * 3 + 1], capePos[(hb + c3) * 3 + 2]);
      hemPipe.build(function () { return 0.007; });
    }
    // which side is out: the winding decides, so it is measured, not assumed
    drape(0);
    var mid = Math.floor(capeV / 2) * (capeU + 1) + Math.floor(capeU / 2);
    var gn = capeGeo.attributes.normal;
    var outward = gn.getX(mid) * capeNorm[mid].x + gn.getY(mid) * capeNorm[mid].y + gn.getZ(mid) * capeNorm[mid].z > 0;
    capeM.side = outward ? T.FrontSide : T.BackSide;
    capeIn.side = outward ? T.BackSide : T.FrontSide;
    var SL = SLc, SR = SRc, armL = armLc, armR = armRc;
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      // left hand on the hip, always: the captain's stance
      armL.set(SL, P.v('lH', -0.285, 0.29, 0.05), P.v('lP', -1, 0.15, -0.25), P.v('lPalm', 1, 0, 0.2));
      var rH = working ? P.v('rH', 0.31, 0.8, 0.25) : P.v('rH', 0.29, 0.17, 0.07);
      var rP = working ? P.v('rP', 1, -0.6, -0.2) : P.v('rP', 0.25, 0, -1);
      var rPalm = working ? P.v('rPalm', -0.4, 0, 1) : P.v('rPalm', -1, 0, 0.1);
      armR.set(SR, rH, rP, rPalm);
      armR.finger.scale.setScalar(Math.max(0.001, P.s('fing', working ? 1 : 0.001)));
      // the rose: working, it swings to find the heading and settles;
      // waiting, it sits a hair off north
      var amp = P.s('amp', working ? 1 : 0);
      card.rotation.z = rm ? (working ? 0.35 : 0.08)
        : 0.08 * (1 - amp) + amp * (Math.sin(t * 1.1) * 0.7 + Math.sin(t * 2.7) * 0.16);
      hubMat.emissiveIntensity = (working ? 3.0 : 1.6) * TK.em;
      b.headYaw = P.s('yaw', working ? 0.18 : 0);
      b.headPitch = P.s('pitch', working ? -0.06 : 0);
      var cl = P.s('cape', working ? 1 : 0);
      drape(cl + (rm ? 0 : Math.sin(t * 1.7) * 0.08));
      return (working && !rm) || P.moving();
    };
    return b;
  };

  // a band around the helmet between two heights — follows the helmet's
  // own superquadric, so it sits ON the head rather than near it
  function helmetBand(H, y0, y1, off, seg) {
    seg = seg || 72;
    var pos = [], nor = [], idx = [], rows = 6, P = new T.Vector3(), N = new T.Vector3();
    for (var i = 0; i <= rows; i++) {
      var y = y0 + (y1 - y0) * i / rows, bulge = Math.sin(i / rows * Math.PI) * off * 0.5 + off * 0.5;
      var k = Math.max(1e-4, 1 - Math.pow(Math.abs(y / H.hy), H.n));
      for (var j = 0; j <= seg; j++) {
        var a = j / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        var sc = Math.pow(k, 1 / H.n) / Math.pow(Math.pow(Math.abs(c), H.n) + Math.pow(Math.abs(s), H.n), 1 / H.n);
        var x = H.hx * c * sc, z = H.hz * s * sc;
        N.set(spow(x, H.n - 1) / Math.pow(H.hx, H.n), spow(y, H.n - 1) / Math.pow(H.hy, H.n), spow(z, H.n - 1) / Math.pow(H.hz, H.n)).normalize();
        P.set(x, y, z).addScaledVector(N, bulge);
        pos.push(P.x, P.y, P.z); nor.push(N.x, N.y, N.z);
      }
    }
    for (i = 0; i < rows; i++) for (var j2 = 0; j2 < seg; j2++) {
      var A = i * (seg + 1) + j2, B = A + seg + 1;
      idx.push(A, B, A + 1, A + 1, B, B + 1);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
  function smooth01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  // 2 · COACH — broad through the chest, a sweatband, wristbands and a
  //     whistle on a lanyard. Waiting: hands on hips, the bar set down in
  //     front. Working: it curls the bar, and grins at the top of the rep.
  BUILD.coach = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.2, bellyR: 0.235, bellyY: 0.2, chestR: 0.275, chestY: 0.4, shR: 0.25, shY: 0.515, topR: 0.11, topY: 0.6 },
      head: { hx: 0.315, hy: 0.265, hz: 0.29, n: 2.7, y: 0.815 },
      screen: { w: 0.235, h: 0.15, y: -0.03, m: 3.4, rim: 0.09 },
      face: {
        n: 2, gap: 0.09, ey: 0.0, round: 2.3, brow: { w: 0.058, t: 0.019, x: 0.006 },
        cheekCol: lighter(TK.hue.chest, 0.12).lerp(TK.hue.mg, 0.2), col: lighter(TK.hue.abs, 0.62),
        wait: { w: 0.048, h: 0.06, lid: 0, slope: 0.05, smile: 0.1, tilt: 0.02, browY: 0.024, browA: 0.16, cheek: 0.3 },
        work: { h: 0.062, lid: 0, smile: 0.66, browY: 0.034, browA: -0.04, cheek: 0.75 }
      },
      feet: { x: 0.135, sx: 0.092, sz: 0.125, yaw: 0.32 },
      coreY: 0.29, markerY: 1.36, footR: 0.46, earR: 0.08
    });
    var g = b.group, acc = b.acc;
    var bandMat = new T.MeshPhysicalMaterial({ color: lighter(acc, 0.05), roughness: 0.78, metalness: 0, sheen: 1, sheenColor: lighter(acc, 0.5), sheenRoughness: 0.4 });
    // the sweatband, around the forehead above the screen
    var sweat = new T.Mesh(helmetBand(b.H, 0.14, 0.205, 0.018), bandMat);
    sweat.castShadow = true; b.head.add(sweat);
    // the lanyard and the whistle
    var wHit = onBody(b.body, 0, 0.47);
    var lan = taperTube(16, 6);
    var lanPts = [V(-0.095, 0.6, 0.02), V(-0.07, 0.535, wHit.p.z * 0.8), V(0, wHit.p.y + 0.01, wHit.p.z + 0.012), V(0.07, 0.535, wHit.p.z * 0.8), V(0.095, 0.6, 0.02)];
    var lanCurve = new T.CatmullRomCurve3(lanPts, false, 'centripetal');
    for (var i = 0; i <= 16; i++) lanCurve.getPoint(i / 16, lan.pts[i]);
    lan.build(function () { return 0.0065; });
    var lanMesh = new T.Mesh(lan.geo, bandMat); lanMesh.castShadow = true; g.add(lanMesh);
    var whistle = new T.Group(); seat(whistle, wHit, 0.03); whistle.position.y -= 0.035; whistle.scale.setScalar(1.5); g.add(whistle);
    var chrome = metalMat(0xdfe6f2, 0.18);
    var wb = new T.Mesh(new T.CapsuleGeometry(0.022, 0.04, 6, 14), chrome); wb.rotation.z = Math.PI / 2; wb.castShadow = true; whistle.add(wb);
    var wm = mesh(GEO.cyl, chrome, 0.012, 0.03, 0.012, 0.03, 0.012, 0); wm.rotation.z = -1.2; whistle.add(wm);
    var wr = mesh(GEO.tor, chrome, 0.013, 0.013, 0.02, -0.03, 0.02, 0); whistle.add(wr);

    // THE BAR — graded plates, knurled grip, collars
    var bar = new T.Group(); g.add(bar);
    var gripMat = new T.MeshPhysicalMaterial({ map: knurlTex(), color: 0xc4ccda, roughness: 0.4, metalness: 0.85, clearcoat: 0.5 });
    var shaft = mesh(GEO.cyl, gripMat, 0.019, 0.98, 0.019); shaft.rotation.z = Math.PI / 2; bar.add(shaft);
    var sleeveMat = metalMat(0x9aa4b6, 0.26);
    var grades = [TK.hue.chest, TK.hue.shoulders, TK.hue.abs];
    [-1, 1].forEach(function (s) {
      var col = mesh(GEO.cyl, sleeveMat, 0.04, 0.03, 0.04, 0.33 * s, 0, 0); col.rotation.z = Math.PI / 2; bar.add(col);
      [0.37, 0.415, 0.452].forEach(function (off, k) {
        var pr = 0.135 - k * 0.026;
        var pm = new T.MeshPhysicalMaterial({ color: darker(grades[k], 0.7), roughness: 0.38, metalness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.1, sheen: 0.5, sheenColor: lighter(grades[k], 0.4) });
        var pl = mesh(new T.CylinderGeometry(1, 1, 1, 40), pm, pr, 0.036, pr, off * s, 0, 0); pl.rotation.z = Math.PI / 2; bar.add(pl);
        var hub = mesh(GEO.cyl, sleeveMat, 0.028, 0.04, 0.028, off * s, 0, 0); hub.rotation.z = Math.PI / 2; bar.add(hub);
        var rimT = mesh(GEO.tor, emissiveMat(grades[k], 1.8, { lamp: true }), pr * 0.99, pr * 0.99, 0.12, (off + 0.019) * s, 0, 0);
        rimT.rotation.y = Math.PI / 2; rimT.castShadow = false; bar.add(rimT);
      });
      var end = mesh(GEO.cyl, sleeveMat, 0.024, 0.05, 0.024, 0.49 * s, 0, 0); end.rotation.z = Math.PI / 2; bar.add(end);
    });

    var SL = V(-0.235, 0.49, 0), SR = V(0.235, 0.49, 0);
    var armL = b.arm(-1, { r0: 0.056, r1: 0.038, L1: 0.2, L2: 0.19, rh: 0.052 });
    var armR = b.arm(1, { r0: 0.056, r1: 0.038, L1: 0.2, L2: 0.19, rh: 0.052 });
    [armL, armR].forEach(function (arm) { arm.hand.children[0].material = bandMat; arm.hand.children[0].scale.set(0.058, 0.058, 0.16); });
    // THE TOWEL — over the left shoulder, a hand's length down the chest
    // and most of the way down the back. Pass 4's was a paper-thin ribbon
    // standing off the chest; this one has thickness and lies on the body.
    armL.set(SL, V(-0.29, 0.28, 0.05), V(-1, 0.15, -0.25), V(1, 0, 0.2));
    armR.set(SR, V(0.29, 0.28, 0.05), V(1, 0.15, -0.25), V(-1, 0, 0.2));
    var towelTex = tex('towel', function (x, w, h) {
      x.fillStyle = '#f7f4ec'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < 1800; i++) { x.fillStyle = 'rgba(0,0,0,' + (0.02 + Math.random() * 0.04) + ')'; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      var col = '#' + lighter(acc, 0.05).getHexString();
      [0.07, 0.11, 0.89, 0.93].forEach(function (u) { x.fillStyle = col; x.fillRect(u * w - w * 0.012, 0, w * 0.024, h); });
    }, 256, 32);
    var towelM = new T.MeshPhysicalMaterial({ map: towelTex, roughness: 0.95, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.8 });
    var towel = strap([b.body, armL.shoulder], [V(-0.15, 0.34, 0.3), V(-0.17, 0.45, 0.25), V(-0.19, 0.58, 0.05), V(-0.19, 0.55, -0.15), V(-0.17, 0.42, -0.3), V(-0.16, 0.22, -0.3)],
      V(-0.12, 0.36, 0), { w: 0.1, t: 0.016, off: 0.004, n: 48, mat: towelM });
    g.add(towel);
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      var ph = 0;
      if (working) {
        // a curl: up, a beat at the top, and down under control
        var c = (t * 0.75) % 1;
        ph = rm ? 1 : (c < 0.4 ? smooth01(c / 0.4) : c < 0.55 ? 1 : 1 - smooth01((c - 0.55) / 0.45));
      }
      var bp = working
        ? P.v('bar', 0, 0.3 + ph * 0.3, 0.33 + Math.sin(ph * Math.PI) * 0.05 + ph * 0.02)
        : P.v('bar', 0, 0.135, 0.46);
      bar.position.copy(bp);
      bar.rotation.x = working ? 0 : 0.0;
      // the grip: on the bar while working; hands on hips while it rests
      var gripL = V(-0.2, bp.y, bp.z), gripR = V(0.2, bp.y, bp.z);
      var lH = working ? P.v('lH', gripL.x, gripL.y, gripL.z) : P.v('lH', -0.29, 0.28, 0.05);
      var rH = working ? P.v('rH', gripR.x, gripR.y, gripR.z) : P.v('rH', 0.29, 0.28, 0.05);
      armL.set(SL, lH, working ? P.v('lP', -0.25, -0.5, -1) : P.v('lP', -1, 0.15, -0.25), working ? P.v('lPalm', 0, 1, 0.3) : P.v('lPalm', 1, 0, 0.2));
      armR.set(SR, rH, working ? P.v('rP', 0.25, -0.5, -1) : P.v('rP', 1, 0.15, -0.25), working ? P.v('rPalm', 0, 1, 0.3) : P.v('rPalm', -1, 0, 0.2));
      // the grin comes with the top of the rep, not with the whole set
      b.face.add.smile = working ? (ph - 1) * 0.45 : 0;
      b.face.add.lid = working ? (1 - ph) * 0.12 : 0;
      b.headPitch = P.s('pitch', working ? -0.05 - ph * 0.05 : 0.03);
      return (working && !rm) || P.moving();
    };
    return b;
  };

  // 3 · CFO — a squared ledger body, a gold celluloid eyeshade, level
  //     brows (precise) over round eyes (friendly). Waiting: arms folded,
  //     the month's stack held. Working: it flips a coin and watches it.
  BUILD.cfo = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.215, bellyR: 0.262, bellyY: 0.22, chestR: 0.25, chestY: 0.4, shR: 0.2, shY: 0.51, topR: 0.1, topY: 0.585 },
      squ: 3.4, depth: 0.8, bands: [0.5],
      head: { hx: 0.325, hy: 0.27, hz: 0.29, n: 2.9, y: 0.81 },
      screen: { w: 0.235, h: 0.15, y: -0.035, m: 3.8, rim: 0.085 },
      face: {
        n: 2, gap: 0.088, ey: 0.0, round: 2.1, brow: { w: 0.05, t: 0.014, x: 0.002 },
        cheekCol: lighter(TK.hue.chest, 0.2).lerp(TK.hue.mg, 0.2),
        wait: { w: 0.045, h: 0.053, lid: 0, slope: 0, smile: 0.16, tilt: 0, browY: 0.024, browA: 0, cheek: 0.2 },
        work: { smile: 0.3, browY: 0.032, cheek: 0.4 }
      },
      coreY: 0.33, markerY: 1.38, footR: 0.44
    });
    var g = b.group;
    // THE COIN SLOT — the helmet is a money box: a dark slot in the crown
    // with a gold lip, readable from any angle the sheet is seen at
    var goldM = metalMat(lighter(TK.gold, 0.15), 0.26);
    var slotG = new T.Group(); slotG.position.set(0, b.H.hy * 0.985, 0.01); slotG.rotation.x = 0.08; b.head.add(slotG);
    var lip = new T.Mesh(new T.CapsuleGeometry(0.03, 0.12, 6, 16), goldM);
    lip.rotation.z = Math.PI / 2; lip.scale.set(1, 1, 0.55); lip.castShadow = true; slotG.add(lip);
    var hole = new T.Mesh(new T.CapsuleGeometry(0.013, 0.12, 4, 12), new T.MeshBasicMaterial({ color: 0x05080d }));
    hole.rotation.z = Math.PI / 2; hole.scale.set(1, 1, 0.5); hole.position.y = 0.012; slotG.add(hole);
    // THE BOW TIE, at the collar
    var tieHit = onBody(b.body, 0, 0.5);
    var tie = new T.Group(); seat(tie, tieHit, 0.014); tie.scale.setScalar(1.45); g.add(tie);
    var tieM = metalMat(lighter(TK.gold, 0.2), 0.35); tieM.emissive = TK.gold.clone(); tieM.emissiveIntensity = 0.25;
    [-1, 1].forEach(function (s) {
      var wing = mesh(GEO.cone, tieM, 0.05, 0.085, 0.028, s * 0.042, 0, 0.005);
      wing.rotation.z = s * Math.PI / 2; tie.add(wing);
    });
    tie.add(mesh(GEO.sph, tieM, 0.022, 0.024, 0.02, 0, 0, 0.018));
    // the stack of the month's receipts
    var coinMat = new T.MeshPhysicalMaterial({ map: chipTex(), color: lighter(TK.gold, 0.12), roughness: 0.26, metalness: 0.8, clearcoat: 0.9 });
    var edgeMat = metalMat(TK.gold, 0.3);
    function coin() {
      var c = new T.Group();
      var body2 = mesh(new T.CylinderGeometry(1, 1, 1, 36), [edgeMat, coinMat, coinMat], 0.088, 0.024, 0.088); c.add(body2);
      return c;
    }
    var stack = new T.Group(); stack.position.set(0.42, 0, 0.16); g.add(stack);
    for (var k = 0; k < 7; k++) { var c = coin(); c.position.set(Math.sin(k * 2.1) * 0.006, 0.013 + k * 0.025, Math.cos(k * 1.7) * 0.006); c.rotation.y = k; stack.add(c); }
    var gleam = halo(lighter(TK.gold, 0.6), 0.12, 0.0); gleam.position.set(0.42, 0.2, 0.2); g.add(gleam);
    var flip = coin(); g.add(flip);

    // THE LEDGER — held against the chest in the left arm. Hands behind the
    // back (pass 4) read from the side as two green nubs; a book in the arm
    // reads from everywhere, and it is the job.
    var ledgerHit = onBody(b.body, -0.075, 0.33);
    var ledger = new T.Group(); seat(ledger, ledgerHit, 0.034); ledger.rotateZ(0.12); ledger.rotateX(-0.08); g.add(ledger);
    // oxblood leather: in the body's green it vanished against the chest
    var ledCover = new T.MeshPhysicalMaterial({ color: 0x5e1f24, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.25, sheen: 0.35, sheenColor: 0xb05a55 });
    ledger.add(mesh(GEO.box, ledCover, 0.155, 0.2, 0.04));
    var pagesM = new T.MeshPhysicalMaterial({ color: 0xf3eedd, roughness: 0.85 });
    ledger.add(mesh(GEO.box, pagesM, 0.146, 0.19, 0.03, 0.007, 0, 0));
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (c) {
      ledger.add(mesh(GEO.box, goldM, 0.026, 0.026, 0.044, c[0] * 0.068, c[1] * 0.09, 0));
    });
    ledger.add(mesh(GEO.box, goldM, 0.08, 0.014, 0.004, 0, 0.036, 0.021));
    ledger.add(mesh(GEO.box, goldM, 0.05, 0.008, 0.004, 0, 0.012, 0.021));
    var ribbonB = mesh(GEO.box, new T.MeshPhysicalMaterial({ color: lighter(TK.gold, 0.1), roughness: 0.6 }), 0.012, 0.06, 0.004, 0.04, -0.12, 0.004);
    ledger.add(ribbonB);
    ledger.updateMatrixWorld(true);
    var ledgerGrip = V(-0.07, -0.088, 0.022).applyMatrix4(ledger.matrix);
    var SL = V(-0.2, 0.475, 0), SR = V(0.2, 0.475, 0);
    var armL = b.arm(-1, { r0: 0.048, r1: 0.033, L1: 0.2, L2: 0.19 });
    var armR = b.arm(1, { r0: 0.048, r1: 0.033, L1: 0.2, L2: 0.19 });
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      // the left arm cradles the ledger: the mitten under its outer corner
      armL.set(SL, ledgerGrip, V(-1, -0.5, -0.2), V(0.3, 1, 0.3));
      var ph = 0, up = 0;
      if (working) {
        var c = (t * 0.7) % 1;
        ph = rm ? 0.5 : c;
        up = Math.sin(Math.min(1, ph / 0.8) * Math.PI);      // the flight
      }
      var rH = working ? P.v('rH', 0.34, 0.33 - up * 0.03, 0.3) : P.v('rH', 0.27, 0.2, 0.08);
      armR.set(SR, rH, working ? P.v('rP', 1, -0.4, -0.4) : P.v('rP', 0.3, 0, -1), working ? P.v('rPalm', 0, 1, 0) : P.v('rPalm', -1, 0, 0.1));
      // the flight is blended in with the hand, so switching to Working never
      // shows a coin already in the air before the hand has come up
      var mixC = P.s('mixC', working ? 1 : 0);
      up *= mixC;
      flip.visible = mixC > 0.02;
      flip.scale.setScalar(Math.max(0.001, Math.min(1, mixC * 1.5)));
      if (working || mixC > 0.02) {
        flip.position.set(rH.x + up * 0.03, rH.y + 0.075 + up * 0.3, rH.z + 0.02);
        flip.rotation.x = rm ? 1.1 : 0.9 + Math.min(1, ph / 0.8) * Math.PI * 6;
        // the eyes follow it up and back down
        b.face.add.dy = up * 0.018; b.face.add.dx = 0.012;
        b.headPitch = P.s('pitch', -up * 0.16);
        b.headYaw = P.s('yaw', 0.14);
      } else {
        b.face.add.dy = 0; b.face.add.dx = 0;
        b.headPitch = P.s('pitch', 0.02); b.headYaw = P.s('yaw', 0);
      }
      gleam.material.opacity = working && !rm ? 0.5 * Math.max(0, 1 - Math.abs(ph - 0.84) * 8) : 0;
      return (working && !rm) || P.moving();
    };
    return b;
  };

  // a shape extruded and then bent onto a body of radius R, so a badge
  // sits ON a round chest instead of cutting a chord through it
  function rrect(w, h, r) { var s2 = new T.Shape(); s2.moveTo(-w / 2 + r, -h / 2); s2.lineTo(w / 2 - r, -h / 2); s2.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); s2.lineTo(w / 2, h / 2 - r); s2.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s2.lineTo(-w / 2 + r, h / 2); s2.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s2.lineTo(-w / 2, -h / 2 + r); s2.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2); return s2; }
  // a fin standing on the crown: the helmet's own profile (x = 0) as the
  // base edge, pushed out along the normal by h(t) for the top edge
  function crownFin(H, a0, a1, h, thick, mat) {
    var base = [], top = [], P = new T.Vector3(), N = new T.Vector3();
    for (var i = 0; i <= 30; i++) {
      var t = i / 30, an = a0 + (a1 - a0) * t, y = Math.sin(an) * H.hy, z = Math.cos(an) * H.hz;
      onHelmet2(H, y, z, 0.004, P, N); base.push([P.z, P.y]);
      onHelmet2(H, y, z, 0.004 + h(t), P, N); top.push([P.z, P.y]);
    }
    var sh = new T.Shape(); sh.moveTo(base[0][0], base[0][1]);
    base.forEach(function (q) { sh.lineTo(q[0], q[1]); });
    top.reverse().forEach(function (q) { sh.lineTo(q[0], q[1]); });
    sh.closePath();
    var g = new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 2, curveSegments: 4 });
    g.translate(0, 0, -thick / 2); g.rotateY(Math.PI / 2);
    var m = new T.Mesh(g, mat); m.castShadow = true; return m;
  }
  // the helmet surface in the x = 0 plane, by (y, z) direction
  function onHelmet2(H, y, z, off, P, N) {
    var n = H.n, l = 1 / Math.pow(Math.pow(Math.abs(y / H.hy), n) + Math.pow(Math.abs(z / H.hz), n), 1 / n);
    y *= l; z *= l;
    N.set(0, spow(y, n - 1) / Math.pow(H.hy, n), spow(z, n - 1) / Math.pow(H.hz, n)).normalize();
    P.set(0, y, z).addScaledVector(N, off);
  }
  function badgeGeo(shape, depth, bevel, R) {
    var g = new T.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16, steps: 1 });
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) { var x = p.getX(i); p.setZ(i, p.getZ(i) - (x * x) / (2 * R)); }
    g.computeVertexNormals();
    return g;
  }
  function shieldShape(w, h) {
    var s = new T.Shape();
    s.moveTo(-w / 2, h * 0.42);
    s.quadraticCurveTo(0, h * 0.52, w / 2, h * 0.42);
    s.bezierCurveTo(w / 2, -h * 0.05, w * 0.3, -h * 0.34, 0, -h * 0.5);
    s.bezierCurveTo(-w * 0.3, -h * 0.34, -w / 2, -h * 0.05, -w / 2, h * 0.42);
    return s;
  }

  // 4 · GUARDIAN — a shield worn on the chest with the core set in it, a
  //     knight's ridge over the helmet, calm round eyes. The lantern hangs
  //     low and amber when a loop has gone quiet; raised and bright when a
  //     backup lands.
  BUILD.guardian = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.215, bellyR: 0.25, bellyY: 0.22, chestR: 0.262, chestY: 0.4, shR: 0.225, shY: 0.52, topR: 0.11, topY: 0.6 },
      head: { hx: 0.32, hy: 0.275, hz: 0.295, n: 2.6, y: 0.82 },
      screen: { w: 0.235, h: 0.155, y: -0.03, m: 3.3, rim: 0.09 },
      face: {
        n: 2, gap: 0.09, ey: 0.0, round: 2.0,
        cheekCol: lighter(TK.hue.chest, 0.2).lerp(TK.hue.mg, 0.3),
        wait: { w: 0.05, h: 0.058, lid: 0, slope: 0, smile: 0.1, tilt: 0, cheek: 0.22 },
        work: { h: 0.058, lid: 0, smile: 0.34, cheek: 0.45 }
      },
      coreY: 0.37, markerY: 1.4, footR: 0.44, feet: { x: 0.13, sx: 0.09, sz: 0.12 }
    });
    var g = b.group, hue = b.hue, acc = b.acc;
    var goldM = metalMat(lighter(TK.gold, 0.15), 0.28);
    // THE SHIELD on the chest, bent to the body, the core set in its boss
    var sh = new T.Group(); g.add(sh);
    var hit = onBody(b.body, 0, 0.37);
    seat(sh, hit, -0.004);
    var back = new T.Mesh(badgeGeo(shieldShape(0.25, 0.3), 0.014, 0.008, 0.27), goldM);
    back.castShadow = true; sh.add(back);
    var faceM = new T.MeshPhysicalMaterial({ color: lighter(hue, 0.15), roughness: 0.3, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: lighter(acc, 0.4) });
    var front = new T.Mesh(badgeGeo(shieldShape(0.2, 0.245), 0.012, 0.006, 0.27), faceM);
    front.position.z = 0.016; front.position.y = 0.004; sh.add(front);
    b.core.position.copy(hit.p).addScaledVector(hit.n, 0.034); b.core.scale.setScalar(1.15);
    // THE RIDGE over the crown, front to back
    var fin = crownFin(b.H, 0.95, Math.PI - 0.1, function (t) { return 0.07 * Math.sin(Math.PI * Math.pow(t, 0.9)); }, 0.024, goldM);
    b.head.add(fin);
    // THE LANTERN — hangs from the hand by its ring
    var lant = new T.Group(); g.add(lant);
    var capM = metalMat(lighter(TK.gold, 0.05), 0.32);
    var ring = mesh(GEO.tor, capM, 0.028, 0.028, 0.03, 0, 0, 0); lant.add(ring);
    var cap = mesh(new T.ConeGeometry(1, 1, 24), capM, 0.082, 0.06, 0.082, 0, -0.058, 0); lant.add(cap);
    lant.add(mesh(GEO.cyl, capM, 0.078, 0.014, 0.078, 0, -0.09, 0));
    var glassMat = new T.MeshPhysicalMaterial({ color: 0xe8eeff, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.24, side: T.DoubleSide, depthWrite: false });
    glassMat.userData.baseOp = 0.24;
    var glass = mesh(new T.CylinderGeometry(1, 1, 1, 28, 1, true), glassMat, 0.066, 0.15, 0.066, 0, -0.17, 0);
    glass.castShadow = false; lant.add(glass);
    for (var k = 0; k < 4; k++) {
      var an = k * Math.PI / 2 + Math.PI / 4;
      lant.add(mesh(GEO.cyl, capM, 0.0065, 0.16, 0.0065, Math.cos(an) * 0.068, -0.17, Math.sin(an) * 0.068));
    }
    lant.add(mesh(GEO.cyl, capM, 0.08, 0.022, 0.08, 0, -0.254, 0));
    var flameGeo = new T.LatheGeometry([V(0.0004, -0.05), V(0.026, -0.036), V(0.033, -0.01), V(0.025, 0.022), V(0.011, 0.05), V(0.0004, 0.074)].map(function (v) { return new T.Vector2(v.x, v.y); }), 20);
    var flameMat = emissiveMat(TK.gold, 2.6, { lamp: true });
    var flame = new T.Mesh(flameGeo, flameMat); flame.position.y = -0.19; flame.castShadow = false; lant.add(flame);
    var coreF = new T.Mesh(flameGeo, addBlend(new T.MeshBasicMaterial({ color: 0xfff4dc, transparent: true, opacity: 0.9, depthWrite: false })));
    coreF.scale.setScalar(0.5); coreF.position.y = -0.2; lant.add(coreF);
    var lampGlow = halo(TK.gold, 0.16, 0.3); lampGlow.position.y = -0.18; lant.add(lampGlow);
    var pointL = new T.PointLight(TK.gold.getHex(), 1.0, 2.4, 2); pointL.position.y = -0.18; lant.add(pointL);

    var SL = V(-0.22, 0.49, 0), SR = V(0.22, 0.49, 0);
    var armL = b.arm(-1, { r0: 0.052, r1: 0.036, L1: 0.2, L2: 0.2 });
    var armR = b.arm(1, { r0: 0.052, r1: 0.036, L1: 0.2, L2: 0.2 });
    var amber = new T.Color(0xe0a15a);
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      var lH = working ? P.v('lH', -0.25, 0.52, 0.3) : P.v('lH', -0.33, 0.28, 0.1);
      armL.set(SL, lH, working ? P.v('lP', -1, -0.6, -0.3) : P.v('lP', -0.6, 0, -1), P.v('lPalm', 1, 0, 0));
      lant.position.set(lH.x, lH.y + 0.02, lH.z);
      // the lantern hangs plumb whatever the arm does, and sways a little
      lant.rotation.z = rm ? 0 : Math.sin(t * 1.3) * 0.04;
      armR.set(SR, P.v('rH', 0.3, 0.2, 0.08), P.v('rP', 0.4, 0, -1), P.v('rPalm', -1, 0, 0.1));
      var lit = P.s('lit', working ? 1 : 0);
      var fl = rm ? 0 : (Math.sin(t * 9.1) * 0.5 + Math.sin(t * 13.7) * 0.3);
      flameMat.emissive.copy(amber).lerp(TK.gold, lit);
      flameMat.emissiveIntensity = (1.1 + lit * (2.6 + fl * 0.5)) * TK.em;
      flame.scale.set(0.85 + lit * 0.25, (0.8 + lit * 0.4) * (1 + fl * 0.06), 0.85 + lit * 0.25);
      coreF.scale.set(0.45 + lit * 0.1, (0.45 + lit * 0.2) * (1 + fl * 0.08), 0.45 + lit * 0.1);
      lampGlow.material.opacity = 0.12 + lit * 0.3;
      pointL.intensity = 0.4 + lit * (1.8 + fl * 0.3);
      b.headPitch = P.s('pitch', working ? 0.04 : 0.1);
      b.headYaw = P.s('yaw', working ? -0.12 : -0.05);
      return !rm || P.moving();
    };
    return b;
  };

  // 5 · RESEARCHER — one great lens for a face, an open book held in both
  //     hands, and an idea-bulb on a bent antenna. Working: the iris reads
  //     along the lines, a page turns with a real curl, the bulb glows.
  //     Waiting at the budget: the page hangs half-turned, and it looks up.
  BUILD.researcher = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.2, bellyR: 0.24, bellyY: 0.22, chestR: 0.24, chestY: 0.39, shR: 0.2, shY: 0.505, topR: 0.1, topY: 0.585 },
      head: { hx: 0.315, hy: 0.285, hz: 0.3, n: 2.4, y: 0.815 },
      screen: { w: 0.172, h: 0.172, y: -0.015, m: 2.05, rim: 0.16 },
      rimCol: new T.Color(0xcfd6e4),
      face: {
        n: 1, gap: 0, ey: 0, round: 2, iris: true, irisR: 0.84, pupil: 0.48,
        col: lighter(TK.hue.quads, 0.8), irisCol: TK.hue.quads.clone().lerp(TK.hue.cy, 0.35),
        wait: { w: 0.095, h: 0.095, lid: 0, smile: 0, tilt: 0 },
        work: { lid: 0, h: 0.1, w: 0.1 }
      },
      coreY: 0.29, markerY: 1.5, footR: 0.42, earR: 0.075
    });
    var g = b.group, hue = b.hue, acc = b.acc;
    // a knurled focus ring around the lens
    var fr = new T.Mesh(helmetPatch(b.H, 0.172, 0.172, -0.015, 2.05, 1.16, 1.24, 0.018, 0.022, 3, 72),
      new T.MeshPhysicalMaterial({ map: knurlTex(), color: lighter(acc, 0.1), roughness: 0.35, metalness: 0.7, clearcoat: 0.6 }));
    b.head.add(fr);
    // THE IDEA BULB on a bent antenna
    var ant = taperTube(16, 8), antPts = [V(0.12, 0.25, -0.03), V(0.15, 0.36, -0.02), V(0.2, 0.43, 0.02)];
    var antCurve = new T.CatmullRomCurve3(antPts);
    for (var i = 0; i <= 16; i++) antCurve.getPoint(i / 16, ant.pts[i]);
    ant.build(function (u) { return 0.012 - u * 0.004; });
    var antM = new T.Mesh(ant.geo, b.jointMat); antM.castShadow = true; b.head.add(antM);
    var bulbG = new T.Group(); bulbG.position.set(0.215, 0.47, 0.03); bulbG.scale.setScalar(1.45); b.head.add(bulbG);
    bulbG.add(mesh(GEO.cyl, metalMat(0xbfc7d6, 0.3), 0.018, 0.03, 0.018, 0, -0.03, 0));
    var bulbGlass = new T.MeshPhysicalMaterial({ color: 0xfff6d8, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.5, emissive: new T.Color(0xffd98a), emissiveIntensity: 0.2 });
    bulbGlass.userData.baseOp = 0.5;
    var bulb = mesh(GEO.sph, bulbGlass, 0.036, 0.042, 0.036, 0, 0.012, 0); bulb.castShadow = false; bulbG.add(bulb);
    var filMat = emissiveMat(new T.Color(0xffd98a), 2.0, { lamp: true });
    var fil = mesh(GEO.sph, filMat, 0.012, 0.016, 0.012, 0, 0.01, 0); fil.castShadow = false; bulbG.add(fil);
    var bulbGlow = halo(new T.Color(0xffd98a), 0.08, 0.0); bulbG.add(bulbGlow);

    // THE BOOK — spine vertical, the two halves open in a V toward the lens
    var book = new T.Group(); g.add(book);
    var coverM = new T.MeshPhysicalMaterial({ color: darker(acc, 0.55).lerp(hue, 0.3), roughness: 0.55, metalness: 0.05, clearcoat: 0.4, sheen: 0.6, sheenColor: lighter(acc, 0.4) });
    var paperM = new T.MeshPhysicalMaterial({ map: pageTex(), color: 0xf4f6fb, roughness: 0.85, emissive: new T.Color(0xdfe9ff), emissiveIntensity: 0.12 });
    var BW = 0.15, BH = 0.2;
    [-1, 1].forEach(function (s) {
      var half = new T.Group(); half.rotation.y = 0.36 * s * -1; book.add(half);
      var cov = mesh(GEO.box, coverM, BW + 0.008, BH + 0.012, 0.01, s * (BW / 2 + 0.002), 0, -0.012); half.add(cov);
      var blk = mesh(GEO.box, paperM, BW - 0.004, BH - 0.006, 0.016, s * BW / 2, 0, 0.001); half.add(blk);
    });
    book.add(mesh(GEO.cyl, coverM, 0.012, BH + 0.012, 0.012, 0, 0, -0.012));
    var pgGeo = new T.PlaneGeometry(BW - 0.006, BH - 0.01, 14, 2); pgGeo.translate((BW - 0.006) / 2, 0, 0);
    var pgBase = pgGeo.attributes.position.array.slice(0);
    var leaf = new T.Mesh(pgGeo, new T.MeshPhysicalMaterial({ map: pageTex(), color: 0xf8faff, roughness: 0.8, side: T.DoubleSide, emissive: new T.Color(0xdfe9ff), emissiveIntensity: 0.15 }));
    leaf.position.z = 0.011; leaf.castShadow = true; book.add(leaf);
    function turn(f) {
      // f 0..1: the leaf lifts from the right half, stands, lays on the left;
      // the free edge lags behind the spine, which is the curl
      var p = pgGeo.attributes.position, amt = Math.sin(f * Math.PI);
      for (var k = 0; k < p.count; k++) {
        var x = pgBase[k * 3], y = pgBase[k * 3 + 1], u = x / (BW - 0.006);
        p.setX(k, x * (1 - amt * 0.12 * u)); p.setY(k, y); p.setZ(k, amt * 0.05 * u * u);
      }
      p.needsUpdate = true; pgGeo.computeVertexNormals();
      leaf.rotation.y = -0.36 - f * (Math.PI - 0.72);
    }
    // THE MESSENGER BAG — at the left hip, its strap across the chest and
    // over the right shoulder. Pass 4's bag sat on the back plate and its
    // strap came out through the chest; now the bag hangs at the side and
    // the strap is laid on the body the whole way round.
    var satM = new T.MeshPhysicalMaterial({ color: 0x8a5a33, roughness: 0.62, clearcoat: 0.35, sheen: 0.4, sheenColor: 0xc99a6a });
    var bagHit = hug([b.body], V(-0.4, 0.24, 0.03), V(0, 0.24, 0), 0);
    var bag = new T.Group(); seat(bag, bagHit, 0.034); g.add(bag);
    bag.add(mesh(new T.CapsuleGeometry(0.03, 0.09, 6, 12).rotateZ(Math.PI / 2).scale(1.55, 1.9, 1), satM, 1, 1, 1));
    var flap = new T.Mesh(badgeGeo(rrect(0.15, 0.08, 0.025), 0.01, 0.004, 3), satM);
    flap.position.set(0, 0.028, 0.034); flap.rotation.x = 0.12; bag.add(flap);
    bag.add(mesh(GEO.box, metalMat(lighter(TK.gold, 0.1), 0.3), 0.026, 0.018, 0.008, 0, -0.002, 0.05));
    bag.updateMatrixWorld(true);
    var bagTopF = V(0, 0.05, 0.02).applyMatrix4(bag.matrix), bagTopB = V(0, 0.05, -0.02).applyMatrix4(bag.matrix);
    var bagStrap = strap([b.body], [bagTopF, V(-0.16, 0.36, 0.3), V(0.02, 0.46, 0.3), V(0.14, 0.58, 0.05), V(0.1, 0.5, -0.3), V(-0.1, 0.36, -0.3), bagTopB],
      V(0, 0.34, 0), { w: 0.03, t: 0.009, off: 0.002, n: 64, mat: satM });
    g.add(bagStrap);
    var SL = V(-0.2, 0.47, 0), SR = V(0.2, 0.47, 0), _hp = new T.Vector3();
    var armL = b.arm(-1, { r0: 0.047, r1: 0.032, L1: 0.19, L2: 0.19 });
    var armR = b.arm(1, { r0: 0.047, r1: 0.032, L1: 0.19, L2: 0.19 });
    var lastF = -1;
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      var bp = P.v('book', 0, 0.37, 0.33);
      book.position.copy(bp);
      book.rotation.set(P.s('bookX', working ? -0.95 : -0.55), 0, 0);
      book.updateMatrix();
      // the hands hold the outer edges of the covers, wherever the book is
      _hp.set(-BW * 0.94, -0.03, -0.02).applyMatrix4(book.matrix);
      armL.set(SL, _hp.clone(), V(-1, -0.4, -0.3), V(1, 0, 0.3));
      _hp.set(BW * 0.94, -0.03, -0.02).applyMatrix4(book.matrix);
      armR.set(SR, _hp.clone(), V(1, -0.4, -0.3), V(-1, 0, 0.3));
      var mixR = P.s('mixR', working ? 1 : 0);
      var c = (t * 0.42) % 1, fc = rm ? 0.5 : (c < 0.55 ? 0 : smooth01((c - 0.55) / 0.45));
      var f = 0.5 + (fc - 0.5) * mixR;
      if (Math.abs(f - lastF) > 0.002) { turn(f); lastF = f; }
      // the eye reads along the line, then snaps back to the next
      var read = working && !rm ? ((t * 0.9) % 1) : 0.5;
      b.face.add.dx = (read - 0.5) * 0.03 * mixR;
      b.face.add.dy = -0.012 * mixR;
      b.headPitch = P.s('pitch', working ? 0.2 : 0.02);
      var lit = P.s('lit', working ? 1 : 0), pulse = rm ? 0 : Math.max(0, Math.sin(t * 2.2)) * 0.6;
      filMat.emissiveIntensity = (0.5 + lit * (2.4 + pulse)) * TK.em;
      bulbGlass.emissiveIntensity = 0.15 + lit * 0.6;
      bulbGlow.material.opacity = lit * (0.3 + pulse * 0.2);
      return (working && !rm) || P.moving();
    };
    return b;
  };

  // a band swept over the crown from ear to ear, along the helmet's profile
  function earBand(H, r, off, mat) {
    var tube = taperTube(40, 10), P = new T.Vector3();
    for (var i = 0; i <= 40; i++) {
      var an = 0.12 + (Math.PI - 0.24) * i / 40, dx = Math.cos(an), dy = Math.sin(an);
      var t = 1 / Math.pow(Math.pow(Math.abs(dx / H.hx), H.n) + Math.pow(Math.abs(dy / H.hy), H.n), 1 / H.n);
      P.set(dx * t, dy * t, 0); tube.pts[i].copy(P).multiplyScalar(1 + off / P.length());
    }
    tube.build(function () { return r; });
    var m = new T.Mesh(tube.geo, mat); m.castShadow = true; return m;
  }
  function scanBarTex() {
    return tex('scanbar', function (x, w, h) {
      var g2 = x.createLinearGradient(0, 0, w, 0);
      g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g2; x.fillRect(0, 0, w, h);
      var g3 = x.createLinearGradient(0, 0, 0, h); x.globalCompositeOperation = 'destination-in';
      g3.addColorStop(0, 'rgba(0,0,0,0)'); g3.addColorStop(0.2, 'rgba(0,0,0,1)'); g3.addColorStop(0.8, 'rgba(0,0,0,1)'); g3.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g3; x.fillRect(0, 0, w, h);
    }, 32, 128);
  }
  function stripeTex(a, b) {
    return tex('stripe-' + a + b, function (x, w, h) {
      for (var i = 0; i < 12; i++) { x.fillStyle = i % 2 ? a : b; x.fillRect(i * w / 12, 0, w / 12 + 1, h); }
      x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, h * 0.86, w, h * 0.14);
    }, 256, 64);
  }

  // 6 · WATCHER — sits with its legs out, headphones on, a bucket of
  //     popcorn in its lap. Its face is a wide cinema screen. Working: a
  //     scanline plays across it, the eyes follow the action, and the light
  //     of whatever it is watching flickers over it.
  BUILD.watcher = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.0, baseR: 0.23, bellyR: 0.275, bellyY: 0.14, chestR: 0.25, chestY: 0.29, shR: 0.2, shY: 0.4, topR: 0.1, topY: 0.47 },
      head: { hx: 0.345, hy: 0.25, hz: 0.29, n: 2.9, y: 0.67 },
      screen: { w: 0.275, h: 0.12, y: -0.02, m: 4.6, rim: 0.08 },
      noFeet: true, earR: 0.105, earY: -0.005,
      face: {
        n: 2, gap: 0.1, ey: 0, round: 2.2,
        cheekCol: lighter(TK.hue.chest, 0.2).lerp(TK.hue.mg, 0.2),
        wait: { w: 0.052, h: 0.04, lid: 0, smile: 0.2, tilt: 0, cheek: 0.2 },
        work: { h: 0.052, smile: 0, cheek: 0.35 }
      },
      coreY: 0.27, markerY: 1.22, footR: 0.52
    });
    var g = b.group, acc = b.acc;
    // HEADPHONES: the band over the crown; the ear pods become the cups
    var bandM = new T.MeshPhysicalMaterial({ color: darker(acc, 0.5), roughness: 0.4, metalness: 0.3, clearcoat: 0.8 });
    var hb = earBand(b.H, 0.02, 0.022, bandM); hb.scale.z = 1.6; b.head.add(hb);
    b.ears.forEach(function (e) { e.scale.set(1.15, 1.6, 1.15); });
    // LEGS, out in front, boots up
    var legM = b.trimMat;
    [-1, 1].forEach(function (s) {
      var leg = taperTube(12, 12), c = new T.CatmullRomCurve3([V(0.11 * s, 0.1, 0.06), V(0.125 * s, 0.07, 0.24), V(0.135 * s, 0.07, 0.36)]);
      for (var i = 0; i <= 12; i++) c.getPoint(i / 12, leg.pts[i]);
      leg.build(function (u) { return 0.058 - u * 0.012; });
      var lm = new T.Mesh(leg.geo, legM); lm.castShadow = true; g.add(lm);
      var boot = mesh(GEO.sph, b.handMat, 0.07, 0.1, 0.06, 0.137 * s, 0.1, 0.39); boot.rotation.x = -0.25; g.add(boot);
    });
    // THE POPCORN
    var bucket = new T.Group(); bucket.scale.setScalar(1.55); g.add(bucket);
    var cupM = new T.MeshPhysicalMaterial({ map: stripeTex('#' + lighter(acc, 0.1).getHexString(), '#f4f1ea'), roughness: 0.5, clearcoat: 0.5, side: T.DoubleSide });
    var cup = new T.Mesh(new T.LatheGeometry([new T.Vector2(0.0004, 0), new T.Vector2(0.062, 0), new T.Vector2(0.086, 0.12), new T.Vector2(0.09, 0.126)], 32), cupM);
    cup.castShadow = true; bucket.add(cup);
    var cornM = new T.MeshPhysicalMaterial({ color: 0xfff1cf, roughness: 0.7, sheen: 0.6, sheenColor: new T.Color(0xffe2a0) });
    var kernels = [];
    for (var k = 0; k < 14; k++) {
      var an = k * 2.4, rr = 0.02 + (k % 5) * 0.012;
      var kern = mesh(GEO.sphLo, cornM, 0.026 + (k % 3) * 0.004, 0.022, 0.024, Math.cos(an) * rr, 0.125 + (k % 4) * 0.012 + (rr < 0.04 ? 0.018 : 0), Math.sin(an) * rr);
      kern.rotation.set(k, k * 0.7, 0); bucket.add(kern); kernels.push(kern);
    }
    // the scanline, laid on the screen
    var scanM = new T.MeshBasicMaterial({ map: scanBarTex(), color: lighter(acc, 0.55), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    var scan = new T.Mesh(GEO.plane, scanM); scan.renderOrder = 4; b.head.add(scan);
    // the light of the film, on its face
    var filmL = new T.PointLight(0xffffff, 0, 2.2, 2); filmL.position.set(0, 0.75, 0.9); g.add(filmL);
    var cA = lighter(acc, 0.3), cB = lighter(TK.hue.cy, 0.3), cT = new T.Color();

    var SL = V(-0.19, 0.37, 0), SR = V(0.19, 0.37, 0), _p = new T.Vector3(), _n = new T.Vector3();
    var armL = b.arm(-1, { r0: 0.046, r1: 0.032, L1: 0.18, L2: 0.17 });
    var armR = b.arm(1, { r0: 0.046, r1: 0.032, L1: 0.18, L2: 0.17 });
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      var bk = P.v('bk', 0, 0.16, 0.3);
      bucket.position.copy(bk);
      // the bucket is drawn at 1.55x, so its sides are where these are
      armL.set(SL, V(bk.x - 0.13, bk.y + 0.1, bk.z), V(-1, -0.5, -0.4), V(1, 0, 0));
      // working, the right hand dips into the bucket now and then
      var dip = 0;
      if (working && !rm) { var c = (t * 0.45) % 1; dip = c > 0.7 ? Math.sin((c - 0.7) / 0.3 * Math.PI) : 0; }
      armR.set(SR, V(bk.x + 0.13 - dip * 0.11, bk.y + 0.1 + dip * 0.14, bk.z - dip * 0.02), V(1, -0.5, -0.4), dip > 0.1 ? V(0, -1, 0) : V(-1, 0, 0));
      var on = P.s('on', working ? 1 : 0);
      var sx = rm ? 0.3 : Math.sin(t * 0.9);
      onHelmet(b.H, sx * 0.25, -0.02, 0.009, _p, _n);
      scan.position.copy(_p); scan.quaternion.setFromUnitVectors(ZV, _n);
      scan.scale.set(0.03, 0.2, 1);
      scanM.opacity = on * 0.8;
      // the eyes follow the action across the screen
      b.face.add.dx = working && !rm ? Math.sin(t * 1.3) * 0.022 + Math.sin(t * 3.1) * 0.006 : 0;
      var fl = rm ? 0.5 : (Math.sin(t * 7.3) * 0.5 + 0.5) * (Math.sin(t * 2.1) * 0.3 + 0.7);
      cT.copy(cA).lerp(cB, rm ? 0.5 : Math.sin(t * 0.7) * 0.5 + 0.5);
      filmL.color.copy(cT); filmL.intensity = on * (0.6 + fl * 1.2);
      b.headPitch = P.s('pitch', working ? -0.06 : 0.02);
      b.headRoll = P.s('roll', working ? 0 : 0.06);
      return (working && !rm) || P.moving();
    };
    return b;
  };

  // 7 · LIBRARIAN — the body is a card catalogue: six drawer fronts with
  //     brass pulls and label plates. Round spectacles, a stack of books on
  //     the hip. Working: it draws a drawer and an index card rises out of
  //     it. Waiting: the drawer stands open with nothing filed.
  BUILD.librarian = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.215, bellyR: 0.25, bellyY: 0.22, chestR: 0.25, chestY: 0.4, shR: 0.21, shY: 0.515, topR: 0.1, topY: 0.595 },
      squ: 3.8, depth: 0.84,
      head: { hx: 0.315, hy: 0.275, hz: 0.29, n: 2.6, y: 0.815 },
      screen: { w: 0.235, h: 0.155, y: -0.03, m: 3.4, rim: 0.09 },
      face: {
        n: 2, gap: 0.088, ey: 0.0, round: 2.0, brow: { w: 0.045, t: 0.013, x: 0 },
        cheekCol: lighter(TK.hue.chest, 0.2).lerp(TK.hue.mg, 0.2),
        wait: { w: 0.043, h: 0.05, lid: 0, smile: 0.22, tilt: 0, browY: 0.034, browA: -0.1, cheek: 0.25 },
        work: { smile: 0.1, browY: 0.03, browA: 0.02, cheek: 0.3 }
      },
      coreY: 0.475, markerY: 1.4, footR: 0.44
    });
    var g = b.group, acc = b.acc;
    var brass = metalMat(lighter(TK.gold, 0.1), 0.3);
    // SPECTACLES — gold rims around the eyes, a bridge, riding the screen
    var specs = [];
    [-1, 1].forEach(function (s) {
      var rim = new T.Mesh(new T.TorusGeometry(0.058, 0.0065, 8, 40), brass);
      rim.castShadow = false; b.head.add(rim); specs.push({ s: s, m: rim });
    });
    var bridge = new T.Mesh(new T.TorusGeometry(0.03, 0.005, 6, 16, Math.PI), brass); b.head.add(bridge);
    var _p = new T.Vector3(), _n = new T.Vector3();
    function seatSpecs() {
      var ey = -0.03 + b.face.cur.dy;
      specs.forEach(function (o) {
        onHelmet(b.H, o.s * 0.088 + b.face.add.dx, ey, 0.022, _p, _n);
        o.m.position.copy(_p); o.m.quaternion.setFromUnitVectors(ZV, _n);
      });
      onHelmet(b.H, b.face.add.dx, ey + 0.012, 0.024, _p, _n);
      bridge.position.copy(_p); bridge.quaternion.setFromUnitVectors(ZV, _n);
    }
    // THE CATALOGUE — six drawer fronts seated on the body
    var frontM = new T.MeshPhysicalMaterial({ color: darker(acc, 0.62).lerp(new T.Color(0x8a5a33), 0.45), roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: lighter(acc, 0.3) });
    var frontGeo = badgeGeo(rrect(0.118, 0.074, 0.016), 0.01, 0.004, 0.26);
    var cardM = new T.MeshPhysicalMaterial({ color: 0xf6f2e8, roughness: 0.8 });
    function drawerFront(parent) {
      var d = new T.Group(); parent.add(d);
      d.add(new T.Mesh(frontGeo, frontM));
      var plate = mesh(GEO.box, brass, 0.046, 0.026, 0.004, 0, 0.013, 0.016); d.add(plate);
      d.add(mesh(GEO.box, cardM, 0.038, 0.018, 0.002, 0, 0.013, 0.0185));
      var pull = new T.Mesh(new T.TorusGeometry(0.014, 0.004, 8, 20, Math.PI), brass); pull.rotation.z = Math.PI; pull.position.set(0, -0.016, 0.017); d.add(pull);
      d.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
      return d;
    }
    var slots = [];
    [0.2, 0.29, 0.38].forEach(function (y) {
      [-1, 1].forEach(function (s) {
        var hit = onBody(b.body, s * 0.068, y);
        var slot = new T.Group(); seat(slot, hit, 0.004); g.add(slot);
        slots.push({ slot: slot, hit: hit, x: s, y: y });
      });
    });
    var OPEN = 3;                                  // the middle right drawer
    slots.forEach(function (o, i) { if (i !== OPEN) drawerFront(o.slot); });
    var open = slots[OPEN].slot;
    var tray = new T.Group(); open.add(tray);
    drawerFront(tray);
    var box = new T.Group(); tray.add(box);
    var sideM = frontM;
    box.add(mesh(GEO.box, sideM, 0.1, 0.004, 0.12, 0, -0.03, -0.06));
    [-1, 1].forEach(function (s) { box.add(mesh(GEO.box, sideM, 0.004, 0.058, 0.12, s * 0.05, -0.002, -0.06)); });
    // the dark behind the drawer, so an open drawer shows a hole
    var holeM = new T.MeshBasicMaterial({ color: 0x06090f });
    var hole = mesh(GEO.box, holeM, 0.1, 0.06, 0.002, 0, 0, 0.0); hole.castShadow = false; open.add(hole);
    var card = mesh(GEO.box, cardM, 0.08, 0.06, 0.003, 0, 0, -0.05); tray.add(card);
    card.add(mesh(GEO.box, new T.MeshBasicMaterial({ color: 0xb85c4a }), 0.05, 0.004, 0.0005, 0, 0.016, 0.002));
    [0.004, -0.006, -0.014].forEach(function (y) { card.add(mesh(GEO.box, new T.MeshBasicMaterial({ color: 0x9aa6b8 }), 0.044, 0.002, 0.0005, 0, y, 0.002)); });
    // BOOKS under the arm — three volumes standing against the hip, spines
    // forward, the mitten cupped under them. Pass 4's lay at an angle and
    // the bottom one read as a plank, with the hand below it holding nothing.
    var books = new T.Group(); g.add(books);
    var bookCols = [TK.hue.shoulders, TK.hue.chest, TK.hue.quads];
    var bw = [0.036, 0.03, 0.04], bh = [0.2, 0.18, 0.21], bd = [0.15, 0.14, 0.16], bx = 0;
    var bandM = metalMat(lighter(TK.gold, 0.1), 0.35);
    bookCols.forEach(function (col, i) {
      var cm = new T.MeshPhysicalMaterial({ color: darker(col, 0.72), roughness: 0.55, clearcoat: 0.45, sheen: 0.5, sheenColor: lighter(col, 0.4) });
      var bk = new T.Group(); bk.position.set(-bx - bw[i] / 2, bh[i] / 2, 0); books.add(bk);
      bk.add(mesh(GEO.box, cm, bw[i], bh[i], bd[i]));
      bk.add(mesh(GEO.box, cardM, bw[i] - 0.008, bh[i] - 0.012, bd[i] - 0.006, 0, 0, -0.004));
      [0.05, -0.06].forEach(function (y) { bk.add(mesh(GEO.box, bandM, bw[i] + 0.002, 0.008, 0.004, 0, y * bh[i] / 0.2, bd[i] / 2 + 0.001)); });
      bx += bw[i] + 0.003;
    });
    books.position.set(-0.262, 0.14, 0.04); books.rotation.set(0, 0.06, 0.05);


    var SL = V(-0.21, 0.485, 0), SR = V(0.21, 0.485, 0), _h = new T.Vector3();
    var armL = b.arm(-1, { r0: 0.048, r1: 0.033, L1: 0.2, L2: 0.19 });
    var armR = b.arm(1, { r0: 0.048, r1: 0.033, L1: 0.2, L2: 0.19 });
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      // the left arm cradles the books against the hip
      armL.set(SL, V(-0.33, 0.125, 0.0), V(-0.4, 0.2, -1), V(0.5, 1, 0.1));
      var mixL = P.s('mixL', working ? 1 : 0);
      var c = (t * 0.5) % 1;
      var dc = rm ? 0.08 : (c < 0.3 ? smooth01(c / 0.3) : c < 0.75 ? 1 : 1 - smooth01((c - 0.75) / 0.25)) * 0.09;
      var lift = (rm ? 0.5 : (c < 0.3 ? 0 : c < 0.75 ? Math.sin((c - 0.3) / 0.45 * Math.PI) : 0)) * mixL;
      var d = 0.07 + (dc - 0.07) * mixL;
      tray.position.z = d;
      card.visible = mixL > 0.02;
      card.position.set(0, 0.012 + lift * 0.07, -0.05 + lift * 0.02);
      // the right hand works the pull, or rests
      tray.updateMatrixWorld(true); g.updateMatrixWorld(true);
      _h.set(0, -0.012, 0.03); tray.localToWorld(_h); g.worldToLocal(_h);
      var rH = working ? P.v('rH', _h.x + 0.01, _h.y - 0.01, _h.z + 0.02) : P.v('rH', 0.29, 0.2, 0.07);
      armR.set(SR, rH, working ? V(1, -0.3, -0.5) : V(0.3, 0, -1), working ? V(0, 0, -1) : V(-1, 0, 0.1));
      b.face.add.dy = working ? -0.012 : 0;
      b.face.add.dx = working ? 0.008 : 0;
      b.headPitch = P.s('pitch', working ? 0.16 : 0.02);
      b.headYaw = P.s('yaw', working ? 0.14 : 0);
      seatSpecs();
      return (working && !rm) || P.moving();
    };
    return b;
  };

  // 8 · MEAL PREP — a chef's toque, an apron over a pot belly, a little pot
  //     held out in front. Waiting: a warm smile, the pot off the heat.
  //     Working: it stirs, steam curls off the pot, the eyes go to ^ ^.
  BUILD.mealprep = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.215, bellyR: 0.29, bellyY: 0.2, chestR: 0.26, chestY: 0.36, shR: 0.2, shY: 0.48, topR: 0.1, topY: 0.565 },
      head: { hx: 0.315, hy: 0.265, hz: 0.29, n: 2.5, y: 0.78 },
      screen: { w: 0.23, h: 0.145, y: -0.035, m: 3.2, rim: 0.09 },
      face: {
        n: 2, gap: 0.088, ey: -0.004, round: 2.1,
        cheekCol: lighter(TK.hue.chest, 0.15).lerp(TK.hue.mg, 0.15), col: lighter(TK.hue.shoulders, 0.62),
        wait: { w: 0.048, h: 0.052, lid: 0, smile: 0.3, tilt: 0.04, cheek: 0.4 },
        work: { h: 0.052, smile: 0.78, cheek: 0.7 }
      },
      coreY: 0.3, markerY: 1.5, footR: 0.46, feet: { x: 0.13, sx: 0.09, sz: 0.12 }
    });
    var g = b.group, acc = b.acc;
    var clothM = new T.MeshPhysicalMaterial({ color: 0xf7f4ee, roughness: 0.82, sheen: 1, sheenColor: new T.Color(0xffffff), sheenRoughness: 0.5 });
    // THE TOQUE — a band and a puffed crown
    var toque = new T.Group(); toque.position.set(0, b.H.hy * 0.8, -0.01); toque.rotation.x = -0.1; b.head.add(toque);
    var tb = new T.Mesh(new T.CylinderGeometry(0.2, 0.215, 0.12, 40, 1, true), clothM); tb.position.y = 0.05; tb.castShadow = true; toque.add(tb);
    var puffs = [[0, 0.17, 0, 0.14], [0.1, 0.15, 0.05, 0.1], [-0.1, 0.15, 0.05, 0.1], [0.09, 0.15, -0.07, 0.1], [-0.09, 0.15, -0.07, 0.1], [0, 0.14, 0.11, 0.1], [0, 0.14, -0.11, 0.1]];
    puffs.forEach(function (p) { var m = mesh(GEO.sph, clothM, p[3], p[3] * 0.85, p[3], p[0], p[1], p[2]); toque.add(m); });
    // THE NECKERCHIEF — a coral scarf round the collar, knotted in front
    var scarfM = new T.MeshPhysicalMaterial({ color: lighter(TK.hue.chest, 0.02), roughness: 0.75, sheen: 1, sheenColor: lighter(TK.hue.chest, 0.45), sheenRoughness: 0.4 });
    // pass 4's ring sat inside the collar and only its knot showed, like a
    // beak; this one rests on the shoulders, rolled, and ties in front
    var scarf = new T.Mesh(new T.TorusGeometry(0.132, 0.03, 12, 56), scarfM); scarf.position.y = 0.548; scarf.rotation.x = Math.PI / 2 + 0.14;
    scarf.scale.set(1, 1, 0.8); scarf.castShadow = true; g.add(scarf);
    var kHit = onBody(b.body, 0, 0.5);
    var knot = new T.Group(); seat(knot, kHit, 0.028); g.add(knot);
    // a bandana: the point hangs down the chest, lying on it
    var tri = new T.Shape(); tri.moveTo(-0.075, 0.012); tri.quadraticCurveTo(0, 0.03, 0.075, 0.012); tri.quadraticCurveTo(0.03, -0.05, 0, -0.1); tri.quadraticCurveTo(-0.03, -0.05, -0.075, 0.012);
    var flapB = new T.Mesh(badgeGeo(tri, 0.008, 0.005, 0.22), scarfM); flapB.position.set(0, -0.008, -0.012); flapB.rotation.x = -0.18; flapB.castShadow = true; knot.add(flapB);
    knot.add(mesh(GEO.sph, scarfM, 0.03, 0.026, 0.024, 0, 0.004, 0.006));
    // THE POT
    var pot = new T.Group(); g.add(pot);
    var enamel = new T.MeshPhysicalMaterial({ color: lighter(TK.hue.chest, 0.05), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, side: T.DoubleSide });
    var potBody = new T.Mesh(new T.LatheGeometry([[0.0004, 0], [0.08, 0], [0.098, 0.015], [0.102, 0.08], [0.108, 0.09]].map(function (p) { return new T.Vector2(p[0], p[1]); }), 36), enamel);
    potBody.castShadow = true; pot.add(potBody);
    var rimP = mesh(GEO.tor, metalMat(0xdfe4ee, 0.25), 0.106, 0.106, 0.06, 0, 0.09, 0); rimP.rotation.x = Math.PI / 2; pot.add(rimP);
    [-1, 1].forEach(function (s) {
      var h = mesh(GEO.tor, metalMat(0xdfe4ee, 0.25), 0.028, 0.028, 0.04, s * 0.118, 0.07, 0); h.rotation.x = Math.PI / 2; pot.add(h);
    });
    var soupM = new T.MeshPhysicalMaterial({ color: lighter(acc, 0.1).lerp(TK.gold, 0.4), roughness: 0.2, emissive: lighter(acc, 0.2), emissiveIntensity: 0.25 });
    var soup = mesh(new T.CircleGeometry(1, 32), soupM, 0.096, 0.096, 1, 0, 0.072, 0); soup.rotation.x = -Math.PI / 2; soup.castShadow = false; pot.add(soup);
    var ladle = new T.Group(); pot.add(ladle);
    var steel = metalMat(0xd5dbe6, 0.22);
    var stick = mesh(GEO.cyl, steel, 0.008, 0.2, 0.008, 0, 0.1, 0); ladle.add(stick);
    ladle.add(mesh(GEO.sph, steel, 0.026, 0.016, 0.026, 0, 0, 0));
    // the heat under it, and the steam off it — soft white, not additive, so it reads
    var heatL = new T.PointLight(TK.gold.getHex(), 0, 1.4, 2); heatL.position.set(0, -0.04, 0); pot.add(heatL);
    var steamM = [], steam = [];
    for (var i = 0; i < 7; i++) {
      var sm = new T.SpriteMaterial({ map: blushTex(), color: 0xfff6ea, transparent: true, opacity: 0, depthWrite: false });
      var sp = new T.Sprite(sm); pot.add(sp); steam.push(sp); steamM.push(sm);
    }
    var SL = V(-0.2, 0.46, 0), SR = V(0.2, 0.46, 0), _t = new T.Vector3();
    var armL = b.arm(-1, { r0: 0.048, r1: 0.033, L1: 0.19, L2: 0.18 });
    var armR = b.arm(1, { r0: 0.048, r1: 0.033, L1: 0.19, L2: 0.18 });
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      var pp = P.v('pot', 0, 0.26, 0.36);
      pot.position.copy(pp);
      armL.set(SL, V(pp.x - 0.13, pp.y + 0.075, pp.z), V(-1, -0.4, -0.3), V(1, 0, 0));
      // the ladle circles the pot when it stirs; rests against the rim when not
      // one blend drives the ladle AND the hand, so the hand never lets go
      var mixM = P.s('mixM', working ? 1 : 0);
      var th = rm ? 0.8 : t * 2.3;
      var bx = Math.cos(0.9) * 0.06 + (Math.cos(th) * 0.045 - Math.cos(0.9) * 0.06) * mixM;
      var bz = Math.sin(0.9) * 0.06 + (Math.sin(th) * 0.045 - Math.sin(0.9) * 0.06) * mixM;
      ladle.position.set(bx, 0.03, bz);
      var lean = 0.5 - 0.15 * mixM;
      ladle.rotation.set(0, 0, -lean);
      _t.set(bx + Math.sin(lean) * 0.19, 0.03 + Math.cos(lean) * 0.19, bz).add(pp);
      var rest = V(pp.x + 0.13, pp.y + 0.075, pp.z);
      var rH = rest.clone().lerp(_t, mixM);
      armR.set(SR, rH, V(1, -0.5, -0.3), V(-1, 0, 0).lerp(V(-0.5, 0, 0.5), mixM));
      var on = P.s('on', working ? 1 : 0);
      heatL.intensity = on * (0.8 + (rm ? 0 : Math.sin(t * 3.1) * 0.2));
      soupM.emissiveIntensity = 0.2 + on * 0.35;
      steam.forEach(function (s, i) {
        var f = rm ? (0.2 + i * 0.1) : (((t * 0.35) + i / 7) % 1);
        s.position.set(Math.sin(f * 5 + i * 1.7) * 0.04 * (0.4 + f), 0.1 + f * 0.42, Math.cos(f * 4 + i) * 0.03);
        s.scale.setScalar(0.11 + f * 0.3);
        steamM[i].opacity = on * 0.75 * Math.pow(1 - f, 1.5) * Math.min(1, f / 0.15);
      });
      b.face.add.dy = working ? -0.006 : 0;
      b.headPitch = P.s('pitch', working ? 0.14 : 0.02);
      b.headRoll = P.s('roll', working ? Math.sin(t * 1.2) * 0.05 : 0);
      return (working && !rm) || P.moving();
    };
    return b;
  };

  function glyphTex(ch, col) {
    return tex('glyph-' + ch + col, function (x, w, h) {
      x.clearRect(0, 0, w, h);
      x.fillStyle = col; x.font = 'italic 400 104px "Instrument Serif", Georgia, serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, w / 2, h / 2 + 6);
    }, 128, 128);
  }

  // 9 · LEADER — a mirror for a face, with soft eyes lit through it; the
  //     head tilted toward one glowing ear, listening; the question it is
  //     holding, cupped in both hands. Working: it nods as it listens and
  //     a ripple goes out from the question as it takes the answer in.
  BUILD.leader = function (a) {
    var b = makeBot(a, {
      body: { y0: 0.07, baseR: 0.205, bellyR: 0.24, bellyY: 0.22, chestR: 0.24, chestY: 0.39, shR: 0.2, shY: 0.51, topR: 0.1, topY: 0.59 },
      head: { hx: 0.32, hy: 0.28, hz: 0.295, n: 2.4, y: 0.815 },
      screen: { w: 0.24, h: 0.16, y: -0.025, m: 3.0, rim: 0.09 },
      mirror: true, irid: 0.3,
      face: {
        n: 2, gap: 0.09, ey: 0.0, round: 2.0, brow: { w: 0.046, t: 0.013, x: 0.002 },
        cheekCol: lighter(TK.hue.mg, 0.25),
        wait: { w: 0.047, h: 0.058, lid: 0, smile: 0.2, tilt: -0.03, browY: 0.03, browA: -0.14, cheek: 0.35 },
        work: { smile: 0.5, browY: 0.036, browA: -0.08, cheek: 0.5 }
      },
      coreY: 0.47, markerY: 1.44, footR: 0.44
    });
    var g = b.group, acc = b.acc;
    // the listening ear: brighter, a little larger, the side it tilts to
    var ear = b.ears[1]; ear.scale.setScalar(1.18);
    var earRing = ear.children[1].material;
    // THE QUESTION — a glass orb with a lit heart and a "?" in it
    var orb = new T.Group(); g.add(orb);
    var orbGlass = new T.MeshPhysicalMaterial({ color: acc.clone(), roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.45, emissive: acc.clone(), emissiveIntensity: 0.35 });
    orbGlass.userData.baseOp = 0.45;
    orbGlass.depthWrite = false;
    var shell = mesh(GEO.sph, orbGlass, 0.105, 0.105, 0.105); shell.castShadow = false; shell.renderOrder = 6; orb.add(shell);
    var heartMat = emissiveMat(acc.clone(), 2.0, { lamp: true });
    var heart = mesh(GEO.sph, heartMat, 0.034, 0.034, 0.034); heart.castShadow = false; orb.add(heart);
    var q = new T.Sprite(new T.SpriteMaterial({ map: glyphTex('?', '#ffffff'), color: 0xffffff, transparent: true, depthWrite: false }));
    q.scale.setScalar(0.15); q.position.z = 0.062; q.renderOrder = 7; orb.add(q);
    var orbGlow = halo(acc, 0.1, 0.35); orb.add(orbGlow);
    var rippleM = new T.SpriteMaterial({ map: tex('ripple', function (x, w, h) {
      x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 6, 0, 7); x.stroke();
    }, 128, 128), color: lighter(acc, 0.5), transparent: true, opacity: 0, depthWrite: false });
    var ripple = new T.Sprite(rippleM); orb.add(ripple);
    var orbL = new T.PointLight(lighter(acc, 0.3).getHex(), 0.5, 1.4, 2); orb.add(orbL);

    var SL = V(-0.2, 0.48, 0), SR = V(0.2, 0.48, 0);
    var armL = b.arm(-1, { r0: 0.047, r1: 0.032, L1: 0.19, L2: 0.19 });
    var armR = b.arm(1, { r0: 0.047, r1: 0.032, L1: 0.19, L2: 0.19 });
    b.tell = function (t, working, rm) {
      var P = b.pose; P.frame(t);
      var op = P.v('orb', 0, 0.4, 0.34);
      // it rests in the hands, lifting a breath above them; pass 4 floated
      // it a hand's height up, and the hands held nothing
      orb.position.copy(op); orb.position.y += 0.03 + (rm ? 0 : Math.sin(t * 1.4) * 0.006);
      var oy = op.y + 0.03;
      armL.set(SL, V(op.x - 0.075, oy - 0.11, op.z - 0.03), V(-1, -0.6, -0.3), V(0.35, 1, 0.1));
      armR.set(SR, V(op.x + 0.075, oy - 0.11, op.z - 0.03), V(1, -0.6, -0.3), V(-0.35, 1, 0.1));
      var on = P.s('on', working ? 1 : 0);
      var pulse = rm ? 0 : Math.sin(t * 1.6) * 0.5 + 0.5;
      heartMat.emissiveIntensity = (1.2 + on * (1.6 + pulse)) * TK.em;
      orbL.intensity = 0.3 + on * 0.9;
      var rp = rm ? 0.5 : (t * 0.5) % 1;
      ripple.scale.setScalar(0.16 + rp * 0.34);
      rippleM.opacity = on * 0.5 * (1 - rp);
      earRing.emissiveIntensity = (1.4 + on * (1.2 + pulse)) * TK.em;
      // the listening tilt, and a slow nod while it takes the answer in
      b.headRoll = P.s('roll', -0.13);
      b.headYaw = P.s('yaw', -0.06);
      b.headPitch = P.s('pitch', working ? 0.04 + (rm ? 0 : Math.max(0, Math.sin(t * 1.9)) * 0.1) : 0.03);
      return !rm || P.moving();
    };
    return b;
  };


  return {
    AGENTS: AGENTS, BUILD: BUILD, face3: face3, EMISSIVES: EMISSIVES,
    darker: darker, lighter: lighter, hueOf: hueOf, accOf: accOf, clamp: clamp,
    emissiveMat: emissiveMat, addBlend: addBlend, glowTex: glowTex, halo: halo,
    contactShadow: contactShadow, GEO: GEO, mesh: mesh, numeralPlate: numeralPlate, tex: tex,
    setSnap: function (v) { SNAP = !!v; }
  };
}
