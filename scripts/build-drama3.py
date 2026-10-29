#!/usr/bin/env python3
"""Build Voice graphs for Fish Audio Drama 3 (fishaudio/drama-3, Fish Audio Community License v1.0) from the example
workflow of the pinned node pack PedroMarinhoDev/ComfyUI-Drama3 @66c4fb9cd3c0151e1e2ccd207847cb8335e87ab4 (GPL-3.0;
copy in workflows/templates/drama3_voice_clone.json). Weights: PedroMarinhoDev/Drama-3-ComfyUI (repack of fishaudio/drama-3,
same licence) + PedroMarinhoDev/Qwen3-ASR-ComfyUI (Apache-2.0).
 - voice-drama3-clone-api.json: LoadAudio (5–15 s sample) -> Qwen3-ASR 0.6B transcript -> Encode Voice -> Generate -> Decode -> SaveAudio
 - voice-drama3-tts-api.json:   no reference voice (Generate with 0 voices)
Sampling = Fish Audio server defaults (temperature 1.0, top_p 0.9, top_k 30). Text carries the inline control syntax
(Appendix C / Table 10 of the Drama 3 technical report). Usage: python3 scripts/build-drama3.py <object_info.json with the pack>"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); WF = os.path.normpath(os.path.join(HERE, "..", "workflows"))
MAPS = os.path.join(WF, "node-maps"); oi_path = sys.argv[1]; out = "/tmp/ohf-drama3.api.json"
subprocess.run([sys.executable, os.path.join(HERE, "ui2api.py"), os.path.join(WF, "templates", "drama3_voice_clone.json"), oi_path, out], check=True, stdout=subprocess.DEVNULL)
g = json.load(open(out))
g["9"]["inputs"]["model_name"] = "qwen3_asr_0.6b_bf16.safetensors"   # README: 0.6B ~ same transcripts, half the time
g["8"]["inputs"]["filename_prefix"] = "openhiggsfield/voice"
g["6"]["inputs"].update(seed=42, temperature=1.0, top_p=0.9, top_k=30)
MODEL = "Fish Audio Drama 3 (Fish Audio Community License v1.0)"
def write(name, g, nm):
    for n in g.values(): n.setdefault("_meta", {}).setdefault("title", n["class_type"])
    json.dump(g, open(os.path.join(WF, name), "w"), indent=2, ensure_ascii=False)
    json.dump({"workflowFile": name, "nodePack": {"repo": "https://github.com/PedroMarinhoDev/ComfyUI-Drama3", "pin": "66c4fb9cd3c0151e1e2ccd207847cb8335e87ab4", "license": "GPL-3.0"}, "model": MODEL, **nm},
              open(os.path.join(MAPS, name.replace("-api.json", ".json")), "w"), indent=2, ensure_ascii=False)
    print(f"{name}: {len(g)} nodes")
write("voice-drama3-clone-api.json", g, {"inputs": {"text": {"node": "6", "field": "text"}, "voiceSample": {"node": "4", "field": "audio"}},
      "seed": {"node": "6", "field": "seed"}, "output": {"node": "8"}})
t = json.loads(json.dumps(g))
for k in ("4", "5", "9", "10"): t.pop(k)
t["6"]["inputs"].pop("voices.voice0")
write("voice-drama3-tts-api.json", t, {"inputs": {"text": {"node": "6", "field": "text"}}, "seed": {"node": "6", "field": "seed"}, "output": {"node": "8"},
      "note": "no reference voice: Drama 3 picks a voice; the pack README warns takes fall silent more often without one"})
