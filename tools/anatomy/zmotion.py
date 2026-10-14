"""DRIVE THE Z-ANATOMY RIG WITH A TRACKED LIFT (15 Oct 2026, the Lyfta pilot, step 3).

Reads a pose_from_video.py JSON (MediaPipe world landmarks, metres, hips at
the origin, y DOWN, z TOWARD the camera), takes ONE rep, and poses the rig
bone by bone by DIRECTION only, so the athlete's limb lengths never stretch
the figure's. The figure is turned to face the camera, the feet stay on the
floor, jitter is smoothed, and a barbell rides between the hands.

    blender -b ~/.cache/nova-anatomy/zanatomy/rigged.blend --python tools/anatomy/zmotion.py -- \\
        --pose ~/.cache/nova-anatomy/motion/i7J5h7BJ07g.pose.json --lift squat --out DIR \\
        [--preview] [--px 480] [--samples 24] [--view three-quarter|side|front]
"""
import bpy, sys, os, json, math, re
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
arg = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
POSE = os.path.expanduser(arg('--pose'))
LIFT = arg('--lift', 'squat')
OUT = os.path.expanduser(arg('--out', '/tmp/zmotion'))
PREVIEW = '--preview' in argv
PX = int(arg('--px', '480'))
VIEW = arg('--view', 'three-quarter')
os.makedirs(OUT, exist_ok=True)

data = json.load(open(POSE))
fps = data['fps']
raw = [f['world'] for f in data['frames']]

# MediaPipe world → Blender: x stays, depth (z, toward camera) becomes -Y... the
# athlete's own frame is fixed below by turning the hips square to the camera,
# so only the axes' handedness matters here: up is -y.
def to_b(p):
    return Vector((p[0], p[2], -p[1]))

L = dict(nose=0, lsh=11, rsh=12, lel=13, rel=14, lwr=15, rwr=16, lhip=23, rhip=24,
         lkn=25, rkn=26, lank=27, rank=28, lhe=29, rhe=30, ltoe=31, rtoe=32, lix=19, rix=20)

frames = []
last = None
for w in raw:
    if w is None:
        frames.append(last)
        continue
    last = {k: to_b(w[i]) for k, i in L.items()}
    frames.append(last)
frames = [f for f in frames if f]

# smooth: a centred moving average over ~0.2 s
def smooth(fs, k):
    out = []
    for i in range(len(fs)):
        win = fs[max(0, i - k):i + k + 1]
        out.append({n: sum((f[n] for f in win), Vector()) / len(win) for n in fs[0]})
    return out
frames = smooth(frames, max(1, int(fps * 0.1)))

def angle(a, b, c):
    return math.degrees((a - b).angle(c - b))

# ONE rep: for a squat, standing → deepest knee → standing; bench and row by elbow
def key(f):
    if LIFT == 'squat':
        return (angle(f['lhip'], f['lkn'], f['lank']) + angle(f['rhip'], f['rkn'], f['rank'])) / 2
    return (angle(f['lsh'], f['lel'], f['lwr']) + angle(f['rsh'], f['rel'], f['rwr'])) / 2
ks = [key(f) for f in frames]
bottom = min(range(len(ks)), key=lambda i: ks[i])
a = max(range(0, bottom + 1), key=lambda i: ks[i] - 0.02 * (bottom - i))
b = max(range(bottom, len(ks)), key=lambda i: ks[i] - 0.02 * (i - bottom))
rep = frames[a:b + 1][::int(arg('--step', '1'))]
print('REP', a, bottom, b, 'frames', len(rep), f'{len(rep) / fps:.2f}s', 'key', round(ks[a]), round(ks[bottom]), round(ks[b]))

# face the camera: turn every frame about Z so the first frame's hip line is +X
# (the figure's left is +X, it faces -Y)
h0 = rep[0]['lhip'] - rep[0]['rhip']
yaw = math.atan2(h0.y, h0.x)
Rz = Matrix.Rotation(-yaw, 3, 'Z')
rep = [{n: Rz @ v for n, v in f.items()} for f in rep]
# MediaPipe's left/right are the athlete's; if the turned hip line runs -X the
# athlete faced away from the figure's front: spin half a turn
if (rep[0]['nose'] - (rep[0]['lsh'] + rep[0]['rsh']) / 2).y > 0:
    R180 = Matrix.Rotation(math.pi, 3, 'Z')
    rep = [{n: R180 @ v for n, v in f.items()} for f in rep]

arm = bpy.data.objects['zrig']
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones
rest = {b.name: (b.bone.head_local.copy(), b.bone.tail_local.copy()) for b in pb}
stand_ankle_z = (rest['footL'][0].z + rest['footR'][0].z) / 2

CHAIN = {  # bone: (from landmark, to landmark), mid() = average of two
    'thighL': ('lhip', 'lkn'), 'shinL': ('lkn', 'lank'), 'footL': ('lank', 'ltoe'),
    'thighR': ('rhip', 'rkn'), 'shinR': ('rkn', 'rank'), 'footR': ('rank', 'rtoe'),
    'upperarmL': ('lsh', 'lel'), 'forearmL': ('lel', 'lwr'), 'handL': ('lwr', 'lix'),
    'upperarmR': ('rsh', 'rel'), 'forearmR': ('rel', 'rwr'), 'handR': ('rwr', 'rix'),
}
ORDER = ['pelvis', 'spine', 'chest', 'neck', 'head', 'clavicleL', 'clavicleR',
         'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
         'upperarmL', 'forearmL', 'handL', 'upperarmR', 'forearmR', 'handR']

def aim(bone_name, direction, roll_ref=None):
    """Pose a bone so it points along `direction` (armature space), keeping its
    head where its parent left it."""
    b = pb[bone_name]
    h, t = rest[bone_name]
    rest_dir = (t - h).normalized()
    q = rest_dir.rotation_difference(direction.normalized())
    if roll_ref is not None:
        # twist about the new axis so the rest x-axis lies as near roll_ref as it can
        x = q @ (b.bone.matrix_local.to_3x3() @ Vector((1, 0, 0)))
        axis = direction.normalized()
        xr = (roll_ref - axis * roll_ref.dot(axis)).normalized()
        xp = (x - axis * x.dot(axis)).normalized()
        tw = xp.rotation_difference(xr)
        q = tw @ q
    m = (q.to_matrix() @ b.bone.matrix_local.to_3x3()).to_4x4()
    head = b.parent.matrix @ (b.parent.bone.matrix_local.inverted() @ h) if b.parent else h
    m.translation = head
    b.matrix = m
    bpy.context.view_layer.update()

def world_head(name):
    return pb[name].head.copy()

def ik_arm(S, target, pole):
    """Two-bone IK: the elbow where both bones keep their length, bent toward `pole`."""
    sh = world_head('upperarm' + S)
    la = (rest['upperarm' + S][1] - rest['upperarm' + S][0]).length
    lb = (rest['forearm' + S][1] - rest['forearm' + S][0]).length
    d = target - sh
    dist = min(d.length, (la + lb) * 0.999)
    u = d.normalized()
    along = (la * la - lb * lb + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, la * la - along * along))
    side = (pole - u * pole.dot(u)).normalized()
    elbow = sh + u * along + side * h
    aim('upperarm' + S, elbow - sh)
    aim('forearm' + S, (sh + u * dist) - elbow)
    aim('hand' + S, (sh + u * dist) - elbow)

def squat_arms():
    ch = pb['chest']
    m = ch.matrix
    top = ch.tail.copy()
    across_sh = (world_head('upperarmL') - world_head('upperarmR')).normalized()
    up = (ch.tail - ch.head).normalized()
    # the figure's back, from the spine and the shoulder line (at rest: +Y),
    # never from the bone's roll, which is arbitrary
    back = up.cross(across_sh).normalized()
    bar_c = top - up * 0.05 + back * 0.07
    for S, sign in (('L', 1), ('R', -1)):
        # the wrist sits a little below and in front of the bar, so the palm
        # wraps it from underneath
        target = bar_c + across_sh * sign * 0.40 - up * 0.035 - back * 0.02
        pole = (back * 0.6 - up * 0.8).normalized()
        ik_arm(S, target, pole)

# THE SQUAT FROM ITS ANGLES (the second render: the tracker's raw 3D
# directions twisted the torso and swung the right forefoot 18 cm sideways).
# Its JOINT ANGLES are what it measures well: knee bend, hip bend, shin lean
# do not depend on depth. Everything else is the lift's own geometry: a squat
# is symmetric and sagittal, knees track out over toes turned out ~12 deg,
# feet stay planted and flat, the bar rides the traps.
FWD = Vector((0, -1, 0))   # the figure faces -Y
def sag(angle_deg, splay=0.0):
    a = math.radians(angle_deg)
    return Vector((splay, -math.sin(a), math.cos(a))).normalized()

def squat_angles(f):
    k = (angle(f['lhip'], f['lkn'], f['lank']) + angle(f['rhip'], f['rkn'], f['rank'])) / 2
    h = (angle(f['lsh'], f['lhip'], f['lkn']) + angle(f['rsh'], f['rhip'], f['rkn'])) / 2
    # shin lean from vertical, forward positive: the knee ahead of the ankle
    shins = [(f['lkn'] - f['lank']), (f['rkn'] - f['rank'])]
    up = Vector((0, 0, 1))
    s = sum(math.degrees(v.angle(up)) for v in shins) / 2
    return k, h, s

def pose_squat(f):
    k, h, s = squat_angles(f)
    shin_up = s                      # ankle -> knee, from vertical, forward +
    thigh_up = s - (180 - k)         # knee -> hip
    torso_up = thigh_up + 180 - h    # hip -> shoulders
    splay = 0.21                     # knees out over the toes
    # place the pelvis so the ankles land on their rest spots (feet planted)
    Lt = (rest['thighL'][1] - rest['thighL'][0]).length
    Ls = (rest['shinL'][1] - rest['shinL'][0]).length
    hip_to_ankle = -sag(thigh_up) * Lt - sag(shin_up) * Ls
    hip_to_ankle.x = 0
    ank_rest = (rest['shinL'][1] + rest['shinR'][1]) / 2
    pel = pb['pelvis']
    # the pelvis tips forward with the torso, about a third as far
    # (Rotation +theta about X carries up toward -Y, the figure's front)
    pm = (Matrix.Rotation(math.radians(torso_up * 0.35), 3, 'X') @ pel.bone.matrix_local.to_3x3()).to_4x4()
    pm.translation = ank_rest - hip_to_ankle + (rest['pelvis'][0] - (rest['thighL'][0] + rest['thighR'][0]) / 2)
    pel.matrix = pm
    bpy.context.view_layer.update()
    torso = sag(torso_up)
    aim('spine', torso)
    aim('chest', sag(torso_up * 0.85))
    aim('neck', sag(torso_up * 0.4))
    aim('head', sag(torso_up * 0.2))
    across = Vector((1, 0, 0))
    for S, sign in (('L', 1), ('R', -1)):
        aim('clavicle' + S, Vector((sign, 0.15, 0.05)), across)
        # bones run hip->knee and knee->ankle: the reverse of the up-angles
        aim('thigh' + S, -sag(thigh_up) + Vector((sign * splay * 0.35, 0, 0)), across)
        aim('shin' + S, -sag(shin_up) + Vector((sign * splay * 0.2, 0, 0)), across)
        foot = rest['foot' + S][1] - rest['foot' + S][0]
        aim('foot' + S, Matrix.Rotation(math.radians(sign * 12), 3, 'Z') @ foot, across)
    squat_arms()

for i, f in enumerate(rep):
    if LIFT == 'squat':
        pose_squat(f)
        for bone_name in ORDER:
            pb[bone_name].keyframe_insert('location', frame=i + 1)
            pb[bone_name].keyframe_insert('rotation_quaternion', frame=i + 1)
        continue
    hipmid = (f['lhip'] + f['rhip']) / 2
    shmid = (f['lsh'] + f['rsh']) / 2
    across = f['lhip'] - f['rhip']
    # the pelvis: rest position, dropped so the lower ankle meets the floor
    pel = pb['pelvis']
    ank = min(f['lank'].z, f['rank'].z)
    drop = (hipmid.z - ank) - (rest['pelvis'][0].z - stand_ankle_z)
    up = (shmid - hipmid).normalized()
    m = Matrix.Identity(4)
    x = across.normalized(); z = up; y = z.cross(x).normalized(); x = y.cross(z).normalized()
    rot = Matrix((x, y, z)).transposed()
    pm = (rot @ pel.bone.matrix_local.to_3x3()).to_4x4()
    pm.translation = rest['pelvis'][0] + Vector((0, 0, drop))
    pel.matrix = pm
    bpy.context.view_layer.update()
    aim('spine', (shmid - hipmid), across)
    aim('chest', (shmid - hipmid), f['lsh'] - f['rsh'])
    aim('neck', (f['nose'] - shmid) * 0.4 + up * 0.6)
    aim('head', (f['nose'] - shmid) * 0.5 + up * 0.5)
    for s, S in (('l', 'L'), ('r', 'R')):
        aim('clavicle' + S, f[s + 'sh'] - (shmid + up * -0.02))
    if LIFT == 'squat':
        # legs from the tracking; arms from the LIFT. In a back squat the bar
        # rests on the upper traps and the hands are half hidden behind the
        # head, where the tracker loses them (the first render held the bar
        # pointing at the camera). The bar is a fact of the lift: it sits
        # behind the neck, across the shoulders, and the arms reach it.
        for bone_name in ('thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'):
            p0, p1 = CHAIN[bone_name]
            aim(bone_name, f[p1] - f[p0], across)
        squat_arms()
    else:
        for bone_name, (p0, p1) in CHAIN.items():
            aim(bone_name, f[p1] - f[p0], across)
    for bone_name in ORDER:
        pb[bone_name].keyframe_insert('location', frame=i + 1)
        pb[bone_name].keyframe_insert('rotation_quaternion', frame=i + 1)

bpy.ops.object.mode_set(mode='OBJECT')
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, len(rep)
scene.render.fps = int(round(fps))

# the barbell: a 2.2 m bar and two plates centred between the hands
def cyl(name, r, depth):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=48)
    o = bpy.context.active_object; o.name = name
    return o
bar = cyl('bar', 0.014, 2.2)
plates = [cyl('plateL', 0.225, 0.05), cyl('plateR', 0.225, 0.05)]
steel = bpy.data.materials.new('steel'); steel.use_nodes = True
sb = steel.node_tree.nodes['Principled BSDF']; sb.inputs['Base Color'].default_value = (0.55, 0.56, 0.58, 1); sb.inputs['Metallic'].default_value = 1; sb.inputs['Roughness'].default_value = 0.3
rubber = bpy.data.materials.new('plate'); rubber.use_nodes = True
rb = rubber.node_tree.nodes['Principled BSDF']; rb.inputs['Base Color'].default_value = (0.05, 0.05, 0.06, 1); rb.inputs['Roughness'].default_value = 0.7
bar.data.materials.append(steel)
for p in plates: p.data.materials.append(rubber)
for i in range(len(rep)):
    scene.frame_set(i + 1)
    # a held bar sits at MID-PALM (the first anatomy model's lesson), not at
    # the wrist, where it left the open hand standing up past it
    def palm(S):
        bn = arm.pose.bones['hand' + S]
        return arm.matrix_world @ (bn.head + (bn.tail - bn.head) * 0.55)
    hl = palm('L')
    hr = palm('R')
    mid = (hl + hr) / 2
    axis = (hl - hr).normalized()
    q = Vector((0, 0, 1)).rotation_difference(axis)
    for o, off in ((bar, 0), (plates[0], 0.82), (plates[1], -0.82)):
        o.location = mid + axis * off
        o.rotation_mode = 'QUATERNION'
        o.rotation_quaternion = q
        o.keyframe_insert('location', frame=i + 1)
        o.keyframe_insert('rotation_quaternion', frame=i + 1)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'{LIFT}.blend'), compress=True)
print('SAVED', os.path.join(OUT, f'{LIFT}.blend'))
