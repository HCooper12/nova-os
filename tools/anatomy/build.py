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
import math
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


def redistribute(ob):
    """Put the mesh's resolution where the muscles are.

    Measured on the base mesh: of its 10,582 vertices, 3,348 are in the head,
    2,510 in the feet and 1,828 in the hands — 73% on the three regions this
    app never highlights — while the ENTIRE THIGH gets 341 and the chest 734.
    That is a face rig's budget, and it is why the first build read as a smooth
    mannequin: there was no geometry left to carry a muscle.

    So: subdivide everything once, then collapse the extremities back down to
    what a silhouette needs. The trunk and limbs come out roughly four times
    denser, the head/hands/feet lighter than they started, and the whole body
    lands near the vertex count it began with.
    """
    z_jaw, z_ank = SK.Z['jaw'], SK.joints(1)['ankle'][2]
    wr = [Vector(SK.joints(s)['wrist']) for s in (1, -1)]
    el = [Vector(SK.joints(s)['elbow']) for s in (1, -1)]

    def extremity(co):
        """1 deep in an extremity, 0 in the body, ramped across the joint."""
        def ramp(d, w=0.075):
            # a wide ramp on purpose: a short one puts the whole change in
            # triangle density into two centimetres and leaves a visible ring
            # around each ankle and wrist where the shading breaks
            return max(0.0, min(1.0, d / w))
        # The head is decimated less hard than the hands and feet: nobody
        # looks at a knuckle, everybody looks at a face, and a face collapsed
        # to a smooth blob is the single most obviously artificial thing on an
        # otherwise convincing body.
        w = ramp(co.z - (z_jaw + 0.010)) * 0.55                # head, above the jaw
        w = max(w, ramp((z_ank + 0.055) - co.z))               # foot, below the ankle
        for wrist, elbow in zip(wr, el):
            # the hand: past the wrist AND close to it. Without the distance
            # gate the forearm's axis runs on down through the whole lower body
            # and the first run decimated the legs and feet away.
            if (co - wrist).length > 0.24:
                continue
            axis = (wrist - elbow).normalized()
            # Hands are decimated less hard than feet now that they have
            # fingers to articulate: at the old ratio a whole hand was 145
            # vertices and a finger was three, which is not something you can
            # curl around a bar.
            w = max(w, ramp((co - wrist).dot(axis) + 0.010) * 0.5)
        return w

    bpy.context.view_layer.objects.active = ob
    sub = ob.modifiers.new('subdiv', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=sub.name)

    g = ob.vertex_groups.new(name='_extremity')
    for v in ob.data.vertices:
        e = extremity(v.co)
        if e > 0:
            g.add([v.index], e, 'REPLACE')

    # Decimate's ratio is a target for the WHOLE mesh, and the zero-weight body
    # is protected — so a naive ratio makes the collapse take everything it is
    # allowed to take. The first run asked for 0.10 and left the feet with eight
    # vertices. Work out the ratio from the actual split instead: keep the body
    # entire, keep KEEP of the extremities.
    KEEP = 0.13
    ext = sum(1 for p in ob.data.polygons if extremity(Vector(p.center)) > 0.30)
    total = len(ob.data.polygons)
    dec = ob.modifiers.new('decimate', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = min(1.0, ((total - ext) + KEEP * ext) / max(1, total))
    dec.vertex_group = g.name
    dec.use_collapse_triangulate = False
    bpy.ops.object.modifier_apply(modifier=dec.name)
    ob.vertex_groups.remove(ob.vertex_groups['_extremity'])
    ob.data.update()
    return ob


def relief(ob, muscles, samples, kd, amount=1.0):
    """Cut the separations between muscles into the surface.

    PHYSIQUE adds mass; this is what makes the mass read as anatomy. For every
    vertex the muscle field is asked two questions: how deep inside its own
    muscle's belly it sits — which becomes a bulge — and how nearly it is
    equidistant from a DIFFERENT muscle, which becomes a groove. Out of those
    two numbers come the lines a lean trained body actually has: the split
    between the pectorals, the tendinous inscriptions across the abdominals,
    the linea alba and the spinal furrow (both of them a left/right seam), the
    groove between biceps and triceps, the separation of vastus lateralis from
    rectus femoris.

    A groove is a real depression, not a painted line — it survives being lit
    from any angle and it shows in the silhouette, which is the whole point.
    """
    RIDGE, GROOVE, W = 0.0080, 0.0140, 0.013
    ob.data.update()
    normals = {v.index: v.normal.copy() for v in ob.data.vertices}
    disp = [0.0] * len(ob.data.vertices)
    for v in ob.data.vertices:
        best = {}
        for _co, idx, d in kd.find_n(v.co, 28):
            p, r, mi, part = samples[idx]
            pen = r - d                       # positive inside the belly
            key = (mi, part)
            if key not in best or pen > best[key]:
                best[key] = pen
        if not best:
            continue
        order = sorted(best.items(), key=lambda kv: -kv[1])
        (own_mi, _own_part), own_pen = order[0]
        if own_pen < -0.028:                  # nothing close: leave the skin alone
            continue
        scale = 0.45 if muscles[own_mi]['group'] == 'frame' else 1.0
        # A bone landmark is a subtle feature of the skin — a collarbone reads
        # as a ridge and a shallow hollow, never as the canyon a groove between
        # two muscle bellies is. Cutting the frame like muscle tore the top of
        # both shoulders open.
        frame_pair = scale < 1.0 or (len(order) > 1 and
                                     muscles[order[1][0][0]]['group'] == 'frame')
        # Only cut where there is muscle to cut between — not out in the empty
        # space over a collarbone. The threshold has to sit BELOW the surface,
        # though: a tendinous inscription is by definition a place where no
        # belly reaches the skin, and a stricter gate erased every one of them.
        presence = max(0.0, min(1.0, (own_pen + 0.020) / 0.014))
        bulge = RIDGE * max(0.0, min(1.0, (own_pen + 0.006) / 0.018))
        seam = math.exp(-((own_pen - order[1][1]) / W) ** 2) if len(order) > 1 else 0.0
        # A groove is the boundary between TWO muscles. Where a third is just as
        # close the boundary has no direction, and cutting there tore the
        # sternum and collarbones — five volumes meet inside two centimetres.
        # So only cut in proportion to how cleanly the seam is a pair.
        if len(order) > 2:
            seam *= 1.0 - math.exp(-((order[1][1] - order[2][1]) / W) ** 2)
        cut = GROOVE * seam * presence * (0.35 if frame_pair else 1.0)
        disp[v.index] = (bulge - cut) * amount * scale

    # Average the displacement with its neighbours before applying it. A groove
    # is a broad valley and survives this; a one-vertex spike where the field
    # is ambiguous does not.
    adj = [[] for _ in range(len(ob.data.vertices))]
    for e in ob.data.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    # one light pass only: at two passes with a heavy neighbour weight the blur
    # radius reached 2.4 cm, wider than a groove, and flattened the whole body
    disp = [d if not adj[i] else d * 0.70 + 0.30 * sum(disp[k] for k in adj[i]) / len(adj[i])
            for i, d in enumerate(disp)]

    moves = {i: normals[i] * d for i, d in enumerate(disp) if abs(d) > 1e-5}
    for i, dv in moves.items():
        ob.data.vertices[i].co += dv
    ob.data.update()
    return len(moves)


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
        paths = m['paths'] if 'paths' in m else [m['path']]
        for pi, path in enumerate(paths):
            # `parts` muscles groove between their own strands — the abdominal
            # inscriptions, the serratus digitations. For every other muscle the
            # strands are one belly and must not be cut apart.
            part = pi if m.get('parts') else 0
            if len(path) == 1:
                c, a, b = path[0]
                pts.append((Vector(c), (a + b) * 0.5, mi, part))
                continue
            for k in range(len(path) - 1):
                (p0, a0, b0), (p1, a1, b1) = path[k], path[k + 1]
                seg = Vector(p1) - Vector(p0)
                n = max(2, int(seg.length / step))
                for i in range(n + 1):
                    t = i / n
                    pts.append((Vector(p0).lerp(Vector(p1), t),
                                (a0 + (a1 - a0) * t + b0 + (b1 - b0) * t) * 0.5, mi, part))
    return pts


def kd_of(samples):
    kd = kdtree.KDTree(len(samples))
    for i, (p, _r, _mi, _part) in enumerate(samples):
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
        p, r, mi, _part = samples[idx]
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


def nearest_bone(co, segs):
    def d(seg):
        _n, a, bb = seg
        ab = bb - a
        t = max(0.0, min(1.0, (co - a).dot(ab) / (ab.dot(ab) or 1e-9)))
        return (co - (a + ab * t)).length
    return min(segs, key=d)[0]


def bone_groups():
    """Which muscle groups may claim a vertex, by the bone it belongs to.

    The inverse of GROUP_BONES, and the fix for two bugs visible the first time
    the model ran in the app: the traps highlight painted his FACE, and the
    forearms highlight put a cyan patch on each hip. Both are "nearest volume
    wins" with no sense of where on the body it is — in the A-pose a hand sits
    five centimetres from a thigh, and the neck muscles reach the jaw. A vertex
    on the head is not eligible to be a trapezius no matter what is nearest.
    """
    inv = {}
    for g, bones in GROUP_BONES.items():
        for bn in (bones or []):
            inv.setdefault(bn, set()).add(g)
    return inv


def bake_occlusion(ob, rays=48, reach=0.22):
    """Ambient occlusion, baked into the mesh as a vertex colour.

    The single biggest step from "3D model" to "photograph of a person" after
    the lighting itself. Every crease a body has — the armpit, the line under
    the pectoral, the furrow beside the spine, the hollow behind the collarbone,
    the gap between two heads of a muscle — is dark because less of the room
    reaches it. Image-based light gets that right for the broad form and wrong
    for the detail, because it cannot know the body occludes itself.

    Baked per VERTEX rather than to a texture: at 24,000 vertices the mesh is
    dense enough to carry the gradient, and it costs four bytes a vertex with
    no image to ship, no UV layout to keep valid through a decimate, and
    nothing to go stale. three.js multiplies it into the base colour, so it
    darkens a highlighted muscle exactly as much as it darkens skin.
    """
    import random
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    rng = random.Random(7)                 # deterministic: same body every run
    dirs = []
    for _ in range(rays):
        # cosine-weighted hemisphere around +Z, rotated per vertex to its normal
        u1, u2 = rng.random(), rng.random()
        r = math.sqrt(u1)
        th = 2 * math.pi * u2
        dirs.append(Vector((r * math.cos(th), r * math.sin(th), math.sqrt(max(0.0, 1 - u1)))))

    me = ob.data
    me.update()
    up = Vector((0, 0, 1))
    ao = [1.0] * len(me.vertices)
    for v in me.vertices:
        n = v.normal.copy()
        if n.length_squared < 1e-9:
            continue
        n.normalize()
        rot = up.rotation_difference(n)
        origin = v.co + n * 0.0015          # off the surface, or every ray hits it
        hits = 0
        for d in dirs:
            loc, _nr, _i, dist = bvh.ray_cast(origin, rot @ d, reach)
            if loc is not None and dist is not None:
                # near hits occlude fully, far ones barely
                hits += 1.0 - min(1.0, dist / reach) ** 0.5
        ao[v.index] = max(0.0, 1.0 - (hits / rays) * 1.35)

    # WARMTH. Real skin is not one colour: it reddens where it is thin over
    # bone and where the circulation is closest to the surface — knuckles,
    # elbows, knees, the face — and cools over the big flat planes of the back
    # and thigh. Baked into the same vertex colour as the occlusion, so it
    # costs nothing extra and rides through every pose.
    warm_at = []
    for side in (1, -1):
        j = SK.joints(side)
        for k in ('elbow', 'knee', 'wrist', 'hand', 'ankle'):
            if j.get(k):
                warm_at.append((Vector(j[k]), 0.10))
    warm_at.append((Vector((0, -0.06, SK.Z['head_c'] - 0.02)), 0.13))   # the face
    warm = Vector((1.075, 0.945, 0.905))

    col = me.color_attributes.get('ao') or me.color_attributes.new(
        # BYTE, not FLOAT: an 8-bit occlusion term is indistinguishable by eye
        # and costs a quarter of the bytes on a mesh this size
        name='ao', type='BYTE_COLOR', domain='CORNER')
    for loop in me.loops:
        v = me.vertices[loop.vertex_index]
        a = ao[loop.vertex_index]
        # a floor, and a gentle curve: full black in an armpit is not what a
        # body looks like, it is what a mistake looks like
        a = 0.38 + 0.62 * (a ** 1.25)
        t = 0.0
        for p, r in warm_at:
            t = max(t, max(0.0, 1.0 - (v.co - p).length / r))
        t *= 0.55
        col.data[loop.index].color = (
            a * (1 + (warm.x - 1) * t),
            a * (1 + (warm.y - 1) * t),
            a * (1 + (warm.z - 1) * t), 1.0)
    return sum(ao) / max(1, len(ao))


def segment(ob, muscles, samples, kd):
    groups = {g: ob.vertex_groups.new(name=g) for g in GROUPS}
    per_muscle = {}
    for m in muscles:
        key = f"{m['name']}.{'L' if m['side'] > 0 else 'R'}"
        if key not in per_muscle:
            per_muscle[key] = ob.vertex_groups.new(name=key)

    segs = [(n, Vector(h), Vector(t)) for n, _p, h, t in SK.BONES]
    allow = bone_groups()

    by_group = {g: [] for g in GROUPS}
    by_muscle = {k: [] for k in per_muscle}
    vert_group = {}
    for v in ob.data.vertices:
        ok = allow.get(nearest_bone(v.co, segs), set())
        m = None
        for _co, idx, _d in kd.find_n(v.co, 24):
            cand = muscles[samples[idx][2]]
            if cand['group'] == 'frame' or cand['group'] in ok:
                m = cand
                break
        if m is None:
            m = muscles[samples[kd.find(v.co)[1]][2]]
        by_group[m['group']].append(v.index)
        by_muscle[f"{m['name']}.{'L' if m['side'] > 0 else 'R'}"].append(v.index)
        vert_group[v.index] = m['group']
    face_group = {}
    for poly in ob.data.polygons:
        gs = [vert_group.get(i) for i in poly.vertices]
        gs = [g for g in gs if g]
        if gs:
            face_group[poly.index] = max(set(gs), key=gs.count)

    # SMOOTH THE BORDERS. Nearest-volume is decided per face against a sampled
    # field, so the boundary between two groups comes out ragged — single faces
    # of one group stranded inside another, edges that zigzag along the
    # topology. On the finished figure that reads as torn paper, which is the
    # most obvious thing left saying "this is a diagram". A few passes of
    # majority vote over each face's neighbours pulls the borders onto the
    # smooth curves anatomy actually has, without moving any of them far.
    nbr = {}
    edge_faces = {}
    for poly in ob.data.polygons:
        for ek in poly.edge_keys:
            edge_faces.setdefault(ek, []).append(poly.index)
    for fs in edge_faces.values():
        for a in fs:
            for b in fs:
                if a != b:
                    nbr.setdefault(a, []).append(b)
    for _ in range(4):
        nxt = {}
        for fi, g in face_group.items():
            votes = [g, g]                       # a face keeps its own opinion twice
            for n in nbr.get(fi, ()):
                if n in face_group:
                    votes.append(face_group[n])
            nxt[fi] = max(set(votes), key=votes.count)
        face_group = nxt
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
        poly.material_index = slot[face_group.get(poly.index, 'frame')]
    return {g: len(v) for g, v in by_group.items() if v}, vert_group


# Which bones may move which part of the body. The segmentation already knows
# what every vertex IS; letting a chest vertex be weighted to a forearm bone is
# what smeared the shoulders into sheets when an arm rotated. Anatomy is the
# constraint a generic auto-rigger does not have.
GROUP_BONES = {
    # The pec stays on the sternum — letting it follow the UPPER ARM folded the
    # chest over the neck. But forbidding it the shoulder entirely made the
    # pec/deltoid boundary a hard seam: one vertex frozen, its neighbour moving
    # with the arm, and at 90° of shoulder flexion the surface between them tore
    # into spikes. The deltoid HELPER takes only half the humerus rotation, so
    # letting a little of it bleed across the boundary blends the seam without
    # dragging the chest.
    'chest': ['chest', 'spine', 'clavicleL', 'clavicleR', 'deltoidL', 'deltoidR'],
    'abs': ['spine', 'pelvis', 'chest'],
    'obliques': ['spine', 'pelvis', 'chest'],
    'lats': ['chest', 'spine', 'upperarmL', 'upperarmR', 'deltoidL', 'deltoidR'],
    'traps': ['chest', 'neck', 'clavicleL', 'clavicleR', 'deltoidL', 'deltoidR'],
    'rhomboids': ['chest', 'spine'],
    'lower-back': ['spine', 'pelvis'],
    'front-delts': ['deltoidL', 'deltoidR', 'upperarmL', 'upperarmR', 'clavicleL', 'clavicleR'],
    'side-delts': ['deltoidL', 'deltoidR', 'upperarmL', 'upperarmR', 'clavicleL', 'clavicleR'],
    'rear-delts': ['deltoidL', 'deltoidR', 'upperarmL', 'upperarmR', 'clavicleL', 'clavicleR'],
    'biceps': ['upperarmL', 'upperarmR', 'forearmL', 'forearmR'],
    'triceps': ['upperarmL', 'upperarmR', 'forearmL', 'forearmR'],
    'forearms': ['forearmL', 'forearmR', 'handL', 'handR', 'fingersL', 'fingersR',
                 'fingertipL', 'fingertipR', 'upperarmL', 'upperarmR'],
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
    # Smoothing is what turns a distance-based weight map into something that
    # deforms like skin. Eight passes left visible seams at the shoulder under
    # a bench press; the cost of more is a few seconds at build time.
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.85, repeat=18, expand=0.25)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = arm
    return arm


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else '/tmp/anat'
    strength = float(argv[argv.index('--physique') + 1]) if '--physique' in argv else 1.0
    relief_amount = float(argv[argv.index('--relief') + 1]) if '--relief' in argv else 1.0
    os.makedirs(out, exist_ok=True)

    body = redistribute(normalise(load_base()))
    muscles = all_muscles()
    samples = muscle_samples(muscles, surface_only=True)
    kd = kd_of(samples)
    moved = physique(body, muscles, samples, kd, strength) if strength > 0 else 0
    cut = relief(body, muscles, samples, kd, relief_amount)
    counts, vert_group = segment(body, muscles, samples, kd)
    mean_ao = bake_occlusion(body)
    if '--norig' not in argv:
        build_rig(body, vert_group)

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'body.blend'))
    glb = os.path.join(out, 'body.glb')
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in bpy.data.objects:
        o.select_set(True)
    # no textures anywhere in this model — the app tints the per-group
    # materials directly — so the UV channel is 8 bytes a vertex of nothing
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True,
                              export_apply=False, export_texcoords=False,
                              export_vertex_color='ACTIVE')
    print(f'BUILT verts={len(body.data.vertices)} moved={moved} relief={cut} '
          f'groups={len(counts)} ao={mean_ao:.3f} glb={os.path.getsize(glb) / 1024:.0f}KB')
    for g in sorted(counts, key=lambda k: -counts[k]):
        print(f'   {g:14s} {counts[g]:5d}')


if __name__ == '__main__':
    main()
