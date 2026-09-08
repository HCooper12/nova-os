"""Grow the body from its muscles, rig it, segment it, export it.

    blender -b --python tools/anatomy/build.py -- --out DIR [--voxel 0.010]

The pipeline, in order:
  1. every muscle in `muscles.py` becomes a chain of metaball ellipsoids along
     its path — metaballs because muscle bellies BLEND, and a deltoid that
     butts against an arm is the mannequin problem all over again;
  2. the field is converted to a mesh and voxel-remeshed into one continuous
     watertight surface with even topology;
  3. each vertex is attributed to the nearest muscle path, giving a per-muscle
     vertex group AND a material slot — the anatomy chart is the body itself;
  4. an armature is built from `skeleton.py` and bound with automatic weights;
  5. exported as .glb for three.js.
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import skeleton as SK            # noqa: E402
from muscles import all_muscles, GROUPS  # noqa: E402

DEFAULT_VOXEL = 0.008   # finer: 0.010 + heavy smoothing melted the neck into the shoulders

# The palette the app tints with — matched to the Command Core tokens so a
# highlighted muscle reads as Nova, not as a medical illustration.
GROUP_COLOUR = {
    'chest': (0.86, 0.36, 0.44), 'front-delts': (0.92, 0.52, 0.30), 'side-delts': (0.94, 0.62, 0.26),
    'rear-delts': (0.80, 0.46, 0.34), 'biceps': (0.72, 0.40, 0.62), 'triceps': (0.52, 0.44, 0.78),
    'forearms': (0.60, 0.52, 0.70), 'abs': (0.84, 0.52, 0.40), 'obliques': (0.78, 0.48, 0.38),
    'lats': (0.42, 0.56, 0.80), 'traps': (0.46, 0.62, 0.74), 'rhomboids': (0.40, 0.58, 0.68),
    'lower-back': (0.44, 0.50, 0.66), 'glutes': (0.70, 0.44, 0.52), 'quads': (0.56, 0.46, 0.74),
    'hamstrings': (0.48, 0.42, 0.66), 'adductors': (0.52, 0.44, 0.60), 'calves': (0.44, 0.60, 0.62),
    'frame': (0.62, 0.60, 0.60),
}


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


RING = 16   # cross-section resolution per muscle tube


def _frame(axis):
    """A stable side/front pair perpendicular to a path direction."""
    axis = axis.normalized()
    up = Vector((0, 0, 1))
    if abs(axis.dot(up)) > 0.995:
        up = Vector((0, 1, 0))
    side = axis.cross(up).normalized()
    front = side.cross(axis).normalized()
    return side, front


def muscle_paths(m):
    """A muscle may be several strands. Sheet muscles — pectoralis, latissimus,
    trapezius — are not tubes: each has distinct heads running in different
    directions, and modelling them as one tube produced ropes lying on the
    chest. Strands fuse into a sheet in the remesh, which is what they are."""
    return m['paths'] if 'paths' in m else [m['path']]


def muscle_mesh(m):
    """One muscle → an elliptical tube along its path.

    Metaballs were tried first and rejected: their influence field is
    spherical, so every semi-axis became the largest one and the torso came
    out a barrel. A loft says exactly what the anatomy table says.
    """
    bm = bmesh.new()
    path = list(m['_strand'])
    if len(path) == 1:   # a single round belly (gluteus medius) still needs a segment
        (c, a, b) = path[0]
        path = [((c[0], c[1], c[2] - b * 0.35), a, b), ((c[0], c[1], c[2] + b * 0.35), a, b)]
    # resample so bends stay smooth and the ends are rounded, not cut off
    pts = []
    for k in range(len(path) - 1):
        (p0, a0, b0), (p1, a1, b1) = path[k], path[k + 1]
        seg = Vector(p1) - Vector(p0)
        steps = max(2, int(seg.length / 0.012))
        for s in range(steps + (1 if k == len(path) - 2 else 0)):
            t = s / steps
            pts.append((Vector(p0).lerp(Vector(p1), t), a0 + (a1 - a0) * t, b0 + (b1 - b0) * t))
    # taper the two ends into domes so a belly has an origin and an insertion
    head_p, head_a, head_b = pts[0]
    tail_p, tail_a, tail_b = pts[-1]
    d0 = (pts[1][0] - head_p).normalized() if len(pts) > 1 else Vector((0, 0, 1))
    d1 = (tail_p - pts[-2][0]).normalized() if len(pts) > 1 else Vector((0, 0, 1))
    pre = [(head_p - d0 * (head_a * f), head_a * math.sqrt(max(0.0, 1 - f * f)), head_b * math.sqrt(max(0.0, 1 - f * f)))
           for f in (0.85, 0.55)]
    post = [(tail_p + d1 * (tail_a * f), tail_a * math.sqrt(max(0.0, 1 - f * f)), tail_b * math.sqrt(max(0.0, 1 - f * f)))
            for f in (0.55, 0.85)]
    pts = pre + pts + post

    rings = []
    n = len(pts)
    for k, (c, a, b) in enumerate(pts):
        prev = pts[max(0, k - 1)][0]
        nxt = pts[min(n - 1, k + 1)][0]
        axis = nxt - prev
        if axis.length < 1e-7:
            axis = Vector((0, 0, 1))
        side, front = _frame(axis)
        rings.append([c + side * (a * math.cos(2 * math.pi * i / RING)) + front * (b * math.sin(2 * math.pi * i / RING))
                      for i in range(RING)])
    vr = [[bm.verts.new(p) for p in r] for r in rings]
    for r0, r1 in zip(vr, vr[1:]):
        for i in range(RING):
            j = (i + 1) % RING
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(list(reversed(vr[0])))
    bm.faces.new(vr[-1])
    me = bpy.data.meshes.new(m['name'])
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(f"{m['name']}_{'L' if m['side'] > 0 else 'R'}", me)
    bpy.context.collection.objects.link(ob)
    return ob


def grow_field(muscles, resolution=0.006):
    """Every strand of every muscle as a tube, joined for the remesh."""
    objs = []
    for m in muscles:
        for strand in muscle_paths(m):
            objs.append(muscle_mesh({**m, '_strand': strand}))
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = 'field'
    return ob


def to_mesh(field, voxel):
    """Fuse the tubes into one continuous watertight surface.

    Voxel remesh is what makes a deltoid FLOW into an arm instead of butting
    against it — the join that made the first figure read as a mannequin.
    """
    bpy.context.view_layer.objects.active = field
    for o in bpy.context.selected_objects:
        o.select_set(False)
    field.select_set(True)
    m = field.modifiers.new('remesh', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    sm = field.modifiers.new('smooth', 'SMOOTH')
    sm.factor = 0.35
    sm.iterations = 2      # v4/v5 used 4 and the head fused into a cowl — smoothing
                           # blends seams, but past two passes it erases anatomy
    bpy.ops.object.modifier_apply(modifier=sm.name)
    field.name = 'body'
    return field


def segment(ob, muscles):
    """Attribute every vertex to the muscle whose path it is nearest.

    Distance is to the path's line segments, scaled by the local radius, so a
    thick belly claims the surface over it and a thin one does not steal
    territory it does not occupy.
    """
    samples = []          # (point, radius, muscle_index)
    for mi, m in enumerate(muscles):
      for path in muscle_paths(m):
        if len(path) == 1:
            (c, a, b) = path[0]
            samples.append((Vector(c), (a + b) * 0.5, mi))
            continue
        for k in range(len(path) - 1):
            (p0, r0a, r0b), (p1, r1a, r1b) = path[k], path[k + 1]
            seg = Vector(p1) - Vector(p0)
            steps = max(2, int(seg.length / 0.010))
            for s in range(steps + 1):
                t = s / steps
                samples.append((Vector(p0).lerp(Vector(p1), t),
                                (r0a + (r1a - r0a) * t + r0b + (r1b - r0b) * t) * 0.5, mi))

    groups = {}
    for g in GROUPS:
        groups[g] = ob.vertex_groups.new(name=g)
    per_muscle = {}
    for m in muscles:
        key = f"{m['name']}.{'L' if m['side'] > 0 else 'R'}"
        per_muscle[key] = ob.vertex_groups.new(name=key)

    assign_group = {g: [] for g in GROUPS}
    assign_muscle = {k: [] for k in per_muscle}
    for v in ob.data.vertices:
        best, best_d = None, 1e9
        for (p, r, mi) in samples:
            d = (v.co - p).length - r      # signed distance to the belly surface
            if d < best_d:
                best_d, best = d, mi
        m = muscles[best]
        assign_group[m['group']].append(v.index)
        assign_muscle[f"{m['name']}.{'L' if m['side'] > 0 else 'R'}"].append(v.index)
    for g, idx in assign_group.items():
        if idx:
            groups[g].add(idx, 1.0, 'REPLACE')
    for k, idx in assign_muscle.items():
        if idx:
            per_muscle[k].add(idx, 1.0, 'REPLACE')

    # material slot per group, so three.js can tint by group without shader work
    slot_of = {}
    for g in GROUPS:
        mat = bpy.data.materials.new(f'mus_{g}')
        mat.use_nodes = True
        b = mat.node_tree.nodes['Principled BSDF']
        c = GROUP_COLOUR[g]
        b.inputs['Base Color'].default_value = (*c, 1.0)
        b.inputs['Roughness'].default_value = 0.62
        ob.data.materials.append(mat)
        slot_of[g] = len(ob.data.materials) - 1
    vert_group = {}
    for g, idx in assign_group.items():
        for i in idx:
            vert_group[i] = g
    for poly in ob.data.polygons:
        gs = [vert_group.get(i) for i in poly.vertices]
        gs = [g for g in gs if g]
        if not gs:
            continue
        poly.material_index = slot_of[max(set(gs), key=gs.count)]
    return ob


def build_rig(body):
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = 'rig'
    eb = arm.data.edit_bones
    eb.remove(eb[0])
    made = {}
    for name, parent, head, tail in SK.BONES:
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent and parent in made:
            b.parent = made[parent]
            b.use_connect = False
        made[name] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.selected_objects:
        o.select_set(False)
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    return arm


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else '/tmp/anat'
    voxel = float(argv[argv.index('--voxel') + 1]) if '--voxel' in argv else DEFAULT_VOXEL
    rig = '--norig' not in argv
    os.makedirs(out, exist_ok=True)

    wipe()
    muscles = all_muscles()
    field = grow_field(muscles)
    body = to_mesh(field, voxel)
    segment(body, muscles)
    if rig:
        build_rig(body)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'body.blend'))
    print(f'BUILT muscles={len(muscles)} verts={len(body.data.vertices)} faces={len(body.data.polygons)}')


if __name__ == '__main__':
    main()
