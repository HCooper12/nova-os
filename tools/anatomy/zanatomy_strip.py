"""Strip Z-Anatomy's 307 MB atlas to the figure: muscles + skeleton meshes,
no labels, outlines, nerves or vessels, Freestyle off, every kept object in a
plain visible collection. Saved once; the pilot iterates on the small file.

    blender -b ~/.cache/nova-anatomy/zanatomy/Z-Anatomy/Startup.blend \\
        --python tools/anatomy/zanatomy_strip.py -- --out ~/.cache/nova-anatomy/zanatomy/figure.blend

Z-Anatomy (Kervyn, Zielinski; from BodyParts3D, DBCLS), CC BY-SA 4.0.
"""
import bpy, sys, re
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[argv.index('--out') + 1]
want = {}
for cname, kind in (('4: Muscular system', 'muscle'), ('1: Skeletal system', 'bone')):
    col = bpy.data.collections.get(cname)
    if not col:
        continue
    for o in col.all_objects:
        if o.type == 'MESH' and re.search(r'\.(l|r|j)$', o.name):
            want[o.name] = kind
fig = bpy.data.collections.new('figure')
bpy.context.scene.collection.children.link(fig)
for name, kind in want.items():
    o = bpy.data.objects[name]
    for c in list(o.users_collection):
        c.objects.unlink(o)
    fig.objects.link(o)
    o['kind'] = kind
    o.hide_render = False
    o.hide_viewport = False
    o.hide_set(False)
# everything else goes
for o in list(bpy.data.objects):
    if o.name not in want:
        bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c is not fig:
        bpy.data.collections.remove(c)
sc = bpy.context.scene
sc.render.use_freestyle = False
for vl in sc.view_layers:
    vl.use_freestyle = False
bpy.ops.outliner.orphans_purge(do_recursive=True)
print('KEPT', len(want), 'muscles', sum(1 for k in want.values() if k == 'muscle'), 'bones', sum(1 for k in want.values() if k == 'bone'))
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print('SAVED', OUT)
