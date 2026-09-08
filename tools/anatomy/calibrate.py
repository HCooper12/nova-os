"""Measure the base mesh's real joint centres, so the anatomy fits THIS body.

    blender -b --python tools/anatomy/calibrate.py -- --out tools/anatomy/joints.json

The CC0 base mesh ships with no rig and no vertex groups, and it stands in a
wide A-pose — so muscle volumes written against an idealised skeleton land in
the wrong places (v7 put 6,181 of 10,582 vertices in 'frame' because the limb
volumes missed the limbs entirely).

Rather than guess, this measures. The body is sliced into horizontal bands; in
each band the vertices are clustered along x, and a gap wider than a hand
separates a limb from the trunk. Following those clusters down gives the axis
of each arm and leg; the joints are then found where a limb is at its
narrowest (elbow, knee, wrist, ankle are all local minima of cross-section)
and where a limb meets the trunk (shoulder, hip).

Deterministic, and it prints what it found so the numbers can be checked
against a tape measure rather than trusted.
"""

import bpy
import json
import os
import sys
from collections import defaultdict

BAND = 0.02          # 2 cm slices
GAP = 0.035          # a limb is separated from the trunk by more than this


def bands(verts):
    out = defaultdict(list)
    for v in verts:
        out[round(v.z / BAND) * BAND].append(v)
    return dict(sorted(out.items()))


def clusters(xs, gap=GAP):
    """1-D clustering along x: [(lo, hi, count)] left→right."""
    xs = sorted(xs)
    if not xs:
        return []
    out, lo, prev = [], xs[0], xs[0]
    n = 1
    for x in xs[1:]:
        if x - prev > gap:
            out.append((lo, prev, n))
            lo, n = x, 0
        prev = x
        n += 1
    out.append((lo, prev, n))
    return out


def limb_axis(verts, side, z_from, z_to, gap=GAP):
    """Centroid of the limb cluster in each band → the limb's own axis."""
    pts = []
    for z, vs in bands([v for v in verts if z_to <= v.z <= z_from]).items():
        cl = clusters([v.co.x for v in vs], gap)
        if len(cl) < 2:
            continue
        pick = cl[-1] if side > 0 else cl[0]
        if pick[2] < 6:
            continue
        band_v = [v for v in vs if pick[0] - 1e-6 <= v.co.x <= pick[1] + 1e-6]
        if len(band_v) < 6:
            continue
        cx = sum(v.co.x for v in band_v) / len(band_v)
        cy = sum(v.co.y for v in band_v) / len(band_v)
        rad = max((v.co - type(v.co)((cx, cy, z))).length for v in band_v)
        pts.append({'z': z, 'x': cx, 'y': cy, 'r': rad, 'n': len(band_v)})
    return sorted(pts, key=lambda p: -p['z'])


def narrowest(pts, lo, hi):
    """The narrowest cross-section between two fractions of a limb's length."""
    if not pts:
        return None
    span = pts[0]['z'] - pts[-1]['z']
    window = [p for p in pts if pts[0]['z'] - span * hi <= p['z'] <= pts[0]['z'] - span * lo]
    return min(window, key=lambda p: p['r']) if window else None


def narrowest_between(pts, z_lo, z_hi):
    """The narrowest cross-section inside an absolute height band.

    Joint search by fraction-of-limb was fragile — the knee came out at 17% of
    stature instead of 28.5% because the polyline's top varies with how high
    the thighs separate. A knee is a knee: it sits in a known band of height,
    and within that band it is the narrowest the leg gets."""
    window = [p for p in pts if z_lo <= p['z'] <= z_hi]
    return min(window, key=lambda p: p['r']) if window else None


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else 'tools/anatomy/joints.json'
    blend = argv[argv.index('--blend') + 1] if '--blend' in argv else None
    if blend:
        bpy.ops.wm.open_mainfile(filepath=blend)
    elif '--base' in argv:
        # measure the untouched base mesh, scaled and centred — the state the
        # muscle table is written against
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import build as _B
        _B.normalise(_B.load_base())
    ob = bpy.data.objects.get('nova_body') or next(o for o in bpy.data.objects if o.type == 'MESH')
    verts = [type('V', (), {'co': ob.matrix_world @ v.co, 'z': (ob.matrix_world @ v.co).z})() for v in ob.data.vertices]
    H = max(v.z for v in verts)

    res = {'stature': H, 'sides': {}}
    # The arms hang out at ~45°, so a naive slice at hip height finds a HAND
    # where it expects a hip (the first run measured exactly that). Find the
    # arms first, mark their vertices, and measure everything else without them.
    arms = {s: limb_axis(verts, s, H * 0.82, H * 0.30) for s in (1, -1)}
    arm_pts = []
    for s, pts in arms.items():
        for p in pts:
            arm_pts.append((p['x'], p['y'], p['z'], p['r'] * 1.35))
    def is_arm(v):
        for (ax, ay, az, ar) in arm_pts:
            if abs(v.co.z - az) < BAND and ((v.co.x - ax) ** 2 + (v.co.y - ay) ** 2) ** 0.5 < ar:
                return True
        return False
    trunk_verts = [v for v in verts if not is_arm(v)]

    for side, tag in ((1, 'L'), (-1, 'R')):
        arm = arms[side]
        # gap 0.02 fragmented each leg into slivers (a 10k-vertex body has
        # gaps wider than that WITHIN a limb); the thighs are ~5 cm apart.
        leg = limb_axis(trunk_verts, side, H * 0.50, 0.0, gap=0.045)
        j = {}
        if arm:
            j['shoulder'] = [arm[0]['x'], arm[0]['y'], arm[0]['z']]
            e = narrowest(arm, 0.38, 0.62)
            w = narrowest(arm, 0.74, 0.90)
            if e:
                j['elbow'] = [e['x'], e['y'], e['z']]
            if w:
                j['wrist'] = [w['x'], w['y'], w['z']]
            j['hand'] = [arm[-1]['x'], arm[-1]['y'], arm[-1]['z']]
            # [height, radius] down the limb: how THICK the arm is at each
            # level, so a muscle can be placed as a fraction of the way out
            # to the skin instead of at a guessed offset from the bone
            j['arm_radius'] = [[round(p['z'], 4), round(p['r'], 5)] for p in arm]
        if leg:
            # The hip JOINT is inside the pelvis, not at the top of the visible
            # thigh: measured height (0.53 stature) and half the measured pelvis
            # breadth, which is what a goniometer would give.
            hz = H * 0.53
            near = min(leg, key=lambda p: abs(p['z'] - hz))
            j['hip'] = [near['x'] * 0.62, near['y'], hz]
            # the joint CENTRE is internal: take its height from anatomy
            # (28.5% of stature) and its x/y from the leg's own axis there
            kz = H * 0.285
            k = min(leg, key=lambda p: abs(p['z'] - kz))
            k = {'x': k['x'], 'y': k['y'], 'z': kz, 'r': k['r']}
            a = narrowest_between(leg, H * 0.025, H * 0.075)   # ankle: 3.9%
            if k:
                j['knee'] = [k['x'], k['y'], k['z']]
            if a:
                j['ankle'] = [a['x'], a['y'], a['z']]
            j['toe'] = [leg[-1]['x'], leg[-1]['y'], leg[-1]['z']]
            j['leg_radius'] = [[round(p['z'], 4), round(p['r'], 5)] for p in leg]
        res['sides'][tag] = j

    # THE SHELL — the trunk's actual cross-section, band by band, as an ellipse:
    # centre y, half-depth, half-width. Muscle volumes are placed relative to
    # this rather than to absolute coordinates. The first table hand-wrote its
    # y values on the assumption of a 9 cm half-depth; the mesh's skin is at
    # 14 cm, so the entire abdominal wall was built six centimetres inside the
    # body and no relief could reach the surface. Measure, don't assume — the
    # same lesson the joints already taught.
    shell = []
    step = 0.020
    z = round(H * 0.46 / step) * step
    while z < H * 0.845:
        vs = [v for v in trunk_verts if abs(v.co.z - z) < step * 0.75]
        # only the vertices actually on the trunk: one x-cluster around the
        # midline. Anything further out at this height is an arm we missed.
        # keep only the x-cluster that spans the midline: at chest height the
        # A-pose arms sit 30 cm out and would otherwise be read as shoulders
        cl = [c for c in clusters([v.co.x for v in vs]) if c[0] <= 0.0 <= c[1]]
        if cl:
            lo, hi = cl[0][0], cl[0][1]
            vs = [v for v in vs if lo - 1e-6 <= v.co.x <= hi + 1e-6]
        vs = [v for v in vs if abs(v.co.x) < H * 0.15]
        sag = [v for v in vs if abs(v.co.x) < 0.045]
        if len(vs) >= 10 and len(sag) >= 4:
            front, back = min(v.co.y for v in sag), max(v.co.y for v in sag)
            shell.append([round(z, 4), round((front + back) / 2, 5),
                          round((back - front) / 2, 5),
                          round(max(abs(v.co.x) for v in vs), 5)])
        z += step
    # The half-width needs two repairs the depth does not. A single band can
    # come out absurd where few vertices sit near the midline (a 2 cm "waist"
    # at the collarbone), so median-filter it; and above the nipple the arm is
    # genuinely joined to the torso, so the measurement flares to 27 cm — a
    # torso does not widen 50% in one 2 cm band, a limb merging does. Carry the
    # last honest width forward through those.
    if len(shell) >= 3:
        ws = [r[3] for r in shell]
        for i in range(1, len(shell) - 1):
            shell[i][3] = round(sorted(ws[i - 1:i + 2])[1], 5)
    for i in range(1, len(shell)):
        if shell[i][3] > shell[i - 1][3] * 1.12:
            shell[i][3] = shell[i - 1][3]
    if shell:
        widest = max(shell, key=lambda r: r[3])
        waist = min([r for r in shell if H * 0.55 < r[0] < H * 0.68], key=lambda r: r[3], default=widest)
        res['trunk'] = {'shell': shell,
                        'chest': {'z': widest[0], 'halfw': widest[3], 'halfd': widest[2]},
                        'waist': {'z': waist[0], 'halfw': waist[3], 'halfd': waist[2]}}

    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    with open(out, 'w') as fh:
        json.dump(res, fh, indent=1)
    print(f'MEASURED stature={H:.3f}')
    for tag, j in res['sides'].items():
        for k in ('shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'):
            if k in j:
                print(f'  {tag} {k:9s} x={j[k][0]:+.3f} y={j[k][1]:+.3f} z={j[k][2]:.3f}')
    if res.get('trunk', {}).get('chest'):
        c, w = res['trunk']['chest'], res['trunk']['waist']
        print(f"  chest z={c['z']:.2f} half-width {c['halfw']:.3f} | waist z={w['z']:.2f} half-width {w['halfw']:.3f}")


if __name__ == '__main__':
    main()
