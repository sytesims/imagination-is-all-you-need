#!/usr/bin/env python3
"""Convert a ComfyUI UI-format workflow (with subgraphs) to API format using /object_info.
Usage: ui2api.py ui.json object_info.json out.json [--drop-node ID ...]"""
import json, sys

WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}

def widget_names(spec):
    names = []
    for sect in ("required", "optional"):
        for name, val in spec["input"].get(sect, {}).items():
            t = val[0]; opts = val[1] if len(val) > 1 and isinstance(val[1], dict) else {}
            if isinstance(t, list) or t in WIDGET_TYPES or t == "COMFY_DYNAMICCOMBO_V3":
                names.append(name)
                if t == "INT" and (opts.get("control_after_generate") or name in ("seed", "noise_seed")):
                    names.append("__control__")
                if opts.get("image_upload") or opts.get("video_upload") or opts.get("audio_upload"):
                    names.append("__upload__")
    return names

def assign_widgets(inp, vals, out, prefix):
    """Consume widget values in order; supports V3 dynamic combos (nested keys 'parent.child')."""
    for sect in ("required", "optional"):
        for name, val in inp.get(sect, {}).items():
            t = val[0]; opts = val[1] if len(val) > 1 and isinstance(val[1], dict) else {}
            if t == "COMFY_DYNAMICCOMBO_V3":
                if not vals: return
                v = vals.pop(0); out[prefix + name] = v
                for o in opts.get("options", []):
                    if o["key"] == v: assign_widgets(o.get("inputs", {}), vals, out, prefix + name + ".")
                continue
            if isinstance(t, list) or t in WIDGET_TYPES:
                if not vals: return
                out[prefix + name] = vals.pop(0)
                if t == "INT" and (opts.get("control_after_generate") or name in ("seed", "noise_seed")) and vals and vals[0] in ("fixed","randomize","increment","decrement"):
                    vals.pop(0)
                if (opts.get("image_upload") or opts.get("video_upload") or opts.get("audio_upload")) and vals and vals[0] in ("image","video","audio"):
                    vals.pop(0)

def main():
    ui, oi, out = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3]
    drop = set(sys.argv[sys.argv.index("--drop-node")+1:]) if "--drop-node" in sys.argv else set()
    subs = {s["id"]: s for s in ui.get("definitions", {}).get("subgraphs", [])}
    api = {}

    def norm_links(g):
        res = {}
        for l in g["links"]:
            if isinstance(l, list):
                res[l[0]] = dict(id=l[0], origin_id=l[1], origin_slot=l[2], target_id=l[3], target_slot=l[4])
            else:
                res[l["id"]] = l
        return res

    # context: (graph, prefix, parent_ctx, instance_node)
    def ctx_make(g, prefix, parent, inst):
        return dict(g=g, prefix=prefix, parent=parent, inst=inst,
                    nodes={n["id"]: n for n in g["nodes"]}, links=norm_links(g))

    def resolve(ctx, origin_id, slot):
        """Return [api_id, slot] or None for the output (origin_id, slot) in ctx."""
        if origin_id == -10:  # subgraph input node
            inst, parent = ctx["inst"], ctx["parent"]
            name = ctx["g"]["inputs"][slot]["name"]
            for inp in inst.get("inputs", []):
                if inp["name"] == name and inp.get("link") is not None:
                    l = parent["links"][inp["link"]]
                    return resolve(parent, l["origin_id"], l["origin_slot"])
            return None
        n = ctx["nodes"][origin_id]
        if n["type"] in subs:
            sg = subs[n["type"]]; inner = ctx_make(sg, f'{ctx["prefix"]}{n["id"]}:', ctx, n)
            for l in inner["links"].values():
                if l["target_id"] == -20 and l["target_slot"] == slot:
                    return resolve(inner, l["origin_id"], l["origin_slot"])
            return None
        if n.get("mode", 0) == 4:  # bypass: pass through first input of same type
            otype = n["outputs"][slot]["type"]
            for inp in n.get("inputs", []):
                if inp.get("type") == otype and inp.get("link") is not None:
                    l = ctx["links"][inp["link"]]
                    return resolve(ctx, l["origin_id"], l["origin_slot"])
            return None
        if n["type"] == "Reroute":
            l = ctx["links"][n["inputs"][0]["link"]]
            return resolve(ctx, l["origin_id"], l["origin_slot"])
        return [f'{ctx["prefix"]}{n["id"]}', slot]

    def emit(ctx):
        for n in ctx["g"]["nodes"]:
            if str(n["id"]) in drop and not ctx["prefix"]: continue
            if n.get("mode", 0) in (2, 4): continue
            if n["type"] in subs:
                emit(ctx_make(subs[n["type"]], f'{ctx["prefix"]}{n["id"]}:', ctx, n)); continue
            if n["type"] not in oi: continue  # notes, frontend-only nodes
            spec = oi[n["type"]]; inputs = {}
            wv = n.get("widgets_values") or []
            if isinstance(wv, dict): inputs.update({k: v for k, v in wv.items() if k in widget_names(spec)})
            else: assign_widgets(spec["input"], list(wv), inputs, "")
            for inp in n.get("inputs", []):
                if inp.get("link") is None: continue
                l = ctx["links"][inp["link"]]
                src = resolve(ctx, l["origin_id"], l["origin_slot"])
                if src is not None: inputs[inp["name"]] = src
            api[f'{ctx["prefix"]}{n["id"]}'] = {"inputs": inputs, "class_type": n["type"],
                                                 "_meta": {"title": n.get("title") or spec.get("display_name", n["type"])}}

    emit(ctx_make(ui, "", None, None))
    # prune nodes whose outputs are unused and that are not output nodes
    changed = True
    while changed:
        changed = False
        used = {v[0] for node in api.values() for v in node["inputs"].values() if isinstance(v, list) and len(v) == 2 and isinstance(v[0], str) and v[0] in api}
        for k in list(api):
            if k not in used and not oi[api[k]["class_type"]].get("output_node"):
                del api[k]; changed = True
    json.dump(api, open(out, "w"), indent=2)
    print(f"wrote {len(api)} nodes to {out}")

main()
