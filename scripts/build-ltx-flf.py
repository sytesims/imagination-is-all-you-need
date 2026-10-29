#!/usr/bin/env python3
"""(O) LTX-2 first + last frame camera graph, built from our own camera-ltx-api.json (clean room: node signatures from our
ComfyUI object_info, comfy_extras.nodes_lt; no template JSON copied).

Writes workflows/camera-ltx-flf-api.json and its Comfy Cloud twin workflows/cloud/camera-ltx-flf-api.json (same graph: core nodes only,
no API nodes, same model files as camera-ltx-api.json, which are all on the public Comfy Cloud list).

Changes vs camera-ltx-api.json:
  200 LoadImage (end frame) -> 201 resize (same size as the start frame) -> 92:201 longer-side resize -> 92:202 LTXVPreprocess
  stage 1: 92:210 LTXVAddGuide(frame_idx=-1, strength 1) on the start-frame latent (92:107); guider 92:47 + AV concat 92:56 use it;
           92:81 LTXVCropGuides crops with the guided conditioning (guide frames removed before upsampling)
  stage 2: 92:211 LTXVAddGuide(frame_idx=-1) on the upsampled start-frame latent (92:108); guider 92:82 + AV concat 92:83 use it;
           92:212 LTXVCropGuides drops the guide frames before VAEDecode 92:95
Audio is unchanged (LTX-2 is an audio+video model: LTXVEmptyLatentAudio -> AV latent -> LTXVAudioVAEDecode -> CreateVideo.audio).
Run: python3 scripts/build-ltx-flf.py
"""
import json, os, copy
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'workflows')
g = json.load(open(os.path.join(W, 'camera-ltx-api.json')))
g = copy.deepcopy(g)
g['200'] = {'class_type': 'LoadImage', 'inputs': {'image': 'end_frame.png'}, '_meta': {'title': 'End frame'}}
g['201'] = {'class_type': 'ResizeImageMaskNode', 'inputs': {**{k: v for k, v in g['102']['inputs'].items() if k != 'input'}, 'input': ['200', 0]}, '_meta': {'title': 'End frame size'}}
g['92:201'] = {'class_type': 'ResizeImageMaskNode', 'inputs': {**{k: v for k, v in g['92:113']['inputs'].items() if k != 'input'}, 'input': ['201', 0]}}
g['92:202'] = {'class_type': 'LTXVPreprocess', 'inputs': {**{k: v for k, v in g['92:99']['inputs'].items() if k != 'image'}, 'image': ['92:201', 0]}}
vae = ['92:1', 2]
g['92:210'] = {'class_type': 'LTXVAddGuide', 'inputs': {'positive': ['92:22', 0], 'negative': ['92:22', 1], 'vae': vae, 'latent': ['92:107', 0], 'image': ['92:202', 0], 'frame_idx': -1, 'strength': 1.0}, '_meta': {'title': 'End frame guide (stage 1)'}}
g['92:47']['inputs'].update(positive=['92:210', 0], negative=['92:210', 1])
g['92:56']['inputs']['video_latent'] = ['92:210', 2]
g['92:81']['inputs'].update(positive=['92:210', 0], negative=['92:210', 1])
g['92:211'] = {'class_type': 'LTXVAddGuide', 'inputs': {'positive': ['92:81', 0], 'negative': ['92:81', 1], 'vae': vae, 'latent': ['92:108', 0], 'image': ['92:202', 0], 'frame_idx': -1, 'strength': 1.0}, '_meta': {'title': 'End frame guide (stage 2)'}}
g['92:82']['inputs'].update(positive=['92:211', 0], negative=['92:211', 1])
g['92:83']['inputs']['video_latent'] = ['92:211', 2]
g['92:212'] = {'class_type': 'LTXVCropGuides', 'inputs': {'positive': ['92:211', 0], 'negative': ['92:211', 1], 'latent': ['92:105', 0]}}
g['92:95']['inputs']['samples'] = ['92:212', 2]
g['75']['inputs']['filename_prefix'] = 'openhiggsfield/camera-flf'
for out in ('camera-ltx-flf-api.json', 'cloud/camera-ltx-flf-api.json'):
    with open(os.path.join(W, out), 'w') as f: json.dump(g, f, indent=1); f.write('\n')
    print('wrote', out, len(g), 'nodes')
