// THE WALKS (AGENT-WORLD-PLAN §9e): the geometry of a being moving over the
// Org Map, and nothing else. A walk is a polyline on the ground walked at a
// speed. Between lane nodes the polyline comes only from the habitat's
// lanes.route, so a being never crosses a tile or the plinth; the short
// steps on a tile (bench to rack, lane to a host's side) go round the set
// pieces, measured against a cloud of the pieces' own vertices.
//
// Pure: THREE is handed in (as habitat.js and beings.js take it), no
// network, no model, no clock. The scene owns the timing and the rig.

// a polyline on the ground (y = 0), consecutive duplicates dropped
export function makeWalk(T, pts, speed) {
  const P = [];
  pts.forEach((p) => {
    const v = new T.Vector3(p.x, 0, p.z);
    if (!P.length || Math.hypot(v.x - P[P.length - 1].x, v.z - P[P.length - 1].z) > 1e-4) P.push(v);
  });
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  return { pts: P, cum, len: cum[cum.length - 1], s: 0, speed, _a: new T.Vector3(), _b: new T.Vector3() };
}

// the point `s` along the walk
export function walkPoint(w, s, out) {
  if (w.pts.length === 1) return out.copy(w.pts[0]);
  s = Math.max(0, Math.min(w.len, s));
  let i = 1;
  while (i < w.cum.length - 1 && w.cum[i] < s) i++;
  const seg = w.cum[i] - w.cum[i - 1] || 1;
  return out.copy(w.pts[i - 1]).lerp(w.pts[i], (s - w.cum[i - 1]) / seg);
}

// which way the walk heads at `s`, looking a little ahead so an arc is
// followed smoothly (yaw = atan2(dx, dz): 0 faces +z, the rig's front)
export function walkHeading(w, s, ahead) {
  const a = walkPoint(w, s, w._a);
  let b = walkPoint(w, Math.min(w.len, s + (ahead || 0.08)), w._b);
  if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-5) {
    const n = w.pts.length;
    if (n < 2) return null;
    b = w.pts[n - 1]; const p = w.pts[n - 2];
    return Math.atan2(b.x - p.x, b.z - p.z);
  }
  return Math.atan2(b.x - a.x, b.z - a.z);
}

// what a being must not walk through: the set pieces' vertices above the
// ankle, flattened to the ground, in `root`'s frame (the world group)
export function obstacleCloud(T, objects, root, per) {
  const out = [], v = new T.Vector3(), inv = new T.Matrix4().copy(root.matrixWorld).invert();
  objects.forEach((obj) => {
    const meshes = [];
    obj.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position && !o.userData.contact && o.visible !== false) meshes.push(o); });
    let total = 0;
    meshes.forEach((o) => { total += o.geometry.attributes.position.count; });
    meshes.forEach((o) => {
      const pa = o.geometry.attributes.position;
      const share = Math.max(3, Math.round((per || 160) * pa.count / Math.max(1, total)));
      const st = Math.max(1, Math.floor(pa.count / share));
      for (let i = 0; i < pa.count; i += st) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        if (v.y > 0.04 && v.y < 1.3) out.push({ x: v.x, z: v.z });
      }
    });
  });
  return out;
}

// the closest the segment a-b comes to the cloud, leaving out the points
// within `skip` of either end (a seat is meant to be walked up to)
export function clearance(a, b, cloud, skip) {
  const ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az || 1e-9;
  let best = Infinity;
  for (let i = 0; i < cloud.length; i++) {
    const p = cloud[i];
    if (Math.hypot(p.x - a.x, p.z - a.z) < skip || Math.hypot(p.x - b.x, p.z - b.z) < skip) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * ax + (p.z - a.z) * az) / l2));
    const d = Math.hypot(p.x - (a.x + ax * t), p.z - (a.z + az * t));
    if (d < best) best = d;
  }
  return best;
}

// a short step on a tile: straight if that is clear of the pieces, else by
// the nearest of `vias` (the tiles' home nodes, which are clear by the
// habitat's contract) that clears both legs; else straight anyway, and the
// caller may say so. Returns the points after `from`.
export function stepPoints(from, to, cloud, vias, r, skip) {
  if (clearance(from, to, cloud, skip) >= r) return { pts: [to], clear: true };
  const ranked = vias
    .map((v) => ({ v, len: Math.hypot(v.x - from.x, v.z - from.z) + Math.hypot(to.x - v.x, to.z - v.z) }))
    .sort((p, q) => p.len - q.len);
  for (const { v } of ranked) {
    if (clearance(from, v, cloud, skip) >= r && clearance(v, to, cloud, skip) >= r) return { pts: [v, to], clear: true };
  }
  return { pts: [to], clear: false };
}
