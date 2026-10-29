"""
Our parkour clips (2026-10-26): a small keyframing kit for the Universal Animation Library mannequin's skeleton, run inside Blender
(headless). A clip is a list of key poses written in the person's own frame (forward, up, left; angles in degrees), so no bone axes are guessed:
each joint turns about the body's axes (bend = forward / back, side = towards the left, twist = turning left) relative to its parent.
Extras on a key:
  - snap: move the body so a part of the mesh touches something (feet on the ground, hands on a rail, feet on a wall)
  - pins (per clip): hold a hand or foot still in the world over a span (two-bone IK), so planted contacts never slide
Then the clip is baked (every frame, constraints removed) and exported by author.py.
Not part of the app build. Our own work, CC0 like the mannequin.
"""
import bpy, math
from mathutils import Quaternion, Vector, Matrix

FPS = 30
SIDE = ('l', 'r')
LIMB_TIP = {'foot_l': 'calf_l', 'foot_r': 'calf_r', 'hand_l': 'lowerarm_l', 'hand_r': 'lowerarm_r'}
SPINE = (('spine_01', 0.3), ('spine_02', 0.35), ('spine_03', 0.35))
NECK = (('neck_01', 0.5), ('Head', 0.5))
SETS = {  # mesh regions by the bone that moves each vertex most
    'body': None,
    'feet': ('foot_l', 'foot_r', 'ball_l', 'ball_r', 'ball_leaf_l', 'ball_leaf_r'),
    'foot_l': ('foot_l', 'ball_l', 'ball_leaf_l'), 'foot_r': ('foot_r', 'ball_r', 'ball_leaf_r'),
    'hands': ('hand_l', 'hand_r'), 'hand_l': ('hand_l',), 'hand_r': ('hand_r',),
    'back': ('spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'),
}
for s in SIDE:
    for f in ('index', 'middle', 'pinky', 'ring', 'thumb'):
        for i in ('01', '02', '03', '04_leaf'):
            SETS['hands'] += (f'{f}_{i}_{s}',); SETS[f'hand_{s}'] += (f'{f}_{i}_{s}',)

def W(f=0.0, u=0.0, l=0.0):
    """the person's frame (forward, up, left) → armature space (the mannequin faces −Y, its left is +X)"""
    return Vector((l, -f, u))

def eul(bend=0.0, side=0.0, twist=0.0):
    """bend forward about the left axis, then lean to the left, then turn to the left (degrees), in armature axes"""
    r = math.radians
    return Quaternion((0, 0, 1), r(twist)) @ Quaternion((0, 1, 0), r(side)) @ Quaternion((1, 0, 0), r(bend))

def aim_q(rest_dir: Vector, d) -> Quaternion:
    """shortest turn from the bone's rest direction to d (out, fwd, up; out = away from the body's middle line, set per side)"""
    return rest_dir.normalized().rotation_difference(Vector(d).normalized())

# ---------------------------------------------------------------- the default pose: standing, arms down, everything else straight
NEUTRAL = {
    'pos': (0.0, 0.93, 0.0), 'ground': 0.0, 'rootf': None, 'rootl': None,
    'body': (0, 0, 0), 'spine': (0, 0, 0), 'neck': (0, 0, 0),
    'hip_l': (0, 0, 0), 'hip_r': (0, 0, 0), 'knee_l': 0, 'knee_r': 0, 'ankle_l': 0, 'ankle_r': 0, 'toe_l': 0, 'toe_r': 0,
    'clav_l': (0, 0), 'clav_r': (0, 0),
    'arm_l': (0.12, 0.02, -1), 'arm_r': (0.12, 0.02, -1), 'fore_l': (0.08, 0.12, -1), 'fore_r': (0.08, 0.12, -1),
    'hand_l': (0, 0, 0), 'hand_r': (0, 0, 0),
}

def mirror(k: dict) -> dict:
    """the same pose with left and right swapped (lean, turn and sideways place change sign)"""
    out = {}
    for key, v in k.items():
        if key.endswith('_l') or key.endswith('_r'):
            key2 = key[:-1] + ('r' if key.endswith('_l') else 'l')
        else:
            key2 = key
        if key in ('body', 'spine', 'neck') and v is not None:
            v = (v[0], -v[1], -v[2])
        elif key.startswith('hip_') and v is not None:
            v = (v[0], v[1], v[2])  # abduction / twist are already written per side (outward / inward)
        elif key == 'pos' and v is not None:
            v = (v[0], v[1], -v[2])
        elif key == 'rootl' and v is not None:
            v = -v
        out[key2] = v
    def side(n):
        return n[:-1] + ('r' if n.endswith('_l') else 'l') if n[-2:] in ('_l', '_r') else n
    if k.get('snap'):
        out['snap'] = [(side(r), ax, {'min': 'max', 'max': 'min'}.get(m, m) if ax == 'l' else m, -v if ax == 'l' else v) for r, ax, m, v in k['snap']]
    return out


class Rig:
    def __init__(self, src: str):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=src)
        for o in list(bpy.data.objects):
            if o.type == 'MESH' and o.parent is None:
                bpy.data.objects.remove(o)
        self.arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
        self.mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
        if self.arm.animation_data:
            self.arm.animation_data.action = None
        for a in list(bpy.data.actions):
            bpy.data.actions.remove(a)
        sc = bpy.context.scene
        sc.render.fps = FPS
        self.pb = self.arm.pose.bones
        for b in self.pb:
            b.rotation_mode = 'QUATERNION'
        self.rest = {b.name: b.bone.matrix_local.to_quaternion() for b in self.pb}
        self.rest_head = {b.name: b.bone.head_local.copy() for b in self.pb}
        self.rest_dir = {b.name: (b.bone.tail_local - b.bone.head_local).normalized() for b in self.pb}
        groups = {g.index: g.name for g in self.mesh.vertex_groups}
        self.vset = {}
        dom = []
        for v in self.mesh.data.vertices:
            best = max(v.groups, key=lambda g: g.weight, default=None)
            dom.append(groups[best.group] if best else '')
        for name, bones in SETS.items():
            self.vset[name] = None if bones is None else [i for i, g in enumerate(dom) if g in bones]

    # ------------------------------------------------------------ pose maths
    def basis(self, bone: str, q_arm: Quaternion) -> Quaternion:
        """a turn given in armature axes (relative to the parent's frame) → the bone's own rotation channel"""
        r = self.rest[bone]
        return r.inverted() @ q_arm @ r

    def apply(self, k: dict):
        """pose the armature from a full key (no interpolation): returns nothing, sets channels"""
        pb = self.pb
        for b in pb:
            b.rotation_quaternion = Quaternion()
            b.location = Vector()
        rf = k['rootf'] if k['rootf'] is not None else k['pos'][0]
        rl = k['rootl'] if k['rootl'] is not None else k['pos'][2]
        root_loc = W(rf, k['ground'], rl)
        pb['root'].location = root_loc
        want = W(*k['pos'])
        off = want - (root_loc + self.rest_head['pelvis'])
        pb['pelvis'].location = self.rest['pelvis'].inverted() @ off
        pb['pelvis'].rotation_quaternion = self.basis('pelvis', eul(*k['body']))
        for name, w in SPINE:
            b, s, t = k['spine']; pb[name].rotation_quaternion = self.basis(name, eul(b * w, s * w, t * w))
        for name, w in NECK:
            b, s, t = k['neck']; pb[name].rotation_quaternion = self.basis(name, eul(b * w, s * w, t * w))
        for s in SIDE:
            sg = 1 if s == 'l' else -1
            flex, abd, tw = k['hip_' + s]
            # flex: thigh forward/up; abd: outward; tw: knee turns outward
            q = Quaternion((0, 0, 1), math.radians(-tw * sg)) @ Quaternion((0, 1, 0), math.radians(-abd * sg)) @ Quaternion((1, 0, 0), math.radians(-flex))
            pb['thigh_' + s].rotation_quaternion = self.basis('thigh_' + s, q)
            pb['calf_' + s].rotation_quaternion = self.basis('calf_' + s, Quaternion((1, 0, 0), math.radians(k['knee_' + s])))
            pb['foot_' + s].rotation_quaternion = self.basis('foot_' + s, Quaternion((1, 0, 0), math.radians(k['ankle_' + s])))
            pb['ball_' + s].rotation_quaternion = self.basis('ball_' + s, Quaternion((1, 0, 0), math.radians(-k['toe_' + s])))
            up, fw = k['clav_' + s]
            pb['clavicle_' + s].rotation_quaternion = self.basis('clavicle_' + s, Quaternion((0, 1, 0), math.radians(-up * sg)) @ Quaternion((0, 0, 1), math.radians(-fw * sg)))
            a = k['arm_' + s]; f = k['fore_' + s]
            da = Vector((a[0] * sg, -a[1], a[2])); df = Vector((f[0] * sg, -f[1], f[2]))
            qa = aim_q(self.rest_dir['upperarm_' + s], da)
            pb['upperarm_' + s].rotation_quaternion = self.basis('upperarm_' + s, qa)
            qf = qa.inverted() @ aim_q(self.rest_dir['lowerarm_' + s], df)
            pb['lowerarm_' + s].rotation_quaternion = self.basis('lowerarm_' + s, qf)
            hb, hs, ht = k['hand_' + s]
            pb['hand_' + s].rotation_quaternion = self.basis('hand_' + s, eul(hb, hs * sg, ht * sg))
        bpy.context.view_layer.update()

    def verts(self, which: str):
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.mesh.evaluated_get(dg)
        me = ev.to_mesh()
        mw = self.mesh.matrix_world
        idx = self.vset[which]
        pts = [mw @ me.vertices[i].co for i in (range(len(me.vertices)) if idx is None else idx)]
        ev.to_mesh_clear()
        return pts

    def snap(self, k: dict, rules):
        """rules: (region, axis f|u|l, min|max|mean, value): move the whole body (pelvis) so the region meets the value"""
        for _ in range(2):
            for region, axis, mode, val in rules:
                self.apply(k)
                pts = self.verts(region)
                comp = {'f': lambda p: -p.y, 'u': lambda p: p.z, 'l': lambda p: p.x}[axis]
                vals = [comp(p) for p in pts]
                cur = min(vals) if mode == 'min' else max(vals) if mode == 'max' else sum(vals) / len(vals)
                d = val - cur
                f, u, l = k['pos']
                k['pos'] = (f + d, u, l) if axis == 'f' else (f, u + d, l) if axis == 'u' else (f, u, l + d)
        self.apply(k)

    def tip_world(self, limb: str) -> Vector:
        b = self.pb[LIMB_TIP[limb]]
        return self.arm.matrix_world @ b.tail

    # ------------------------------------------------------------ build one clip
    def build(self, name: str, keys, pins=(), loop=False):
        """keys: [(frame, {overrides})] in order; each key keeps the previous key's values it doesn't set. Returns metadata."""
        act = bpy.data.actions.new(name)
        self.arm.animation_data_create()
        self.arm.animation_data.action = act
        full = []
        cur = dict(NEUTRAL)
        prevq = {}
        bones = [b for b in self.pb if not b.name.startswith(('index', 'middle', 'pinky', 'ring', 'thumb'))]
        for fr, over in keys:
            cur = dict(cur)
            cur.update({kk: vv for kk, vv in over.items() if kk != 'snap'})
            if 'rootf' not in over:
                cur['rootf'] = None
            k = dict(cur)
            if over.get('snap'):
                self.snap(k, over['snap'])
                cur['pos'] = k['pos']
            else:
                self.apply(k)
            full.append((fr, k))
            for b in bones:
                q = b.rotation_quaternion.copy()
                if b.name in prevq and prevq[b.name].dot(q) < 0:
                    q.negate(); b.rotation_quaternion = q
                prevq[b.name] = q.copy()
                b.keyframe_insert('rotation_quaternion', frame=fr)
                if b.name in ('root', 'pelvis'):
                    b.keyframe_insert('location', frame=fr)
        end = keys[-1][0]
        # planted contacts: an IK target per span, held where the limb is at the span's first frame
        made = []
        for limb, f0, f1, *opt in pins:
            bpy.context.scene.frame_set(f0)
            bpy.context.view_layer.update()
            p = self.tip_world(limb)
            if opt and opt[0]:
                o = opt[0]
                if 'u' in o: p.z = o['u']
                if 'f' in o: p.y = -o['f']
                if 'l' in o: p.x = o['l']
            e = bpy.data.objects.new(f'pin_{name}_{limb}_{f0}', None)
            bpy.context.scene.collection.objects.link(e)
            e.location = p
            c = self.pb[LIMB_TIP[limb]].constraints.new('IK')
            c.target = e; c.chain_count = 2; c.use_tail = True; c.use_stretch = False
            ramp = 2
            for fr, inf in ((max(0, f0 - ramp), 0.0 if f0 > 0 else 1.0), (f0, 1.0), (f1, 1.0), (min(end, f1 + ramp), 0.0 if f1 < end else 1.0)):
                c.influence = inf; c.keyframe_insert('influence', frame=fr)
            made.append(e)
        sc = bpy.context.scene
        sc.frame_start, sc.frame_end = 0, end
        if pins:
            bpy.context.view_layer.objects.active = self.arm
            self.arm.select_set(True)
            bpy.ops.object.mode_set(mode='POSE')
            bpy.ops.pose.select_all(action='SELECT')
            bpy.ops.nla.bake(frame_start=0, frame_end=end, only_selected=False, visual_keying=True, clear_constraints=True, use_current_action=True, bake_types={'POSE'})
            bpy.ops.object.mode_set(mode='OBJECT')
            for e in made:
                bpy.data.objects.remove(e)
            act = self.arm.animation_data.action
            act.name = name
        act.use_fake_user = True
        act.use_frame_range = True; act.frame_start = 0; act.frame_end = end
        return {'frames': end, 'keys': full}
