"""Build the web Cue from the Meshy model: bust crop, props, the app's pose timeline, GLB and portrait.

  blender -b --factory-startup --python art/interviewer/pro/build_cue_pro.py -- [--preview DIR] [--no-render]

Input   work/cue_face_raw.glb   Meshy model + auto-rig, after charpipe meshy_prep.py and face_rig.py
                                (Tripo-style bone names; blink / expression / viseme shape keys)
Output  work/cue_pro_raw.glb    one animation holding every pose range the app cuts out (cueStage.ts)
        CuePro.blend            the scene, for hand edits
        public/interviewer/cue.png (unless --no-render)
Then:   node pack_web.mjs work/cue_pro_raw.glb public/interviewer/cue.glb   (see README.md)

Blender 5.3. The character faces -Y; her left arm (+X) leads the gestures, as in build_cue.py.
"""
import sys
from math import cos, exp, pi, radians, sin, sqrt
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else None

FPS = 24
# (first frame, length, pose). cueStage.ts cuts the exported timeline at the same frames.
RANGES = [(1, 96, 'listen'), (98, 144, 'speak'), (244, 48, 'invite'), (294, 180, 'focus'), (476, 118, 'fold'),
          (596, 144, 'explain'), (742, 144, 'lean'), (888, 132, 'consider'), (1022, 108, 'yawn'),
          (1132, 144, 'stretch'), (1278, 58, 'offer'), (1338, 94, 'attend'), (1434, 96, 'pinpoint'),
          (1532, 108, 'applaud')]
STAGE_SCALE = 3.5      # metres -> stage units; the app camera frames stage z 0..3
WAIST = 0.863          # model height (m) that lands on the bottom edge of the stage
CUT = 0.80             # legs below this are never on screen

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, RANGES[-1][0] + RANGES[-1][1]
bpy.ops.import_scene.gltf(filepath=str(HERE / 'work' / 'cue_face_raw.glb'))
for action in list(bpy.data.actions):          # charpipe face clips; the app uses one pose timeline instead
    bpy.data.actions.remove(action)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
arm.animation_data_clear()
for ob in list(bpy.data.objects):
    if ob.type == 'MESH' and ob.parent is not arm or ob.type == 'EMPTY':
        bpy.data.objects.remove(ob)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for ob in meshes:
    if ob.data.shape_keys:
        ob.data.shape_keys.animation_data_clear()
body = max(meshes, key=lambda o: len(o.data.vertices))
body.name = 'Body'

# ---------------------------------------------------------------------------------------------- bust
LEGS = [g.index for g in body.vertex_groups if g.name.split('_')[-1] in ('Thigh', 'Calf', 'Foot', 'ToeBase')]
world = body.matrix_world
doomed = [v.index for v in body.data.vertices
          if (world @ v.co).z < CUT and sum(g.weight for g in v.groups if g.group in LEGS) > .5]
bpy.context.view_layer.objects.active = body
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')
for i in doomed:
    body.data.vertices[i].select = True
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for bone in list(arm.data.edit_bones):
    if bone.name.split('_')[-1] in ('Thigh', 'Calf', 'Foot', 'ToeBase') or bone.name in ('head_end', 'headfront'):
        arm.data.edit_bones.remove(bone)
bpy.ops.object.mode_set(mode='OBJECT')

# One raised eyebrow is most of Cue's wit; the face rig only has the symmetric shape.
keys = body.data.shape_keys.key_blocks
basis, both = keys['Basis'], keys['brow_up']
one = body.shape_key_add(name='brow_up_L', from_mix=False)
for v, b, src, dst in zip(body.data.vertices, basis.data, both.data, one.data):
    x = (world @ b.co).x
    t = max(0, min(1, (x + .008) / .016))
    dst.co = b.co + (src.co - b.co) * t * t * (3 - 2 * t)

# The glasses are part of the body mesh and the eyes are painted on its lenses, so the face shapes must leave the
# frame alone: nothing moves between the bottom rim and the top rim.
for block in keys[1:]:
    for v, b, d in zip(body.data.vertices, basis.data, block.data):
        at = world @ b.co
        if abs(at.x) < .115 and at.y < -.07 and d.co != b.co:
            t = max(0, min(1, max((1.375 - at.z) / .010, (at.z - 1.436) / .008)))
            d.co = b.co + (d.co - b.co) * t * t * (3 - 2 * t)

# The eyelid shells slide over the lenses. Lay them just in front of the lens surface so the frame, which stands
# proud of it, stays in front of them.
lids = next(o for o in meshes if o.name.startswith('Eyelids'))
surface = BVHTree.FromPolygons([tuple(world @ b.co) for b in basis.data], [tuple(p.vertices) for p in body.data.polygons])
lid_world, lid_local = lids.matrix_world, lids.matrix_world.inverted()
lid_basis = lids.data.shape_keys.key_blocks['Basis']
for block in lids.data.shape_keys.key_blocks[1:]:
    moved = [(i, lid_world @ d.co) for i, (d, b) in enumerate(zip(block.data, lid_basis.data)) if (d.co - b.co).length > 1e-4]
    for eye in (-1, 1):
        hits = []
        for i, at in moved:
            if at.x * eye > 0:
                hit = surface.ray_cast(Vector((at.x, -1, at.z)), Vector((0, 1, 0)))[0]
                if hit:
                    hits.append((i, at, hit.y))
        if len(hits) < 8:
            continue
        rows = np.array([[1, at.x, at.z, at.x * at.x, at.z * at.z] for _, at, _ in hits])
        depth = np.array([y for _, _, y in hits])
        lens = np.ones(len(hits), bool)
        for _ in range(4):                                   # drop the frame (in front of the fit), refit the lens
            fit = np.linalg.lstsq(rows[lens], depth[lens], rcond=None)[0]
            lens = depth - rows @ fit > -.0015
        for (i, at, y), on_lens, plane in zip(hits, lens, rows @ fit):
            block.data[i].co = lid_local @ Vector((at.x, (y if on_lens else plane) - .0032, at.z))

# ---------------------------------------------------------------------------------------------- rest pose, in metres
AW = arm.matrix_world.copy()
REST_ROT, REST_POS, PARENT = {}, {}, {}
for bone in arm.data.bones:
    m = AW @ bone.matrix_local
    REST_ROT[bone.name] = m.to_quaternion().to_matrix()
    REST_POS[bone.name] = m.to_translation()
    PARENT[bone.name] = bone.parent.name if bone.parent else None
ORDER = [b.name for b in arm.data.bones]       # parents come first
SIDE = {1: 'L', -1: 'R'}
SHOULDER = {s: REST_POS[SIDE[s] + '_Upperarm'] for s in SIDE}
UPPER = {s: (REST_POS[SIDE[s] + '_Forearm'] - REST_POS[SIDE[s] + '_Upperarm']).length for s in SIDE}
LOWER = {s: (REST_POS[SIDE[s] + '_Hand'] - REST_POS[SIDE[s] + '_Forearm']).length for s in SIDE}
# In the A-pose the palms face the thighs.
PALM = {}
for s in SIDE:
    n = REST_ROT[SIDE[s] + '_Hand'].transposed() @ Vector((-s, 0, 0))
    n.y = 0
    PALM[s] = n.normalized()


def front(z, half=.05):
    """Front surface (most negative y) of the torso at height z."""
    return min((world @ v.co).y for v in body.data.vertices
               if abs((world @ v.co).z - z) < .02 and abs((world @ v.co).x) < half)


CHEST_FRONT = front(1.05)
CHIN = Vector((0, front(1.275, .02), 1.275))
MOUTH = Vector((0, front(1.322, .02), 1.322))
print('CUE_MEASURE chest', round(CHEST_FRONT, 3), 'chin', CHIN[:], 'mouth', MOUTH[:],
      'arm', {s: (round(UPPER[s], 3), round(LOWER[s], 3)) for s in SIDE}, 'shoulder', SHOULDER[1][:])

# ---------------------------------------------------------------------------------------------- props
def lit(name, rgb, rough=.6, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*[c ** 2.2 for c in rgb], 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    return mat


def to_bone(ob, bone, world_matrix):
    """Rigid prop: parent to a bone but keep the given world placement (metres)."""
    ob.parent, ob.parent_type, ob.parent_bone = arm, 'BONE', bone
    bpy.context.view_layer.update()
    ob.matrix_world = world_matrix


def pencil():
    """A short chunky pencil: thin props do not survive image-to-3D, so this one is modelled here."""
    bm = bmesh.new()
    spans = [(-.058, .0052, 3), (-.046, .0052, 3), (-.046, .0056, 4), (-.036, .0056, 4),      # eraser, ferrule
             (-.036, .0054, 0), (.040, .0054, 0), (.040, .0054, 1), (.055, .0016, 1),         # paint, wood
             (.055, .0016, 2), (.062, .0002, 2)]                                             # graphite
    rings = []
    for y, r, mat in spans:
        rings.append(([bm.verts.new((r * cos(i * pi / 3), y, r * sin(i * pi / 3))) for i in range(6)], mat))
    for (a, mat), (b, _) in zip(rings[::2], rings[1::2]):
        for i in range(6):
            bm.faces.new((a[i], a[(i + 1) % 6], b[(i + 1) % 6], b[i])).material_index = mat
    bm.faces.new(reversed(rings[0][0])).material_index = 3
    mesh = bpy.data.meshes.new('Pencil')
    bm.to_mesh(mesh)
    for mat in (lit('Pencil paint', (.96, .66, .10), .45), lit('Pencil wood', (.86, .68, .47), .8),
                lit('Graphite', (.16, .16, .18), .4), lit('Eraser', (.80, .45, .42), .8),
                lit('Ferrule', (.72, .62, .40), .35, 1)):
        mesh.materials.append(mat)
    ob = bpy.data.objects.new('Pencil', mesh)
    bpy.context.collection.objects.link(ob)
    return ob


def clipboard():
    bm = bmesh.new()

    def box(size, at, mat):
        made = bmesh.ops.create_cube(bm, size=1)['verts']
        for v in made:
            v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(at)
        for face in {f for v in made for f in v.link_faces}:
            face.material_index = mat
    box((.150, .007, .205), (0, 0, 0), 0)                    # board
    box((.132, .002, .176), (0, -.0048, -.008), 1)           # paper
    box((.062, .010, .020), (0, -.008, .092), 2)             # clip
    for i in range(4):                                       # a few ruled lines read as notes at stage size
        box((.100 - .018 * (i % 2), .0006, .005), (-.006 - .009 * (i % 2), -.0061, .050 - i * .030), 3)
    mesh = bpy.data.meshes.new('Clipboard')
    bm.to_mesh(mesh)
    for mat in (lit('Clipboard board', (.50, .33, .21), .7), lit('Paper', (.95, .93, .87), .85),
                lit('Clip', (.70, .70, .72), .3, 1), lit('Notes', (.36, .42, .50), .8)):
        mesh.materials.append(mat)
    ob = bpy.data.objects.new('Clipboard', mesh)
    bpy.context.collection.objects.link(ob)
    return ob


# Tucked above her right ear, tip up and out so it shows from the front.
temple = max(abs((world @ v.co).x) for v in body.data.vertices
             if abs((world @ v.co).z - 1.47) < .015 and -.04 < (world @ v.co).y < .05 and (world @ v.co).x < 0)
tip = Vector((-.36, .30, .88)).normalized()
across = tip.cross(Vector((0, -1, 0))).normalized()
pencil_ob = pencil()
to_bone(pencil_ob, 'Head', Matrix.Translation((-temple - .006, .004, 1.475))
        @ Matrix((across, tip, across.cross(tip))).transposed().to_4x4() @ Matrix.Scale(1.5, 4))
BOARD = Vector((-.075, CHEST_FRONT - .034, 1.045))           # held against the chest by her right hand
board_ob = clipboard()
to_bone(board_ob, 'Spine03', Matrix.Translation(BOARD) @ Euler((radians(-16), radians(-9), radians(7))).to_matrix().to_4x4())
BOARD_SCALE = board_ob.scale.copy()

# ---------------------------------------------------------------------------------------------- pose solver
def beat(u, center, width):
    return exp(-((u - center) / width) ** 2)


def swing(a, b):
    return a.rotation_difference(b).to_matrix()


def from_chest(x, z, y_old=None, s=1):
    """A hand position given as build_cue.py did: relative to the shoulder, scaled by the arm length."""
    k = (UPPER[s] + LOWER[s]) / 1.03
    sh = SHOULDER[s]
    return Vector((sh.x + (x - s * .59) * k, CHEST_FRONT - .035 + (y_old + .45) * k, sh.z + (z - 1.065) * k))


def hands(mode, s, u):
    """Wrist target, finger direction, palm normal and the body part the target rides on."""
    c = lambda x, y, z: from_chest(x, z, y, s)
    if mode in ('speak', 'invite', 'focus'):
        lift = (beat(u, .30, .14) + .6 * beat(u, .70, .12)) if mode == 'speak' else beat(u, .46, .26)
        if mode == 'focus':
            return c(s * .37, -.46, .59 + .04 * s), (-s * .40, -.46, .63), (0, -1, .1), 'chest'
        lead = lift * (1 if s == 1 else .24)
        return (c(s * (.51 + .14 * lead), -.44 - .18 * lead, .59 + .39 * lead),
                (s * .28, -.60, .55 + .23 * lead), (.12 * s, -.85 + .54 * lead, .40 + .43 * lead), 'chest')
    if mode in ('offer', 'attend', 'pinpoint'):
        rest, rest_fingers = c(s * .53, -.42, .54), Vector((-s * .25, -.52, .65))
        if mode == 'pinpoint':
            amount = beat(u, .50, .34)
            tap = beat(u, .40, .07) + .68 * beat(u, .61, .07)
            target = c(.40, -.66, 1.08 - .13 * tap) if s == 1 else c(-.33, -.54, .75)
            fingers = (-.62, -.45, -.64) if s == 1 else (.84, -.36, .16)
            normal = (-.3, .2, -.93) if s == 1 else (0, -.16, 1)
        elif mode == 'attend':
            amount = beat(u, .49, .32)
            if s == -1:      # raise a hand beside the ear
                return (rest.lerp(Vector((-.195, -.10, 1.235)), amount), rest_fingers.lerp(Vector((.08, -.05, .99)), amount),
                        (.45, -.9, 0), 'chest')
            target, fingers, normal = c(.39, -.46, .58), (-.40, -.40, .62), (.65, -.62, 0)
        else:
            amount = beat(u, .48, .31)
            target = c(.62, -.68, .99) if s == 1 else c(-.46, -.41, .55)
            fingers = (.76, -.59, .30) if s == 1 else (.40, -.40, .65)
            normal = (.10, -.45, .89) if s == 1 else (-.65, -.65, 0)
        return rest.lerp(target, amount), rest_fingers.lerp(Vector(fingers), amount), normal, 'chest'
    if mode in ('yawn', 'stretch'):
        delay = .032 if mode == 'stretch' and s == -1 else 0
        t = max(0, min(1, (u - delay) / .31))
        release = max(0, min(1, (1 - u) / .29))
        amount = t * t * (3 - 2 * t) * release * release * (3 - 2 * release)
        start = c(s * .55, -.40, .51)
        if mode == 'stretch':  # the auto-rig's shoulders do not survive arms overhead, so this is a shoulder roll
            target, fingers, palm = c(s * 1.12, -.30, 1.02 + .05 * s), (s * .80, -.25, .55), (s * .17, -.95, -.1)
        elif s == 1:         # cover the yawn
            target, fingers, palm = MOUTH + Vector((.085, -.055, -.075)), (-.62, -.1, .78), (.3, .95, 0)
        else:
            target, fingers, palm = c(-.38, -.45, .57), (.54, -.2, -.68), (.65, -.70, 0)
        direction = Vector((s * .2, -.55, .72)).lerp(Vector(fingers), amount)
        return start.lerp(target, amount), direction, palm, 'chest'
    if mode == 'listen':     # hands resting together at the belt
        return (Vector((s * .045, CHEST_FRONT - .012 - .014 * s, .955 + .012 * s)), (-s * .62, -.12, -.77), (0, 1, .1), 'chest')
    if mode == 'fold':       # forearms crossed, each hand resting on the other arm
        return (Vector((s * .012, CHEST_FRONT - .05 - .022 * s, 1.03 + .024 * s)), (-s, .28, .12), (0, 1, 0), 'chest')
    if mode == 'consider':   # a finger at the chin, the clipboard held to the chest
        if s == 1:
            return CHIN + Vector((.075, -.05, -.115)), (-.45, -.12, .88), (.75, .65, 0), 'chest'
        return BOARD + Vector((-.065, -.03, -.085)), (.80, -.1, .58), (.2, .95, .2), 'chest'
    if mode == 'lean':
        return (Vector((s * .05, CHEST_FRONT - .03 - .016 * s, .975 + .016 * s)), (-s * .7, -.1, -.7), (0, 1, .1), 'chest')
    if mode == 'explain':
        lift = beat(u, .24 if s == -1 else .58, .18)
        return (c(s * (.54 + .14 * lift), -.51 - .12 * lift, .73 + .20 * lift),
                (s * (.34 + .26 * lift), -.88, .30 + .40 * lift), (0, .22, 1), 'chest')
    if mode == 'applaud':    # a small, close clap in front of the tie
        gap = .5 - .5 * cos(2 * pi * 5 * min(1, max(0, (u - .12) / .62)))
        amount = min(1, u / .12) * min(1, (1 - u) / .2)
        amount = amount * amount * (3 - 2 * amount)
        rest = c(s * .53, -.42, .54)
        target = Vector((s * (.028 + .045 * gap), CHEST_FRONT - .135, 1.125 - .012 * s))
        return rest.lerp(target, amount), Vector((-s * .25, -.52, .65)).lerp(Vector((-s * .12, -.45, .88)), amount), (-s, 0, .1), 'chest'
    raise ValueError(mode)


LAST = {}


def key_rotation(name, matrix, frame):
    pose = arm.pose.bones[name]
    pose.rotation_mode = 'QUATERNION'
    q = matrix.to_quaternion()
    if name in LAST:
        q.make_compatible(LAST[name])
    LAST[name] = q
    pose.rotation_quaternion = q
    pose.keyframe_insert('rotation_quaternion', frame=frame)


def shape(name, value, frame):
    for ob in meshes:
        block = ob.data.shape_keys and ob.data.shape_keys.key_blocks.get(name)
        if block:
            block.value = max(0, min(1, value))
            block.keyframe_insert('value', frame=frame)


def turn(degrees):
    return Euler([radians(a) for a in degrees]).to_matrix()


def pose_frame(mode, u, frame, count):
    angle = 2 * pi * u
    breath = sin(angle)
    talking = mode in ('speak', 'explain', 'pinpoint')
    accent = (beat(u, .30, .115) + .66 * beat(u, .70, .095)) if talking else 0
    if mode == 'invite':
        accent = beat(u, .45, .29)
    leaning, thinking, focusing, folded = mode == 'lean', mode == 'consider', mode == 'focus', mode == 'fold'
    shift = beat(u, .56, .24)
    yawn = beat(u, .49, .195) if mode == 'yawn' else 0
    stretch = beat(u, .50, .26) if mode == 'stretch' else 0
    ear = beat(u, .47, .30) if mode == 'attend' else 0
    offer = beat(u, .46, .28) if mode == 'offer' else 0
    clap = min(1, u / .12) * min(1, (1 - u) / .2) if mode == 'applaud' else 0
    nod = (13 * beat(u, .18, .052) - 3 * beat(u, .26, .045) + 7 * beat(u, .33, .052) + 10 * beat(u, .80, .065)) if focusing else 0
    nod += 6 * clap * (.5 - .5 * cos(2 * pi * 2 * u))
    attention = (.45 + .55 * beat(u, .63, .21)) if focusing else 0
    ponder = beat(u, .5, .33) if thinking else 0

    chest = turn((.8 * breath - 1.6 * accent + (9 + 2 * shift if leaning else 0) - 5 * stretch + 5 * ear + 3 * offer + 3 * clap,
                  -1 + .7 * breath + (4 if thinking else 0) - 3 * ear,
                  -2 + 2 * accent - (5 if leaning else 0) + 5 * offer))
    head = turn((-2 + .7 * breath - 2 * accent + nod + 2 * attention - 9 * yawn - 5 * stretch
                 + (-5 + 7 * beat(u, .36, .08) if leaning else 0) + 7 * ponder,      # chin down: she looks over her glasses
                 1 + 1.2 * accent + 3 * attention + (2 if folded else 0) + (3 * shift if thinking else 0) - 12 * ear + 5 * ponder,
                 2 + 1.2 * sin(angle) - 3 * attention + (7 * shift if thinking else 0)))
    deltas = {'Spine01': chest, 'Spine02': chest, 'Spine03': chest, 'NeckTwist01': head, 'Head': head}
    share = {'Spine01': 1 / 3, 'Spine02': 1 / 3, 'Spine03': 1 / 3, 'NeckTwist01': .35, 'Head': .65}

    rot, pos = {}, {}

    def carry(name):
        p = PARENT[name]
        if p is None:
            return REST_ROT[name].copy(), REST_POS[name].copy()
        step = rot[p] @ REST_ROT[p].transposed()
        return step @ REST_ROT[name], pos[p] + step @ (REST_POS[name] - REST_POS[p])

    def follow(part, point):
        return pos[part] + rot[part] @ REST_ROT[part].transposed() @ (point - REST_POS[part])

    for name in ORDER:
        base, pos[name] = carry(name)
        rot[name] = base
        if name in deltas:
            q = Quaternion().slerp(deltas[name].to_quaternion(), share[name]).to_matrix()
            rot[name] = q @ base
            key_rotation(name, base.transposed() @ rot[name], frame)
        elif name.endswith('_Upperarm'):
            s = 1 if name[0] == 'L' else -1
            target, fingers, palm, part = hands(mode, s, u)
            target = follow('Head' if part == 'head' else 'Spine03', target)
            fingers, palm = Vector(fingers).normalized(), Vector(palm).normalized()
            reach = target - pos[name]
            total = UPPER[s] + LOWER[s]
            distance = max(.35 * total, min(total - .002, reach.length))
            direction = reach.normalized()
            pole = Vector((s * .75, .42, -1))                 # elbows stay low, outside and a little behind
            bend = (pole - direction * pole.dot(direction)).normalized()
            along = (UPPER[s] ** 2 - LOWER[s] ** 2 + distance ** 2) / (2 * distance)
            elbow = along * direction + sqrt(max(0, UPPER[s] ** 2 - along ** 2)) * bend
            rot[name] = swing(base.col[1], elbow) @ base
            key_rotation(name, base.transposed() @ rot[name], frame)
            fore = SIDE[s] + '_Forearm'
            base, pos[fore] = carry(fore)
            forearm = (direction * distance - elbow).normalized()
            rot[fore] = swing(base.col[1], forearm) @ base
            key_rotation(fore, base.transposed() @ rot[fore], frame)
            hand = SIDE[s] + '_Hand'
            base, pos[hand] = carry(hand)
            if fingers.dot(forearm) < .35:                    # no broken wrists
                fingers = (fingers + forearm * (.35 - fingers.dot(forearm)) * 1.4).normalized()
            palm = (palm - fingers * palm.dot(fingers)).normalized()
            wanted = Matrix((fingers, palm, fingers.cross(palm))).transposed()
            local_y, local_n = Vector((0, 1, 0)), PALM[s]
            source = Matrix((local_y, local_n, local_y.cross(local_n))).transposed()
            q = (base.transposed() @ wanted @ source.transposed()).to_quaternion()
            limit = radians(62)
            if q.angle > limit:
                q = Quaternion().slerp(q, limit / q.angle)
            rot[hand] = base @ q.to_matrix()
            key_rotation(hand, q.to_matrix(), frame)
        elif name.endswith(('_Forearm', '_Hand')):
            continue

    # Face. A relaxed, slightly amused resting face; one eyebrow goes up when she is curious.
    smile = .10 + .30 * accent + .16 * attention + .12 * beat(u, .67, .17) + .25 * offer
    cycles = round(count / 8)                                # about three syllables a second
    syllable = int(u * cycles) % 6
    opening = (.5 - .5 * cos(2 * pi * cycles * u)) * (.72 + .28 * sin(3 * angle + 1)) if talking else 0
    # Wide, round and narrow openings in turn. viseme_EE and the 'happy' and 'thinking' shapes crease the cheeks on
    # this mesh, so a small jaw opening with a smile stands in for EE and the brows carry the expressions.
    wide, round_, jaw, grin = [(1, 0, .55, 0), (0, 0, .7, .5), (.3, .6, .4, 0), (.8, 0, .75, 0),
                               (0, .5, .35, 0), (0, 0, .9, .3)][syllable]
    shape('viseme_AA', wide * opening, frame)
    shape('viseme_OO', round_ * opening, frame)
    shape('jaw_open', max(jaw * opening, yawn), frame)
    shape('smile', (smile * (1 - opening * .6) + grin * opening + .55 * clap) * (1 - yawn), frame)
    shape('brow_up', .55 * accent + .5 * yawn + .4 * clap + .35 * offer + .3 * ear, frame)
    shape('brow_up_L', .12 + .75 * ponder + .5 * ear + .35 * beat(u, .5, .2) * (mode in ('listen', 'lean', 'fold'))
          + .4 * attention, frame)
    shape('squint', .25 * attention + .3 * leaning + .5 * clap, frame)
    blink_at = .78 if talking else .57
    blink = beat(u, blink_at, .018 if u < blink_at else .033)
    if mode in ('focus', 'fold', 'explain', 'lean', 'stretch'):      # long ranges need a second blink
        blink = max(blink, beat(u, .19, .014 if u < .19 else .026))
    closed = max(blink, .92 * yawn, .30 * stretch, .55 * clap * beat(u, .45, .2))
    for s in 'LR':
        shape('blink_' + s, closed, frame)

    show = max(0, min(1, (u - .04) / .1)) * max(0, min(1, (1 - u) / .1)) if thinking else 0
    board_ob.scale = BOARD_SCALE * max(.001, show * show * (3 - 2 * show))
    board_ob.keyframe_insert('scale', frame=frame)


for first, count, mode in RANGES:
    for f in sorted(set(range(0, count + 1, 2)) | {count}):
        pose_frame(mode, f / count, first + f, count)

# ---------------------------------------------------------------------------------------------- stage and export
arm.matrix_world = (Matrix.Translation((0, 0, -WAIST * STAGE_SCALE)) @ Matrix.Scale(STAGE_SCALE, 4)) @ AW
scene.frame_set(1)
bpy.context.view_layer.update()


def aim(ob, target):
    ob.rotation_euler = (Vector(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()


def camera(width, height):
    """The app's camera (cueStage.ts), which is orthographic and looks slightly down."""
    data = bpy.data.cameras.new('Stage')
    cam = bpy.data.objects.new('Stage', data)
    bpy.context.collection.objects.link(cam)
    cam.location = (.68, -6.7, 2.06)
    aim(cam, (0, -.05, 1.49))
    data.type = 'ORTHO'
    data.ortho_scale = 2 * 1.48 * max(width / height, 1)
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = width, height
    return cam


def studio():
    scene.world = bpy.data.worlds.new('Studio fill')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.30, .32, .34, 1)
    for name, loc, energy, size, color in [('Key', (-3, -4.5, 4.6), 620, 4.5, (1, .93, .85)),
                                           ('Fill', (3.5, -3.5, 2.6), 210, 4, (.82, .91, 1)),
                                           ('Rim', (1.6, 3, 4.4), 520, 2.6, (1, .86, .70))]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
        bpy.context.collection.objects.link(light)
        light.location = loc
        light.data.energy, light.data.shape, light.data.size, light.data.color = energy, 'DISK', size, color
        aim(light, (0, 0, 1.6))


studio()
if PREVIEW:
    camera(560, 470)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = False
    for first, count, mode in RANGES:
        for tag, u in (('a', .3), ('b', .5), ('c', .7)):
            scene.frame_set(first + round(count * u))
            scene.render.filepath = f'{PREVIEW}/{mode}_{tag}.png'
            bpy.ops.render.render(write_still=True)
    scene.frame_set(1)

if '--no-render' not in ARGS:
    # Studio stills: the stage portrait the app shows before WebGL is ready, and closer busts for the brand images.
    scene.render.engine = 'CYCLES'
    scene.cycles.samples, scene.cycles.use_denoising = 160, True
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for backend in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.refresh_devices()
        if any(d.type == backend for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == backend
            scene.cycles.device = 'GPU'
            break
    scene.render.film_transparent = True
    scene.view_settings.view_transform, scene.view_settings.look = 'AgX', 'AgX - Medium High Contrast'
    stage_cam = camera(960, 840)
    frame_of = {mode: first + round(count * u) for (first, count, mode), u in zip(RANGES, [.5] * len(RANGES))}
    scene.frame_set(frame_of['listen'])
    scene.render.filepath = str(ROOT / 'public' / 'interviewer' / 'cue.png')
    bpy.ops.render.render(write_still=True)
    bust = bpy.data.objects.new('Bust', bpy.data.cameras.new('Bust'))
    bpy.context.collection.objects.link(bust)
    bust.data.lens = 85
    bust.location = (.52, -5.4, 2.05)
    aim(bust, (0, 0, 1.80))
    scene.camera = bust
    scene.render.resolution_x = scene.render.resolution_y = 1024
    for name, mode in (('neutral', 'listen'), ('thinking', 'consider'), ('speaking', 'explain'), ('applaud', 'applaud')):
        scene.frame_set(frame_of[mode] + (10 if mode == 'explain' else 0))
        scene.render.filepath = str(HERE / 'work' / 'render' / f'bust_{name}.png')
        bpy.ops.render.render(write_still=True)
    scene.camera = stage_cam
    scene.frame_set(1)

bpy.ops.object.select_all(action='DESELECT')
for ob in [arm, *meshes, pencil_ob, board_ob]:
    ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(HERE / 'work' / 'cue_pro_raw.glb'), export_format='GLB', use_selection=True,
                          export_animation_mode='SCENE', export_frame_range=True, export_frame_step=2,
                          export_anim_scene_split_object=False, export_optimize_animation_size=True,
                          export_morph=True, export_morph_normal=False, export_skins=True, export_apply=False,
                          export_cameras=False, export_lights=False, export_vertex_color='MATERIAL')
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'CuePro.blend'), compress=True)
print('CUE_PRO_OK')
