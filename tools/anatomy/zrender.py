"""RENDER A POSED LIFT IN THE LYFTA LOOK (15 Oct 2026, the Lyfta pilot, step 4).

    blender -b ~/.cache/nova-anatomy/pilot/squat.blend --python tools/anatomy/zrender.py -- \\
        --out DIR --lift squat [--frames 8 | --all] [--px 480] [--samples 24] [--view three-quarter]

Same materials and light as lyfta_zanatomy.py (the still that met the bar);
Cycles on the M1 GPU. `--frames N` renders N evenly spaced frames to judge
the motion; `--all` renders every frame for the loop.
"""
import bpy, sys, os, math, re
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
OUT = os.path.expanduser(arg('--out', '/tmp/zrender'))
LIFT = arg('--lift', 'squat')
PX = int(arg('--px', '480'))
VIEW = arg('--view', 'three-quarter')
os.makedirs(OUT, exist_ok=True)

LIFTS = {
    'squat': (r'rectus femoris|vastus|gluteus maximus|adductor magnus', r'adductor|gluteus medius|biceps femoris|semitend|semimemb|erector|soleus'),
    'bench': (r'pectoralis major|clavicular part of deltoid', r'triceps|anconeus|serratus anterior|acromial part of deltoid'),
    'row': (r'latissimus|trapezius|rhomboid|teres major|spinal part of deltoid', r'biceps brachii|brachialis|brachioradialis|infraspinatus|teres minor|erector'),
}
WORK, SECOND = LIFTS[LIFT]
SHEET = re.compile(r'fascia|aponeuros|retinacul|sheath|iliotibial tract|galea|epicranial', re.I)
scene = bpy.context.scene
scene.render.use_freestyle = False
scene.use_nodes = False
scene.render.use_compositing = False

def material(name, base, rough=0.6, sss=0.0, emit=None, emit_k=0.0, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (0.9, 0.35, 0.25)
        b.inputs['Subsurface Scale'].default_value = 0.01
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = emit_k
    return m

CLAY = material('lk_clay', (0.52, 0.53, 0.56), rough=0.55, sss=0.1)
BONE = material('lk_bone', (0.60, 0.59, 0.56), rough=0.6)
WORKM = material('lk_work', (0.62, 0.02, 0.02), rough=0.42, sss=0.05, emit=(0.85, 0.04, 0.03), emit_k=0.18)
SECONDM = material('lk_second', (0.80, 0.30, 0.27), rough=0.5, sss=0.08)
figure = []
for o in bpy.data.objects:
    if o.type != 'MESH' or not o.get('kind'):
        continue
    show = bool(re.search(r'\.(l|r)$', o.name)) and not SHEET.search(o.name)
    o.hide_render = not show
    if not show:
        continue
    figure.append(o)
    low = o.name.lower()
    m = BONE if o.get('kind') == 'bone' else WORKM if re.search(WORK, low) else SECONDM if re.search(SECOND, low) else CLAY
    o.data.materials.clear()
    o.data.materials.append(m)

scene.render.engine = 'CYCLES'
scene.cycles.samples = int(arg('--samples', '24'))
scene.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices: d.use = True
    scene.cycles.device = 'GPU'
except Exception as e:
    print('CPU render:', e)
scene.render.resolution_x = PX
scene.render.resolution_y = int(PX * 1.25)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -1.7
G = (0.035, 0.045, 0.085)
scene.world = bpy.data.worlds.new('lk_w'); scene.world.use_nodes = True
bgn = scene.world.node_tree.nodes['Background']; bgn.inputs[0].default_value = (*G, 1); bgn.inputs[1].default_value = 0.5
for o in bpy.data.objects:
    if o.type in ('LIGHT', 'CAMERA'):
        o.hide_render = True

H = 1.75
centre = Vector((0, 0, 0.78))
def area(name, off, energy, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy * H * H; d.size = size * H; d.color = color
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o)
    o.location = centre + Vector(off) * H
    o.rotation_euler = (centre - o.location).to_track_quat('-Z', 'Y').to_euler()
area('lk_key', (1.1, -1.4, 0.9), 380, 1.2)
area('lk_fill', (-1.4, -1.0, 0.3), 110, 1.5, (0.85, 0.9, 1.0))
area('lk_rim', (0.2, 1.5, 0.8), 300, 0.8, (0.8, 0.88, 1.0))
# no floor, as in Lyfta's library: the figure on the ground colour alone
# (a lit floor plane glowed blue-grey in the first motion render)

cd = bpy.data.cameras.new('lk_cam'); cd.lens = 60
cam = bpy.data.objects.new('lk_cam', cd); scene.collection.objects.link(cam); scene.camera = cam
deg = {'three-quarter': 40, 'side': 90, 'front': 0}[VIEW]
a = math.radians(deg); d = H * 3.2
cam.location = centre + Vector((math.sin(a) * d, -math.cos(a) * d, 0.12))
cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()

f0, f1 = scene.frame_start, scene.frame_end
if '--all' in argv:
    picks = list(range(f0, f1 + 1))
else:
    n = int(arg('--frames', '8'))
    picks = sorted({round(f0 + i * (f1 - f0) / max(1, n - 1)) for i in range(n)})
for fr in picks:
    scene.frame_set(fr)
    scene.render.filepath = os.path.join(OUT, f'{LIFT}-{VIEW}-{fr:04d}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', fr)
