"""Build continuous deforming surfaces from Cue's tailoring and glove primitives."""
import math

import bpy
import numpy as np
from mathutils.kdtree import KDTree


def bind_costume(chest, arms, jacket, glove):
    bpy.context.view_layer.update()
    local = chest.matrix_world.inverted()
    targets = [chest]
    gloves = []
    for _, shoulder, elbow, wrist, digits, thumb in arms:
        hand = [wrist, *(bone for pair in digits for bone in pair), thumb]
        targets.extend([shoulder, elbow, *hand])
        gloves.append(hand)
    rest = {ob: local @ ob.matrix_world for ob in targets}
    cloth_parts = [ob for ob in chest.children_recursive
                   if ob.type == 'MESH' and ob.active_material == jacket]
    hand_parts = [[ob for bone in hand for ob in bone.children
                   if ob.type == 'MESH' and ob.active_material == glove] for hand in gloves]

    armature = bpy.data.armatures.new('Tailoring skeleton')
    rig = bpy.data.objects.new('Costume rig', armature)
    bpy.context.collection.objects.link(rig)
    rig.parent = chest
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for target in targets:
        bone = armature.edit_bones.new(target.name)
        bone.head, bone.tail = (0,0,0), (0,.12,0)
        bone.matrix = rest[target]
        if target.parent in targets:
            bone.parent = armature.edit_bones[target.parent.name]
    bpy.ops.object.mode_set(mode='OBJECT')
    for target in targets:
        follow = rig.pose.bones[target.name].constraints.new('COPY_TRANSFORMS')
        follow.target = target
        follow.owner_space = follow.target_space = 'WORLD'

    fuse('One-piece tailored coat', cloth_parts, jacket, rig, local, .022, 22)
    for index, parts in enumerate(hand_parts):
        fuse('Left glove' if index == 0 else 'Right glove', parts, glove, rig, local, .009, 9)


def fuse(name, parts, material, rig, local, voxel, diffusion_steps):
    graph = bpy.context.evaluated_depsgraph_get()
    sources = []
    positions, faces, owners = [], [], []
    for part in parts:
        parent = part.parent.name
        if parent not in sources:
            sources.append(parent)
        evaluated = part.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        transform = local @ evaluated.matrix_world
        offset = len(positions)
        positions.extend(transform @ vertex.co for vertex in mesh.vertices)
        faces.extend(tuple(offset+i for i in face.vertices) for face in mesh.polygons)
        owners.extend([sources.index(parent)] * len(mesh.vertices))
        evaluated.to_mesh_clear()
    search = KDTree(len(positions))
    for i, position in enumerate(positions):
        search.insert(position, i)
    search.balance()

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(positions, [], faces)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.parent = rig
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    mesh.remesh_voxel_size = voxel
    bpy.ops.object.voxel_remesh()
    relax = ob.modifiers.new('Blend seams', 'SMOOTH')
    relax.factor, relax.iterations = .68, 4
    bpy.ops.object.modifier_apply(modifier=relax.name)
    simplify = ob.modifiers.new('Screen mesh', 'DECIMATE')
    simplify.ratio = .47
    bpy.ops.object.modifier_apply(modifier=simplify.name)
    mesh = ob.data
    mesh.materials.clear()
    mesh.materials.append(material)
    for polygon in mesh.polygons:
        polygon.use_smooth = True

    # Diffuse rigid source memberships across actual edges. Close fingers on
    # opposite sides of an air gap therefore remain independently articulated.
    weights = np.zeros((len(mesh.vertices), len(sources)), dtype=np.float32)
    for v in mesh.vertices:
        _, sample, _ = search.find(v.co)
        weights[v.index, owners[sample]] = 1
    edges = np.array([tuple(e.vertices) for e in mesh.edges])
    origin, dest = np.concatenate((edges, edges[:,::-1])).T
    counts = np.maximum(1, np.bincount(origin, minlength=len(weights)))[:,None]
    for _ in range(diffusion_steps):
        adjacent = np.zeros_like(weights)
        np.add.at(adjacent, origin, weights[dest])
        weights = .22*weights + .78*adjacent/counts
    groups = [ob.vertex_groups.new(name=n) for n in sources]
    for i, row in enumerate(weights):
        selected = np.argsort(row)[-4:]
        selected = selected[row[selected] > .0005]
        for group in selected:
            groups[group].add([i], float(row[group]/row[selected].sum()), 'REPLACE')
    deform = ob.modifiers.new('Continuous skin', 'ARMATURE')
    deform.object = rig
    # Use linear skinning in the authoring file and the glTF player alike.
    if name == 'One-piece tailored coat':
        uv = mesh.uv_layers.new(name='Coat grain')
        for face in mesh.polygons:
            coords = [mesh.vertices[i].co for i in face.vertices]
            u = [.5 + math.atan2(co.y,co.x)/(2*math.pi) for co in coords]
            seam = max(u)-min(u) > .5
            for loop, co, value in zip(face.loop_indices, coords, u):
                uv.data[loop].uv = (value+int(seam and value<.5),co.z*.8)
    for part in parts:
        bpy.data.objects.remove(part, do_unlink=True)
