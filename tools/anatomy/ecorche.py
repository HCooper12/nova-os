"""THE MUSCLE LAYER — the body with the skin taken off.

    blender -b --python tools/anatomy/ecorche.py -- --out DIR

Hayden, 12 Sep 2026, with a reference: an anatomical figure showing individual
muscle bellies, fibre direction, tendon at the attachments. *"This is the
better kind of detail… the model should have."*

The skinned figure paints coloured patches ON skin. An écorché IS the muscles —
which is a different object, not a better texture, and no amount of smoothing a
patch turns it into a belly.

The anatomy for it has been here the whole time. `muscles.py` already carries
82 muscles a side, 159 volumes, each a polyline of centres with an elliptical
cross-section at every point, placed against measured joints and a measured
trunk shell. Until now they were only ever used to EMBOSS the skin (relief) and
to decide which patch of skin belongs to which group (segment). This lofts them
into geometry and shows them directly.

Three things make it read as anatomy rather than as a bundle of tubes:

  * a belly is thickest in the middle and tapers to its attachments, so the
    swept ellipse is scaled by a spindle curve along its own length;
  * a muscle is crimson through the belly and white at the tendon, and the
    change is quick — most of the length is meat and the last fifth is cord;
  * fibres run ALONG the muscle, so a fine striation is written into the
    vertex colour around the sweep, which at a glance is what tells you
    which way a muscle pulls.

Deep muscles and the frame are kept but darkened and pushed behind the rest:
the ribcage under the pecs is what stops the chest floating in space.
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import skeleton as SK                                     # noqa: E402
from muscles import all_muscles                           # noqa: E402
import build as B                                         # noqa: E402

RING = 18          # verts around a muscle; below ~16 the facets read as a bug
TENDON = 0.18      # the last fifth of a muscle is cord, not meat

# Anatomical tone, not the app's highlight palette. A fresh muscle is darker
# and browner than people draw it; the pale one is what a tendon looks like.
MEAT = Vector((0.47, 0.10, 0.10))
MEAT_LIGHT = Vector((0.66, 0.19, 0.17))
TENDON_COL = Vector((0.86, 0.82, 0.72))
BONE_COL = Vector((0.80, 0.75, 0.64))
DEEP = 0.62        # deep muscles sit back, dimmer


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.objects, bpy.data.materials):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def _frame(d):
    """A stable ring basis for a sweep direction — any perpendicular will do,
    but it has to vary smoothly or the tube corkscrews."""
    up = Vector((0, 0, 1))
    if abs(d.dot(up)) > 0.95:
        up = Vector((0, 1, 0))
    x = d.cross(up).normalized()
    return x, d.cross(x).normalized()


def spindle(t):
    """Thickest in the middle, tapering to the attachments. A muscle is not a
    dowel, and a dowel is exactly what a constant sweep looks like — but nor is
    it a spindle: taper it to a point at both ends and the figure comes out
    stringy, with daylight between every belly. It keeps most of its width."""
    return 0.68 + 0.32 * math.sin(math.pi * min(1.0, max(0.0, t))) ** 0.5


def loft(bm, path, scale, deep):
    """Sweep an ellipse along one muscle's centreline. Returns the verts made,
    each tagged with how far along the muscle it sits and how far around."""
    pts = [(Vector(c), a, b) for c, a, b in path]
    if len(pts) < 2:
        c, a, b = pts[0]
        pts = [(c - Vector((0, 0, a * 0.5)), a, b), (c + Vector((0, 0, a * 0.5)), a, b)]
    total = sum((pts[i + 1][0] - pts[i][0]).length for i in range(len(pts) - 1)) or 1e-6
    rings = []
    run = 0.0
    for i, (c, a, b) in enumerate(pts):
        nxt = pts[min(i + 1, len(pts) - 1)][0]
        prv = pts[max(i - 1, 0)][0]
        d = (nxt - prv)
        if d.length < 1e-9:
            d = Vector((0, 0, 1))
        d.normalize()
        if i:
            run += (c - pts[i - 1][0]).length
        t = run / total
        s = spindle(t) * scale
        x, y = _frame(d)
        ring = []
        for k in range(RING):
            ang = 2 * math.pi * k / RING
            p = c + x * (math.cos(ang) * a * s) + y * (math.sin(ang) * b * s)
            v = bm.verts.new(p)
            v.tag = deep
            ring.append((v, t, k / RING))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(RING):
            a1 = rings[i][k][0]; a2 = rings[i][(k + 1) % RING][0]
            b1 = rings[i + 1][k][0]; b2 = rings[i + 1][(k + 1) % RING][0]
            try:
                bm.faces.new((a1, a2, b2, b1))
            except ValueError:
                pass                                       # a degenerate ring
    return [r for ring in rings for r in ring]


def build_layer():
    """Every muscle as its own geometry, in one object so it skins as one."""
    ms = all_muscles()
    bm = bmesh.new()
    tagged = []
    for m in ms:
        # The frame goes back in. Lofted flat it read as a lozenge where a
        # skull should be, but subdivided and smooth it is a cranium and a
        # ribcage — and without it the figure is headless and you can see the
        # background through its waist.
        paths = m['paths'] if 'paths' in m else [m['path']]
        deep = bool(m.get('deep'))
        # BONE SITS INSIDE MUSCLE. The frame volumes are sized to fill a body
        # under SKIN, so at full size they swallowed the muscles whole and the
        # figure came out as a pale skeleton with a few red threads on it.
        # Pulled well in, they do what bone should: give the muscles something
        # to sit on and stop the torso being see-through.
        frame = m.get('group') == 'frame'
        scale = 0.45 if frame else (1.0 if deep else 1.18)
        for path in paths:
            tagged += [(v, t, a, deep or frame, m.get('group', 'frame')) for v, t, a in
                       loft(bm, path, scale, deep)]
    # indices BEFORE the bmesh is freed — a BMVert is a live handle, and
    # reading .index after free() raises rather than returning a stale number
    bm.verts.index_update()
    tagged = [(v.index, t, a, deep, group) for v, t, a, deep, group in tagged]
    me = bpy.data.meshes.new('muscle')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('muscle', me)
    bpy.context.collection.objects.link(ob)
    # SMOOTH, and subdivided once. Flat-shaded, every facet of the sweep is a
    # visible plane and the result reads as a bag of polygons rather than as
    # tissue — which is what the first render was.
    for poly in me.polygons:
        poly.use_smooth = True
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    mod = ob.modifiers.new('smooth', 'SUBSURF')
    mod.levels = 1
    mod.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=mod.name)
    me = ob.data

    # colour: meat through the belly, cord at the ends, fibres along the length
    col = me.color_attributes.new(name='tone', type='BYTE_COLOR', domain='CORNER')
    by_vert = {}
    for vi, t, a, deep, group in tagged:
        by_vert[vi] = (t, a, deep, group)
    for loop in me.loops:
        t, a, deep, group = by_vert.get(loop.vertex_index, (0.5, 0.0, False, 'frame'))
        edge = min(t, 1.0 - t) / TENDON
        base = BONE_COL if group == 'frame' else (
            TENDON_COL if edge < 1.0 else MEAT.lerp(MEAT_LIGHT, 0.5 + 0.5 * math.cos(2 * math.pi * a * 3)))
        if group != 'frame' and edge < 1.0:
            base = TENDON_COL.lerp(MEAT, min(1.0, edge))
        # FIBRES. A fine stripe around the sweep, which is what tells the eye
        # which way a muscle pulls before it can name the muscle.
        fib = 0.93 + 0.07 * math.cos(2 * math.pi * a * RING)
        k = DEEP if deep else 1.0
        col.data[loop.index].color = (base.x * fib * k, base.y * fib * k, base.z * fib * k, 1.0)
    return ob


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[argv.index('--out') + 1] if '--out' in argv else '/tmp/anat'
    os.makedirs(out, exist_ok=True)
    clear()
    ob = build_layer()
    # the SAME rig and the same weighting rule as the skin, so the two layers
    # move together and a toggle between them is a toggle, not a jump
    arm = B.build_rig(ob, None)
    bpy.context.view_layer.objects.active = ob
    glb = os.path.join(out, 'body-muscle.glb')
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    arm.select_set(True)
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True,
                              export_apply=False, export_texcoords=False,
                              export_vertex_color='ACTIVE', export_morph=False)
    print(f'ECORCHE verts={len(ob.data.vertices)} faces={len(ob.data.polygons)} '
          f'glb={os.path.getsize(glb) / 1024:.0f}KB')


if __name__ == '__main__':
    main()
