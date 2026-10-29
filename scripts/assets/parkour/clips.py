"""
Our parkour clips: the key poses. Timing is written from how the moves are done in real parkour (our own description, our own keys):
a fast approach, a short low last step, a takeoff that drives the hips up and forward, contacts that are brief and light, and a landing that
soaks the fall through the ankles, knees and hips before running on. 30 frames a second; distances in metres in the person's frame
(f forward, u up, l left); angles in degrees.
Every clip starts and ends close to a running or standing pose of the library, so the game can blend in and out.
"""
from rig import mirror

# ----------------------------------------------------------------------------------------------------------- shared poses
RUN_L = {  # left foot on the ground under the body, right leg swinging through, right arm forward
    'spine': (12, 0, -6), 'neck': (-8, 0, 4), 'body': (6, 0, 0),
    'hip_l': (8, 0, 0), 'knee_l': 25, 'ankle_l': 5, 'hip_r': (-5, 0, 0), 'knee_r': 95, 'ankle_r': 30,
    'arm_r': (0.12, 0.75, -0.55), 'fore_r': (0.0, 0.9, 0.55), 'arm_l': (0.15, -0.55, -0.8), 'fore_l': (0.05, 0.35, -1),
}
RUN_R = mirror(RUN_L)
RUN_L_AIR = {  # flight: left leg reaching forward, right leg trailing
    'spine': (10, 0, -4), 'neck': (-6, 0, 2), 'body': (6, 0, 0),
    'hip_l': (55, 0, 0), 'knee_l': 55, 'ankle_l': 5, 'hip_r': (-25, 0, 0), 'knee_r': 70, 'ankle_r': 25,
    'arm_r': (0.12, 0.85, -0.35), 'fore_r': (0.0, 0.7, 0.75), 'arm_l': (0.15, -0.7, -0.6), 'fore_l': (0.05, 0.25, -1),
}
RUN_R_AIR = mirror(RUN_L_AIR)
STAND = {'spine': (0, 0, 0), 'neck': (0, 0, 0), 'body': (0, 0, 0), 'hip_l': (0, 3, 0), 'hip_r': (0, 3, 0), 'knee_l': 3, 'knee_r': 3,
         'ankle_l': 0, 'ankle_r': 0, 'arm_l': (0.12, 0.02, -1), 'arm_r': (0.12, 0.02, -1), 'fore_l': (0.08, 0.15, -1), 'fore_r': (0.08, 0.15, -1),
         'hand_l': (0, 0, 0), 'hand_r': (0, 0, 0), 'clav_l': (0, 0), 'clav_r': (0, 0)}
CROUCH_LAND = {  # both feet down, deep knees, arms forward for balance
    'spine': (30, 0, 0), 'neck': (-25, 0, 0), 'body': (12, 0, 0),
    'hip_l': (85, 8, 0), 'hip_r': (85, 8, 0), 'knee_l': 115, 'knee_r': 115, 'ankle_l': -30, 'ankle_r': -30,
    'arm_l': (0.3, 0.8, -0.3), 'arm_r': (0.3, 0.8, -0.3), 'fore_l': (0.1, 1, 0.1), 'fore_r': (0.1, 1, 0.1),
}
TUCK = {  # knees to chest, hands near the shins
    'spine': (35, 0, 0), 'neck': (25, 0, 0),
    'hip_l': (125, 8, 0), 'hip_r': (125, 8, 0), 'knee_l': 140, 'knee_r': 140, 'ankle_l': 25, 'ankle_r': 25,
    'arm_l': (0.25, 0.9, -0.2), 'arm_r': (0.25, 0.9, -0.2), 'fore_l': (0.05, 0.2, -1), 'fore_r': (0.05, 0.2, -1),
}
GROUND = [('feet', 'u', 'min', 0.0)]

def on(h):
    return [('feet', 'u', 'min', h)]

def k(**kw):
    return kw

def merge(*ds, **kw):
    out = {}
    for d in ds:
        out.update(d)
    out.update(kw)
    return out

def arc(t0, t1, a, b, g=9.81):
    """a ballistic flight from pose position a (at frame t0) to b (at frame t1): straight across, a real parabola up and down"""
    T = (t1 - t0) / 30.0
    v0 = (b[1] - a[1] + 0.5 * g * T * T) / T
    def at(fr):
        t = (fr - t0) / 30.0; x = (fr - t0) / (t1 - t0)
        return (a[0] + (b[0] - a[0]) * x, a[1] + v0 * t - 0.5 * g * t * t, a[2] + (b[2] - a[2]) * x)
    return at

CLIPS = []
def clip(**c):
    CLIPS.append(c); return c

# ----------------------------------------------------------------------------------------------------------- speed vault
clip(id='vault', label='Speed vault', key='Digit7', needs={'obstacle': 'rail', 'height': [0.8, 1.15], 'depth': [0.05, 0.6], 'at': 1.6},
     props=[((1.55, 1.65), (0, 1.0), (-0.6, 0.6))],
     keys=[
         (0, merge(RUN_R, pos=(0.0, 0.88, 0), snap=GROUND)),
         (4, merge(RUN_R_AIR, pos=(0.62, 0.95, 0))),
         (7, merge(RUN_L, pos=(1.0, 0.86, 0), body=(-4, 0, 0), spine=(4, 0, 0), arm_l=(0.2, 0.9, -0.1), fore_l=(0.05, 1, -0.2), arm_r=(0.2, 0.8, 0.1), fore_r=(0.1, 1, 0.1), snap=GROUND)),
         (11, k(pos=(1.3, 1.28, 0.06), body=(-12, 18, 18), spine=(12, 8, 6), neck=(-10, -12, -14), hip_l=(75, 0, 0), knee_l=60, hip_r=(90, -5, 0), knee_r=70,
                ankle_l=20, ankle_r=20, arm_l=(0.15, 0.7, -0.75), fore_l=(0.1, 0.5, -1), arm_r=(0.7, 0.7, -0.2), fore_r=(0.5, 0.9, -0.1))),
         (14, k(pos=(1.62, 1.58, 0.14), body=(-22, 28, 28), spine=(18, 10, 8), neck=(-14, -18, -20), hip_l=(88, -8, 0), knee_l=30, hip_r=(92, -2, 0), knee_r=26,
                ankle_l=15, ankle_r=15, arm_l=(0.15, 0.15, -1), fore_l=(0.1, 0.05, -1), arm_r=(0.75, 0.6, -0.35), fore_r=(0.6, 0.8, -0.2),
                snap=[('hand_l', 'u', 'min', 1.0), ('hand_l', 'f', 'mean', 1.6)])),
         (17, k(pos=(2.02, 1.38, 0.1), body=(-10, 16, 14), spine=(12, 6, 4), neck=(-10, -8, -10), hip_l=(55, 0, 0), knee_l=35, hip_r=(80, -5, 0), knee_r=50, ankle_r=10,
                arm_l=(0.55, -0.3, -0.6), fore_l=(0.3, 0.2, -1), arm_r=(0.6, 0.7, -0.1), fore_r=(0.4, 1, 0.0))),
         (21, merge(RUN_R, pos=(2.5, 0.84, 0), body=(2, 0, 0), knee_r=40, hip_r=(20, 0, 0), snap=[('foot_r', 'u', 'min', 0.0)])),
         (25, merge(RUN_R_AIR, pos=(3.15, 0.95, 0))),
         (28, merge(RUN_L, pos=(3.65, 0.88, 0), snap=GROUND)),
     ],
     pins=[('foot_l', 7, 9), ('hand_l', 13, 16), ('foot_r', 21, 22)],
     contacts={'takeoff': 8, 'hand': [13, 16], 'land': 21})

# ----------------------------------------------------------------------------------------------------------- kong vault (dive, both hands, tuck through)
clip(id='kong', label='Kong vault', key='Digit8', needs={'obstacle': 'box', 'height': [0.8, 1.2], 'depth': [0.5, 1.2], 'at': 1.5},
     props=[((1.5, 2.3), (0, 1.0), (-0.6, 0.6))],
     keys=[
         (0, merge(RUN_R, pos=(0.0, 0.88, 0), snap=GROUND)),
         (4, merge(RUN_R_AIR, pos=(0.6, 0.95, 0))),
         (7, merge(RUN_L, pos=(0.98, 0.84, 0), body=(22, 0, 0), spine=(10, 0, 0), arm_l=(0.2, 0.5, 0.6), fore_l=(0.1, 0.9, 0.5), arm_r=(0.2, 0.5, 0.6), fore_r=(0.1, 0.9, 0.5), snap=GROUND)),
         (10, k(pos=(1.3, 1.3, 0), body=(55, 0, 0), spine=(5, 0, 0), neck=(-45, 0, 0), hip_l=(-10, 5, 0), knee_l=30, hip_r=(-25, 5, 0), knee_r=50, ankle_l=30, ankle_r=30,
                arm_l=(0.2, 1, 0.15), fore_l=(0.1, 1, 0.0), arm_r=(0.2, 1, 0.15), fore_r=(0.1, 1, 0.0))),
         (13, k(pos=(1.6, 1.62, 0), body=(70, 0, 0), spine=(15, 0, 0), neck=(-55, 0, 0), hip_l=(40, 15, 0), knee_l=100, hip_r=(30, 15, 0), knee_r=110,
                arm_l=(0.2, 0.6, -0.8), fore_l=(0.1, 0.6, -0.8), arm_r=(0.2, 0.6, -0.8), fore_r=(0.1, 0.6, -0.8), snap=[('hands', 'u', 'min', 1.0), ('hands', 'f', 'mean', 1.75)])),
         (16, k(pos=(1.95, 1.72, 0), body=(35, 0, 0), spine=(30, 0, 0), neck=(-35, 0, 0), hip_l=(125, 20, 0), knee_l=135, hip_r=(120, 20, 0), knee_r=135, ankle_l=20, ankle_r=20,
                arm_l=(0.15, -0.3, -1), fore_l=(0.1, -0.3, -1), arm_r=(0.15, -0.3, -1), fore_r=(0.1, -0.3, -1))),
         (19, k(pos=(2.4, 1.55, 0), body=(5, 0, 0), spine=(15, 0, 0), neck=(-10, 0, 0), hip_l=(85, 8, 0), knee_l=50, hip_r=(70, 8, 0), knee_r=60, ankle_l=0, ankle_r=0,
                arm_l=(0.4, -0.5, -0.2), fore_l=(0.2, 0.4, -0.6), arm_r=(0.4, -0.5, -0.2), fore_r=(0.2, 0.4, -0.6))),
         (23, merge(RUN_L, pos=(3.0, 0.84, 0), hip_l=(25, 0, 0), knee_l=45, body=(10, 0, 0), snap=[('foot_l', 'u', 'min', 0.0)])),
         (27, merge(RUN_L_AIR, pos=(3.6, 0.95, 0))),
         (30, merge(RUN_R, pos=(4.05, 0.88, 0), snap=GROUND)),
     ],
     pins=[('foot_l', 7, 8), ('hand_l', 13, 16), ('hand_r', 13, 16), ('foot_l', 23, 24)],
     contacts={'takeoff': 8, 'hand': [13, 16], 'land': 23})

# ----------------------------------------------------------------------------------------------------------- ledge climb (run, jump, grab, pull up)
LEDGE = 2.0; WALLF = 0.9
clip(id='climb', label='Ledge climb', key='Digit9', needs={'obstacle': 'ledge', 'height': [1.7, 2.2], 'at': WALLF},
     props=[((WALLF, 3.5), (0, LEDGE), (-1.0, 1.0))],
     keys=[
         (0, merge(RUN_R, pos=(-0.6, 0.88, 0), snap=GROUND)),
         (4, merge(RUN_L, pos=(-0.1, 0.84, 0), body=(-5, 0, 0), arm_l=(0.2, 0.6, 0.6), fore_l=(0.1, 0.5, 0.9), arm_r=(0.2, 0.6, 0.6), fore_r=(0.1, 0.5, 0.9), snap=GROUND)),
         (9, k(pos=(0.35, 1.45, 0), body=(0, 0, 0), spine=(0, 0, 0), neck=(-15, 0, 0), hip_l=(5, 3, 0), knee_l=20, hip_r=(70, 3, 0), knee_r=90, ankle_l=35, ankle_r=10,
               arm_l=(0.15, 0.3, 1), fore_l=(0.1, 0.4, 1), arm_r=(0.15, 0.3, 1), fore_r=(0.1, 0.4, 1))),
         (12, k(pos=(0.5, 1.3, 0), body=(6, 0, 0), neck=(-10, 0, 0), hip_l=(60, 5, 0), knee_l=95, hip_r=(70, 5, 0), knee_r=100, ankle_l=-5, ankle_r=-5,
                arm_l=(0.18, 0.3, 1), fore_l=(0.12, 0.4, 1), arm_r=(0.18, 0.3, 1), fore_r=(0.12, 0.4, 1), snap=[('hands', 'u', 'min', LEDGE), ('hands', 'f', 'max', WALLF + 0.15)])),
         (17, k(pos=(0.5, 1.22, 0), body=(2, 0, 0), hip_l=(55, 5, 0), knee_l=85, hip_r=(62, 5, 0), knee_r=92)),
         (22, k(pos=(0.55, 1.6, 0), body=(8, 0, 0), spine=(8, 0, 0), neck=(-20, 0, 0), hip_l=(75, 5, 0), knee_l=105, hip_r=(45, 5, 0), knee_r=70,
                arm_l=(0.25, 0.6, 0.2), fore_l=(0.1, 0.3, 1), arm_r=(0.25, 0.6, 0.2), fore_r=(0.1, 0.3, 1))),
         (26, k(pos=(0.78, LEDGE + 0.15, 0), body=(25, 0, 0), spine=(30, 0, 0), neck=(-25, 0, 0), hip_l=(30, 5, 0), knee_l=60, hip_r=(95, 5, 0), knee_r=120,
                arm_l=(0.3, -0.2, -1), fore_l=(0.1, 0.3, -1), arm_r=(0.3, -0.2, -1), fore_r=(0.1, 0.3, -1))),
         (30, k(pos=(1.05, LEDGE + 0.42, 0), ground=LEDGE, body=(25, 0, 0), spine=(30, 0, 0), neck=(-20, 0, 0), hip_l=(15, 5, 0), knee_l=60, hip_r=(105, 5, 0), knee_r=125, ankle_r=-10,
                arm_l=(0.3, 0.1, -1), fore_l=(0.1, 0.5, -1), arm_r=(0.3, 0.1, -1), fore_r=(0.1, 0.5, -1), snap=[('foot_r', 'u', 'min', LEDGE)])),
         (35, k(pos=(1.35, LEDGE + 0.65, 0), body=(15, 0, 0), spine=(20, 0, 0), neck=(-10, 0, 0), hip_l=(70, 5, 0), knee_l=100, hip_r=(70, 5, 0), knee_r=95, ankle_r=-20,
                arm_l=(0.3, 0.4, -0.8), fore_l=(0.1, 0.8, -0.4), arm_r=(0.3, 0.4, -0.8), fore_r=(0.1, 0.8, -0.4), snap=on(LEDGE))),
         (41, merge(STAND, pos=(1.5, LEDGE + 0.93, 0), snap=on(LEDGE))),
     ],
     pins=[('foot_l', 4, 5), ('hand_l', 12, 30), ('hand_r', 12, 30), ('foot_l', 13, 21, {'f': WALLF - 0.17}), ('foot_r', 13, 19, {'f': WALLF - 0.17}), ('foot_r', 30, 35)],
     contacts={'takeoff': 5, 'grab': 12, 'top': 30, 'stand': 41})

# ----------------------------------------------------------------------------------------------------------- wall run (wall on the left, three steps, kick off)
WALL = 0.75
clip(id='wallrun', label='Wall run', key='Digit0', needs={'obstacle': 'wall', 'side': 'left', 'distance': [0.5, 1.0], 'length': 4.0, 'height': [2.2, 99]}, yaw=-68.0,
     props=[((0.8, 4.8), (0, 3.0), (WALL, WALL + 0.3))],
     keys=[
         (0, merge(RUN_R, pos=(0.0, 0.88, 0), snap=GROUND)),
         (4, merge(RUN_R_AIR, pos=(0.6, 0.96, 0.12))),
         (7, merge(RUN_L, pos=(1.05, 0.86, 0.22), body=(4, -10, 0), snap=GROUND)),
         (10, merge(RUN_L_AIR, pos=(1.55, 1.1, 0.35), body=(8, -24, 0), spine=(10, 6, -5), hip_l=(70, 25, 0), knee_l=85, hip_r=(-15, 10, 0))),
         (13, merge(RUN_L, pos=(1.95, 1.3, 0.38), body=(6, -28, 0), spine=(10, 8, -8), hip_l=(40, 30, 0), knee_l=70, ankle_l=-10, snap=[('foot_l', 'l', 'max', WALL)])),
         (16, merge(RUN_R_AIR, pos=(2.45, 1.48, 0.38), body=(6, -30, 0), spine=(8, 8, 8), hip_r=(70, -20, 0), knee_r=80, hip_l=(-10, 30, 0))),
         (19, merge(RUN_R, pos=(2.95, 1.55, 0.36), body=(6, -30, 0), spine=(8, 8, 8), hip_r=(45, -25, 0), knee_r=75, snap=[('foot_r', 'l', 'max', WALL)])),
         (22, merge(RUN_L_AIR, pos=(3.4, 1.62, 0.36), body=(5, -28, 0), hip_l=(70, 25, 0), knee_l=85)),
         (25, merge(RUN_L, pos=(3.8, 1.62, 0.36), body=(0, -28, 0), hip_l=(55, 30, 0), knee_l=95, ankle_l=-15, arm_r=(0.6, 0.6, 0.4), fore_r=(0.4, 0.9, 0.5), snap=[('foot_l', 'l', 'max', WALL)])),
         (29, k(pos=(4.35, 1.75, -0.1), body=(0, -5, -15), spine=(5, 0, 0), neck=(-5, 0, 10), hip_l=(70, 5, 0), knee_l=100, hip_r=(90, 5, 0), knee_r=110, ankle_l=10, ankle_r=10,
                arm_l=(0.7, 0.4, 0.3), fore_l=(0.5, 0.8, 0.3), arm_r=(0.8, 0.3, 0.3), fore_r=(0.5, 0.8, 0.3))),
         (34, merge(CROUCH_LAND, pos=(5.0, 0.7, -0.45), body=(8, 0, -10), hip_l=(60, 8, 0), hip_r=(70, 8, 0), knee_l=85, knee_r=90, snap=GROUND)),
         (38, merge(RUN_L_AIR, pos=(5.55, 0.92, -0.5))),
         (41, merge(RUN_R, pos=(6.0, 0.88, -0.5), snap=GROUND)),
     ],
     pins=[('foot_l', 7, 8), ('foot_l', 13, 14), ('foot_r', 19, 20), ('foot_l', 25, 26), ('foot_l', 34, 36), ('foot_r', 34, 36)],
     contacts={'takeoff': 8, 'wall': [13, 19, 25], 'jump': 27, 'land': 34})

# ----------------------------------------------------------------------------------------------------------- front flip (hurdle, two-foot punch, tuck)
def flip(axis, a):
    return (a, 0, 0) if axis == 'pitch' else (0, a, 0)

def flip_keys(axis):
    sg = 1 if axis == 'pitch' else -1
    A = arc(10, 30, (1.38, 1.12, 0), (2.78, 0.92, 0))
    end = (lambda a: flip(axis, a * sg)) if axis == 'pitch' else (lambda a: (a - 360 if a > 300 else 0, -360, 0))
    return [
        (0, merge(RUN_R, pos=(0.0, 0.88, 0), snap=GROUND)),
        (4, merge(RUN_R_AIR, pos=(0.6, 1.0, 0), hip_r=(30, 0, 0), knee_r=60, hip_l=(20, 0, 0), knee_l=70, arm_l=(0.2, -0.6, 0.2), fore_l=(0.1, -0.2, -1), arm_r=(0.2, -0.6, 0.2), fore_r=(0.1, -0.2, -1))),
        (8, merge(CROUCH_LAND, pos=(1.1, 0.72, 0), body=(5, 0, 0), spine=(20, 0, 0), neck=(-10, 0, 0), hip_l=(65, 5, 0), hip_r=(65, 5, 0), knee_l=85, knee_r=85, ankle_l=-20, ankle_r=-20,
                  arm_l=(0.2, 0.6, 1), fore_l=(0.1, 0.4, 1), arm_r=(0.2, 0.6, 1), fore_r=(0.1, 0.4, 1), snap=GROUND)),
        (10, merge(STAND, pos=A(10), body=flip(axis, 12 * sg), spine=(0, 0, 0), neck=(0, 0, 0), hip_l=(5, 4, 0), hip_r=(5, 4, 0), knee_l=8, knee_r=8, ankle_l=40, ankle_r=40,
                   arm_l=(0.2, 0.25, 1), fore_l=(0.1, 0.3, 1), arm_r=(0.2, 0.25, 1), fore_r=(0.1, 0.3, 1))),
        (13, merge(STAND, pos=A(13), body=flip(axis, 45 * sg), spine=(20, 0, 0), neck=(15, 0, 0), hip_l=(70, 6, 0), hip_r=(70, 6, 0), knee_l=90, knee_r=90, ankle_l=30, ankle_r=30,
                   arm_l=(0.2, 0.8, 0.4), fore_l=(0.1, 0.9, -0.2), arm_r=(0.2, 0.8, 0.4), fore_r=(0.1, 0.9, -0.2))),
        (16, merge(TUCK, pos=A(16), body=flip(axis, 120 * sg))),
        (19, merge(TUCK, pos=A(19), body=flip(axis, 205 * sg))),
        (22, merge(TUCK, pos=A(22), body=flip(axis, 285 * sg))),
        (26, merge(TUCK, pos=A(26), body=flip(axis, 340 * sg), spine=(12, 0, 0), neck=(-5, 0, 0), hip_l=(60, 8, 0), hip_r=(60, 8, 0), knee_l=45, knee_r=45, ankle_l=10, ankle_r=10,
                  arm_l=(0.6, 0.4, 0.4), fore_l=(0.4, 0.8, 0.3), arm_r=(0.6, 0.4, 0.4), fore_r=(0.4, 0.8, 0.3))),
        (30, merge(STAND, pos=A(30), body=end(358), spine=(10, 0, 0), hip_l=(25, 6, 0), hip_r=(25, 6, 0), knee_l=30, knee_r=30, ankle_l=-5, ankle_r=-5,
                   arm_l=(0.5, 0.6, 0.3), fore_l=(0.3, 0.9, 0.2), arm_r=(0.5, 0.6, 0.3), fore_r=(0.3, 0.9, 0.2), snap=GROUND)),
        (34, merge(CROUCH_LAND, pos=(2.9, 0.68, 0), body=end(368), snap=GROUND)),
        (40, merge(CROUCH_LAND, pos=(2.95, 0.8, 0), body=end(362), hip_l=(45, 5, 0), hip_r=(45, 5, 0), knee_l=55, knee_r=55, ankle_l=-12, ankle_r=-12, spine=(12, 0, 0), arm_l=(0.3, 0.5, -0.5), fore_l=(0.2, 0.8, -0.2), arm_r=(0.3, 0.5, -0.5), fore_r=(0.2, 0.8, -0.2), snap=GROUND)),
        (48, merge(STAND, pos=(2.98, 0.92, 0), body=end(360), snap=GROUND)),
    ]

FLIP_PINS = [('foot_l', 8, 9), ('foot_r', 8, 9), ('foot_l', 30, 48), ('foot_r', 30, 48)]
clip(id='frontflip', label='Front flip', key='KeyT', needs={'obstacle': None, 'clear': 3.2}, keys=flip_keys('pitch'),
     pins=FLIP_PINS, contacts={'takeoff': 10, 'land': 30})
clip(id='sideflip', label='Side flip', key='KeyY', needs={'obstacle': None, 'clear': 3.2}, keys=flip_keys('roll'), yaw=-78.0,
     pins=FLIP_PINS, contacts={'takeoff': 10, 'land': 30})

# ----------------------------------------------------------------------------------------------------------- drop from height into a roll, run on
H = 2.0
DROP = arc(7, 29, (0.45, H + 0.98, 0), (3.2, 0.92, 0))
clip(id='droproll', label='Drop and roll', key='KeyG', needs={'obstacle': 'drop', 'height': [1.2, 3.0]},
     props=[((-1.4, 0.2), (0, H), (-1.0, 1.0))],
     keys=[
         (0, merge(RUN_R, pos=(-0.6, H + 0.88, 0), ground=H, snap=on(H))),
         (5, merge(RUN_L, pos=(0.1, H + 0.86, 0), ground=H, body=(0, 0, 0), arm_l=(0.3, 0.6, 0.5), fore_l=(0.2, 0.8, 0.5), arm_r=(0.3, 0.6, 0.5), fore_r=(0.2, 0.8, 0.5), snap=on(H))),
         (7, merge(RUN_L, pos=DROP(7), ground=H, body=(0, 0, 0), ankle_l=40, knee_l=10, arm_l=(0.3, 0.6, 0.6), fore_l=(0.2, 0.8, 0.5), arm_r=(0.3, 0.6, 0.6), fore_r=(0.2, 0.8, 0.5))),
         (12, merge(RUN_L_AIR, pos=DROP(12), ground=H, hip_l=(50, 5, 0), hip_r=(5, 5, 0), knee_r=60, arm_l=(0.6, 0.4, 0.5), fore_l=(0.3, 0.6, 0.6), arm_r=(0.6, 0.4, 0.5), fore_r=(0.3, 0.6, 0.6))),
         (19, k(pos=DROP(19), body=(4, 0, 0), spine=(5, 0, 0), neck=(-10, 0, 0), hip_l=(40, 6, 0), hip_r=(30, 6, 0), knee_l=40, knee_r=50, ankle_l=10, ankle_r=10,
                arm_l=(0.7, 0.3, 0.5), fore_l=(0.4, 0.5, 0.6), arm_r=(0.7, 0.3, 0.5), fore_r=(0.4, 0.5, 0.6))),
         (25, k(pos=DROP(25), ground=0.0, body=(8, 0, 0), spine=(8, 0, 0), neck=(-10, 0, 0), hip_l=(30, 6, 0), hip_r=(30, 6, 0), knee_l=25, knee_r=25, ankle_l=15, ankle_r=15,
                arm_l=(0.5, 0.6, 0.3), fore_l=(0.3, 0.8, 0.3), arm_r=(0.5, 0.6, 0.3), fore_r=(0.3, 0.8, 0.3))),
         (29, merge(STAND, pos=DROP(29), body=(10, 0, 0), spine=(10, 0, 0), hip_l=(20, 6, 0), hip_r=(20, 6, 0), knee_l=20, knee_r=20, arm_l=(0.4, 0.8, 0.0), fore_l=(0.2, 1, 0.1), arm_r=(0.4, 0.8, 0.0), fore_r=(0.2, 1, 0.1), snap=GROUND)),
         (32, merge(CROUCH_LAND, pos=(3.4, 0.62, 0), body=(22, 0, 0), snap=GROUND)),
         (35, merge(CROUCH_LAND, pos=(3.62, 0.5, 0), body=(45, 0, 6), spine=(45, 0, 0), neck=(35, 0, -12), arm_l=(0.2, 0.7, -0.6), fore_l=(0.0, 1, -0.4), arm_r=(0.3, 0.9, -0.2), fore_r=(0.0, 1, -0.4), snap=GROUND)),
         (38, merge(TUCK, pos=(3.95, 0.5, 0), body=(115, 14, 10), neck=(40, 0, 0), snap=[('body', 'u', 'min', 0.0)])),
         (41, merge(TUCK, pos=(4.25, 0.5, 0), body=(200, 12, 8), neck=(40, 0, 0), snap=[('body', 'u', 'min', 0.0)])),
         (44, merge(TUCK, pos=(4.55, 0.5, 0), body=(280, 6, 4), neck=(25, 0, 0), snap=[('body', 'u', 'min', 0.0)])),
         (47, merge(CROUCH_LAND, pos=(4.85, 0.6, 0), body=(345, 0, 0), spine=(35, 0, 0), arm_l=(0.3, 0.9, -0.1), fore_l=(0.1, 1, 0.2), arm_r=(0.3, 0.9, -0.1), fore_r=(0.1, 1, 0.2), snap=GROUND)),
         (51, merge(RUN_R, pos=(5.3, 0.82, 0), body=(365, 0, 0), hip_r=(25, 0, 0), knee_r=50, snap=[('foot_r', 'u', 'min', 0.0)])),
         (55, merge(RUN_R_AIR, pos=(5.9, 0.95, 0), body=(366, 0, 0))),
         (58, merge(RUN_L, pos=(6.35, 0.88, 0), body=(366, 0, 0), snap=GROUND)),
     ],
     pins=[('foot_l', 5, 6), ('foot_l', 29, 36), ('foot_r', 29, 36), ('foot_r', 51, 52)],
     contacts={'takeoff': 7, 'land': 29, 'roll': [35, 47]})

# ----------------------------------------------------------------------------------------------------------- cat leap to a wall, climb up
TOP = 2.3; FACE = 1.7
clip(id='catleap', label='Cat leap', key='KeyC', needs={'obstacle': 'wall', 'height': [2.0, 2.5], 'at': FACE},
     props=[((FACE, FACE + 2.5), (0, TOP), (-1.0, 1.0))],
     keys=[
         (0, merge(STAND, pos=(0.0, 0.92, 0), snap=GROUND)),
         (7, merge(CROUCH_LAND, pos=(0.0, 0.66, 0), body=(25, 0, 0), spine=(20, 0, 0), neck=(-25, 0, 0), arm_l=(0.3, -0.7, -0.2), fore_l=(0.1, -0.5, -0.8), arm_r=(0.3, -0.7, -0.2), fore_r=(0.1, -0.5, -0.8), snap=GROUND)),
         (11, merge(STAND, pos=(0.32, 1.1, 0), body=(28, 0, 0), spine=(0, 0, 0), neck=(-25, 0, 0), ankle_l=45, ankle_r=45, arm_l=(0.2, 0.8, 0.6), fore_l=(0.1, 0.6, 0.8), arm_r=(0.2, 0.8, 0.6), fore_r=(0.1, 0.6, 0.8))),
         (16, k(pos=(0.9, 1.6, 0), body=(10, 0, 0), spine=(5, 0, 0), neck=(-20, 0, 0), hip_l=(55, 8, 0), hip_r=(65, 8, 0), knee_l=70, knee_r=80, ankle_l=0, ankle_r=0,
                arm_l=(0.18, 0.5, 0.9), fore_l=(0.1, 0.5, 1), arm_r=(0.18, 0.5, 0.9), fore_r=(0.1, 0.5, 1))),
         (20, k(pos=(1.25, 1.45, 0), body=(5, 0, 0), hip_l=(75, 10, 0), hip_r=(85, 10, 0), knee_l=85, knee_r=95, ankle_l=-10, ankle_r=-10,
                arm_l=(0.18, 0.3, 1), fore_l=(0.12, 0.5, 1), arm_r=(0.18, 0.3, 1), fore_r=(0.12, 0.5, 1), snap=[('hands', 'u', 'min', TOP), ('hands', 'f', 'max', FACE + 0.12)])),
         (25, k(pos=(1.22, 1.4, 0), body=(2, 0, 0), hip_l=(70, 10, 0), hip_r=(80, 10, 0), knee_l=90, knee_r=100)),
         (29, k(pos=(1.3, 1.8, 0), body=(10, 0, 0), spine=(8, 0, 0), neck=(-20, 0, 0), hip_l=(95, 8, 0), knee_l=110, hip_r=(45, 8, 0), knee_r=60, ankle_r=20,
                arm_l=(0.25, 0.6, 0.2), fore_l=(0.1, 0.3, 1), arm_r=(0.25, 0.6, 0.2), fore_r=(0.1, 0.3, 1))),
         (33, k(pos=(1.48, 2.42, 0), body=(25, 0, 0), spine=(30, 0, 0), neck=(-25, 0, 0), hip_l=(30, 5, 0), knee_l=60, hip_r=(95, 5, 0), knee_r=120,
                arm_l=(0.3, -0.2, -1), fore_l=(0.1, 0.3, -1), arm_r=(0.3, -0.2, -1), fore_r=(0.1, 0.3, -1))),
         (37, k(pos=(1.85, TOP + 0.42, 0), ground=TOP, body=(25, 0, 0), spine=(30, 0, 0), neck=(-20, 0, 0), hip_l=(15, 5, 0), knee_l=60, hip_r=(105, 5, 0), knee_r=125, ankle_r=-10,
                arm_l=(0.3, 0.1, -1), fore_l=(0.1, 0.5, -1), arm_r=(0.3, 0.1, -1), fore_r=(0.1, 0.5, -1), snap=[('foot_r', 'u', 'min', TOP)])),
         (42, k(pos=(2.1, TOP + 0.65, 0), body=(15, 0, 0), spine=(20, 0, 0), neck=(-10, 0, 0), hip_l=(70, 5, 0), knee_l=100, hip_r=(70, 5, 0), knee_r=95, ankle_r=-20,
                arm_l=(0.3, 0.4, -0.8), fore_l=(0.1, 0.8, -0.4), arm_r=(0.3, 0.4, -0.8), fore_r=(0.1, 0.8, -0.4), snap=on(TOP))),
         (48, merge(STAND, pos=(2.25, TOP + 0.92, 0), snap=on(TOP))),
     ],
     pins=[('foot_l', 7, 10), ('foot_r', 7, 10), ('hand_l', 20, 37), ('hand_r', 20, 37), ('foot_l', 20, 27, {'f': FACE - 0.17}), ('foot_r', 20, 25, {'f': FACE - 0.17}), ('foot_r', 37, 42)],
     contacts={'takeoff': 10, 'catch': 20, 'top': 37, 'stand': 48})
