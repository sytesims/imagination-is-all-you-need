"""Static MiniMax H3 graph rules (2026-10-17), used by validate-workflows.py.
  1. frames = 17n+5 (5, 22, 39 ... 124 ... 243)          2. width and height multiples of 32
  3. area <= 1344*768 (open-weights 768p cap)             4. LoRA family == base family (fl2va | ref2va); full-build LoRAs not on pruned bases
Documented cross-family exception: akatz Character Swap recipe = Ref2VA base + FL2V turbo 8-step LoRA at 1.0 (model card, 2026-10-17).
Mirrors server/src/tools/h3/rules.ts (runtime checks). Returns a list of violation strings ([] = ok)."""
import math
AREA_CAP = 1344 * 768
ALLOW_CROSS = {('ref2va', 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors')}
def fam(name):
    n = name.lower()
    if 'ref2v' in n: return 'ref2va'
    if 'fl2v' in n: return 'fl2va'
    return None
def frames_ok(n): return isinstance(n, int) and n >= 5 and (n - 5) % 17 == 0
def snap(sec):  # same formula as the graphs' ComfyMathExpression
    f = max(5, round(sec * 24)); return f + (5 - f % 17) % 17
def _val(g, v):
    if isinstance(v, list) and len(v) == 2 and str(v[0]) in g:
        n = g[str(v[0])]
        if n['class_type'] in ('PrimitiveInt', 'PrimitiveFloat'): return n['inputs'].get('value')
        return ('node', n)
    return v
def _upstream_unet(g, link, seen=None):
    seen = seen or set()
    while isinstance(link, list) and str(link[0]) in g and str(link[0]) not in seen:
        nid = str(link[0]); seen.add(nid); n = g[nid]
        if n['class_type'] == 'UNETLoader': return n['inputs'].get('unet_name')
        nxt = n['inputs'].get('model') or n['inputs'].get('on_false') or n['inputs'].get('on_true'); link = nxt
    return None
def check(g):
    if not isinstance(g, dict) or not all(isinstance(n, dict) for n in g.values()): return []
    vids = [(k, n) for k, n in g.items() if n.get('class_type') in ('MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo', 'EmptyMiniMaxH3LatentAV')]
    if not vids: return []
    out = []
    for k, n in vids:
        L = _val(g, n['inputs'].get('length'))
        if isinstance(L, tuple) and L[1]['class_type'] == 'ComfyMathExpression' and '% 17' in L[1]['inputs'].get('expression', ''):
            a = _val(g, L[1]['inputs'].get('values.a'))
            if isinstance(a, (int, float)) and not frames_ok(snap(a)): out.append(f'node {k}: frames {snap(a)} not 17n+5')
        elif isinstance(L, int) and not frames_ok(L): out.append(f'node {k}: length {L} not 17n+5')
        elif isinstance(L, tuple): out.append(f'node {k}: length comes from {L[1]["class_type"]} (cannot prove 17n+5)')
        W, H = _val(g, n['inputs'].get('width')), _val(g, n['inputs'].get('height'))
        if isinstance(W, tuple) and W[1]['class_type'] == 'ResolutionSelector':
            rs = W[1]['inputs']
            if rs.get('multiple') != 32: out.append(f'node {k}: ResolutionSelector multiple {rs.get("multiple")} != 32')
            if float(rs.get('megapixels', 0)) * 1e6 > AREA_CAP: out.append(f'node {k}: ResolutionSelector {rs.get("megapixels")} MP over the {AREA_CAP} px area cap')
        elif isinstance(W, int) and isinstance(H, int):
            if W % 32 or H % 32: out.append(f'node {k}: {W}x{H} not multiples of 32')
            if W * H > AREA_CAP: out.append(f'node {k}: {W}x{H} = {W*H} px over the area cap {AREA_CAP} (1344x768)')
    for k, n in g.items():
        if n.get('class_type') != 'LoraLoaderModelOnly': continue
        name = n['inputs'].get('lora_name', ''); unet = _upstream_unet(g, n['inputs'].get('model'))
        if not unet or 'minimax_h3' not in unet and 'h3' not in unet.lower(): continue
        bf, lf = fam(unet), fam(name)
        if lf and bf and lf != bf and (bf, name) not in ALLOW_CROSS: out.append(f'node {k}: LoRA {name} is {lf}, base {unet} is {bf}')
        if 'pruned' in unet and ('_full' in name.lower() or 'nonpruned' in name.lower()): out.append(f'node {k}: full-build LoRA {name} on pruned base {unet}')
    return out
