"""
Our parkour clips: a plain stage for previews (ground, the clip's obstacles, a camera from the person's right, Workbench lighting).
Used by author.py to draw the contact sheet and the preview video. Not part of the app build.
"""
import bpy, math
from mathutils import Vector
from rig import W

ORANGE = (0.95, 0.40, 0.10, 1); DARK = (0.23, 0.24, 0.27, 1); STONE = (0.32, 0.34, 0.38, 1); GROUND = (0.8, 0.8, 0.8, 1)

def mat(name, rgba, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = rgba
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = rgba; bsdf.inputs['Roughness'].default_value = rough
    return m

def setup(rig, res=(640, 480)):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE_NEXT'
    sc.eevee.taa_render_samples = 16
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    w = sc.world or bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bg = w.node_tree.nodes.get('Background'); bg.inputs[0].default_value = (0.92, 0.93, 0.95, 1); bg.inputs[1].default_value = 0.9
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = 0.12
    so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so); so.rotation_euler = (0.75, 0.0, 0.9)
    for slot in rig.mesh.material_slots:
        if slot.material:
            slot.material = mat('joint', DARK, 0.5) if 'Joint' in slot.material.name else mat('body', ORANGE, 0.45)
    bpy.ops.mesh.primitive_plane_add(size=300, location=(0, -8, 0))
    g = bpy.context.object; g.name = 'ground'; g.data.materials.append(mat('ground', GROUND, 0.9))
    cam = bpy.data.cameras.new('cam'); co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    return co

def props(boxes):
    """boxes: [((f0, f1), (u0, u1), (l0, l1))] in the person's frame"""
    for o in [o for o in bpy.data.objects if o.name.startswith('prop')]:
        bpy.data.objects.remove(o)
    m = mat('stone', STONE)
    for i, (fr, ur, lr) in enumerate(boxes):
        c = W((fr[0] + fr[1]) / 2, (ur[0] + ur[1]) / 2, (lr[0] + lr[1]) / 2)
        bpy.ops.mesh.primitive_cube_add(size=1, location=c)
        o = bpy.context.object; o.name = f'prop{i}'
        o.scale = (abs(lr[1] - lr[0]), abs(fr[1] - fr[0]), abs(ur[1] - ur[0]))
        o.data.materials.append(m)

def frame_camera(cam, fmin, fmax, umax, side=1.0, yaw=-18.0, ortho=False):
    """look at the move from the person's right (side=1) or left (side=-1), a little from the front"""
    sc = bpy.context.scene
    cf = (fmin + fmax) / 2; span = max(fmax - fmin + 0.8, (umax + 0.4) * sc.render.resolution_x / sc.render.resolution_y)
    target = W(cf, max(0.9, umax * 0.47), 0)
    a = math.radians(yaw)
    dist = span * 1.25 + 2.0
    pos = target + W(math.sin(a) * dist, 0.25 * dist, -side * math.cos(a) * dist)
    cam.location = pos
    d = (target - pos)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        cam.data.type = 'ORTHO'; cam.data.ortho_scale = span
    else:
        cam.data.type = 'PERSP'; cam.data.lens = 50
        cam.data.angle = 2 * math.atan(span / 2 / dist) * 1.02
