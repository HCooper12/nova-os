"""The muscles — every one that shows on a trained male, as a real belly
between real attachments.

This is the anatomy the model IS, not a texture painted on it. Each entry names
the muscle, the group the app highlights it by, and the volume it occupies: a
path (origin → belly → insertion, in the skeleton's MEASURED coordinates) with
the semi-axes of its cross-section at each point. The builder grows the surface
where these sit and attributes every vertex to the muscle nearest it — so the
figure can light up the long head of the triceps, not merely "triceps".

Heads are SEPARATE wherever they are separately trainable: pectoralis major has
three, the triceps three, the quadriceps four, the hamstrings three, the calf
two plus soleus. Deep muscles that shape the surface without appearing on it
(subscapularis, iliopsoas, transversus abdominis) carry `deep=True` — they give
the body its volume but never win a surface vertex, and they do not grow with
training.

Origins and insertions follow standard anatomy; bellies sit where they visibly
sit on a lean, trained 180 cm male. Bilateral muscles are written once and
mirrored. `group` is `server/lib/muscles.js`'s closed list, so the chart, the
Coach and the model all speak one language.
"""

import math

import skeleton as SK
from skeleton import Z, SHOULDER_X, RIB_X, PELVIS_X, joints


def _lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _off(p, dx=0.0, dy=0.0, dz=0.0):
    return (p[0] + dx, p[1] + dy, p[2] + dz)


def build(side):
    """Every muscle volume for one side. side=+1 left, -1 right."""
    j = joints(side)
    sh, el, wr = j['shoulder'], j['elbow'], j['wrist']
    hip, kne, ank = j['hip'], j['knee'], j['ankle']
    x = lambda v: side * v          # noqa: E731 — mirror helper
    M = []
    add = lambda **kw: M.append(kw)  # noqa: E731

    # Trunk placement. `xf` is the fraction of the way out to the trunk's
    # MEASURED half-width at that height, `d` how far beneath the skin the
    # belly sits. Every torso muscle is written through these two calls, so the
    # anatomy lands on the body that is actually there — see skeleton.skin().
    def F(z, xf=0.0, d=0.014):
        xx = SK.trunk_x(z) * xf
        return (x(xx), SK.skin(z, xx, depth=d), z)

    def B(z, xf=0.0, d=0.014):
        xx = SK.trunk_x(z) * xf
        return (x(xx), SK.skin(z, xx, depth=d, back=True), z)

    # Limb placement. `t` runs 0→1 along the bone, `ang` is degrees around it
    # (0 anterior, +90 lateral, 180 posterior, -90 medial) and `f` is the
    # fraction of the way out to the limb's MEASURED radius. Written this way
    # because the first table put the adductors 2.6 cm medial of a femur inside
    # a thigh 7.9 cm thick — the whole group sat buried in the middle of the
    # leg, where it could neither be seen nor highlighted.
    def limb(a, b, kind, t, ang, f=0.72):
        p = _lerp(a, b, t)
        r = SK.limb_r(kind, side, p[2]) * f
        rad = math.radians(ang)
        return (p[0] + side * math.sin(rad) * r, p[1] - math.cos(rad) * r, p[2])

    TH = lambda t, ang, f=0.72: limb(hip, kne, 'leg', t, ang, f)   # noqa: E731
    SN = lambda t, ang, f=0.72: limb(kne, ank, 'leg', t, ang, f)   # noqa: E731

    # ==================== FRAME — what the body hangs on ====================
    add(name='ribcage', group='frame', deep=True, path=[
        ((0, 0.012, Z['t10']), RIB_X * 0.93, 0.098),
        ((0, 0.004, Z['nipple']), RIB_X, 0.104),
        ((0, 0.000, Z['t4']), RIB_X * 0.96, 0.100),
        ((0, 0.006, Z['c7'] - 0.030), RIB_X * 0.80, 0.086),
    ])
    add(name='pelvis', group='frame', deep=True, path=[
        ((0, 0.014, Z['hip'] - 0.045), PELVIS_X * 1.02, 0.098),
        ((0, 0.010, Z['hip'] + 0.010), PELVIS_X, 0.096),
        ((0, 0.020, Z['l3'] - 0.030), PELVIS_X * 0.80, 0.082),
    ])
    add(name='abdominal_cavity', group='frame', deep=True, path=[
        ((0, 0.010, Z['navel'] - 0.030), RIB_X * 0.80, 0.086),
        ((0, 0.006, Z['navel'] + 0.030), RIB_X * 0.80, 0.086),
    ])
    add(name='neck_column', group='frame', path=[
        (F(Z['c7'] - 0.010, 0.0, 0.050), 0.056, 0.056),
        ((0, SK.skin(Z['jaw'] - 0.030) + 0.030, Z['jaw'] - 0.026), 0.048, 0.050),
    ])
    add(name='cranium', group='frame', path=[
        ((0, -0.012, Z['jaw'] - 0.006), 0.040, 0.044),
        ((0, -0.008, Z['jaw'] + 0.022), 0.058, 0.070),
        ((0, -0.004, Z['head_c'] + 0.006), 0.074, 0.090),
        ((0, 0.006, Z['head_top'] - 0.022), 0.054, 0.062),
    ])
    add(name='clavicle', group='frame', path=[
        (F(Z['c7'] - 0.026, 0.10, 0.012), 0.013, 0.011),
        (F(Z['c7'] - 0.034, 0.45, 0.012), 0.013, 0.011),
        ((sh[0] * 0.90, sh[1] - 0.030, sh[2] + 0.020), 0.014, 0.012),
    ])
    add(name='scapula', group='frame', deep=True, path=[
        (B(Z['t4'] + 0.020, 0.36, 0.020), 0.038, 0.016),
        (B(Z['nipple'] - 0.010, 0.72, 0.020), 0.034, 0.016),
    ])
    add(name='axilla', group='frame', path=[
        ((sh[0] * 0.66, sh[1] + 0.006, sh[2] - 0.040), 0.032, 0.038),
        ((sh[0] * 0.88, sh[1] + 0.008, sh[2] - 0.062), 0.028, 0.034),
    ])
    add(name='knee_joint', group='frame', path=[
        (_lerp(hip, kne, 0.90), 0.044, 0.044),
        (_off(kne, 0, -0.004), 0.042, 0.044),
        (_lerp(kne, ank, 0.10), 0.040, 0.042),
    ])
    add(name='ankle_joint', group='frame', path=[
        (_lerp(kne, ank, 0.86), 0.030, 0.030),
        (_off(ank, 0, 0.004, 0.004), 0.028, 0.028),
    ])
    add(name='achilles_tendon', group='calves', path=[
        (_lerp(kne, ank, 0.74), 0.017, 0.019),
        (_off(ank, 0, 0.016, 0.010), 0.014, 0.016),
    ])
    add(name='foot', group='frame', path=[
        (_off(ank, 0, -0.020, -0.004), 0.030, 0.026),
        (_off(ank, 0, 0.030, -0.028), 0.038, 0.028),
        (_off(ank, 0, 0.100, -0.038), 0.038, 0.022),
        (_off(ank, 0, 0.155, -0.040), 0.030, 0.016),
    ])
    add(name='hand', group='forearms', path=[
        (_off(wr, 0, 0.002, -0.030), 0.026, 0.019),
        (_off(wr, 0, 0.004, -0.082), 0.024, 0.017),
    ])

    # ============================== NECK ===================================
    add(name='sternocleidomastoid', group='traps', path=[
        (F(Z['c7'] - 0.024, 0.12, 0.010), 0.012, 0.010),
        ((x(0.030), SK.skin(Z['jaw'] - 0.020) + 0.014, Z['jaw'] - 0.020), 0.012, 0.011),
    ])
    add(name='splenius_capitis', group='traps', path=[
        (B(Z['c7'] - 0.006, 0.16, 0.012), 0.014, 0.010),
        ((x(0.026), SK.skin(Z['jaw'] - 0.006, 0.026, back=True), Z['jaw'] - 0.006), 0.012, 0.010),
    ])
    add(name='levator_scapulae', group='traps', deep=True, path=[
        (B(Z['jaw'] - 0.030, 0.14, 0.030), 0.011, 0.010),
        (B(Z['t4'] + 0.030, 0.34, 0.030), 0.012, 0.010),
    ])

    # ============================== CHEST ==================================
    # three heads, one insertion on the humerus — which is why an incline press
    # and a flat press are genuinely different exercises
    pec_ins = (sh[0] + (el[0] - sh[0]) * 0.11, sh[1] - 0.040, sh[2] - 0.052)
    add(name='pectoralis_major_clavicular', group='chest', paths=[
        [(F(Z['c7'] - 0.030, 0.11, 0.011), 0.021, 0.013),
         (F(Z['t4'] + 0.020, 0.40, 0.011), 0.028, 0.016),
         (pec_ins, 0.022, 0.017)],
    ])
    add(name='pectoralis_major_sternal', group='chest', paths=[
        [(F(Z['nipple'] + 0.026, 0.09, 0.011), 0.023, 0.013),
         (F(Z['nipple'] + 0.016, 0.46, 0.011), 0.031, 0.017),
         (pec_ins, 0.022, 0.017)],
        [(F(Z['nipple'] - 0.014, 0.09, 0.011), 0.023, 0.013),
         (F(Z['nipple'] - 0.006, 0.52, 0.011), 0.029, 0.017),
         (pec_ins, 0.021, 0.016)],
    ])
    add(name='pectoralis_major_abdominal', group='chest', paths=[
        [(F(Z['t10'] + 0.024, 0.13, 0.011), 0.021, 0.013),
         (F(Z['nipple'] - 0.044, 0.50, 0.011), 0.029, 0.016),
         (pec_ins, 0.021, 0.016)],
    ])
    add(name='pectoralis_minor', group='chest', deep=True, path=[
        (F(Z['nipple'] - 0.040, 0.34, 0.040), 0.022, 0.014),
        (F(Z['t4'] + 0.010, 0.62, 0.040), 0.018, 0.012),
    ])
    # the digitations: `parts` cuts them into the fingers a lean flank shows
    add(name='serratus_anterior', group='chest', parts=True, paths=[
        [(F(Z['t10'] + 0.048, 0.80, 0.012), 0.016, 0.014), (F(Z['nipple'] - 0.006, 0.94, 0.014), 0.014, 0.013)],
        [(F(Z['t10'] + 0.022, 0.82, 0.012), 0.015, 0.013), (F(Z['nipple'] - 0.030, 0.94, 0.014), 0.013, 0.012)],
        [(F(Z['t10'] - 0.002, 0.82, 0.012), 0.014, 0.012), (F(Z['t10'] + 0.032, 0.94, 0.014), 0.012, 0.011)],
    ])

    # ============================= SHOULDER =================================
    delt_ins = _lerp(sh, el, 0.46)
    add(name='deltoid_anterior', group='front-delts', path=[
        ((sh[0] * 0.86, -0.046, sh[2] + 0.014), 0.026, 0.022),
        ((sh[0] * 1.00, -0.028, sh[2] - 0.026), 0.030, 0.026),
        (delt_ins, 0.024, 0.022),
    ])
    add(name='deltoid_lateral', group='side-delts', path=[
        ((sh[0] * 1.02, -0.002, sh[2] + 0.018), 0.030, 0.028),
        ((sh[0] * 1.10, 0.000, sh[2] - 0.030), 0.034, 0.032),
        (delt_ins, 0.026, 0.024),
    ])
    add(name='deltoid_posterior', group='rear-delts', path=[
        ((sh[0] * 0.88, 0.040, sh[2] + 0.010), 0.026, 0.022),
        ((sh[0] * 1.00, 0.026, sh[2] - 0.028), 0.028, 0.026),
        (delt_ins, 0.022, 0.021),
    ])
    add(name='supraspinatus', group='rear-delts', deep=True, path=[
        (B(Z['t4'] + 0.026, 0.34, 0.026), 0.018, 0.012),
        ((sh[0] * 0.92, sh[1] + 0.020, sh[2] + 0.016), 0.015, 0.011),
    ])
    add(name='infraspinatus', group='rear-delts', path=[
        (B(Z['t4'] - 0.010, 0.30, 0.013), 0.026, 0.013),
        (B(Z['t4'] - 0.004, 0.66, 0.013), 0.024, 0.013),
        ((sh[0] * 0.92, sh[1] + 0.034, sh[2] - 0.024), 0.019, 0.012),
    ])
    add(name='teres_minor', group='rear-delts', path=[
        (B(Z['nipple'] + 0.010, 0.68, 0.014), 0.015, 0.011),
        ((sh[0] * 0.92, sh[1] + 0.034, sh[2] - 0.038), 0.013, 0.011),
    ])
    add(name='teres_major', group='lats', path=[
        (B(Z['nipple'] - 0.020, 0.72, 0.014), 0.019, 0.013),
        ((sh[0] * 0.86, sh[1] + 0.026, sh[2] - 0.060), 0.016, 0.012),
    ])
    add(name='subscapularis', group='lats', deep=True, path=[
        (B(Z['t4'] - 0.010, 0.50, 0.045), 0.024, 0.012),
        ((sh[0] * 0.86, sh[1] + 0.006, sh[2] - 0.030), 0.018, 0.011),
    ])
    add(name='coracobrachialis', group='chest', deep=True, path=[
        ((sh[0] * 0.80, -0.030, sh[2] - 0.020), 0.014, 0.013),
        (_lerp(sh, el, 0.42), 0.013, 0.012),
    ])

    # ============================ UPPER ARM =================================
    add(name='biceps_brachii_long', group='biceps', path=[
        ((sh[0] * 0.94, -0.018, sh[2] - 0.010), 0.016, 0.016),
        (_off(_lerp(sh, el, 0.30), 0, -0.012), 0.021, 0.021),
        (_off(_lerp(sh, el, 0.55), 0, -0.014), 0.023, 0.022),
        (_off(_lerp(sh, el, 0.86), 0, -0.014), 0.016, 0.016),
    ])
    add(name='biceps_brachii_short', group='biceps', path=[
        ((sh[0] * 0.82, -0.030, sh[2] - 0.014), 0.016, 0.015),
        (_off(_lerp(sh, el, 0.34), side * -0.010, -0.014), 0.020, 0.020),
        (_off(_lerp(sh, el, 0.60), side * -0.008, -0.016), 0.022, 0.021),
        (_off(el, 0, -0.020, -0.020), 0.015, 0.015),
    ])
    add(name='brachialis', group='biceps', path=[
        (_off(_lerp(sh, el, 0.62), 0, -0.006), 0.023, 0.020),
        (_off(_lerp(sh, el, 0.92), 0, -0.010), 0.019, 0.017),
    ])
    add(name='triceps_long', group='triceps', path=[
        ((sh[0] * 0.92, 0.036, sh[2] - 0.040), 0.020, 0.019),
        (_off(_lerp(sh, el, 0.34), 0, 0.014), 0.024, 0.023),
        (_off(_lerp(sh, el, 0.68), 0, 0.016), 0.022, 0.021),
        (_off(el, 0, 0.022, 0.004), 0.017, 0.017),
    ])
    add(name='triceps_lateral', group='triceps', path=[
        (_off(_lerp(sh, el, 0.22), side * 0.016, 0.012), 0.019, 0.018),
        (_off(_lerp(sh, el, 0.52), side * 0.014, 0.016), 0.022, 0.020),
        (_off(el, side * 0.006, 0.020, 0.006), 0.016, 0.016),
    ])
    add(name='triceps_medial', group='triceps', deep=True, path=[
        (_off(_lerp(sh, el, 0.58), side * -0.012, 0.014), 0.018, 0.017),
        (_off(el, side * -0.004, 0.018, 0.006), 0.015, 0.015),
    ])
    add(name='anconeus', group='triceps', path=[
        (_off(el, side * 0.010, 0.020, 0.000), 0.012, 0.010),
        (_off(_lerp(el, wr, 0.14), side * 0.008, 0.018), 0.011, 0.010),
    ])

    # ============================= FOREARM ==================================
    add(name='forearm_flexors', group='forearms', path=[
        (_off(_lerp(el, wr, 0.08), side * -0.010, -0.014), 0.025, 0.023),
        (_off(_lerp(el, wr, 0.30), side * -0.008, -0.014), 0.023, 0.021),
        (_off(_lerp(el, wr, 0.70), 0, -0.008), 0.016, 0.015),
        (_off(wr, 0, -0.004, 0.006), 0.013, 0.012),
    ])
    add(name='forearm_extensors', group='forearms', path=[
        (_off(_lerp(el, wr, 0.08), side * 0.012, 0.014), 0.024, 0.022),
        (_off(_lerp(el, wr, 0.32), side * 0.010, 0.014), 0.022, 0.020),
        (_off(_lerp(el, wr, 0.70), 0, 0.010), 0.015, 0.014),
        (_off(wr, 0, 0.006, 0.006), 0.012, 0.012),
    ])
    add(name='brachioradialis', group='forearms', path=[
        (_off(_lerp(sh, el, 0.84), side * 0.014, -0.008), 0.015, 0.013),
        (_off(_lerp(el, wr, 0.24), side * 0.014, -0.010), 0.019, 0.017),
        (_off(_lerp(el, wr, 0.62), side * 0.008, -0.006), 0.013, 0.012),
    ])
    add(name='pronator_teres', group='forearms', deep=True, path=[
        (_off(el, side * -0.010, -0.014, -0.006), 0.014, 0.012),
        (_off(_lerp(el, wr, 0.34), side * 0.004, -0.010), 0.012, 0.011),
    ])

    # =============================== BACK ===================================
    lat_ins = (sh[0] * 0.82, sh[1] + 0.016, sh[2] - 0.066)
    # The broadest muscle in the body, and the first draft gave it 302 vertices
    # of 24,000. It is a SHEET: origin along the whole thoracolumbar spine and
    # the iliac crest, sweeping up and laterally to twist into the humerus. Four
    # strands, each running out to the flank before turning up to the armpit.
    add(name='latissimus_dorsi', group='lats', paths=[
        [(B(Z['hip'] + 0.030, 0.26, 0.013), 0.026, 0.014),
         (B(Z['l3'] - 0.010, 0.62, 0.013), 0.030, 0.016),
         (B(Z['t10'] + 0.030, 0.86, 0.014), 0.030, 0.017), (lat_ins, 0.022, 0.018)],
        [(B(Z['l3'] + 0.010, 0.22, 0.013), 0.026, 0.014),
         (B(Z['t10'] - 0.020, 0.66, 0.013), 0.030, 0.016),
         (B(Z['nipple'] - 0.030, 0.90, 0.014), 0.028, 0.017), (lat_ins, 0.022, 0.018)],
        [(B(Z['t10'] + 0.010, 0.20, 0.014), 0.026, 0.014),
         (B(Z['t10'] + 0.060, 0.60, 0.014), 0.028, 0.016),
         (B(Z['nipple'] + 0.020, 0.88, 0.015), 0.026, 0.016), (lat_ins, 0.021, 0.017)],
        [(B(Z['navel'] + 0.010, 0.76, 0.013), 0.024, 0.015),
         (B(Z['t10'] - 0.050, 0.94, 0.014), 0.026, 0.016), (lat_ins, 0.020, 0.016)],
    ])
    add(name='trapezius_upper', group='traps', path=[
        (B(Z['c7'] + 0.030, 0.08, 0.012), 0.019, 0.014),
        (B(Z['c7'] - 0.006, 0.34, 0.012), 0.025, 0.016),
        ((sh[0] * 0.94, sh[1] + 0.014, sh[2] + 0.016), 0.023, 0.015),
    ])
    add(name='trapezius_middle', group='traps', path=[
        (B(Z['t4'] + 0.024, 0.08, 0.014), 0.023, 0.013),
        (B(Z['t4'] + 0.010, 0.50, 0.015), 0.027, 0.015),
    ])
    # Kept to a narrow paraspinal triangle. The real lower trapezius fans right
    # across the interscapular region and covers the rhomboids completely — see
    # the note below for why the model does not draw it that way.
    add(name='trapezius_lower', group='traps', path=[
        (B(Z['t10'] + 0.010, 0.10, 0.016), 0.021, 0.012),
        (B(Z['t4'] - 0.040, 0.18, 0.016), 0.022, 0.013),
    ])
    # Anatomically the rhomboids lie UNDER the trapezius and own no skin at all,
    # so on a strict nearest-volume rule the app's rhomboids group lit 23
    # vertices out of 24,000 — a highlight that shows nothing. What a lifter
    # means by "rhomboids" is the interscapular strip a row works, so the model
    # gives them that strip: sited correctly, drawn one layer too shallow on
    # purpose, with the lower trapezius held off it. Stated plainly here rather
    # than buried in a coordinate.
    add(name='rhomboid_major', group='rhomboids', paths=[
        [(B(Z['t4'] - 0.006, 0.14, 0.012), 0.022, 0.013),
         (B(Z['t4'] - 0.020, 0.34, 0.012), 0.022, 0.013),
         (B(Z['nipple'] + 0.012, 0.52, 0.012), 0.021, 0.013)],
        [(B(Z['t4'] - 0.034, 0.14, 0.012), 0.021, 0.013),
         (B(Z['t4'] - 0.048, 0.34, 0.012), 0.021, 0.013),
         (B(Z['nipple'] - 0.016, 0.50, 0.012), 0.020, 0.013)],
        [(B(Z['t4'] - 0.062, 0.14, 0.012), 0.020, 0.013),
         (B(Z['nipple'] - 0.040, 0.44, 0.012), 0.019, 0.012)],
    ])
    add(name='rhomboid_minor', group='rhomboids', path=[
        (B(Z['t4'] + 0.024, 0.14, 0.012), 0.018, 0.012),
        (B(Z['t4'] + 0.010, 0.40, 0.012), 0.018, 0.012),
    ])
    add(name='erector_spinae_longissimus', group='lower-back', path=[
        (B(Z['hip'] + 0.020, 0.13, 0.014), 0.020, 0.020),
        (B(Z['l3'] + 0.020, 0.14, 0.014), 0.019, 0.019),
        (B(Z['t10'] + 0.040, 0.13, 0.015), 0.017, 0.017),
    ])
    add(name='erector_spinae_iliocostalis', group='lower-back', path=[
        (B(Z['hip'] + 0.030, 0.26, 0.015), 0.016, 0.015),
        (B(Z['l3'] + 0.030, 0.26, 0.015), 0.015, 0.014),
        (B(Z['t10'] + 0.020, 0.25, 0.016), 0.014, 0.013),
    ])
    add(name='quadratus_lumborum', group='lower-back', deep=True, path=[
        (B(Z['hip'] + 0.040, 0.20, 0.040), 0.018, 0.014),
        (B(Z['l3'] + 0.030, 0.24, 0.040), 0.016, 0.013),
    ])

    # ============================= ABDOMEN ==================================
    # the rectus as its own segments, so the tendinous inscriptions are
    # geometry rather than a texture: `parts` makes the relief cut between them
    rectus = []
    # six rows: the bellies have to stop short of each other or the inscription
    # between them has nowhere to cut, and short of the midline or the linea
    # alba disappears. Belly centre ~3.5 cm off the midline, half-width ~3 cm.
    rows = ((Z['t10'] + 0.016, 0.22), (Z['t10'] - 0.050, 0.21), (Z['t10'] - 0.116, 0.20),
            (Z['navel'] + 0.036, 0.19), (Z['navel'] - 0.040, 0.17), (Z['hip'] + 0.018, 0.15))
    for zz, xf in rows:
        rectus.append([(F(zz + 0.013, xf, 0.011), 0.028, 0.011),
                       (F(zz - 0.013, xf, 0.011), 0.028, 0.011)])
    add(name='rectus_abdominis', group='abs', parts=True, paths=rectus)
    # a sheet down the flank, not a wire: the oblique owns the whole side wall
    # from the costal margin to the iliac crest
    add(name='external_oblique', group='obliques', paths=[
        [(F(Z['t10'] + 0.014, 0.92, 0.013), 0.022, 0.018),
         (F(Z['navel'] + 0.030, 0.94, 0.013), 0.024, 0.019),
         (F(Z['hip'] + 0.006, 0.84, 0.013), 0.022, 0.018)],
        [(F(Z['t10'] - 0.030, 0.74, 0.013), 0.022, 0.018),
         (F(Z['navel'] + 0.010, 0.72, 0.013), 0.023, 0.018),
         (F(Z['hip'] - 0.010, 0.62, 0.013), 0.021, 0.017)],
    ])
    add(name='internal_oblique', group='obliques', deep=True, path=[
        (F(Z['navel'] + 0.020, 0.72, 0.034), 0.020, 0.016),
        (F(Z['hip'] + 0.006, 0.62, 0.034), 0.019, 0.015),
    ])
    add(name='transversus_abdominis', group='abs', deep=True, path=[
        (F(Z['navel'] + 0.010, 0.30, 0.048), 0.030, 0.020),
        (F(Z['navel'] - 0.040, 0.30, 0.048), 0.028, 0.019),
    ])

    # =============================== HIP ====================================
    add(name='gluteus_maximus', group='glutes', path=[
        (B(Z['hip'] + 0.030, 0.18, 0.014), 0.040, 0.032),
        (B(Z['hip'] - 0.010, 0.42, 0.014), 0.046, 0.036),
        (B(Z['hip'] - 0.070, 0.36, 0.016), 0.036, 0.030),
    ])
    add(name='gluteus_medius', group='glutes', path=[
        (B(Z['hip'] + 0.052, 0.70, 0.014), 0.028, 0.024),
        (B(Z['hip'] + 0.006, 0.86, 0.016), 0.026, 0.023),
    ])
    add(name='gluteus_minimus', group='glutes', deep=True, path=[
        (B(Z['hip'] + 0.030, 0.68, 0.040), 0.022, 0.018),
    ])
    add(name='tensor_fasciae_latae', group='glutes', path=[
        (F(Z['hip'] + 0.040, 0.82, 0.013), 0.019, 0.017),
        (TH(0.16, 56, 0.84), 0.018, 0.016),
    ])
    add(name='piriformis', group='glutes', deep=True, path=[
        (B(Z['hip'] + 0.018, 0.14, 0.042), 0.018, 0.012),
        (B(Z['hip'] + 0.010, 0.62, 0.042), 0.015, 0.011),
    ])
    add(name='iliopsoas', group='quads', deep=True, path=[
        (B(Z['l3'], 0.18, 0.070), 0.020, 0.018),
        (F(Z['hip'] + 0.020, 0.22, 0.070), 0.019, 0.017),
        (TH(0.08, -20, 0.30), 0.016, 0.014),
    ])

    # ============================== THIGH ===================================
    add(name='rectus_femoris', group='quads', path=[
        (TH(0.06, 0, 0.62), 0.024, 0.022),
        (TH(0.38, 0, 0.80), 0.028, 0.025),
        (TH(0.72, 0, 0.76), 0.024, 0.021),
        (TH(0.95, 0, 0.62), 0.018, 0.016),
    ])
    add(name='vastus_lateralis', group='quads', path=[
        (TH(0.16, 58, 0.72), 0.026, 0.024),
        (TH(0.48, 52, 0.84), 0.030, 0.027),
        (TH(0.78, 44, 0.80), 0.024, 0.021),
        (TH(0.96, 38, 0.66), 0.018, 0.016),
    ])
    add(name='vastus_medialis', group='quads', path=[
        (TH(0.44, -52, 0.74), 0.022, 0.020),
        (TH(0.76, -44, 0.86), 0.027, 0.024),
        (TH(0.95, -36, 0.74), 0.020, 0.018),
    ])
    add(name='vastus_intermedius', group='quads', deep=True, path=[
        (TH(0.40, 0, 0.30), 0.026, 0.024),
        (TH(0.78, 0, 0.30), 0.024, 0.022),
    ])
    add(name='sartorius', group='quads', path=[
        (TH(0.04, -34, 0.78), 0.012, 0.010),
        (TH(0.45, -58, 0.84), 0.011, 0.010),
        (TH(0.94, -84, 0.76), 0.010, 0.009),
    ])
    add(name='biceps_femoris_long', group='hamstrings', path=[
        (TH(0.04, 156, 0.68), 0.022, 0.020),
        (TH(0.44, 150, 0.82), 0.025, 0.023),
        (TH(0.80, 144, 0.80), 0.021, 0.019),
        (TH(0.96, 138, 0.68), 0.016, 0.015),
    ])
    add(name='biceps_femoris_short', group='hamstrings', deep=True, path=[
        (TH(0.58, 152, 0.44), 0.019, 0.018),
        (TH(0.94, 144, 0.44), 0.016, 0.015),
    ])
    add(name='semitendinosus', group='hamstrings', path=[
        (TH(0.04, -168, 0.68), 0.018, 0.017),
        (TH(0.46, -166, 0.82), 0.020, 0.019),
        (TH(0.82, -160, 0.80), 0.017, 0.016),
        (TH(0.96, -152, 0.68), 0.014, 0.013),
    ])
    add(name='semimembranosus', group='hamstrings', path=[
        (TH(0.06, -146, 0.66), 0.018, 0.017),
        (TH(0.50, -142, 0.78), 0.020, 0.018),
        (TH(0.94, -136, 0.68), 0.015, 0.014),
    ])
    add(name='adductor_magnus', group='adductors', path=[
        (TH(0.02, -118, 0.62), 0.024, 0.022),
        (TH(0.40, -118, 0.80), 0.024, 0.022),
        (TH(0.76, -122, 0.72), 0.019, 0.018),
    ])
    add(name='adductor_longus', group='adductors', path=[
        (TH(0.02, -84, 0.62), 0.018, 0.016),
        (TH(0.34, -92, 0.80), 0.019, 0.017),
    ])
    add(name='adductor_brevis', group='adductors', deep=True, path=[
        (TH(0.02, -96, 0.36), 0.017, 0.015),
        (TH(0.24, -100, 0.36), 0.016, 0.014),
    ])
    add(name='pectineus', group='adductors', deep=True, path=[
        (TH(-0.02, -72, 0.44), 0.015, 0.013),
        (TH(0.10, -80, 0.44), 0.014, 0.012),
    ])
    add(name='gracilis', group='adductors', path=[
        (TH(0.02, -104, 0.74), 0.012, 0.011),
        (TH(0.52, -106, 0.86), 0.012, 0.010),
        (TH(0.96, -108, 0.76), 0.010, 0.009),
    ])

    # ============================ LOWER LEG =================================
    add(name='gastrocnemius_medial', group='calves', path=[
        (SN(0.02, -158, 0.66), 0.020, 0.018),
        (SN(0.26, -156, 0.84), 0.026, 0.024),
        (SN(0.52, -160, 0.76), 0.019, 0.018),
    ])
    add(name='gastrocnemius_lateral', group='calves', path=[
        (SN(0.02, 158, 0.66), 0.019, 0.018),
        (SN(0.24, 156, 0.82), 0.023, 0.021),
        (SN(0.48, 160, 0.74), 0.017, 0.016),
    ])
    add(name='soleus', group='calves', path=[
        (SN(0.34, 172, 0.72), 0.019, 0.017),
        (SN(0.58, 176, 0.82), 0.021, 0.019),
        (SN(0.80, 178, 0.72), 0.015, 0.014),
    ])
    add(name='tibialis_anterior', group='calves', path=[
        (SN(0.16, -26, 0.76), 0.016, 0.015),
        (SN(0.50, -24, 0.80), 0.015, 0.014),
        (SN(0.84, -22, 0.70), 0.011, 0.010),
    ])
    add(name='peroneus_longus', group='calves', path=[
        (SN(0.20, 74, 0.80), 0.013, 0.012),
        (SN(0.60, 76, 0.84), 0.012, 0.011),
        (SN(0.88, 78, 0.74), 0.010, 0.009),
    ])
    add(name='extensor_digitorum_longus', group='calves', deep=True, path=[
        (SN(0.34, -6, 0.50), 0.013, 0.012),
        (SN(0.80, -8, 0.50), 0.011, 0.010),
    ])
    add(name='tibialis_posterior', group='calves', deep=True, path=[
        (SN(0.44, 176, 0.34), 0.014, 0.013),
        (SN(0.84, 176, 0.34), 0.011, 0.010),
    ])
    add(name='iliotibial_band', group='quads', path=[
        (TH(0.20, 84, 0.88), 0.013, 0.010),
        (TH(0.60, 86, 0.90), 0.012, 0.010),
        (TH(0.96, 78, 0.82), 0.011, 0.010),
    ])

    for m in M:
        m['side'] = side
    return M


# Structures that exist once, on the midline — built on the left pass only.
MIDLINE_ONLY = {'ribcage', 'pelvis', 'abdominal_cavity', 'neck_column', 'cranium'}


def all_muscles():
    out = []
    for s in (1, -1):
        for m in build(s):
            if m['name'] in MIDLINE_ONLY and s == -1:
                continue
            out.append(m)
    return out


# The groups the app highlights, in the order an anatomy chart lists them.
GROUPS = ['chest', 'front-delts', 'side-delts', 'rear-delts', 'biceps', 'triceps',
          'forearms', 'abs', 'obliques', 'lats', 'traps', 'rhomboids', 'lower-back',
          'glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'frame']

# How much a trained lifter carries at each site, in metres of surface added to
# an average male base mesh. Hypertrophy differences, not invention: a trained
# deltoid and quadriceps add the most visible mass, the frame adds none.
GAIN = {
    'chest': 0.013, 'front-delts': 0.011, 'side-delts': 0.013, 'rear-delts': 0.009,
    'biceps': 0.010, 'triceps': 0.011, 'forearms': 0.006, 'abs': 0.004, 'obliques': 0.003,
    'lats': 0.013, 'traps': 0.010, 'rhomboids': 0.006, 'lower-back': 0.006,
    'glutes': 0.010, 'quads': 0.014, 'hamstrings': 0.011, 'adductors': 0.006,
    'calves': 0.010, 'frame': 0.0,
}


def muscle_gain(m):
    # a deep muscle shapes the body it sits under; it does not grow the surface
    return 0.0 if m.get('deep') else GAIN.get(m.get('group'), 0.0)
