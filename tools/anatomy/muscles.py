"""The muscles — each one a real belly between real attachments.

This is the anatomy the model IS, not a texture painted on it. Every entry
names the muscle, the group the app highlights it by, and the volume it
occupies: a path of points (origin → belly → insertion, in the skeleton's
coordinates) with a radius at each. The builder grows a metaball field along
each path, so the surface that results has the muscle's actual shape, and
every vertex can be attributed back to the muscle nearest it — which is how
the app lights up exactly what a lift trains.

Origins and insertions follow standard anatomy (Gray's / Kenhut conventions);
bellies are placed where they visibly sit on a lean trained male. Bilateral
muscles are written once and mirrored.

`group` is the vocabulary the rest of Nova already uses (server/lib/muscles.js),
so the chart, the Coach and the model all speak one language.
"""

from skeleton import Z, SHOULDER_X, RIB_X, PELVIS_X, HIP_X, joints, MIDLINE, f


def _lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def build(side):
    """Every muscle volume for one side. side=+1 left, -1 right."""
    j = joints(side)
    sh, el, wr = j['shoulder'], j['elbow'], j['wrist']
    hip, kne, ank = j['hip'], j['knee'], j['ankle']
    x = lambda v: side * v  # noqa: E731  — mirror helper

    M = []
    add = lambda **kw: M.append(kw)  # noqa: E731

    # ---------------- torso frame (not muscle, but the body needs a frame) ---
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
    add(name='abdomen', group='frame', deep=True, path=[
        ((0, 0.010, Z['navel'] - 0.030), RIB_X * 0.80, 0.086),
        ((0, 0.006, Z['navel'] + 0.030), RIB_X * 0.80, 0.086),
    ])
    # The neck is a column, not a cone off the shoulders: too wide at the base
    # and the remesh fuses skull, traps and shoulders into a hood.
    # A 39 cm neck is 6.2 cm of radius; the column runs from the thorax to the
    # base of the skull, and the sternocleidomastoids give it the two front
    # ridges that stop a neck reading as a post.
    add(name='neck', group='frame', path=[
        ((0, 0.012, Z['c7'] - 0.020), 0.058, 0.058),
        ((0, 0.004, Z['jaw'] - 0.024), 0.050, 0.052),
    ])
    add(name='sternocleidomastoid', group='frame', paths=[
        [((x(0.016), -0.040, Z['c7'] - 0.026), 0.013, 0.011),
         ((x(0.030), -0.010, Z['jaw'] - 0.018), 0.012, 0.011)],
        [((-x(0.016), -0.040, Z['c7'] - 0.026), 0.013, 0.011),
         ((-x(0.030), -0.010, Z['jaw'] - 0.018), 0.012, 0.011)],
    ])
    add(name='cranium', group='frame', path=[
        ((0, -0.012, Z['jaw'] - 0.006), 0.040, 0.044),   # chin
        ((0, -0.008, Z['jaw'] + 0.022), 0.058, 0.070),   # jaw / cheek
        ((0, -0.004, Z['head_c'] + 0.006), 0.074, 0.090),  # cranium, widest
        ((0, 0.006, Z['head_top'] - 0.022), 0.054, 0.062),
    ])
    # The clavicles: the shoulder LINE. Without them the trapezius runs
    # unbroken into the deltoid and the whole yoke reads as a hood.
    add(name='clavicle', group='frame', path=[
        ((x(0.010), -0.052, Z['c7'] - 0.034), 0.014, 0.012),
        ((x(SHOULDER_X * 0.60), -0.046, Z['c7'] - 0.044), 0.014, 0.012),
        ((sh[0] * 0.94, -0.022, sh[2] + 0.016), 0.014, 0.012),
    ])

    # ---------------- chest -------------------------------------------------
    # Pectoralis major: clavicle + sternum → intertubercular groove of the humerus.
    # Three heads, each running from its own origin to the SAME insertion on
    # the humerus — which is why a flat press and an incline press load the
    # chest differently, and why one tube could never show it.
    ins = (sh[0] * 0.80, -0.040, sh[2] - 0.034)
    add(name='pectoralis_major', group='chest', paths=[
        [((x(0.024), -0.066, Z['c7'] - 0.036), 0.024, 0.013),     # clavicular head
         ((x(0.052), -0.080, Z['nipple'] + 0.036), 0.030, 0.016),
         (ins, 0.024, 0.018)],
        [((x(0.020), -0.072, Z['nipple'] + 0.014), 0.026, 0.014),  # sternocostal, upper
         ((x(0.058), -0.082, Z['nipple'] + 0.004), 0.034, 0.018),
         (ins, 0.024, 0.018)],
        [((x(0.020), -0.066, Z['t10'] + 0.030), 0.024, 0.013),     # sternocostal, lower
         ((x(0.056), -0.076, Z['nipple'] - 0.034), 0.032, 0.017),
         (ins, 0.022, 0.017)],
        [((x(0.022), -0.070, Z['nipple'] - 0.014), 0.026, 0.014),   # the belly between them,
         ((x(0.070), -0.074, Z['nipple'] - 0.012), 0.030, 0.016),   # so the sheet is continuous
         (ins, 0.022, 0.017)],
    ])
    add(name='serratus_anterior', group='chest', path=[
        ((x(RIB_X * 0.86), -0.030, Z['t10'] + 0.030), 0.026, 0.026),
        ((x(RIB_X * 0.90), 0.004, Z['nipple'] - 0.010), 0.024, 0.026),
    ])

    # ---------------- shoulder ---------------------------------------------
    # Deltoid, three heads around the glenohumeral joint.
    # All three heads originate at or below the acromion (sh_z + 0.018 is the
    # bone's own top) and converge on the deltoid tuberosity a third of the way
    # down the humerus. v4 stacked them ABOVE the acromion — shoulder pads.
    delt_ins = _lerp(sh, el, 0.46)
    add(name='deltoid_anterior', group='front-delts', path=[
        ((sh[0] * 0.86, -0.046, sh[2] + 0.014), 0.026, 0.022),   # lateral third of the clavicle
        ((sh[0] * 1.00, -0.028, sh[2] - 0.026), 0.030, 0.026),
        (delt_ins, 0.024, 0.022),
    ])
    add(name='deltoid_lateral', group='side-delts', path=[
        ((sh[0] * 1.02, -0.002, sh[2] + 0.018), 0.030, 0.028),   # acromion
        ((sh[0] * 1.10, 0.000, sh[2] - 0.030), 0.034, 0.032),
        (delt_ins, 0.026, 0.024),
    ])
    add(name='deltoid_posterior', group='rear-delts', path=[
        ((sh[0] * 0.88, 0.040, sh[2] + 0.010), 0.026, 0.022),    # spine of the scapula
        ((sh[0] * 1.00, 0.026, sh[2] - 0.028), 0.028, 0.026),
        (delt_ins, 0.022, 0.021),
    ])
    # the axilla — without it the arm and the ribcage never meet and the remesh
    # leaves a hole under each shoulder (the dark gaps in v4)
    add(name='axilla', group='frame', path=[
        ((sh[0] * 0.62, 0.004, sh[2] - 0.030), 0.034, 0.040),
        ((sh[0] * 0.86, 0.006, sh[2] - 0.052), 0.030, 0.036),
    ])

    # ---------------- upper arm --------------------------------------------
    add(name='biceps_brachii', group='biceps', path=[
        (_lerp(sh, el, 0.16), 0.030, 0.030),
        (_lerp(sh, el, 0.46), 0.038, 0.036),   # the peak
        (_lerp(sh, el, 0.80), 0.026, 0.026),
        ((el[0], el[1] - 0.020, el[2] - 0.020), 0.018, 0.018),
    ])
    add(name='triceps_brachii', group='triceps', path=[
        ((sh[0] * 0.96, 0.034, sh[2] - 0.050), 0.032, 0.030),   # long head, from the scapula
        (_lerp(sh, el, 0.46), 0.038, 0.036),                    # lateral + long bellies
        (_lerp(sh, el, 0.82), 0.030, 0.028),
        ((el[0], el[1] + 0.022, el[2] + 0.004), 0.022, 0.022),  # olecranon
    ])
    add(name='brachialis', group='biceps', path=[
        (_lerp(sh, el, 0.66), 0.030, 0.028),
        (_lerp(sh, el, 0.92), 0.024, 0.024),
    ])

    # ---------------- forearm ----------------------------------------------
    add(name='forearm_flexors', group='forearms', path=[
        (_lerp(el, wr, 0.10), 0.036, 0.034),
        (_lerp(el, wr, 0.34), 0.032, 0.030),
        (_lerp(el, wr, 0.72), 0.022, 0.021),
        ((wr[0], wr[1], wr[2] + 0.006), 0.018, 0.017),
    ])
    add(name='brachioradialis', group='forearms', path=[
        (_lerp(sh, el, 0.86), 0.022, 0.020),
        (_lerp(el, wr, 0.26), 0.026, 0.024),
    ])
    add(name='hand', group='forearms', path=[
        ((wr[0], wr[1] + 0.002, wr[2] - 0.030), 0.026, 0.019),
        ((wr[0], wr[1] + 0.004, wr[2] - 0.082), 0.024, 0.017),
    ])

    # ---------------- back --------------------------------------------------
    # The V: broad origin along the thoracolumbar fascia and lower ribs,
    # converging to a narrow insertion in the bicipital groove.
    lat_ins = (sh[0] * 0.80, 0.014, sh[2] - 0.062)
    add(name='latissimus_dorsi', group='lats', paths=[
        [((x(0.026), 0.056, Z['l3'] - 0.030), 0.030, 0.014),
         ((x(RIB_X * 0.72), 0.052, Z['t10'] + 0.010), 0.034, 0.016), (lat_ins, 0.022, 0.018)],
        [((x(0.060), 0.056, Z['l3'] + 0.020), 0.030, 0.014),
         ((x(RIB_X * 0.90), 0.044, Z['nipple'] - 0.020), 0.034, 0.017), (lat_ins, 0.022, 0.018)],
        [((x(RIB_X * 0.80), 0.050, Z['t10'] + 0.040), 0.030, 0.015),
         ((x(RIB_X * 0.94), 0.034, Z['t4'] - 0.014), 0.030, 0.016), (lat_ins, 0.020, 0.017)],
    ])
    add(name='trapezius', group='traps', paths=[
        [((x(0.012), 0.030, Z['c7'] + 0.030), 0.020, 0.014),      # upper: nuchal line → acromion
         ((x(SHOULDER_X * 0.55), 0.020, Z['c7'] - 0.006), 0.026, 0.016),
         ((x(SHOULDER_X * 0.92), 0.012, sh[2] + 0.010), 0.024, 0.015)],
        [((x(0.014), 0.048, Z['t4'] + 0.020), 0.024, 0.013),      # middle: spine → scapular spine
         ((x(SHOULDER_X * 0.70), 0.040, Z['t4'] - 0.004), 0.028, 0.015)],
        [((x(0.014), 0.048, Z['t10'] + 0.030), 0.022, 0.012),     # lower: T12 → scapular spine
         ((x(SHOULDER_X * 0.52), 0.044, Z['t4'] - 0.020), 0.024, 0.013)],
    ])
    add(name='rhomboids', group='rhomboids', path=[
        ((x(0.026), 0.048, Z['t4'] + 0.014), 0.030, 0.018),
        ((x(0.052), 0.050, Z['nipple'] + 0.010), 0.030, 0.018),
    ])
    add(name='infraspinatus_teres', group='rear-delts', path=[
        ((x(RIB_X * 0.72), 0.048, Z['t4'] - 0.006), 0.034, 0.022),
        ((sh[0] * 0.90, 0.030, sh[2] - 0.030), 0.026, 0.020),
    ])
    add(name='erector_spinae', group='lower-back', path=[
        ((x(0.026), 0.050, Z['hip'] + 0.030), 0.026, 0.026),
        ((x(0.026), 0.046, Z['l3'] + 0.020), 0.024, 0.024),
        ((x(0.024), 0.040, Z['t10'] + 0.030), 0.022, 0.022),
    ])

    # ---------------- abdomen ------------------------------------------------
    add(name='rectus_abdominis', group='abs', path=[
        ((x(0.022), -0.074, Z['t10'] + 0.010), 0.026, 0.016),
        ((x(0.022), -0.078, Z['navel'] + 0.020), 0.026, 0.017),
        ((x(0.020), -0.074, Z['navel'] - 0.040), 0.024, 0.016),
        ((x(0.018), -0.062, Z['hip'] - 0.030), 0.022, 0.015),
    ])
    add(name='external_oblique', group='obliques', path=[
        ((x(RIB_X * 0.86), -0.030, Z['t10'] + 0.010), 0.032, 0.026),
        ((x(RIB_X * 0.80), -0.020, Z['navel']), 0.032, 0.026),
        ((x(PELVIS_X * 0.90), -0.020, Z['hip'] - 0.010), 0.028, 0.024),
    ])

    # ---------------- hip / glute -------------------------------------------
    add(name='gluteus_maximus', group='glutes', path=[
        ((x(0.030), 0.070, Z['hip'] + 0.030), 0.048, 0.036),
        ((x(0.062), 0.066, Z['hip'] - 0.010), 0.052, 0.040),
        ((x(0.058), 0.040, Z['hip'] - 0.070), 0.040, 0.034),
    ])
    add(name='gluteus_medius', group='glutes', path=[
        ((x(PELVIS_X * 0.98), 0.030, Z['hip'] + 0.040), 0.034, 0.028),
    ])

    # ---------------- thigh --------------------------------------------------
    add(name='quadriceps', group='quads', path=[
        ((hip[0] * 1.10, -0.030, hip[2] - 0.020), 0.048, 0.044),   # rectus femoris origin
        (_lerp(hip, kne, 0.36), 0.056, 0.050),                     # vastus bellies
        (_lerp(hip, kne, 0.68), 0.050, 0.046),
        ((kne[0], kne[1] - 0.016, kne[2] + 0.030), 0.040, 0.038),  # above the patella
    ])
    add(name='vastus_medialis', group='quads', path=[
        ((_lerp(hip, kne, 0.74)[0] - side * 0.022, -0.024, _lerp(hip, kne, 0.76)[2]), 0.032, 0.030),
        ((kne[0] - side * 0.020, -0.014, kne[2] + 0.040), 0.028, 0.026),
    ])
    add(name='hamstrings', group='hamstrings', path=[
        ((hip[0] * 0.96, 0.052, hip[2] - 0.040), 0.042, 0.038),
        (_lerp(hip, kne, 0.42), 0.046, 0.042),
        (_lerp(hip, kne, 0.78), 0.038, 0.034),
        ((kne[0], kne[1] + 0.024, kne[2] + 0.026), 0.030, 0.028),
    ])
    add(name='adductors', group='adductors', path=[
        ((hip[0] * 0.52, 0.006, hip[2] - 0.030), 0.036, 0.034),
        ((_lerp(hip, kne, 0.44)[0] * 0.72, 0.004, _lerp(hip, kne, 0.44)[2]), 0.036, 0.034),
        ((_lerp(hip, kne, 0.80)[0] * 0.84, 0.004, _lerp(hip, kne, 0.80)[2]), 0.028, 0.026),
    ])

    # ---------------- lower leg ---------------------------------------------
    add(name='gastrocnemius', group='calves', path=[
        ((kne[0] - side * 0.014, 0.030, kne[2] - 0.030), 0.032, 0.030),  # medial head
        ((kne[0] + side * 0.014, 0.030, kne[2] - 0.030), 0.030, 0.028),  # lateral head
        (_lerp(kne, ank, 0.30), 0.042, 0.040),
        (_lerp(kne, ank, 0.56), 0.032, 0.030),
    ])
    add(name='soleus', group='calves', path=[
        (_lerp(kne, ank, 0.50), 0.034, 0.032),
        (_lerp(kne, ank, 0.74), 0.026, 0.024),
    ])
    add(name='tibialis_anterior', group='calves', path=[
        (_lerp(kne, ank, 0.26), 0.024, 0.024),
        (_lerp(kne, ank, 0.66), 0.020, 0.020),
    ])
    # The ankle overlaps the shin above it and the foot below, or the remesh
    # leaves the foot floating — which is exactly what v2 and v3 did.
    add(name='ankle', group='frame', path=[
        (_lerp(kne, ank, 0.86), 0.030, 0.030),
        ((ank[0], ank[1] + 0.004, ank[2] + 0.004), 0.028, 0.028),
    ])
    add(name='foot', group='frame', path=[
        ((ank[0], ank[1] - 0.020, ank[2] - 0.004), 0.030, 0.026),   # heel, behind the ankle
        ((ank[0], ank[1] + 0.030, ank[2] - 0.028), 0.038, 0.028),
        ((ank[0], ank[1] + 0.100, ank[2] - 0.038), 0.038, 0.022),
        ((ank[0], ank[1] + 0.155, ank[2] - 0.040), 0.030, 0.016),
    ])
    add(name='knee', group='frame', path=[      # bridges thigh and shin
        (_lerp(hip, kne, 0.90), 0.044, 0.044),
        ((kne[0], kne[1] - 0.004, kne[2]), 0.042, 0.044),
        (_lerp(kne, ank, 0.10), 0.040, 0.042),
    ])
    for m in M:
        m['side'] = side
    return M


def all_muscles():
    out = []
    for s in (1, -1):
        for m in build(s):
            # midline structures are built once, on the left pass only
            if m['group'] == 'frame' and m['name'] in ('ribcage', 'pelvis', 'abdomen', 'neck', 'cranium') and s == -1:
                continue
            out.append(m)
    return out


# The groups the app highlights, in the order an anatomy chart lists them.
GROUPS = ['chest', 'front-delts', 'side-delts', 'rear-delts', 'biceps', 'triceps',
          'forearms', 'abs', 'obliques', 'lats', 'traps', 'rhomboids', 'lower-back',
          'glutes', 'quads', 'hamstrings', 'adductors', 'calves', 'frame']

# How much a trained lifter carries at each site, in metres of surface added to
# an average male base mesh. These are hypertrophy differences, not invention:
# a trained deltoid and quadriceps add the most visible mass, the frame adds
# none, and a muscle Nova cannot see the point of growing does not grow.
GAIN = {
    'chest': 0.013, 'front-delts': 0.011, 'side-delts': 0.013, 'rear-delts': 0.009,
    'biceps': 0.010, 'triceps': 0.011, 'forearms': 0.006, 'abs': 0.004, 'obliques': 0.003,
    'lats': 0.013, 'traps': 0.010, 'rhomboids': 0.006, 'lower-back': 0.006,
    'glutes': 0.010, 'quads': 0.014, 'hamstrings': 0.011, 'adductors': 0.006,
    'calves': 0.010, 'frame': 0.0,
}


def muscle_gain(m):
    return GAIN.get(m.get('group'), 0.0)
