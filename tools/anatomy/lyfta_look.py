"""THE LYFTA LOOK, as a render test (15 Oct 2026, the 3-lift pilot).

His bar (13 Oct): the exercise figures should look like Lyfta's library: a
detailed grey anatomical figure, the working muscles in red, soft studio
light. Those are PRE-RENDERED loops, not live 3D. This renders Nova's own
rigged, segmented body that way, so the look can be judged before any motion
work is spent on it.

    blender -b --python tools/anatomy/lyfta_look.py -- --out DIR
        [--glb public/models/body.glb] [--work quads,glutes,adductors]
        [--ground dark|light] [--px 900] [--pose rest|squat]
"""
import bpy, sys, os, math
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
OUT = arg('--out', '/tmp/lyfta')
GLB = arg('--glb', 'public/models/body.glb')
WORK = [w.strip() for w in arg('--work', 'quads,glutes,adductors').split(',') if w.strip()]
SECOND = [w.strip() for w in arg('--second', 'hamstrings,lower-back,calves').split(',') if w.strip()]
GROUND = arg('--ground', 'dark')
PX = int(arg('--px', '900'))
POSE = arg('--pose', 'rest')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o)
body = next(o for o in bpy.data.objects if o.type == 'MESH')
rig = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)


def material(name, base, rough=0.62, sss=0.0, emit=None, emit_k=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.35
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (0.9, 0.35, 0.25)
        b.inputs['Subsurface Scale'].default_value = 0.012
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_k
    return m


# Lyfta's grey: a cool, slightly translucent clay; the working muscle a deep
# red with a little of its own light so it reads on either ground; the
# secondary movers a lighter, quieter red.
CLAY = material('clay', (0.62, 0.63, 0.66), rough=0.58, sss=0.12)
WORKM = material('work', (0.78, 0.08, 0.07), rough=0.45, sss=0.1, emit=(0.9, 0.12, 0.08), emit_k=0.35)
SECONDM = material('second', (0.86, 0.42, 0.38), rough=0.5, sss=0.1)
for i, m in enumerate(body.data.materials):
    group = (m.name if m else '').removeprefix('mus_')
    body.data.materials[i] = WORKM if group in WORK else SECONDM if group in SECOND else CLAY

# smooth the silhouette without touching the rig
sub = body.modifiers.new('smooth', 'SUBSURF')
sub.levels = 1
sub.render_levels = 2
for poly in body.data.polygons:
    poly.use_smooth = True

# A first pose, by hand, only to see the look under load. Real motion comes
# from capture; this is not a squat anyone should copy.
if rig and POSE == 'squat':
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    pb = rig.pose.bones
    def rot(name, x=0, y=0, z=0):
        b = pb.get(name)
        if b:
            b.rotation_mode = 'XYZ'
            b.rotation_euler = Euler((math.radians(x), math.radians(y), math.radians(z)))
    names = [b.name for b in pb]
    for side in ('L', 'R'):
        for n in names:
            if n.startswith('thigh') and n.endswith(side): rot(n, x=-95)
            if n.startswith('shin') and n.endswith(side): rot(n, x=110)
            if n.startswith('foot') and n.endswith(side): rot(n, x=-20)
    rot('spine', x=25)
    bpy.ops.object.mode_set(mode='OBJECT')

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = PX
scene.render.resolution_y = int(PX * 1.25)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
try:
    scene.eevee.use_raytracing = True
    scene.eevee.use_shadows = True
except Exception:
    pass
GROUND_RGB = (0.035, 0.045, 0.085) if GROUND == 'dark' else (0.94, 0.94, 0.95)
scene.world = bpy.data.worlds.new('w')
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']
bg.inputs[0].default_value = (*GROUND_RGB, 1)
bg.inputs[1].default_value = 0.6

# a soft studio: big key, cool fill, rim from behind so the silhouette reads on dark
def area(name, loc, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy = energy
    d.size = size
    d.color = color
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    o.rotation_euler = (Vector((0, 0, 0.95)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

area('key', (2.2, -2.6, 2.6), 900, 2.5)
area('fill', (-2.6, -1.8, 1.4), 260, 3.0, (0.85, 0.9, 1.0))
area('rim', (0.4, 2.8, 2.4), 700, 1.6, (0.8, 0.88, 1.0))

# a shadow catcher the colour of the ground
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
floor = bpy.context.active_object
fm = material('floor', GROUND_RGB, rough=0.9)
floor.data.materials.append(fm)

bb = [body.matrix_world @ Vector(c) for c in body.bound_box]
top = max(v.z for v in bb)
cz = top * (0.5 if POSE == 'rest' else 0.4)

cam_d = bpy.data.cameras.new('cam')
cam_d.lens = 70
cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam)
scene.camera = cam

views = {'three-quarter': (35, -1), 'front': (0, -1), 'side': (90, -1)}
for name, (deg, _) in views.items():
    a = math.radians(deg)
    dist = top * 3.1
    cam.location = (math.sin(a) * dist, -math.cos(a) * dist, cz + top * 0.08)
    cam.rotation_euler = (Vector((0, 0, cz)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, f'{POSE}-{GROUND}-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)
