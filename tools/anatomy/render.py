"""Render turnaround views of the model so its anatomy can be judged, not assumed.

    blender -b <file.blend> --python tools/anatomy/render.py -- --out DIR [--px 700]
"""
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = argv[argv.index('--out') + 1] if '--out' in argv else '/tmp/anat'
px = int(argv[argv.index('--px') + 1]) if '--px' in argv else 700
os.makedirs(out, exist_ok=True)

body = next((o for o in bpy.data.objects if o.type == 'MESH'), None)
if body is None:
    raise SystemExit('no mesh')

# a clean studio: three lights, matte grey, so form reads and colour does not distract
KEEP = '--muscles' in argv     # keep the per-muscle materials instead of clay
mat = bpy.data.materials.new('clay')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Base Color'].default_value = (0.72, 0.70, 0.68, 1)
bsdf.inputs['Roughness'].default_value = 0.55
if not KEEP:
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.data.materials.clear()
            o.data.materials.append(mat)
else:
    # A muscle map is read as a CHART, not lit as a photograph. Under studio
    # lighting the group colours washed out to indistinguishable pastels and
    # the map could not be judged — lats and traps came out the same blue. So
    # light the segmentation from within: the pixel is the group's own colour,
    # with a little shading kept so form still reads.
    for m in bpy.data.materials:
        if not m.name.startswith('mus_') or not m.use_nodes:
            continue
        b = m.node_tree.nodes.get('Principled BSDF')
        if not b:
            continue
        c = b.inputs['Base Color'].default_value
        b.inputs['Emission Color'].default_value = (c[0], c[1], c[2], 1)
        b.inputs['Emission Strength'].default_value = 1.0
        b.inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
        b.inputs['Roughness'].default_value = 0.95

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = px
scene.render.resolution_y = int(px * 2.0)
scene.render.film_transparent = False
if KEEP:
    # AgX (Blender's default view transform) is a film response curve: it
    # desaturates hard, and it was turning every group colour into the same
    # pastel. A chart wants the colour that was actually assigned.
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
scene.world = bpy.data.worlds.new('w')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.06, 0.06, 0.07, 1)

def light(name, loc, energy, size=3.0):
    # the muscle chart is lit by the segmentation itself; the lamps are there
    # only to keep enough shading for the form to read under the colour
    if KEEP:
        energy *= 0.10
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size
    o = bpy.data.objects.new(name, d); o.location = loc
    bpy.context.collection.objects.link(o)
    o.rotation_euler = (Vector((0,0,1.0)) - Vector(loc)).to_track_quat('-Z','Y').to_euler()
    return o

if '--rake' in argv:
    # Raking light: a small, hard source almost parallel to the skin. Soft
    # studio lighting hides relief — a 5 mm groove on a 1.8 m body is two
    # pixels of displacement and simply vanishes. This is how anatomy is
    # photographed, and it is the only lighting that lets the model be judged.
    light('rake', (3.4, -1.6, 1.9), 760, size=0.9)
    light('fill', (-2.6, -2.6, 1.5), 200, size=4.0)
    light('rim', (0.0, 3.2, 2.4), 320, size=2.0)
else:
    light('key', (2.5, -3.0, 2.4), 900)
    light('fill', (-3.0, -2.0, 1.4), 300)
    light('rim', (0.0, 3.4, 2.2), 600)

cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 2.0
cam = bpy.data.objects.new('cam', cam_d)
bpy.context.collection.objects.link(cam)
scene.camera = cam

views = {'front': (0, -4, 0.95), 'side': (4, 0, 0.95), 'back': (0, 4, 0.95), 'three_q': (2.9, -2.9, 1.25)}
for name, loc in views.items():
    cam.location = loc
    cam.rotation_euler = (Vector((0, 0, 0.95)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)
