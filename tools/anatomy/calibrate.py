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
from mathutils import Vector

# segment lengths as fractions of stature (Drillis & Contini), the same
# numbers skeleton.py builds its fallback skeleton from
SEG_UPPER, SEG_FORE, SEG_HAND = 0.186, 0.146, 0.108
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


def hand_landmarks(verts, elbow, wrist_guess, side):
    """Wrist, knuckles and fingertip, found off the mesh along the arm's axis.

    The radius profile down a forearm tells the whole story: it swells to the
    flexor mass, drops hard at the wrist, runs roughly flat across the back of
    the hand, then tapers away at the fingers. Reading that is reliable in a
    way that slicing horizontally through an A-pose is not.
    """
    fwd = (wrist_guess - elbow)
    if fwd.length < 1e-6:
        return None
    fwd.normalize()
    pts = []
    for v in verts:
        t = (v.co - elbow).dot(fwd)
        if t < 0.02:
            continue
        off = v.co - (elbow + fwd * t)
        if off.length < 0.16:
            pts.append((t, off.length, v.co.copy()))
    if len(pts) < 60:
        return None
    tmax = max(p[0] for p in pts)
    step = 0.01
    prof = {}
    for t, r, _c in pts:
        k = round(t / step)
        prof[k] = max(prof.get(k, 0.0), r)
    keys = sorted(prof)

    def at(t):
        return elbow + fwd * t

    def centre(t, w=0.012):
        near = [c for tt, _r, c in pts if abs(tt - t) < w]
        if not near:
            return at(t)
        m = Vector((0, 0, 0))
        for c in near:
            m += c
        return m / len(near)

    # the wrist: the sharpest narrowing in the outer half of the limb
    lo = [k for k in keys if 0.50 * tmax <= k * step <= 0.78 * tmax]
    if not lo:
        return None
    drop = max(lo, key=lambda k: prof.get(k - 1, 0) - prof[k])
    t_w = drop * step
    # the knuckles: where the flat of the hand starts tapering into fingers
    hi = [k for k in keys if t_w + 0.02 < k * step < tmax - 0.005]
    t_k = (max(hi, key=lambda k: prof.get(k - 1, 0) - prof[k]) * step) if hi else (t_w + (tmax - t_w) * 0.55)
    c_w, c_k = centre(t_w), centre(t_k)
    tip = max(pts, key=lambda p: p[0])[2]
    return {
        'wrist': [round(c_w.x, 5), round(c_w.y, 5), round(c_w.z, 5)],
        'knuckles': [round(c_k.x, 5), round(c_k.y, 5), round(c_k.z, 5)],
        'fingertip': [round(tip.x, 5), round(tip.y, 5), round(tip.z, 5)],
    }


def digit_landmarks(verts, wrist, knuckles, tip, side):
    """Five digits, found in the mesh: base, and two joints along each.

    A hand that closes as one mitten is convincing on a barbell and nowhere
    else — a rope, an open palm, a hook grip and a thumbless grip all come out
    the same shape. So the fingers are found rather than assumed: take the
    hand's points, build a frame from them, and read the digits off as the
    clusters they form across the palm.
    """
    h = (tip - wrist)
    if h.length < 0.02:
        return None
    span = h.length
    h.normalize()
    pts = []
    for v in verts:
        d = v.co - wrist
        t = d.dot(h)
        if t < -0.01 or t > span * 1.30:
            continue
        if (d - h * t).length < 0.115:
            pts.append((t, v.co.copy()))
    if len(pts) < 80:
        return None

    # the hand's own frame: `spread` is the widest direction across the palm,
    # `norm` is through it. Taken from the points, not assumed, because the
    # hand is at whatever angle the A-pose left it.
    mid = Vector((0, 0, 0))
    for _t, p in pts:
        mid += p
    mid /= len(pts)
    perp = []
    for _t, p in pts:
        d = p - mid
        perp.append(d - h * d.dot(h))
    # principal direction of the perpendicular spread, by power iteration
    spread = Vector((0, 0, 1)) - h * h.dot(Vector((0, 0, 1)))
    if spread.length < 1e-6:
        spread = Vector((1, 0, 0)) - h * h.dot(Vector((1, 0, 0)))
    spread.normalize()
    for _ in range(24):
        acc = Vector((0, 0, 0))
        for d in perp:
            acc += d * d.dot(spread)
        if acc.length < 1e-9:
            break
        acc.normalize()
        spread = acc - h * acc.dot(h)
        if spread.length < 1e-9:
            break
        spread.normalize()

    t_k = (knuckles - wrist).dot(h)
    distal = [(p, (p - wrist).dot(spread)) for t, p in pts if t > t_k * 0.94]
    if len(distal) < 40:
        return None
    us = sorted(u for _p, u in distal)
    lo, hi = us[0], us[-1]
    # five lanes across the hand; the digit that is shortest and set furthest
    # back along the hand is the thumb
    lanes = [[] for _ in range(5)]
    for p, u in distal:
        k = min(4, max(0, int((u - lo) / max(1e-6, (hi - lo)) * 5)))
        lanes[k].append(p)
    out = {}
    order = ['a', 'b', 'c', 'd', 'e']
    for k, lane in enumerate(lanes):
        if len(lane) < 6:
            continue
        far = max(lane, key=lambda p: (p - wrist).dot(h))
        near = min(lane, key=lambda p: (p - wrist).dot(h))
        base = Vector((0, 0, 0))
        n = 0
        for p in lane:
            if (p - wrist).dot(h) < (near - wrist).dot(h) + span * 0.12:
                base += p
                n += 1
        base = base / n if n else near
        out[order[k]] = {'base': [round(c, 5) for c in base],
                         'tip': [round(c, 5) for c in far],
                         'len': round((far - base).length, 5)}
    if len(out) < 4:
        return None
    # name them: the thumb is the shortest lane, the rest run across the hand
    keys = [k for k in order if k in out]
    thumb = min(keys, key=lambda k: out[k]['len'])
    # ...and then found again properly. A thumb branches off the hand much
    # further back than the fingers do, so the distal slice that isolates the
    # four fingers catches only its very tip and gives it a length of 8 mm.
    lo_t, hi_t = None, None
    for u_lo, u_hi in [((lo + (hi - lo) * order.index(thumb) / 5),
                        (lo + (hi - lo) * (order.index(thumb) + 1) / 5))]:
        lo_t, hi_t = u_lo, u_hi
    lane = [p for t, p in pts
            if t > t_k * 0.45 and lo_t - 0.004 <= (p - wrist).dot(spread) <= hi_t + 0.004]
    if len(lane) >= 6:
        far = max(lane, key=lambda p: (p - wrist).dot(h))
        near = min(lane, key=lambda p: (p - wrist).dot(h))
        out[thumb] = {'base': [round(c, 5) for c in near],
                      'tip': [round(c, 5) for c in far],
                      'len': round((far - near).length, 5)}
    rest_keys = [k for k in keys if k != thumb]
    # index is the lane adjacent to the thumb
    if order.index(thumb) > 2:
        rest_keys = list(reversed(rest_keys))
    names = ['index', 'middle', 'ring', 'little']
    named = {'thumb': out[thumb]}
    for i, k in enumerate(rest_keys[:4]):
        named[names[i]] = out[k]
    return named


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
            # kept only as a DIRECTION estimate — see below for why it cannot
            # be trusted as a position
            w = narrowest(arm, 0.74, 0.90)
            # THE ARM, ALONG ITS OWN AXIS.
            #
            # Searching horizontal bands for "the narrowest cross-section"
            # found the joints ONE SEGMENT OUT: the elbow landed at the wrist,
            # the wrist at the fingertips, and the hand bone ran from the
            # fingertips back toward the body's midline. Every lift's elbow
            # flexion has been pivoting at his wrist. An A-pose arm is diagonal,
            # so a horizontal slice cuts it obliquely and the minima it finds
            # mean nothing.
            #
            # Same fix as the knee: a joint sits at a known FRACTION of the
            # limb, so take the fraction from anatomy and only the position
            # from the mesh. Shoulder to fingertip is measurable and
            # unambiguous — it is the farthest point of the arm.
            # The arm's own points, taken as a CONE down the limb rather than
            # from the band clusters: at hand height those clusters brush the
            # hip, and the "fingertip" came out next to his groin.
            sh = Vector(j['shoulder'])
            # The band search is unreliable for WHERE a joint is but fine for
            # which way the arm points, so it supplies the direction and the
            # mesh supplies the rest. The cone is also capped just past that
            # estimate: run it further and it continues down the thigh, and
            # the "fingertip" comes out on the floor.
            aim = (Vector((w['x'], w['y'], w['z'])) - sh) if w else None
            av = []
            if aim and aim.length > 0.2:
                reach = aim.length * 1.12
                aim.normalize()
                for v in verts:
                    t = (v.co - sh).dot(aim)
                    if t < 0.03 or t > reach:
                        continue
                    if (v.co - (sh + aim * t)).length < 0.17:
                        av.append(v.co.copy())
            if av:
                tip = max(av, key=lambda p: (p - sh).dot(aim))
                axis = (tip - sh)
                L = axis.length
                axis.normalize()

                def along(f, w=0.020):
                    t = L * f
                    seat = sh + axis * t
                    near = [p for p in av if abs((p - sh).dot(axis) - t) < w * L / 0.10]
                    if not near:
                        return seat
                    m = Vector((0, 0, 0))
                    for p in near:
                        m += p
                    return m / len(near)

                # fractions of shoulder→fingertip, from the segment lengths in
                # skeleton.py: upper arm .186H, forearm .146H, hand .108H
                whole = SEG_UPPER + SEG_FORE + SEG_HAND
                el = along(SEG_UPPER / whole)
                wr = along((SEG_UPPER + SEG_FORE) / whole)
                # the knuckles sit about 62% of the way down a hand — the palm is
                # the long part, the fingers the short one
                kn = along((SEG_UPPER + SEG_FORE + SEG_HAND * 0.62) / whole)
                j['elbow'] = [round(c, 5) for c in el]
                j['wrist'] = [round(c, 5) for c in wr]
                j['knuckles'] = [round(c, 5) for c in kn]
                j['fingertip'] = [round(c, 5) for c in tip]
                j['hand'] = j['knuckles']
                dig = digit_landmarks(verts, wr, kn, tip, side)
                if dig:
                    j['digits'] = dig
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
