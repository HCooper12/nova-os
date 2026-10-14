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
J['headtop'] = Vector((0, J['neck'].y + 0.02, max(p.z for o in meshes for p in [o.matrix_world @ Vector(c) for c in o.bound_box])))
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

for o in meshes:
    side = 'l' if o.name.endswith('.l') else 'r' if o.name.endswith('.r') else None
    allowed = SIDE_BONES[side] if side else SIDE_BONES['l'] & SIDE_BONES['r']
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
        for v in o.data.vertices:
            p = mw @ v.co
            d = sorted((seg_dist(p, *segs[n]), n) for n in allowed)[:2]
            w0 = 1 / (d[0][0] + 0.004) ** 4
            w1 = 1 / (d[1][0] + 0.004) ** 4
            groups[d[0][1]].add([v.index], w0 / (w0 + w1), 'REPLACE')
            groups[d[1][1]].add([v.index], w1 / (w0 + w1), 'REPLACE')
    mod = o.modifiers.new('rig', 'ARMATURE')
    mod.object = arm
    o.parent = arm
    o.matrix_parent_inverse = arm.matrix_world.inverted()
print('SKINNED', len(meshes))
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('SAVED', OUT)
