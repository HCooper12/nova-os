"""Nova's anatomy model: a real human base mesh, given his physique, segmented
by muscle, rigged, and exported for the app.

    tools/anatomy/fetch_base.sh                 # once — the CC0 base mesh
    blender -b --python tools/anatomy/build.py -- --out DIR

WHY IT IS BUILT THIS WAY. The first figure was capsules on a joint hierarchy —
a mannequin, and Hayden said so. The second attempt lofted muscle volumes
procedurally (`build_procedural.py`, kept for its anatomy work); six iterations
in it read as a human but never as anatomy. The honest conclusion: a body's
topology is not something to derive from a table, it is something to start
from. So the base is Blender's own **Human Base Meshes** bundle — CC0 / public
domain, blender.org/download/demo-files — a 10,582-vertex anatomically modelled
adult male with clean quad topology. This script does the four things that make
it Nova's:

  1. SCALE to his stature (180 cm), feet on the floor, midline centred.
  2. PHYSIQUE: every muscle in `muscles.py` carries a gain — how much a trained
     lifter adds there — and the surface is pushed out along its own normals
     inside each muscle's field. The base is an average male; this is the
     physique he trains toward, grown where muscle actually sits.
  3. SEGMENT: every vertex is attributed to the nearest muscle volume, giving a
     vertex group per muscle AND a material slot per muscle group — so the app
     lights up exactly what a lift trains. The anatomy chart IS the body.
  4. RIG: an armature from `skeleton.py` (joint centres from Drillis & Contini)
     bound with automatic weights, so the same model performs the movement.

Deterministic: same inputs, same body, every run.
"""

import bpy
import os
import sys
from mathutils import Vector, kdtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import skeleton as SK                             # noqa: E402
from muscles import all_muscles, GROUPS, muscle_gain  # noqa: E402

BASE_OBJECT = 'GEO-body_male_realistic'
TARGET_STATURE = SK.STATURE

GROUP_COLOUR = {
    'chest': (0.83, 0.33, 0.42), 'front-delts': (0.90, 0.50, 0.28), 'side-delts': (0.93, 0.60, 0.24),
    'rear-delts': (0.78, 0.44, 0.32), 'biceps': (0.70, 0.38, 0.60), 'triceps': (0.50, 0.42, 0.76),
    'forearms': (0.58, 0.50, 0.68), 'abs': (0.82, 0.50, 0.38), 'obliques': (0.76, 0.46, 0.36),
    'lats': (0.40, 0.54, 0.78), 'traps': (0.44, 0.60, 0.72), 'rhomboids': (0.38, 0.56, 0.66),
    'lower-back': (0.42, 0.48, 0.64), 'glutes': (0.68, 0.42, 0.50), 'quads': (0.54, 0.44, 0.72),
    'hamstrings': (0.46, 0.40, 0.64), 'adductors': (0.50, 0.42, 0.58), 'calves': (0.42, 0.58, 0.60),
    'frame': (0.70, 0.62, 0.56),
}


def base_blend():
    here = os.path.dirname(os.path.abspath(__file__))
    for p in (os.environ.get('NOVA_HBM', ''),
              os.path.join(here, '.cache', 'human_base_meshes_bundle.blend'),
              os.path.expanduser('~/.cache/nova-anatomy/human_base_meshes_bundle.blend')):
        if p and os.path.exists(p):
            return p
    raise SystemExit('base mesh not found — run tools/anatomy/fetch_base.sh first')


def load_base():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = base_blend()
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        if BASE_OBJECT not in src.objects:
            raise SystemExit(f'{BASE_OBJECT} not in {path}')
        dst.objects = [BASE_OBJECT]
    ob = bpy.data.objects[BASE_OBJECT]
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    ob.parent = None
    ob.modifiers.clear()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def normalise(ob):
    """Stature to 180 cm, feet on the floor, midline on x = 0."""
    zs = [v.co.z for v in ob.data.vertices]
    xs = [v.co.x for v in ob.data.vertices]
    s = TARGET_STATURE / (max(zs) - min(zs))
    cx = (max(xs) + min(xs)) / 2
    z0 = min(zs)
    for v in ob.data.vertices:
        v.co.x = (v.co.x - cx) * s
        v.co.y *= s
        v.co.z = (v.co.z - z0) * s
    ob.name = 'nova_body'
    ob.data.name = 'nova_body'
    return ob


def muscle_samples(muscles, step=0.010, surface_only=False):
    """Every muscle volume as a cloud of (point, radius, muscle index).

    `surface_only` drops the deep scaffolding — ribcage, pelvis, abdomen. Those
    exist to give the procedural body its mass; on a real base mesh they sit
    under the skin and, being large, they won a majority of the surface (59% of
    all vertices came out as 'frame' before this). A chest vertex belongs to the
    pectoralis, not to the ribs beneath it.
    """
    pts = []
    for mi, m in enumerate(muscles):
        if surface_only and m.get('deep'):
            continue
        for path in (m['paths'] if 'paths' in m else [m['path']]):
            if len(path) == 1:
                c, a, b = path[0]
                pts.append((Vector(c), (a + b) * 0.5, mi))
                continue
            for k in range(len(path) - 1):
                (p0, a0, b0), (p1, a1, b1) = path[k], path[k + 1]
                seg = Vector(p1) - Vector(p0)
                n = max(2, int(seg.length / step))
                for i in range(n + 1):
                    t = i / n
                    pts.append((Vector(p0).lerp(Vector(p1), t),
                                (a0 + (a1 - a0) * t + b0 + (b1 - b0) * t) * 0.5, mi))
    return pts


def kd_of(samples):
    kd = kdtree.KDTree(len(samples))
    for i, (p, _r, _mi) in enumerate(samples):
        kd.insert(p, i)
    kd.balance()
    return kd


def physique(ob, muscles, samples, kd, strength=1.0):
    """Push the surface out where a trained lifter carries muscle.

    Each vertex moves along its own normal by the gain of the muscle nearest
    it, faded by how far outside that belly it sits — so a deltoid grows a
    deltoid rather than a shoulder-shaped bubble.
    """
    normals = {v.index: v.normal.copy() for v in ob.data.vertices}
    moves = {}
    for v in ob.data.vertices:
        _co, idx, _d = kd.find(v.co)
        p, r, mi = samples[idx]
        gain = muscle_gain(muscles[mi])
        if gain <= 0:
            continue
        outside = max(0.0, (v.co - p).length - r)
        fade = max(0.0, 1.0 - outside / 0.045)
        if fade <= 0:
            continue
        moves[v.index] = normals[v.index] * (gain * fade * strength)
    for i, d in moves.items():
        ob.data.vertices[i].co += d
    return len(moves)


def segment(ob, muscles, samples, kd):
    groups = {g: ob.vertex_groups.new(name=g) for g in GROUPS}
    per_muscle = {}
    for m in muscles:
        key = f"{m['name']}.{'L' if m['side'] > 0 else 'R'}"
        if key not in per_muscle:
            per_muscle[key] = ob.vertex_groups.new(name=key)

    by_group = {g: [] for g in GROUPS}
    by_muscle = {k: [] for k in per_muscle}
    vert_group = {}
    for v in ob.data.vertices:
        _co, idx, _d = kd.find(v.co)
        m = muscles[samples[idx][2]]
        by_group[m['group']].append(v.index)
        by_muscle[f"{m['name']}.{'L' if m['side'] > 0 else 'R'}"].append(v.index)
        vert_group[v.index] = m['group']
    for g, idx in by_group.items():
        if idx:
            groups[g].add(idx, 1.0, 'REPLACE')
    for k, idx in by_muscle.items():
        if idx:
            per_muscle[k].add(idx, 1.0, 'REPLACE')

    slot = {}
    for g in GROUPS:
        mat = bpy.data.materials.new(f'mus_{g}')
        mat.use_nodes = True
        b = mat.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*GROUP_COLOUR[g], 1.0)
        b.inputs['Roughness'].default_value = 0.60
        ob.data.materials.append(mat)
        slot[g] = len(ob.data.materials) - 1
    for poly in ob.data.polygons:
        gs = [vert_group.get(i) for i in poly.vertices]
        gs = [g for g in gs if g]
        if gs:
            poly.material_index = slot[max(set(gs), key=gs.count)]
    return {g: len(v) for g, v in by_group.items() if v}, vert_group


# Which bones may move which part of the body. The segmentation already knows
# what every vertex IS; letting a chest vertex be weighted to a forearm bone is
# what smeared the shoulders into sheets when an arm rotated. Anatomy is the
# constraint a generic auto-rigger does not have.
GROUP_BONES = {
    'chest': ['chest', 'spine', 'clavicleL', 'clavicleR'],   # the pec stays on the sternum; letting it follow the deltoid folded the chest over the neck
    'abs': ['spine', 'pelvis', 'chest'],
    'obliques': ['spine', 'pelvis', 'chest'],
    'lats': ['chest', 'spine', 'upperarmL', 'upperarmR'],
    'traps': ['chest', 'neck', 'clavicleL', 'clavicleR'],
    'rhomboids': ['chest', 'spine'],
    'lower-back': ['spine', 'pelvis'],
    'front-delts': ['deltoidL', 'deltoidR', 'upperarmL', 'upperarmR', 'clavicleL', 'clavicleR'],
    'side-delts': ['deltoidL', 'deltoidR', 'upperarmL', 'upperarmR', 'clavicleL', 'clavicleR'],
    'rear-delts': ['deltoidL', 'deltoidR', 'upperarmL', 'upperarmR', 'clavicleL', 'clavicleR'],
    'biceps': ['upperarmL', 'upperarmR', 'forearmL', 'forearmR'],
    'triceps': ['upperarmL', 'upperarmR', 'forearmL', 'forearmR'],
    'forearms': ['forearmL', 'forearmR', 'handL', 'handR', 'upperarmL', 'upperarmR'],
    'glutes': ['pelvis', 'thighL', 'thighR'],
    'quads': ['thighL', 'thighR', 'pelvis', 'shinL', 'shinR'],
    'hamstrings': ['thighL', 'thighR', 'pelvis', 'shinL', 'shinR'],
    'adductors': ['thighL', 'thighR', 'pelvis'],
    'calves': ['shinL', 'shinR', 'footL', 'footR', 'thighL', 'thighR'],
    'frame': None,     # head, hands, feet, joints — nearest bone is right there
}


def skin_weights(body, bones_def, vert_group=None):
    """Weight every vertex to the bones near it, by hand.

    Blender's automatic (bone-heat) weights tore the shoulders apart the moment
    a pull-up rotated the arm 170°: the deltoid stretched into flat sheets. Bone
    heat solves a diffusion problem over the surface and does badly where two
    limbs are close together in an A-pose.

    This is simpler and predictable: distance to each bone's SEGMENT, a smooth
    falloff, the best three bones kept and normalised. Because the bones were
    placed on measured joints, "nearest bone" is anatomically the right answer —
    a vertex on the biceps is nearest the upper-arm bone, and it stays there.
    """
    segs = []
    for name, _parent, head, tail in bones_def:
        segs.append((name, Vector(head), Vector(tail)))

    def dist_to(seg, p):
        _n, a, b = seg
        ab = b - a
        L2 = ab.dot(ab) or 1e-9
        t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
        return (p - (a + ab * t)).length

    groups = {}
    for name, _p, _h, _t in bones_def:
        groups[name] = body.vertex_groups.new(name=name)
    for v in body.data.vertices:
        allowed = GROUP_BONES.get((vert_group or {}).get(v.index)) if vert_group else None
        pool = [s for s in segs if (allowed is None or s[0] in allowed)] or segs
        ds = sorted(((dist_to(s, v.co), s[0]) for s in pool), key=lambda x: x[0])[:3]
        # a smooth falloff: the nearest bone dominates, the next two blend the joint
        ws = [(name, 1.0 / (d + 0.02) ** 2.6) for d, name in ds]
        total = sum(w for _n, w in ws) or 1.0
        for name, w in ws:
            if w / total > 0.01:
                groups[name].add([v.index], w / total, 'REPLACE')
    return groups


def build_rig(body, vert_group=None):
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = 'nova_rig'
    arm.data.name = 'nova_rig'
    eb = arm.data.edit_bones
    eb.remove(eb[0])
    made = {}
    for name, parent, head, tail in SK.BONES:
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent and parent in made:
            b.parent = made[parent]
        made[name] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    # our own weights, then bind with EMPTY groups so Blender keeps them
    skin_weights(body, SK.BONES, vert_group)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_NAME')
    # Smooth the weights across the surface. Distance-based weights alone put a
    # hard seam through the deltoid — at 150° of shoulder flexion the cap tore
    # into flaps. Laplacian smoothing over the mesh graph turns that seam into
    # the gradient a shoulder actually deforms with.
    for o in bpy.context.selected_objects:
        o.select_set(False)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.65, repeat=8, expand=0.15)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = arm
    return arm


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else '/tmp/anat'
    strength = float(argv[argv.index('--physique') + 1]) if '--physique' in argv else 1.0
    os.makedirs(out, exist_ok=True)

    body = normalise(load_base())
    muscles = all_muscles()
    samples = muscle_samples(muscles, surface_only=True)
    kd = kd_of(samples)
    moved = physique(body, muscles, samples, kd, strength) if strength > 0 else 0
    counts, vert_group = segment(body, muscles, samples, kd)
    if '--norig' not in argv:
        build_rig(body, vert_group)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'body.blend'))
    glb = os.path.join(out, 'body.glb')
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=False)
    print(f'BUILT verts={len(body.data.vertices)} moved={moved} groups={len(counts)} '
          f'glb={os.path.getsize(glb) / 1024:.0f}KB')
    for g in sorted(counts, key=lambda k: -counts[k]):
        print(f'   {g:14s} {counts[g]:5d}')


if __name__ == '__main__':
    main()
