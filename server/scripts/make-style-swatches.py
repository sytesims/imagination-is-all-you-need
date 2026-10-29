#!/usr/bin/env python3
"""Procedural Restyle swatches (our own; numpy + Pillow, no generative model). Writes server/samples/styles/<id>.png
(768x432) and styles.json ({id,label,swatch,prompt,negative}). Each swatch is a small scene (sun, hills, figure)
rendered with a technique that hints at the style, used as the VACE style reference image (node 134)."""
import json, os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "samples", "styles"); os.makedirs(OUT, exist_ok=True)
W, H = 768, 432; rng = np.random.default_rng(7)

def scene(pal, outline=None, ow=0):
    sky, sun, hill1, hill2, fig = [tuple(int(pal[i][j:j + 2], 16) for j in (1, 3, 5)) for i in range(5)]
    im = Image.new("RGB", (W, H), sky); d = ImageDraw.Draw(im)
    d.ellipse((540, 50, 660, 170), fill=sun, outline=outline, width=ow)
    d.polygon([(0, 300), (200, 190), (420, 290), (600, 210), (768, 280), (768, 432), (0, 432)], fill=hill1, outline=outline, width=ow)
    d.polygon([(0, 360), (260, 300), (520, 370), (768, 330), (768, 432), (0, 432)], fill=hill2, outline=outline, width=ow)
    d.ellipse((330, 200, 380, 250), fill=fig, outline=outline, width=ow); d.rounded_rectangle((322, 248, 388, 350), 18, fill=fig, outline=outline, width=ow)
    return im

def noise(scale, amp):
    n = rng.random((H // scale + 1, W // scale + 1)); n = np.array(Image.fromarray((n * 255).astype("uint8")).resize((W, H), Image.BICUBIC)) / 255.0
    return (n - 0.5) * amp

def arr(im): return np.asarray(im).astype(np.float32)
def img(a): return Image.fromarray(np.clip(a, 0, 255).astype("uint8"))
P = {  # palettes: sky, sun, hill1, hill2, figure
    "warm": ["#f6d7a7", "#f28c28", "#8fb339", "#4f772d", "#c0392b"], "cool": ["#a8dadc", "#f1faee", "#457b9d", "#1d3557", "#e63946"],
    "neon": ["#0b0221", "#ff2a6d", "#05d9e8", "#005678", "#d1f7ff"], "earth": ["#e9dcc9", "#b5651d", "#8a7f5a", "#5c4d3c", "#2f2f2f"],
    "pop": ["#ffe600", "#ff007f", "#00b4ff", "#00d084", "#111111"], "pastel": ["#fde2e4", "#fad2e1", "#bee1e6", "#cddafd", "#e2ece9"],
    "mono": ["#f2f2f2", "#d0d0d0", "#8c8c8c", "#4d4d4d", "#1a1a1a"], "vapor": ["#ff71ce", "#fffb96", "#01cdfe", "#b967ff", "#05ffa1"],
}
def t_cel(p): return scene(P[p], (20, 20, 20), 4)
def t_watercolor(p): a = arr(scene(P[p]).filter(ImageFilter.GaussianBlur(6))); a += noise(24, 60)[..., None]; return img(a * 0.9 + 25).filter(ImageFilter.SMOOTH_MORE)
def t_clay(p): im = scene(P[p], (60, 40, 30), 2).filter(ImageFilter.GaussianBlur(3)); return ImageOps.autocontrast(img(arr(im) + noise(6, 40)[..., None]).filter(ImageFilter.EMBOSS).convert("L")).convert("RGB").resize((W, H)) if False else img(arr(im) * 0.85 + arr(im.filter(ImageFilter.EMBOSS)) * 0.15 + noise(5, 25)[..., None])
def t_pixel(p): return scene(P[p]).resize((W // 16, H // 16), Image.NEAREST).resize((W, H), Image.NEAREST)
def t_ink(p): im = scene(P[p], (0, 0, 0), 6).convert("L"); return ImageOps.posterize(im.convert("RGB"), 2)
def t_oil(p): return scene(P[p]).filter(ImageFilter.ModeFilter(9)).filter(ImageFilter.GaussianBlur(1))
def t_paper(p): im = scene(P[p], (255, 255, 255), 3); sh = img(arr(im) * 0.6); base = Image.new("RGB", (W, H), (240, 232, 214)); base.paste(sh, (6, 6)); base.paste(im, (0, 0), Image.new("L", (W, H), 235)); return base
def t_pencil(p): g = scene(P[p], (0, 0, 0), 2).convert("L").filter(ImageFilter.FIND_EDGES); return ImageOps.invert(g).convert("RGB").filter(ImageFilter.SMOOTH)
def t_toon3d(p): im = scene(P[p], (30, 30, 30), 2); return img(arr(im) + arr(im.filter(ImageFilter.GaussianBlur(14))) * 0.25 - 30)
def t_lowpoly(p):
    src = scene(P[p]); im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im); s = 48
    for y in range(0, H, s):
        for x in range(0, W, s):
            for tri in ([(x, y), (x + s, y), (x, y + s)], [(x + s, y), (x + s, y + s), (x, y + s)]):
                cx, cy = [min(v, (W - 1, H - 1)[i]) for i, v in enumerate((sum(q[0] for q in tri) // 3, sum(q[1] for q in tri) // 3))]
                d.polygon(tri, fill=src.getpixel((cx, cy)))
    return im
def t_neon(p): im = scene(P[p], (255, 42, 109), 3); glow = im.filter(ImageFilter.GaussianBlur(10)); return img(arr(im) * 0.7 + arr(glow) * 0.6)
def t_ukiyoe(p): im = ImageOps.posterize(scene(P[p], (40, 30, 30), 3), 3); return img(arr(im) * 0.9 + noise(3, 18)[..., None] + 10)
def t_glass(p):
    im = scene(P[p]); d = ImageDraw.Draw(im)
    for i in range(14): d.line([(rng.integers(0, W), 0), (rng.integers(0, W), H)], fill=(20, 20, 20), width=6); d.line([(0, rng.integers(0, H)), (W, rng.integers(0, H))], fill=(20, 20, 20), width=6)
    return img(arr(im) * 1.1)
def t_charcoal(p): g = scene(P[p], (0, 0, 0), 4).convert("L").filter(ImageFilter.GaussianBlur(2)); return img(arr(g.convert("RGB")) * 0.8 + noise(2, 70)[..., None])
def t_retro(p): return ImageOps.posterize(scene(P[p], (0, 0, 0), 5), 3)
def t_felt(p): return img(arr(scene(P[p]).filter(ImageFilter.GaussianBlur(2))) + noise(1, 45)[..., None])
def t_vapor(p):
    im = scene(P[p]); d = ImageDraw.Draw(im)
    for y in range(300, H, 14): d.line([(0, y), (W, y)], fill=(255, 113, 206), width=2)
    for x in range(-400, W + 400, 60): d.line([(W // 2, 300), (x, H)], fill=(1, 205, 254), width=2)
    return im
def t_blueprint(p): g = scene(P[p], (255, 255, 255), 2).convert("L").filter(ImageFilter.FIND_EDGES); a = arr(g); return img(np.stack([a * 0.9 + 20, a * 0.9 + 70, a * 0.6 + 150], -1))
def t_popart(p):
    im = ImageOps.posterize(scene(P[p], (0, 0, 0), 5), 2); d = ImageDraw.Draw(im)
    for y in range(0, H, 16):
        for x in range(0, W, 16): d.ellipse((x + 5, y + 5, x + 10, y + 10), fill=(0, 0, 0))
    return im
def t_graffiti(p): im = scene(P[p], (0, 0, 0), 8); return img(arr(im) + arr(im.filter(ImageFilter.GaussianBlur(5))) * 0.4 - 40 + noise(4, 30)[..., None])
def t_gouache(p): return ImageOps.posterize(scene(P[p]).filter(ImageFilter.ModeFilter(5)), 4)
def t_woodcut(p): g = scene(P[p], (0, 0, 0), 5).convert("L"); a = arr(g) + ((np.indices((H, W))[0] % 8) < 3) * 40; return img(np.stack([np.where(a > 120, 235, 25)] * 3, -1))
def t_live(p): return img(arr(scene(P[p]).filter(ImageFilter.GaussianBlur(1.5))) + noise(2, 12)[..., None])

STYLES = [("Anime cel", t_cel, "pastel", "flat cel shading, clean ink outlines, anime"),
  ("Watercolor", t_watercolor, "pastel", "soft watercolor washes, paper texture, bleeding edges"),
  ("Claymation", t_clay, "warm", "clay figures, fingerprint texture, stop-motion lighting"),
  ("Pixel art", t_pixel, "cool", "16-bit pixel art, limited palette, crisp pixels"),
  ("Comic ink", t_ink, "mono", "bold comic ink, heavy black lines, high contrast"),
  ("Oil painting", t_oil, "warm", "thick oil paint strokes, canvas texture, rich colour"),
  ("Paper cutout", t_paper, "warm", "layered paper cutout, drop shadows, craft texture"),
  ("Pencil sketch", t_pencil, "mono", "graphite pencil sketch, hatching, white paper"),
  ("3D toon", t_toon3d, "pop", "stylised 3D toon render, soft global illumination"),
  ("Low poly", t_lowpoly, "cool", "low-poly faceted geometry, flat shaded triangles"),
  ("Neon noir", t_neon, "neon", "neon noir, glowing magenta and cyan light, rain, deep shadows"),
  ("Ukiyo-e print", t_ukiyoe, "earth", "ukiyo-e woodblock print, flat colour, fine outlines"),
  ("Stained glass", t_glass, "pop", "stained glass, leaded black lines, luminous colour"),
  ("Charcoal", t_charcoal, "mono", "smudged charcoal drawing, grainy paper"),
  ("Retro 80s cartoon", t_retro, "pop", "1980s saturday-morning cartoon, thick outlines, flat colour"),
  ("Stop-motion felt", t_felt, "warm", "felt puppets, fuzzy fabric texture, stop-motion"),
  ("Vaporwave", t_vapor, "vapor", "vaporwave, pastel neon gradient, grid horizon"),
  ("Blueprint", t_blueprint, "cool", "technical blueprint, white line drawing on blue"),
  ("Pop art", t_popart, "pop", "pop art, halftone dots, bold primary colours"),
  ("Graffiti", t_graffiti, "vapor", "spray-paint graffiti, drips, bold outlines"),
  ("Gouache storybook", t_gouache, "earth", "gouache storybook illustration, matte colour"),
  ("Woodcut", t_woodcut, "mono", "black and white woodcut, carved lines"),
  ("Live-action", t_live, "earth", "photorealistic live-action, natural lighting")]
meta = []
for label, fn, pal, look in STYLES:
    sid = re.sub(r"[^a-z0-9]+", "-", label.lower()); fn(pal).convert("RGB").save(os.path.join(OUT, f"{sid}.png"), optimize=True)
    meta.append({"id": sid, "label": label, "swatch": f"/samples/styles/{sid}.png",
                 "prompt": f"{{subject}}, redrawn in {label.lower()} style: {look}. Keep the original motion, timing and composition.",
                 "negative": "photorealistic, blurry, low quality, watermark" if sid != "live-action" else "cartoon, illustration, blurry, low quality"})
json.dump({"generator": "procedural (numpy+Pillow), not a generative model", "styles": meta}, open(os.path.join(OUT, "styles.json"), "w"), indent=2)
print(len(meta), "swatches ->", OUT)
