"""Our own FLUX 3 Image Klein multi-reference graph (up to 10 refs), derived from our edit graph
(workflows/create-image-flux3klein-edit-api.json): extra LoadImage nodes feed BatchImagesNode (prompt upsampler)
and ReferenceMultiLatent (reference conditioning). Unused refs are dropped per job in comfy/plans.ts image()."""
import json, copy, pathlib
W = pathlib.Path(__file__).resolve().parent.parent / 'workflows'
g = json.loads((W / 'create-image-flux3klein-edit-api.json').read_text())
MAX = 10
for k in range(1, MAX):
    nid = str(110 + k)
    g[nid] = copy.deepcopy(g['11']); g[nid]['_meta'] = {'title': f'Reference {k + 1}'}
    g['50']['inputs'][f'images.image{k}'] = [nid, 0]
    g['17']['inputs'][f'images.image{k}'] = [nid, 0]
g['11'].setdefault('_meta', {})['title'] = 'Reference 1'
(W / 'create-image-flux3klein-multiref-api.json').write_text(json.dumps(g, indent=2))
nm = json.loads((W / 'node-maps/create-image-flux3klein-edit.json').read_text())
nm['workflowFile'] = 'create-image-flux3klein-multiref-api.json'
nm['refs'] = [{'node': '11', 'field': 'image'}] + [{'node': str(110 + k), 'field': 'image'} for k in range(1, MAX)]
nm['maxRefs'] = MAX
(W / 'node-maps/create-image-flux3klein-multiref.json').write_text(json.dumps(nm, indent=2))
print('wrote create-image-flux3klein-multiref-api.json with', MAX, 'refs')
