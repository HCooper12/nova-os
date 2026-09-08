"""Anthropometry for the model — one table, sourced from measured norms, so the
body is a real physique rather than a designer's guess.

Target: a lean, trained adult male ~180 cm, ~80 kg, the physique Hayden is
training toward. Circumferences are in centimetres at the anatomical landmark
named; the builder converts them to elliptical cross-sections with the
breadth:depth ratios measured for that site (a chest is wide and shallow, a
thigh is nearly round, a calf is deep and narrow).

Sources for the ratios: ANSUR II male anthropometry (US Army, 2012) for
segment lengths and circumferences; Drillis & Contini segment-length fractions
of stature for joint centres. Both are population data, not idealisation.
"""

STATURE_CM = 180.0

# Drillis & Contini fractions of stature → joint centre heights (metres)
H = STATURE_CM / 100.0
JOINT_H = {
    'floor':        0.000 * H,
    'ankle':        0.039 * H,
    'knee':         0.285 * H,
    'hip':          0.530 * H,
    'navel':        0.600 * H,
    'lumbar':       0.630 * H,   # L3-ish, where the hinge happens
    'thorax':       0.720 * H,   # T10, bottom of the ribcage
    'nipple':       0.760 * H,
    'shoulder':     0.818 * H,   # glenohumeral centre
    'c7':           0.860 * H,
    'chin':         0.870 * H,
    'head_top':     1.000 * H,
}
# Widths (metres, half-width from the midline unless noted)
BIACROMIAL = 0.410 * H / 2      # shoulder joint centre offset from midline
HIP_OFFSET = 0.095 * H / 2      # hip joint centre offset
ELBOW_DROP = 0.186 * H          # shoulder → elbow
WRIST_DROP = 0.146 * H          # elbow → wrist
HAND_LEN   = 0.108 * H

# Circumferences (cm) for the target physique — trained but not inflated
CIRC = {
    'neck': 39.0,
    'chest': 104.0,        # at the nipple line, arms down
    'waist': 82.0,         # at the navel
    'hip': 98.0,           # at the greater trochanter
    'upper_arm': 36.5,     # mid-humerus, relaxed
    'elbow': 27.0,
    'forearm': 30.0,       # max, just below the elbow
    'wrist': 17.5,
    'thigh': 59.0,         # mid-thigh
    'knee': 38.0,
    'calf': 39.0,          # max
    'ankle': 23.0,
}
# breadth : depth at each site (a chest is an ellipse, not a circle)
RATIO = {
    'neck': 1.05, 'chest': 1.42, 'waist': 1.28, 'hip': 1.32,
    'upper_arm': 1.0, 'elbow': 1.05, 'forearm': 1.05, 'wrist': 1.25,
    'thigh': 1.03, 'knee': 1.05, 'calf': 0.92, 'ankle': 1.15,
}

def semi_axes(site):
    """circumference + breadth:depth ratio → (half-breadth, half-depth) in metres."""
    import math
    c = CIRC[site] / 100.0
    r = RATIO[site]
    # Ramanujan's ellipse perimeter, solved for the semi-axes at that ratio
    b = 1.0
    a = r
    h = ((a - b) ** 2) / ((a + b) ** 2)
    p_unit = math.pi * (a + b) * (1 + (3 * h) / (10 + math.sqrt(4 - 3 * h)))
    k = c / p_unit
    return a * k, b * k
