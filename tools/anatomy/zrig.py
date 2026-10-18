"""A RIG FOR Z-ANATOMY (15 Oct 2026, the Lyfta pilot, step 2).

Z-Anatomy ships no armature. This builds one whose joints are MEASURED from
its own skeleton (the hip at the femoral head, the knee between the condyles,
the ankle at the talus...) — the lesson the first anatomy model paid for: a
joint sits where the mesh says, never where a guess puts it. Then it skins:

  - every skeleton piece follows ONE rig bone, rigidly (bone does not bend)
  - every muscle vertex blends its two nearest rig bones by distance, only
    among bones on its own side of the body, so a quad crosses the knee
    smoothly and a left muscle never follows the right leg

    blender -b ~/.cache/nova-anatomy/zanatomy/figure.blend \\
        --python tools/anatomy/zrig.py -- --out ~/.cache/nova-anatomy/zanatomy/rigged.blend

Z-Anatomy (Kervyn, Zielinski; from BodyParts3D, DBCLS), CC BY-SA 4.0.
"""
import bpy, sys, re
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[argv.index('--out') + 1]

SHEET = re.compile(r'fascia|aponeuros|retinacul|sheath|iliotibial tract|galea|epicranial', re.I)
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('kind') in ('muscle', 'bone')
          and re.search(r'\.(l|r)$', o.name) or (o.type == 'MESH' and o.get('kind') and o.name.endswith('.j') and len(o.data.vertices) > 50)]
meshes = [o for o in meshes if not SHEET.search(o.name)]
ob = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}

# Z-ANATOMY'S LEFT SIDE IS THE RIGHT SIDE MIRRORED: each `.l` object shares its
# `.r` twin's mesh, flipped by a -1 X scale. Vertex weights live IN the mesh,
# so skinning one side overwrote the other's: the left hand followed the RIGHT
# arm and hung at knee height through the squat (loop v3, 18 Oct). Every
# piece gets its own mesh with its transform baked in; the mirrored ones get
# their normals flipped back, or they render inside out.
from mathutils import Matrix as _M
# SOME PIECES ARE PARENTED to others (the inguinal ligament to the external
# oblique). Baking a parent moved every child a second time: the ligament
# landed a metre in front of the body (loop v6, 18 Oct). Unparent everything
# first, keeping each piece exactly where it is, then bake.
worlds = {o.name: o.matrix_world.copy() for o in bpy.data.objects if o.type == 'MESH'}
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent is not None:
        o.parent = None
        o.matrix_world = worlds[o.name]
bpy.context.view_layer.update()
for o in meshes:
    if o.data.users > 1:
        o.data = o.data.copy()
    mw = o.matrix_world.copy()
    o.data.transform(mw)
    if mw.determinant() < 0:
        o.data.flip_normals()
    o.matrix_world = _M.Identity(4)
# a copied mesh's cached bounding box reads empty until Blender refreshes it;
# measured from it, the head's top fell to the floor and the head bone ran
# down through the whole body, claiming knees and ribs (loop v4, 18 Oct)
bpy.context.view_layer.update()

def verts(name):
    o = ob[name]
    return [o.matrix_world @ v.co for v in o.data.vertices]

def centroid(ps):
    return sum(ps, Vector()) / len(ps)

def end(name, top=True, band=0.03, medial=None):
    """Centroid of a bone's highest (top) or lowest vertices, optionally only
    its medial half (the femoral head is medial to the trochanter)."""
    ps = verts(name)
    z = max(p.z for p in ps) if top else min(p.z for p in ps)
    sel = [p for p in ps if (p.z >= z - band if top else p.z <= z + band)]
    if medial is not None:
        cx = centroid(ps).x
        sel = [p for p in sel if (p.x < cx if medial == 'l' else p.x > cx)] or sel
    return centroid(sel)

J = {}
for s in ('l', 'r'):
    S = s.upper()
    J['hip' + S] = end(f'Femur.{s}', top=True, band=0.035, medial=s)
    J['knee' + S] = end(f'Femur.{s}', top=False, band=0.03)
    J['ankle' + S] = centroid(verts(f'Talus.{s}'))
    toes = verts(f'Second metatarsal bone.{s}')
    J['toe' + S] = min(toes, key=lambda p: p.y)
    J['shoulder' + S] = end(f'Humerus.{s}', top=True, band=0.03)
    J['elbow' + S] = end(f'Humerus.{s}', top=False, band=0.025)
    J['wrist' + S] = centroid(verts(f'Capitate bone.{s}'))
    mc = verts(f'Third metacarpal bone.{s}')
    J['hand' + S] = min(mc, key=lambda p: p.z)
    cl = verts(f'Clavicle.{s}')
    J['clav' + S] = min(cl, key=lambda p: abs(p.x))
J['pelvis'] = (J['hipL'] + J['hipR']) / 2
J['chest'] = Vector((0, J['shoulderL'].y * 0.5, (J['clavL'].z + J['pelvis'].z) / 2 + 0.12))
J['neck'] = Vector((0, (J['clavL'].y + J['clavR'].y) / 2 + 0.03, (J['clavL'].z + J['clavR'].z) / 2))
J['headbase'] = Vector((0, J['neck'].y + 0.02, J['neck'].z + 0.13))
J['headtop'] = Vector((0, J['neck'].y + 0.02, max(max(v.co.z for v in o.data.vertices) for o in meshes if len(o.data.vertices))))
assert J['headtop'].z > J['headbase'].z + 0.1, 'the head top is not above the head base'
for k, v in J.items():
    print('JOINT', k, tuple(round(x, 3) for x in v))

# the armature, bones named the way the motion script expects
arm_d = bpy.data.armatures.new('zrig')
arm = bpy.data.objects.new('zrig', arm_d)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones
def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = head, tail
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b
bone('pelvis', J['pelvis'], J['pelvis'] + Vector((0, 0, 0.1)))
bone('spine', J['pelvis'] + Vector((0, 0, 0.1)), J['chest'], 'pelvis', True)
bone('chest', J['chest'], J['neck'], 'spine', True)
bone('neck', J['neck'], J['headbase'], 'chest', True)
bone('head', J['headbase'], J['headtop'], 'neck', True)
for S in ('L', 'R'):
    bone('thigh' + S, J['hip' + S], J['knee' + S], 'pelvis')
    bone('shin' + S, J['knee' + S], J['ankle' + S], 'thigh' + S, True)
    bone('foot' + S, J['ankle' + S], J['toe' + S], 'shin' + S, True)
    bone('clavicle' + S, J['clav' + S], J['shoulder' + S], 'chest')
    bone('upperarm' + S, J['shoulder' + S], J['elbow' + S], 'clavicle' + S, True)
    bone('forearm' + S, J['elbow' + S], J['wrist' + S], 'upperarm' + S, True)
    bone('hand' + S, J['wrist' + S], J['hand' + S], 'forearm' + S, True)
segs = {b.name: (b.head.copy(), b.tail.copy()) for b in eb}
bpy.ops.object.mode_set(mode='OBJECT')

SIDE_BONES = {
    'l': {'pelvis', 'spine', 'chest', 'neck', 'head', 'thighL', 'shinL', 'footL', 'clavicleL', 'upperarmL', 'forearmL', 'handL'},
    'r': {'pelvis', 'spine', 'chest', 'neck', 'head', 'thighR', 'shinR', 'footR', 'clavicleR', 'upperarmR', 'forearmR', 'handR'},
}

def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length

# REGION BY NAME, not by distance. In the rest pose the hands hang beside
# the thighs, so "nearest rig bone" gave finger bones to the thigh and a hand
# floated at knee height through the squat (loop v2, 15 Oct). A hand piece may
# only follow the forearm or hand; a foot piece only the shin or foot.
FOOT = re.compile(r'of foot|toe|hallucis|metatars|tarsal|cuneiform|cuboid|navicular|calcane|talus|plantar|dorsal interossei muscles of foot', re.I)
HAND = re.compile(r'finger|thumb|pollicis|metacarp|carpal|scaphoid|lunate|triquetr|pisiform|trapezium|trapezoid|capitate|hamate|of hand|palmar|lumbrical muscles of hand|interossei muscles of hand|digiti minimi muscle of hand', re.I)

for o in meshes:
    side = 'l' if o.name.endswith('.l') else 'r' if o.name.endswith('.r') else None
    allowed = SIDE_BONES[side] if side else SIDE_BONES['l'] & SIDE_BONES['r']
    trunk_arm = None
    if side and re.search(r'infraspinatus|supraspinatus|teres|subscapularis', o.name, re.I):
        # shoulder blade to arm: the rig has no scapula bone, and the clavicle
        # moves with the blade; on chest + arm they stretched 2.1x arms-up
        allowed = {'clavicle' + side.upper(), 'upperarm' + side.upper()}
    elif side and re.search(r'trapezius', o.name, re.I):
        # neck, spine and the shoulder girdle, never the arm: dragged by the
        # upper arm it crumpled into a hood arms-up (2.1x, 19 Oct)
        allowed = {'neck', 'chest', 'spine', 'clavicle' + side.upper()}   # the lower part reaches T12
    elif re.search(r'serratus posterior', o.name, re.I):
        allowed = {'spine', 'chest'}          # spine to ribs
    elif re.search(r'scalenus|scalene', o.name, re.I):
        # neck vertebrae to the first ribs, never the collarbone: weighted to
        # the clavicle it stretched 2.3x when the tracked shoulders moved
        allowed = {'neck', 'chest'}
    elif re.search(r'inguinal ligament', o.name, re.I):
        # pelvis to pelvis (anterior iliac spine to pubic tubercle): blended
        # toward the thigh it stretched 4.6x in a deep squat (loop v6 check)
        allowed = {'pelvis'}
    elif side and FOOT.search(o.name):
        allowed = {'shin' + side.upper(), 'foot' + side.upper()}
    elif side and HAND.search(o.name):
        allowed = {'forearm' + side.upper(), 'hand' + side.upper()}
    else:
        # nothing below the waist follows an arm: in the rest pose the hands
        # hang by the groin, and the inguinal ligament, weighted partly to the
        # hand, stretched to six times its length up to the bar (loop v5)
        n_ = max(1, len(o.data.vertices))
        cz = sum((v.co.z for v in o.data.vertices), 0.0) / n_
        cx = abs(sum((v.co.x for v in o.data.vertices), 0.0) / n_)
        # the body's own column only: the hanging forearms are also below the
        # waist in the rest pose, and cutting them off the arm left the left
        # forearm's muscles hanging by the hip at the bottom (loop v7)
        if cz < 1.05 and cx < 0.19:
            allowed = {n for n in allowed if not re.match(r'(upperarm|forearm|hand|clavicle)', n)}
        # a TRUNK piece reaching the arm (latissimus, pectoralis, serratus):
        # the arms hang beside it at rest, so its waist edge sat nearest the
        # forearm and flew out with it as a wing when the arms rose to the bar
        # (sheet v9, 19 Oct). It follows the upper arm only near the joint.
        elif side and cx < 0.16:
            trunk = {n for n in allowed if not re.match(r'(upperarm|forearm|hand)', n)}
            trunk_arm = (segs['upperarm' + side.upper()][0], trunk)
            allowed = trunk | {'upperarm' + side.upper()}
    mw = o.matrix_world
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    groups = {n: o.vertex_groups.new(name=n) for n in allowed}
    if o.get('kind') == 'bone':
        # rigid: the whole piece follows the bone nearest its centre
        c = mw @ centroid([v.co for v in o.data.vertices])
        best = min(allowed, key=lambda n: seg_dist(c, *segs[n]))
        groups[best].add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    else:
        def blend(p, bones):
            d = sorted((seg_dist(p, *segs[n]), n) for n in bones)[:2]
            if len(d) == 1:   # pinned to one bone (the inguinal ligament)
                return {d[0][1]: 1.0}
            w0 = 1 / (d[0][0] + 0.004) ** 4
            w1 = 1 / (d[1][0] + 0.004) ** 4
            return {d[0][1]: w0 / (w0 + w1), d[1][1]: w1 / (w0 + w1)}
        for v in o.data.vertices:
            p = mw @ v.co
            w = blend(p, allowed)
            if trunk_arm:
                # all arm within 7 cm of the shoulder joint, none past 15 cm
                t = max(0.0, min(1.0, ((p - trunk_arm[0]).length - 0.07) / 0.08))
                f = 1 - t * t * (3 - 2 * t)
                wt = blend(p, trunk_arm[1])
                w = {n: f * w.get(n, 0.0) + (1 - f) * wt.get(n, 0.0) for n in set(w) | set(wt)}
            for n, x in w.items():
                if x > 0:
                    groups[n].add([v.index], x, 'REPLACE')
    mod = o.modifiers.new('rig', 'ARMATURE')
    mod.object = arm
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
print('SKINNED', len(meshes))
# every skinned piece must sit at its true place with a clean transform: a
# piece that does not (a parent moved it, a mirror survived) deforms off the
# body. Fail the rig rather than render it.
bpy.context.view_layer.update()
_bad = [o.name for o in meshes if o.parent is not arm or any(abs(o.matrix_basis[i][j] - (1 if i == j else 0)) > 1e-4 for i in range(4) for j in range(4))]
assert not _bad, f'pieces off their true place: {_bad[:5]}'
# the hanging arms (rest pose): every piece out there must follow an arm bone,
# or it stays down by the hip while the arm goes up (loop v7's left forearm)
def _rest_c(o):
    n_ = max(1, len(o.data.vertices))
    return (sum((v.co.x for v in o.data.vertices), 0.0) / n_, sum((v.co.z for v in o.data.vertices), 0.0) / n_)
_arm_less = []
for o in meshes:
    cx, cz = _rest_c(o)
    if abs(cx) > 0.21 and 0.6 < cz < 1.2:
        used = {g.name for g in o.vertex_groups}
        if not any(re.match(r'(upperarm|forearm|hand)', n) for n in used):
            _arm_less.append(o.name)
assert not _arm_less, f'arm pieces not on an arm bone: {_arm_less[:5]}'
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('SAVED', OUT)
