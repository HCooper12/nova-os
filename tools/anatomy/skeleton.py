"""The skeleton: joint centres for a 180 cm male, and the bones between them.

Joint-centre heights are fractions of stature from Drillis & Contini (1966),
the standard biomechanics table; breadths are from ANSUR II (2012). Every
muscle in `muscles.py` attaches to points defined here, so the body is built
on a real frame instead of eyeballed positions — and the same frame drives the
rig, which is why the mesh deforms correctly when a joint bends.

Coordinates: metres, Blender frame. +X = the model's LEFT (viewer's right),
+Y = posterior (behind), +Z = up. Origin between the feet.
"""

import math

STATURE = 1.80

def f(x):
    return x * STATURE

# --- heights (fraction of stature) ------------------------------------------
Z = {
    'floor': 0.0,
    'ankle': f(0.039),
    'knee': f(0.285),
    'crotch': f(0.485),
    'hip': f(0.530),      # greater trochanter / hip joint centre
    'navel': f(0.600),
    'l3': f(0.632),       # lumbar hinge
    't12': f(0.690),
    't10': f(0.720),      # bottom of the ribcage
    'nipple': f(0.760),
    't4': f(0.790),
    'shoulder': f(0.800), # glenohumeral centre — the acromion is 0.818, the joint sits ~3 cm below it
    'c7': f(0.830),      # cervicale — v4 had this at 0.855, nearly chin height, which left a 2 cm neck and a hooded head
    'jaw': f(0.872),
    'head_c': f(0.935),
    'head_top': f(1.000),
}

# --- breadths (half-widths from the midline) --------------------------------
SHOULDER_X = f(0.115)     # biacromial breadth ≈ 0.23·stature, halved
HIP_X = f(0.048)          # hip joint centres ≈ 0.096·stature apart
RIB_X = f(0.088)          # half-breadth of the ribcage at T8
PELVIS_X = f(0.070)
KNEE_X = f(0.045)
ANKLE_X = f(0.040)

# --- segment lengths --------------------------------------------------------
UPPER_ARM = f(0.186)
FOREARM = f(0.146)
HAND = f(0.108)

# In the build pose the arms hang at 8° of abduction — close enough to anatomical
# position to keep the deltoid/lat relationship honest, open enough to skin well.
ABDUCT = math.radians(8)


import json as _json
import os as _os

_MEASURED = None


def measured():
    """The joints measured off the actual base mesh (tools/anatomy/calibrate.py).

    The table below is population anthropometry — right for a body in
    anatomical position. The mesh Nova actually ships stands in a wide A-pose,
    so muscle volumes written against the table land beside the limbs rather
    than on them. When a measurement exists it wins: the anatomy has to fit the
    body it is drawn on.
    """
    global _MEASURED
    if _MEASURED is None:
        p = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'joints.json')
        try:
            with open(p) as fh:
                _MEASURED = _json.load(fh)
        except Exception:
            _MEASURED = {}
    return _MEASURED


def joints(side=1):
    """Every joint centre for one side (side = +1 left, -1 right)."""
    m = measured().get('sides', {}).get('L' if side > 0 else 'R', {})
    if m.get('shoulder'):
        def g(k, fallback):
            v = m.get(k)
            return tuple(v[:3]) if v else fallback
        sh = g('shoulder', (side * SHOULDER_X, 0.0, Z['shoulder']))
        el = g('elbow', (sh[0] + side * 0.10, 0.0, sh[2] - UPPER_ARM))
        wr = g('wrist', (el[0] + side * 0.06, 0.0, el[2] - FOREARM))
        hnd = g('hand', (wr[0], wr[1], wr[2] - HAND * 0.55))
        hip = g('hip', (side * HIP_X, 0.0, Z['hip']))
        kne = g('knee', (side * KNEE_X, 0.0, Z['knee']))
        ank = g('ankle', (side * ANKLE_X, 0.0, Z['ankle']))
        toe = g('toe', (ank[0], ank[1] + 0.145, ank[2] - 0.045))
        return {
            'shoulder': sh, 'elbow': el, 'wrist': wr, 'hand': hnd,
            'hip': hip, 'knee': kne, 'ankle': ank, 'toe': toe,
            'acromion': (sh[0] * 1.16, sh[1], sh[2] + 0.030),
            'scapula': (sh[0] * 0.60, sh[1] + 0.060, sh[2] + 0.010),
            'clavicle': (sh[0] * 0.55, sh[1] - 0.045, sh[2] + 0.020),
        }
    sh = (side * SHOULDER_X, 0.0, Z['shoulder'])
    el = (sh[0] + side * math.sin(ABDUCT) * UPPER_ARM, 0.006, sh[2] - math.cos(ABDUCT) * UPPER_ARM)
    wr = (el[0] + side * math.sin(ABDUCT * 1.4) * FOREARM, 0.010, el[2] - math.cos(ABDUCT * 1.4) * FOREARM)
    hnd = (wr[0] + side * 0.012, 0.012, wr[2] - HAND * 0.55)
    hip = (side * HIP_X, 0.0, Z['hip'])
    kne = (side * KNEE_X, 0.010, Z['knee'])
    ank = (side * ANKLE_X, -0.010, Z['ankle'])
    toe = (side * ANKLE_X, 0.145, Z['ankle'] - 0.045)
    return {
        'shoulder': sh, 'elbow': el, 'wrist': wr, 'hand': hnd,
        'hip': hip, 'knee': kne, 'ankle': ank, 'toe': toe,
        'acromion': (side * SHOULDER_X * 1.08, 0.0, Z['shoulder'] + 0.030),
        'scapula': (side * RIB_X * 0.82, 0.055, Z['t4']),
        'clavicle': (side * SHOULDER_X * 0.55, -0.045, Z['c7'] - 0.020),
    }


def limb_r(kind, side, z):
    """How thick the arm or leg is at height z, measured off the base mesh.

    `kind` is 'arm' or 'leg'. Limb muscles are placed as a fraction of the way
    out to this rather than at a fixed offset from the bone — the adductors were
    written 2.6 cm medial of the femur on a thigh 9 cm thick, which buried the
    whole group inside the leg where it could neither show nor be highlighted.
    """
    m = measured().get('sides', {}).get('L' if side > 0 else 'R', {})
    rows = m.get(f'{kind}_radius') or []
    if not rows or not isinstance(rows[0], list):
        return (UPPER_ARM if kind == 'arm' else 0.10) * 0.30
    rows = sorted(rows)
    if z <= rows[0][0]:
        return rows[0][1]
    if z >= rows[-1][0]:
        return rows[-1][1]
    for a, b in zip(rows, rows[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / ((b[0] - a[0]) or 1.0)
            return a[1] + (b[1] - a[1]) * t
    return rows[-1][1]


def shell(z):
    """The trunk's cross-section at height z, MEASURED off the base mesh:
    (centre_y, half_depth, half_width). Interpolated between 2 cm bands, held
    flat past the ends. `calibrate.py` writes it.
    """
    rows = measured().get('trunk', {}).get('shell') or []
    if not rows:
        return (0.0, RIB_X * 0.78, RIB_X)
    if z <= rows[0][0]:
        return tuple(rows[0][1:4])
    if z >= rows[-1][0]:
        return tuple(rows[-1][1:4])
    for a, b in zip(rows, rows[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / ((b[0] - a[0]) or 1.0)
            return tuple(a[i] + (b[i] - a[i]) * t for i in (1, 2, 3))
    return tuple(rows[-1][1:4])


def skin(z, x=0.0, depth=0.014, back=False):
    """A point `depth` metres beneath the trunk's skin, at height z, offset x.

    The cross-section is treated as an ellipse of the measured half-depth and
    half-width, so a muscle placed 6 cm off the midline sits where the chest
    actually curves away rather than on a flat plane.

    Every torso muscle goes through this. The first table hand-wrote its y
    values against an assumed 9 cm half-depth; the mesh's skin is at 14 cm, so
    the entire abdominal wall was built six centimetres inside the body, where
    no amount of relief could ever reach the surface. The joints taught this
    lesson once already: measure the body you are drawing on.
    """
    cy, hd, hw = shell(z)
    t = min(1.0, abs(x) / max(hw, 1e-6))
    r = hd * math.sqrt(max(0.0, 1.0 - t * t))
    return (cy + r - depth) if back else (cy - r + depth)


def trunk_x(z, frac=1.0):
    """`frac` of the way out to the trunk's measured half-width at height z."""
    return shell(z)[2] * frac


MIDLINE = {
    'pelvis': (0.0, 0.010, Z['hip'] - 0.020),
    'sacrum': (0.0, 0.055, Z['hip'] + 0.010),
    'l3': (0.0, 0.030, Z['l3']),
    't10': (0.0, 0.020, Z['t10']),
    't4': (0.0, 0.015, Z['t4']),
    'sternum': (0.0, -0.070, Z['nipple']),
    'c7': (0.0, 0.020, Z['c7']),
    'jaw': (0.0, -0.020, Z['jaw']),
    'head': (0.0, -0.005, Z['head_c']),
}

# The bones the rig will carry, parent → child, named as the app will address
# them. Kept here so the mesh, the rig and the motion data cannot drift apart.
BONES = [
    ('root', None, (0, 0, Z['hip'] - 0.02), (0, 0, Z['hip'] + 0.02)),
    ('pelvis', 'root', (0, 0, Z['hip']), (0, 0, Z['l3'])),
    ('spine', 'pelvis', (0, 0, Z['l3']), (0, 0, Z['t10'])),
    ('chest', 'spine', (0, 0, Z['t10']), (0, 0, Z['c7'])),
    ('neck', 'chest', (0, 0, Z['c7']), (0, 0, Z['jaw'])),
    ('head', 'neck', (0, 0, Z['jaw']), (0, 0, Z['head_top'])),
]
for s, tag in ((1, 'L'), (-1, 'R')):
    j = joints(s)
    BONES += [
        (f'clavicle{tag}', 'chest', (0, 0, Z['c7'] - 0.02), j['shoulder']),
        # A deltoid helper: it takes HALF the humerus rotation, so the cap
        # follows the arm without the pec and trap being dragged with it. This
        # is the standard fix for the shoulder collapsing at high flexion, and
        # without it an overhead press folded the chest over the neck.
        (f'deltoid{tag}', f'clavicle{tag}', j['shoulder'],
         tuple(j['shoulder'][i] + (j['elbow'][i] - j['shoulder'][i]) * 0.45 for i in range(3))),
        (f'upperarm{tag}', f'clavicle{tag}', j['shoulder'], j['elbow']),
        (f'forearm{tag}', f'upperarm{tag}', j['elbow'], j['wrist']),
        (f'hand{tag}', f'forearm{tag}', j['wrist'], j['hand']),
        (f'thigh{tag}', 'pelvis', j['hip'], j['knee']),
        (f'shin{tag}', f'thigh{tag}', j['knee'], j['ankle']),
        (f'foot{tag}', f'shin{tag}', j['ankle'], j['toe']),
    ]
