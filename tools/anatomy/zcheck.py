"""A POSED LIFT MUST HOLD TOGETHER (18 Oct 2026): fail if any visible vertex
leaves the body's box at any sampled frame. Run before every full render;
loop v4 exploded into spikes a frame-by-frame look caught after 20 minutes
of rendering, from one mis-measured joint.

    blender -b squat.blend --python tools/anatomy/zcheck.py
"""
import bpy, re, sys
# (bracketed) names are Z-Anatomy's optional variants of a structure already drawn
SHEET = re.compile(r'fascia|aponeuros|retinacul|sheath|iliotibial tract|galea|epicranial|^\(', re.I)
sc = bpy.context.scene
bad = 0
for fr in range(sc.frame_start, sc.frame_end + 1, max(1, (sc.frame_end - sc.frame_start) // 8)):
    sc.frame_set(fr)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.hide_render or not re.search(r'\.(l|r)$', o.name):
            continue
        if SHEET.search(o.name):
            continue   # hidden at render (zrender.py)
        e = o.evaluated_get(dg); me = e.to_mesh()
        n = len(me.vertices)
        ps = [e.matrix_world @ me.vertices[i].co for i in range(0, n, max(1, n // 80))] if n else []
        e.to_mesh_clear()
        far = sum(1 for p in ps if not (-0.15 < p.z < 1.95 and abs(p.x) < 0.9))
        if far:
            bad += 1
            print('FLUNG', fr, o.name, far)
        # STRETCHED: a piece pulled past 1.8x its rest size is following a bone
        # it should not (loop v5: the inguinal ligament, 6x, up to the bar)
        if ps:
            rs = [o.data.vertices[i].co for i in range(0, len(o.data.vertices), max(1, len(o.data.vertices) // 80))]
            ext = max(max(p[k] for p in ps) - min(p[k] for p in ps) for k in range(3))
            rext = max(max(p[k] for p in rs) - min(p[k] for p in rs) for k in range(3))
            if ext > rext * 2.0 and ext > 0.12:   # 1.8 flagged a flexed elbow's pronator: ordinary bending
                bad += 1
                print('STRETCHED', fr, o.name, round(ext / rext, 1))
print('CHECK', 'FAIL' if bad else 'PASS', bad)
sys.exit(1 if bad else 0)
