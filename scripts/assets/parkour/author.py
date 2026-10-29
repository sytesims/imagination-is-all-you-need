"""
Our parkour clips: build every clip in clips.py on the Universal Animation Library mannequin, export them as one animation-only GLB, and draw
previews. Run with Blender 4.2+ (headless):
  Blender -b --python scripts/assets/parkour/author.py -- --src UAL1_Standard.glb --out parkour-raw.glb [--only vault,flip] [--preview DIR]
Then compress: node scripts/assets/parkour/pack.mjs parkour-raw.glb web/public/models/mannequin/parkour.glb (writes parkour.json next to it).
--preview DIR renders each clip's frames to DIR/<id>/0000.png (Workbench, a side view) for the contact sheet and the video.
"""
import sys, os, json, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import rig, stage
from clips import CLIPS

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True); ap.add_argument('--out'); ap.add_argument('--only'); ap.add_argument('--preview'); ap.add_argument('--step', type=int, default=1)
ap.add_argument('--meta')
a = ap.parse_args(argv)
only = set(a.only.split(',')) if a.only else None

R = rig.Rig(a.src)
built = []
for c in CLIPS:
    if only and c['id'] not in only:
        continue
    info = R.build(c['id'], c['keys'], c.get('pins', ()))
    act = bpy.data.actions[c['id']]
    # where the clip ends up (root motion) and how high the body goes
    sc = bpy.context.scene
    R.arm.animation_data.action = act
    sc.frame_set(info['frames'])
    end = R.pb['root'].location.copy()
    built.append({**{kk: c[kk] for kk in ('id', 'label', 'key', 'needs', 'contacts') if kk in c}, 'frames': info['frames'], 'fps': rig.FPS,
                  'seconds': round(info['frames'] / rig.FPS, 3), 'move': [round(-end.y, 3), round(end.z, 3), round(end.x, 3)], 'props': c.get('props', [])})

if a.preview:
    cam = stage.setup(R)
    sc = bpy.context.scene
    for c, b in zip([c for c in CLIPS if not only or c['id'] in only], built):
        R.arm.animation_data.action = bpy.data.actions[c['id']]
        stage.props(c.get('props', []))
        fs = [p[0] for p in c.get('props', [])]
        umax = max([1.9 + b['move'][1], 2.2] + [min(p[1][1], 2.6) + 0.6 for p in c.get('props', [])])
        stage.frame_camera(cam, min([0.0] + [f[0] for f in fs]) - 0.3, max([b['move'][0]] + [f[1] for f in fs]) + 0.3, umax, side=c.get('view', 1.0), yaw=c.get('yaw', -18.0))
        d = os.path.join(a.preview, c['id']); os.makedirs(d, exist_ok=True)
        for f in range(0, b['frames'] + 1, a.step):
            sc.frame_set(f); sc.render.filepath = os.path.join(d, f'{f:04d}.png'); bpy.ops.render.render(write_still=True)
        stage.props([])

if a.out:
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o)
    R.arm.animation_data.action = None
    bpy.ops.object.select_all(action='DESELECT'); R.arm.select_set(True)
    bpy.ops.export_scene.gltf(filepath=a.out, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
                              export_force_sampling=True, export_frame_step=1, export_skins=False, export_morph=False, export_def_bones=False,
                              export_anim_single_armature=True, export_reset_pose_bones=True)
if a.meta:
    with open(a.meta, 'w') as fh:
        json.dump(built, fh, indent=1)
print('BUILT', json.dumps([{k: b[k] for k in ('id', 'frames', 'move')} for b in built]))
