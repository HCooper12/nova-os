"""THE LYFTA LOOK ON Z-ANATOMY (15 Oct 2026, the 3-lift pilot, step 1).

Nova's own body rendered Lyfta-style fell apart (a layered, puffy torso):
the base model is the ceiling, not the shading. Z-Anatomy (CC BY-SA 4.0,
BodyParts3D-derived, ~900 named muscles) is the candidate base. This renders
its muscular system, still, in the same look, so the ANATOMY can be judged
before rigging or motion is spent on it.

    blender -b ~/.cache/nova-anatomy/zanatomy/figure.blend \\
        --python tools/anatomy/lyfta_zanatomy.py -- --out DIR [--work squat] [--ground dark|light]

Attribution (required by the licence, carried with every derived render):
Z-Anatomy by Gauthier Kervyn and Marcin Zielinski, from BodyParts3D (DBCLS),
CC BY-SA 4.0.
"""
import bpy, sys, os, math, re
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d: argv[argv.index(k) + 1] if k in argv else d
OUT = arg('--out', '/tmp/lyfta-z')
GROUND = arg('--ground', 'dark')
PX = int(arg('--px', '800'))
os.makedirs(OUT, exist_ok=True)

# which muscles WORK in each pilot lift (prime movers, then synergists)
LIFTS = {
    'squat': (r'rectus femoris|vastus|gluteus maximus|adductor magnus', r'adductor|gluteus medius|biceps femoris|semitend|semimemb|erector|soleus'),
    'bench': (r'pectoralis major|clavicular part of deltoid', r'triceps|anconeus|serratus anterior|acromial part of deltoid'),
    'row': (r'latissimus|trapezius|rhomboid|teres major|spinal part of deltoid', r'biceps brachii|brachialis|brachioradialis|infraspinatus|teres minor|erector'),
}
WORK, SECOND = LIFTS[arg('--work', 'squat')]

scene = bpy.context.scene
scene.render.use_freestyle = False
# the atlas ships a compositor tree that paints over the whole frame
scene.use_nodes = False
scene.render.use_compositing = False
# figure.blend (zanatomy_strip.py): every mesh carries kind = muscle | bone
# fascia and aponeurotic sheets wrap the muscles like skin and hide them (the
# first clean render was a smooth white body with no red at all): an écorché
# shows the muscle bellies, so the sheets stay out
# (bracketed) names are Z-Anatomy's optional variants of a structure already drawn
SHEET = re.compile(r'fascia|aponeuros|retinacul|sheath|iliotibial tract|galea|epicranial|^\(', re.I)
keep = {o.name for o in bpy.data.objects if o.type == 'MESH' and o.get('kind') in ('muscle', 'bone') and not SHEET.search(o.name)}
skeletal = {o.name for o in bpy.data.objects if o.get('kind') == 'bone'}
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.hide_render = o.name not in keep
        o.hide_viewport = o.name not in keep

def material(name, base, rough=0.6, sss=0.0, emit=None, emit_k=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.35
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (0.9, 0.35, 0.25)
        b.inputs['Subsurface Scale'].default_value = 0.01
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_k
    return m

CLAY = material('clay', (0.52, 0.53, 0.56), rough=0.55, sss=0.1)
BONE = material('bone', (0.70, 0.69, 0.66), rough=0.6)
WORKM = material('work', (0.62, 0.02, 0.02), rough=0.42, sss=0.05, emit=(0.85, 0.04, 0.03), emit_k=0.18)
SECONDM = material('second', (0.80, 0.30, 0.27), rough=0.5, sss=0.08)
n_work = n_second = 0
for name in keep:
    o = bpy.data.objects[name]
    low = name.lower()
    is_bone = o.name in skeletal
    m = BONE if is_bone else WORKM if re.search(WORK, low) else SECONDM if re.search(SECOND, low) else CLAY
    n_work += m is WORKM
    n_second += m is SECONDM
    o.data.materials.clear()
    o.data.materials.append(m)
print('KEPT', len(keep), 'WORK', n_work, 'SECOND', n_second)

# the figure's bounds, from what is shown
pts = []
for name in keep:
    o = bpy.data.objects[name]
    pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
centre = (lo + hi) / 2
height = hi.z - lo.z
print('BOUNDS', tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi))

for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA'):
        o.hide_render = True
# Cycles, not EEVEE: EEVEE speckled the torso black where thin muscles lie
# almost on top of each other (shadow acne on near-coincident surfaces);
# a path tracer on the M1's GPU with denoising resolves them cleanly
ENGINE = arg('--engine', 'cycles')
if ENGINE == 'cycles':
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = int(arg('--samples', '96'))
    scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices: d.use = True
        scene.cycles.device = 'GPU'
    except Exception as e:
        print('GPU unavailable, CPU render:', e)
else:
    scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = PX
scene.render.resolution_y = int(PX * 1.3)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -1.7
G = (0.035, 0.045, 0.085) if GROUND == 'dark' else (0.94, 0.94, 0.95)
scene.world = bpy.data.worlds.new('w')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (*G, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.5

def area(name, off, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy * height * height; d.size = size * height; d.color = color
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o)
    o.location = centre + Vector(off) * height
    o.rotation_euler = (centre - o.location).to_track_quat('-Z', 'Y').to_euler()

area('key', (1.1, -1.4, 0.9), 380, 1.2)
area('fill', (-1.4, -1.0, 0.3), 110, 1.5, (0.85, 0.9, 1.0))
area('rim', (0.2, 1.5, 0.8), 300, 0.8, (0.8, 0.88, 1.0))

cam_d = bpy.data.cameras.new('pilotcam'); cam_d.lens = 70
cam = bpy.data.objects.new('pilotcam', cam_d); scene.collection.objects.link(cam); scene.camera = cam
# Z-Anatomy faces -Y or +Y depending on build; try both and keep the face
VIEWS = [v for v in (('front', 0), ('three-quarter', 35), ('back', 180)) if arg('--views', 'front,three-quarter,back').find(v[0]) >= 0]
for name, deg in VIEWS:
    a = math.radians(deg)
    d = height * 2.9
    cam.location = centre + Vector((math.sin(a) * d, -math.cos(a) * d, height * 0.04))
    cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, f'z-{arg("--work", "squat")}-{GROUND}-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)
