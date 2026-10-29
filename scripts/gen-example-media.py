#!/usr/bin/env python3
"""Generate example posters/previews and Camera Moves previews from the repo's own samples only
(server/samples/*). No external or third-party media. Run: python3 scripts/gen-example-media.py
Outputs: server/samples/examples/<id>.{jpg,mp4}, server/samples/camera/<move>.{mp4,webm,gif}"""
import math, os, re, subprocess, sys
from PIL import Image, ImageOps, ImageEnhance
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
S = os.path.join(ROOT, 'server/samples'); EX = os.path.join(S, 'examples'); CAM = os.path.join(S, 'camera')
os.makedirs(EX, exist_ok=True); os.makedirs(CAM, exist_ok=True)
W, H, FPS = 320, 180, 15

def ff(*a): subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *a], check=True)

H3_POSTER_SRC = {'h3-push-in': 'push-in', 'h3-pull-back': 'pull-out', 'h3-handheld': 'handheld', 'h3-orbit': 'orbit', 'h3-aerial': 'flyover', 'h3-crane': 'crane-up', 'h3-pan': 'pan-right'}
# ---------- video preset posters (Generate Video library), procedural, our own art only (no GPU, no third-party media) ----------
# One shared hand-built scene (sky, sun, layered hills, a figure, a ground grid) in the brand palette, then:
#   camera moves  -> the scene under that move's transform + motion cues (zoom streaks, ghost trails, orbit arc, arrows, horizon tilt)
#   style presets -> the same scene re-lit / re-graded / re-rendered per style (grain, neon, watercolour, cel, clay, instant border ...)
# Run only this part: python3 scripts/gen-example-media.py --video-presets
from PIL import ImageDraw, ImageFilter, ImageChops, ImageFont
import random
PW, PH = 640, 360
def _lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def scene(pal=None, w=PW * 2, h=PH * 2, night=False, sun_y=0.42):
    p = {'sky0': (46, 16, 92), 'sky1': (255, 150, 60), 'sun': (255, 214, 120), 'hill': [(120, 40, 120), (80, 24, 96), (40, 12, 60)], 'ground': (24, 8, 40), 'grid': (255, 120, 80), 'fig': (12, 4, 20)}
    if pal: p.update(pal)
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    hz = int(h * 0.62)
    for y in range(hz): d.line([(0, y), (w, y)], fill=_lerp(p['sky0'], p['sky1'], (y / hz) ** 1.4))
    if night:
        rnd = random.Random(3)
        for _ in range(160): x, y = rnd.randrange(w), rnd.randrange(int(hz * 0.8)); d.point((x, y), fill=(255, 255, 255))
    sx, sy, r = int(w * 0.66), int(h * sun_y), int(h * 0.11)
    glow = Image.new('L', (w, h)); ImageDraw.Draw(glow).ellipse([sx - r * 2.2, sy - r * 2.2, sx + r * 2.2, sy + r * 2.2], fill=110)
    im = Image.composite(Image.new('RGB', (w, h), p['sun']), im, glow.filter(ImageFilter.GaussianBlur(r * 0.8))); d = ImageDraw.Draw(im)
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=p['sun'])
    for k, (amp, base, col) in enumerate(zip([0.10, 0.07, 0.05], [0.50, 0.56, 0.61], p['hill'])):
        pts = [(0, h)] + [(x, int(h * base - h * amp * (0.5 + 0.5 * math.sin(x / w * (3 + k * 2.3) * math.pi + k * 1.7)) * (0.7 + 0.3 * math.sin(x / w * 11 + k)))) for x in range(0, w + 8, 8)] + [(w, h)]
        d.polygon(pts, fill=col)
    d.rectangle([0, hz, w, h], fill=p['ground'])
    vx = w // 2
    for i in range(-14, 15): d.line([(vx + i * w // 14 * 3, h), (vx + i * w // 60, hz)], fill=p['grid'], width=2)
    y = hz; step = 6
    while y < h: d.line([(0, y), (w, y)], fill=p['grid'], width=2); step *= 1.35; y += int(step)
    fx, fy, fs = int(w * 0.42), int(h * 0.80), h * 0.30   # figure: head, body, legs (simple silhouette)
    d.ellipse([fx - fs * 0.07, fy - fs, fx + fs * 0.07, fy - fs * 0.84], fill=p['fig'])
    d.polygon([(fx - fs * 0.12, fy - fs * 0.82), (fx + fs * 0.12, fy - fs * 0.82), (fx + fs * 0.09, fy - fs * 0.38), (fx - fs * 0.09, fy - fs * 0.38)], fill=p['fig'])
    d.polygon([(fx - fs * 0.09, fy - fs * 0.40), (fx - fs * 0.02, fy - fs * 0.40), (fx - fs * 0.07, fy), (fx - fs * 0.16, fy)], fill=p['fig'])
    d.polygon([(fx + fs * 0.02, fy - fs * 0.40), (fx + fs * 0.09, fy - fs * 0.40), (fx + fs * 0.16, fy), (fx + fs * 0.07, fy)], fill=p['fig'])
    return im
def _crop(im, cx, cy, z, ang=0):
    w, h = im.size; cw, ch = w / z / 2, h / z / 2
    if ang: im = im.rotate(ang, resample=Image.BICUBIC, center=(cx * w, cy * h))
    x, y = cx * w, cy * h
    return im.crop((int(x - cw / 2), int(y - ch / 2), int(x + cw / 2), int(y + ch / 2))).resize((PW, PH), Image.LANCZOS)
def _arrow(d, a, b, col=(255, 255, 255), wd=5):
    d.line([a, b], fill=col, width=wd); ang = math.atan2(b[1] - a[1], b[0] - a[0])
    for s in (2.6, -2.6): d.line([b, (b[0] + 22 * math.cos(ang + s), b[1] + 22 * math.sin(ang + s))], fill=col, width=wd)
def _ghost(base_fn, n, alpha=0.35):
    out = base_fn(0)
    for k in range(1, n): out = Image.blend(out, base_fn(k), alpha / k ** 0.3)
    return out
def _overlay(im, draw_fn, a=170):
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0)); draw_fn(ImageDraw.Draw(lay)); im = im.convert('RGBA')
    lay.putalpha(lay.getchannel('A').point(lambda v: min(v, a))); return Image.alpha_composite(im, lay).convert('RGB')
def cam_poster(pid, S0):
    W2, H2 = PW // 2, PH // 2
    if pid == 'h3-push-in':   # zoom-burst: layered crops blended toward the subject + radial streaks inward
        im = _ghost(lambda k: _crop(S0, 0.44, 0.58, 1.6 + k * 0.18), 6, 0.45)
        def f(d):
            for i in range(24):
                a = i / 24 * 2 * math.pi; d.line([(W2 + math.cos(a) * 400, H2 + math.sin(a) * 300), (W2 + math.cos(a) * 170, H2 + math.sin(a) * 120)], fill=(255, 255, 255, 120), width=2)
            d.rectangle([W2 - 90, H2 - 55, W2 + 90, H2 + 55], outline=(255, 255, 255, 230), width=3)
        return _overlay(im, f)
    if pid == 'h3-pull-back':  # wide frame with the previous tight frame drawn inside, arrows outward
        im = _crop(S0, 0.5, 0.55, 1.0)
        def f(d):
            d.rectangle([W2 - 110, H2 - 50, W2 + 70, H2 + 50], outline=(255, 255, 255, 230), width=3)
            for (ax, ay), (bx, by) in [((W2 - 110, H2 - 50), (40, 30)), ((W2 + 70, H2 - 50), (PW - 40, 30)), ((W2 - 110, H2 + 50), (40, PH - 30)), ((W2 + 70, H2 + 50), (PW - 40, PH - 30))]: _arrow(d, (ax, ay), (bx, by), (255, 255, 255, 200), 3)
        return _overlay(im, f)
    if pid == 'h3-handheld':  # slight tilt + double-exposure jitter
        im = Image.blend(_crop(S0, 0.47, 0.57, 1.5, 4), _crop(S0, 0.475, 0.565, 1.52, 1.5), 0.4)
        def f(d):
            pts = [(30 + i * 12, PH - 34 + 8 * math.sin(i * 1.3) + 4 * math.sin(i * 3.1)) for i in range(48)]; d.line(pts, fill=(255, 255, 255, 220), width=3)
        return _overlay(im, f)
    if pid == 'h3-orbit':   # subject centred, background ghosts shifted sideways + elliptical arc arrow around the subject
        im = _ghost(lambda k: _crop(S0, 0.42 + k * 0.03, 0.58, 1.7), 4, 0.4)
        def f(d):
            box = [W2 - 200, H2 + 40, W2 + 200, H2 + 130]; d.arc(box, 200, 520, fill=(255, 255, 255, 230), width=4)
            _arrow(d, (W2 + 150, H2 + 120), (W2 + 185, H2 + 105), (255, 255, 255, 230), 4)
        return _overlay(im, f)
    if pid == 'h3-aerial':  # high, top-down-ish view: flatten (scale y), forward arrow on the ground
        im = _crop(S0, 0.5, 0.70, 1.15); im = im.transform((PW, PH), Image.PERSPECTIVE, (1.25, 0.25, -120, 0, 1.6, -40, 0, 0.0009), Image.BICUBIC)
        im = Image.blend(im, im.filter(ImageFilter.GaussianBlur(3)), 0.3)
        return _overlay(im, lambda d: _arrow(d, (W2, PH - 30), (W2, PH - 150), (255, 255, 255, 220), 5))
    if pid == 'h3-crane':   # vertical ghost trail rising + up arrow
        im = _ghost(lambda k: _crop(S0, 0.47, 0.62 - k * 0.025, 1.45), 5, 0.45)
        return _overlay(im, lambda d: [_arrow(d, (PW - 60, PH - 50), (PW - 60, 60), (255, 255, 255, 230), 5)])
    if pid == 'h3-pan':     # horizontal motion blur + side arrow
        im = _crop(S0, 0.52, 0.56, 1.3); bl = im.filter(ImageFilter.BoxBlur(0))
        k = 25; acc = Image.new('RGB', im.size)
        for i in range(k): acc = Image.blend(acc, ImageChops.offset(im, i * 2, 0), 1 / (i + 1))
        im = Image.blend(im, acc, 0.6)
        return _overlay(im, lambda d: _arrow(d, (60, PH - 40), (PW - 60, PH - 40), (255, 255, 255, 230), 5))
    raise KeyError(pid)
def _grain(im, amt=18, seed=1, mono=True):
    rnd = random.Random(seed); n = Image.effect_noise(im.size, amt).convert('L')
    return ImageChops.add(ImageChops.subtract(im, Image.merge('RGB', [n] * 3).point(lambda v: v // 3)), Image.new('RGB', im.size, (0, 0, 0)))
def _vignette(im, s=0.55):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).ellipse([-im.width * 0.15, -im.height * 0.25, im.width * 1.15, im.height * 1.25], fill=255)
    return Image.composite(im, Image.new('RGB', im.size), m.filter(ImageFilter.GaussianBlur(80)).point(lambda v: int(255 * (1 - s) + v * s)))
def _tone(im, lo, hi):
    g = ImageOps.grayscale(im); return ImageOps.colorize(g, lo, hi)
def style_poster(sid):
    small = lambda **k: scene(**k).resize((PW, PH), Image.LANCZOS)
    if sid == 'warm-ambient':
        im = small(pal={'sky0': (150, 80, 50), 'sky1': (255, 200, 140), 'hill': [(190, 110, 80), (160, 90, 70), (120, 70, 60)], 'ground': (90, 50, 40), 'grid': (210, 140, 90), 'fig': (60, 30, 25)})
        return Image.blend(Image.blend(im, im.filter(ImageFilter.GaussianBlur(10)), 0.5), Image.new('RGB', im.size, (255, 200, 150)), 0.18)
    if sid == 'street-2000s':
        im = ImageEnhance.Color(small(pal={'sky0': (20, 30, 70), 'sky1': (60, 70, 120)}, night=True)).enhance(1.6); m = Image.new('L', im.size); ImageDraw.Draw(m).ellipse([150, 80, 420, 360], fill=255)
        im = Image.composite(ImageEnhance.Brightness(im).enhance(2.2), im, m.filter(ImageFilter.GaussianBlur(60))); return Image.blend(im, ImageChops.offset(im, 6, 0), 0.3)
    if sid == 'mono': return _grain(ImageEnhance.Contrast(ImageOps.grayscale(small()).convert('RGB')).enhance(1.6), 40)
    if sid == 'stage-light':
        im = ImageEnhance.Brightness(small(pal={'sky0': (10, 5, 15), 'sky1': (30, 15, 40), 'sun': (30, 20, 40)})).enhance(0.6); m = Image.new('L', im.size)
        ImageDraw.Draw(m).polygon([(250, 0), (300, 0), (380, 360), (170, 360)], fill=255); return Image.composite(ImageEnhance.Brightness(im).enhance(3.5), im, m.filter(ImageFilter.GaussianBlur(25)))
    if sid == 'film-35':
        im = small(); im = Image.blend(im, _tone(im, (30, 20, 25), (255, 235, 200)), 0.35); glow = im.point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.GaussianBlur(10))
        im = _grain(ImageChops.screen(im, Image.merge('RGB', [glow.getchannel(0), Image.new('L', im.size, 0), Image.new('L', im.size, 0)]).point(lambda v: v // 2)), 22)
        out = Image.new('RGB', (PW, PH), (18, 12, 10)); out.paste(im.resize((PW, PH - 70)), (0, 35)); d = ImageDraw.Draw(out)   # 35mm strip with sprocket holes
        for x in range(10, PW, 40): d.rounded_rectangle([x, 9, x + 20, 25], 3, fill=(235, 220, 190)); d.rounded_rectangle([x, PH - 25, x + 20, PH - 9], 3, fill=(235, 220, 190))
        return out
    if sid == 'editorial':
        im = Image.new('RGB', (PW, PH), (232, 228, 224)); d = ImageDraw.Draw(im); m = Image.new('L', im.size); ImageDraw.Draw(m).ellipse([-100, 260, 740, 520], fill=60)
        im = Image.composite(Image.new('RGB', im.size, (180, 175, 172)), im, m.filter(ImageFilter.GaussianBlur(40))); d = ImageDraw.Draw(im)
        fx, fy, fs = 320, 330, 280; c = (30, 26, 34)
        d.ellipse([fx - 22, fy - fs, fx + 22, fy - fs + 46], fill=c); d.polygon([(fx - 40, fy - fs + 52), (fx + 40, fy - fs + 52), (fx + 60, fy), (fx - 60, fy)], fill=c); return im
    if sid == 'neon-night':
        im = small(pal={'sky0': (5, 0, 20), 'sky1': (40, 0, 60), 'sun': (255, 40, 200), 'hill': [(20, 0, 50), (10, 0, 35), (5, 0, 20)], 'ground': (2, 0, 10), 'grid': (0, 240, 255), 'fig': (0, 0, 0)}, night=True)
        glow = im.filter(ImageFilter.GaussianBlur(8)); return ImageChops.screen(im, glow)
    if sid == 'pastel': return ImageEnhance.Contrast(Image.blend(small(pal={'sky0': (190, 170, 240), 'sky1': (255, 210, 225), 'hill': [(170, 220, 210), (150, 200, 220), (200, 180, 230)], 'ground': (240, 220, 235), 'grid': (255, 255, 255), 'fig': (120, 110, 150)}), Image.new('RGB', (PW, PH), (255, 255, 255)), 0.25)).enhance(0.8)
    if sid == 'noir':
        im = ImageEnhance.Contrast(ImageOps.grayscale(small()).convert('RGB')).enhance(1.8); m = Image.new('L', im.size, 0); d = ImageDraw.Draw(m)
        for i in range(-6, 16): d.polygon([(i * 50, 0), (i * 50 + 24, 0), (i * 50 + 24 + 180, PH), (i * 50 + 180, PH)], fill=255)
        return _grain(Image.composite(ImageEnhance.Brightness(im).enhance(0.35), im, m.filter(ImageFilter.GaussianBlur(3))), 20)
    if sid == 'product':
        im = Image.new('RGB', (PW, PH)); d = ImageDraw.Draw(im)
        for y in range(PH): d.line([(0, y), (PW, y)], fill=_lerp((250, 248, 252), (200, 196, 210), y / PH))
        d.ellipse([230, 300, 410, 330], fill=(170, 165, 180)); d.rounded_rectangle([270, 110, 370, 315], 26, fill=(120, 40, 140)); d.rounded_rectangle([296, 80, 344, 116], 8, fill=(40, 20, 50))
        d.rounded_rectangle([284, 130, 300, 290], 8, fill=(220, 170, 235)); return im.filter(ImageFilter.SMOOTH)
    if sid == 'anime-cel':
        im = ImageOps.posterize(ImageEnhance.Color(small()).enhance(1.4), 3); edges = ImageOps.invert(im.convert('L').filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 40 else 0))
        return ImageChops.multiply(im, edges.convert('RGB'))
    if sid == 'watercolor':
        im = small(pal={'sky0': (120, 160, 210), 'sky1': (250, 220, 190), 'hill': [(150, 120, 170), (110, 140, 160), (90, 110, 130)], 'ground': (200, 190, 175), 'grid': (220, 205, 190), 'fig': (70, 60, 80)})
        im = im.filter(ImageFilter.ModeFilter(9)).filter(ImageFilter.GaussianBlur(1.5)); paper = Image.effect_noise((PW, PH), 30).convert('RGB').point(lambda v: 200 + v // 5)
        return ImageChops.multiply(Image.blend(im, Image.new('RGB', im.size, (250, 245, 235)), 0.2), paper)
    if sid == 'clay-3d':
        im = ImageOps.posterize(small(pal={'sky0': (240, 200, 170), 'sky1': (255, 230, 200), 'hill': [(230, 140, 110), (200, 110, 120), (160, 90, 130)], 'ground': (220, 180, 150), 'grid': (220, 180, 150), 'fig': (90, 60, 110)}), 4).filter(ImageFilter.GaussianBlur(3))
        return ImageChops.overlay(im, im.convert('L').filter(ImageFilter.EMBOSS).convert('RGB'))
    if sid == 'vintage-polaroid':
        im = ImageEnhance.Color(_tone(small(), (60, 40, 60), (255, 240, 210))).enhance(1); im = Image.blend(small(), im, 0.6).resize((PW - 220, PH - 60))
        out = Image.new('RGB', (PW, PH), (60, 50, 60)); card = Image.new('RGB', (PW - 196, PH - 8), (246, 243, 236)); card.paste(im, (12, 12)); out.paste(card.rotate(-3, expand=True, fillcolor=(60, 50, 60)), (88, -10)); return out
    if sid == 'cinematic-teal':
        im = small(); g = im.convert('L'); im = Image.blend(im, ImageOps.colorize(g, (0, 60, 80), (255, 180, 110)), 0.6); d = ImageDraw.Draw(im)
        d.rectangle([0, 0, PW, 44], fill=(0, 0, 0)); d.rectangle([0, PH - 44, PW, PH], fill=(0, 0, 0)); fl = Image.new('L', im.size); ImageDraw.Draw(fl).rectangle([0, 128, PW, 140], fill=200)
        return ImageChops.screen(im, ImageOps.colorize(fl.filter(ImageFilter.GaussianBlur(6)), (0, 0, 0), (120, 200, 255)))
    if sid == 'documentary': return _grain(ImageEnhance.Color(_crop(scene(), 0.40, 0.62, 1.4, -2)).enhance(0.55), 16)
    if sid == 'flat-light':
        im = Image.new('RGB', (PW, PH), (150, 150, 155)); d = ImageDraw.Draw(im); c = (60, 58, 66)
        for fx, fs in [(220, 290), (430, 150)]:
            fy = 330 if fs > 200 else 230; d.ellipse([fx - fs * .08, fy - fs, fx + fs * .08, fy - fs * .82], fill=c); d.rectangle([fx - fs * .12, fy - fs * .80, fx + fs * .12, fy - fs * .38], fill=c)
            if fs > 200: d.rectangle([fx - fs * .10, fy - fs * .38, fx - fs * .02, fy], fill=c); d.rectangle([fx + fs * .02, fy - fs * .38, fx + fs * .10, fy], fill=c)
        return im
    if sid == 'golden-hour': return _vignette(small(pal={'sky0': (90, 40, 30), 'sky1': (255, 170, 60), 'sun': (255, 230, 150)}, sun_y=0.58), 0.4)
    if sid == 'high-key': return ImageEnhance.Contrast(ImageEnhance.Brightness(small(pal={'sky0': (230, 230, 240), 'sky1': (255, 255, 255), 'hill': [(225, 225, 235), (210, 210, 222), (195, 195, 210)], 'ground': (245, 245, 248), 'grid': (230, 230, 236), 'fig': (90, 90, 100)})).enhance(1.05)).enhance(0.9)
    if sid == 'low-key':
        im = ImageEnhance.Brightness(small()).enhance(0.25); m = Image.new('L', im.size); ImageDraw.Draw(m).ellipse([180, 60, 380, 360], fill=255)
        return Image.composite(ImageEnhance.Brightness(im).enhance(3.2), im, m.filter(ImageFilter.GaussianBlur(50)))
    # unknown style id: a distinct hue rotation of the base scene so a new preset never ships a blank tile
    h = sum(map(ord, sid)) % 360; im = small().convert('HSV'); hh, s, v = im.split(); return Image.merge('HSV', (hh.point(lambda x: (x + h * 255 // 360) % 256), s, v)).convert('RGB')
def video_preset_posters():
    P = os.path.join(S, 'presets'); os.makedirs(P, exist_ok=True)
    S0 = scene(w=PW * 3, h=PH * 3)
    for pid in H3_POSTER_SRC: cam_poster(pid, S0).save(os.path.join(P, f'video-{pid}.jpg'), quality=88)
    # Style looks no longer use drawn posters (2026-10-27): their covers are real local stills in web/public/examples/covers/video-looks (h3/videoLooks.ts)
    print(f'video preset posters: {len(H3_POSTER_SRC)} camera')
if '--video-presets' in sys.argv: video_preset_posters(); sys.exit(0)
# ---------- tool preset tiles (Object Swap / Motion Transfer / Restyle / Photo FX / Upscale scenes): our own procedural scene,
# one palette per preset (hashed from its id), the repo's sample stills composited in, label strip. Input: JSON [{url,label,group}]
# dumped from the live registry. Run only this part: python3 scripts/gen-example-media.py --tool-presets /tmp/presets.json
import colorsys, hashlib, json as _json
def _pal(key):
    h = int(hashlib.sha1(key.encode()).hexdigest()[:6], 16) / 0xFFFFFF
    c = lambda hh, l, s_: tuple(int(v * 255) for v in colorsys.hls_to_rgb(hh % 1, l, s_))
    return {'sky0': c(h, 0.18, 0.6), 'sky1': c(h + 0.08, 0.62, 0.85), 'sun': c(h + 0.12, 0.8, 0.9), 'hill': [c(h - 0.05, 0.35, 0.5), c(h - 0.08, 0.25, 0.5), c(h - 0.1, 0.15, 0.5)], 'ground': c(h, 0.08, 0.5), 'grid': c(h + 0.5, 0.6, 0.8)}
def _preset_look(im, key, label):
    """Per-preset look: a keyword filter (from the preset's own name) + a hashed motif and tint, so no two posters read alike."""
    from PIL import ImageFilter, ImageOps, ImageEnhance
    import hashlib, colorsys
    h = int(hashlib.sha1(key.encode()).hexdigest(), 16); L = label.lower()
    KW = [(('blur', 'dream', 'soft', 'haze', 'fog'), lambda x: x.filter(ImageFilter.GaussianBlur(4))),
          (('invert', 'negative', 'x-ray', 'xray'), ImageOps.invert),
          (('sepia', 'vintage', 'retro', 'old', 'film', 'noir'), lambda x: ImageOps.colorize(ImageOps.grayscale(x), (40, 20, 10), (240, 210, 160))),
          (('mono', 'black', 'b&w', 'grey', 'gray'), lambda x: ImageOps.grayscale(x).convert('RGB')),
          (('pixel', '8-bit', 'retro game', 'mosaic'), lambda x: x.resize((x.width // 12, x.height // 12)).resize(x.size, Image.NEAREST)),
          (('poster', 'pop', 'comic', 'cartoon', 'anime'), lambda x: ImageOps.posterize(x, 3)),
          (('glitch', 'vhs'), lambda x: Image.merge('RGB', (x.getchannel('R').transform(x.size, Image.AFFINE, (1, 0, 8, 0, 1, 0)), x.getchannel('G'), x.getchannel('B')))),
          (('neon', 'glow', 'cyber'), lambda x: ImageEnhance.Contrast(x.filter(ImageFilter.EDGE_ENHANCE_MORE)).enhance(1.6)),
          (('sharp', 'detail', 'upscale', '4k', '8k', 'crisp'), lambda x: x.filter(ImageFilter.UnsharpMask(3, 200))),
          (('sketch', 'pencil', 'line', 'ink'), lambda x: ImageOps.invert(ImageOps.grayscale(x).filter(ImageFilter.FIND_EDGES)).convert('RGB')),
          (('fire', 'burn', 'sunset', 'warm'), lambda x: ImageOps.colorize(ImageOps.grayscale(x), (60, 0, 0), (255, 200, 60))),
          (('ice', 'frost', 'snow', 'cold', 'water'), lambda x: ImageOps.colorize(ImageOps.grayscale(x), (0, 20, 60), (200, 240, 255)))]
    for kws, f in KW:
        if any(k in L for k in kws): im = f(im); break
    else:  # no keyword: hashed hue tint
        r, g, b = [int(c * 255) for c in colorsys.hsv_to_rgb((h % 360) / 360, 0.6, 1.0)]
        im = Image.blend(im, ImageOps.colorize(ImageOps.grayscale(im), (0, 0, 0), (r, g, b)), 0.45)
    d = ImageDraw.Draw(im, 'RGBA'); W_, H_ = im.size; motif = (h >> 8) % 4; col = ((h >> 12) % 200 + 55, (h >> 20) % 200 + 55, (h >> 28) % 200 + 55, 70)
    if motif == 0:
        for x in range(-H_, W_, 18 + (h >> 4) % 20): d.line([(x, H_), (x + H_, 0)], fill=col, width=4)
    elif motif == 1:
        for r_ in range(20, W_, 26 + (h >> 4) % 20): d.ellipse([W_ * 0.25 - r_, H_ * 0.45 - r_, W_ * 0.25 + r_, H_ * 0.45 + r_], outline=col, width=3)
    elif motif == 2:
        g_ = 22 + (h >> 4) % 24
        for x in range(0, W_, g_): d.line([(x, 0), (x, H_)], fill=col, width=1)
        for y in range(0, H_, g_): d.line([(0, y), (W_, y)], fill=col, width=1)
    else:
        for k in range(14): cx, cy = (h >> k) % W_, (h >> (k + 7)) % H_; rr = 6 + (h >> k) % 22; d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    mono = ''.join(w[0] for w in label.split()[:2]).upper() or '?'
    d.text((14, 12), mono, fill=(255, 255, 255, 230), font=ImageFont.load_default(size=44) if hasattr(ImageFont, 'load_default') else None)
    return im

def tool_preset_posters(items):
    stills = [Image.open(os.path.join(S, n)).convert('RGB') for n in ('sample-character.png', 'sample-product.png')]
    for k, it in enumerate(items):
        out = os.path.join(S, it['url'].split('/samples/')[1]); os.makedirs(os.path.dirname(out), exist_ok=True)
        im = scene(_pal(it['url']), w=PW, h=PH, night=k % 3 == 0, sun_y=0.3 + (k % 5) * 0.05)
        fg = stills[k % 2].copy(); fg.thumbnail((int(PH * 0.42),) * 2)
        mask = Image.eval(fg.convert('L'), lambda v: 255 if v > 10 else 0)
        im.paste(fg, (int(PW * (0.58 + 0.04 * (k % 3))), int(PH * 0.34)), mask)
        im = _preset_look(im, it['url'], it['label'])
        d = ImageDraw.Draw(im); d.rectangle([0, PH - 44, PW, PH], fill=(10, 6, 18))
        d.text((14, PH - 34), it['label'][:56], fill=(255, 255, 255)); d.text((14, PH - 18), it.get('group', '')[:40], fill=(200, 190, 230))
        im.save(out, quality=80)
        if it.get('webm'):  # 1.6 s slow push on the poster (VP9, no audio) for hover previews
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-t', '1.6', '-i', out, '-vf', f"scale={PW*2}:{PH*2},zoompan=z='1+0.002*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={PW}x{PH}:fps=24,format=yuv420p",
                            '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-deadline', 'realtime', os.path.join(S, it['webm'].split('/samples/')[1])], check=True)
    print(f'tool preset posters: {len(items)}')
if '--tool-presets' in sys.argv:
    tool_preset_posters(_json.load(open(sys.argv[sys.argv.index('--tool-presets') + 1]))); sys.exit(0)

# ---------- examples: parse server/src/examples.ts for id/toolId/video/image ----------
src = open(os.path.join(ROOT, 'server/src/examples.ts')).read()
consts = dict(re.findall(r"(\w+) = '(/samples/[^']+)'", src))
TOOL_RESULT = {'object-swap': 'result-swap.mp4', 'motion-transfer': 'result-motion.mp4', 'restyle': 'result-restyle.mp4', 'app-anime-restyle': 'result-restyle.mp4',
  'reshoot': 'result-angle-a.mp4', 'camera': 'result-camera.mp4', 'photo-fx': 'result-fx.mp4', 'upscale': 'result-detail.mp4', 'app-video-upscale': 'result-detail.mp4',
  'cinema': 'result-angle-b.mp4', 'app-orbit-shot': 'result-angle-b.mp4', 'h3-video': 'result-camera.mp4', 'app-transition': 'result-fx.mp4', 'app-ugc-ad': 'result-motion.mp4'}
rows = []
for m in re.finditer(r"\{ id: '(ex-[^']+)', toolId: '([^']+)'(.*?)\},?\n", src):
    body = m.group(3)
    def field(k):
        f = re.search(k + r": (?:'([^']+)'|(\w+))", body)
        return None if not f else (f.group(1) or consts.get(f.group(2)))
    ref = re.search(r"refs: \[(?:'([^']+)'|(\w+))", body)
    rows.append((m.group(1), m.group(2), field('video'), field('image') or (ref and (ref.group(1) or consts.get(ref.group(2))))))
for i, (eid, tool, video, image) in enumerate(rows):
    # distinct per example: own source, seek time, crop window and colour grade
    hue = (i * 47) % 360 - 180; t0 = 0.3 + (i * 0.37) % 4.0; zx = (i * 53) % 100 / 100
    res = TOOL_RESULT.get(tool)
    clip = os.path.join(S, res) if res else (os.path.join(S, video.split('/samples/')[1]) if video else None)
    vf = f"scale=480:-2,crop=400:225:(iw-400)*{zx:.2f}:(ih-225)/2,scale={W*1.5:.0f}:{H*1.5:.0f},hue=h={hue}:s=1.25,format=yuv420p"
    out = os.path.join(EX, eid)
    if clip:
        ff('-ss', f'{t0:.2f}', '-t', '1.6', '-i', clip, '-vf', vf, '-r', str(FPS), '-an', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-movflags', '+faststart', out + '.mp4')
    else:  # still-only / audio tools: slow push on the still (or the keyframe) so the card still moves
        still = os.path.join(S, (image or '/samples/sample-keyframe.png').split('/samples/')[1])
        ff('-loop', '1', '-t', '1.6', '-i', still, '-vf', f"scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='1+0.0025*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=480x270:fps={FPS},hue=h={hue}:s=1.25,format=yuv420p",
           '-an', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-movflags', '+faststart', out + '.mp4')
    ff('-ss', '0.5', '-i', out + '.mp4', '-frames:v', '1', '-q:v', '5', out + '.jpg')
print(f'examples: {len(rows)}')

# ---------- camera moves: synthesized pan/zoom/rotate on the sample keyframe ----------
# a textured stage built from repo samples (keyframe backdrop + grid + character + product) so motion is readable
from PIL import ImageDraw
BW, BH = 1344, 756  # oversized canvas: rotations/pans never reveal empty corners
base = Image.open(os.path.join(S, 'sample-keyframe.png')).convert('RGB').resize((BW, BH), Image.LANCZOS)
d = ImageDraw.Draw(base)
for x in range(0, BW, 48): d.line([(x, 0), (x, BH)], fill=(255, 255, 255) if x % 192 == 0 else (120, 170, 200), width=2 if x % 192 == 0 else 1)
for y in range(0, BH, 48): d.line([(0, y), (BW, y)], fill=(255, 255, 255) if y % 192 == 0 else (120, 170, 200), width=2 if y % 192 == 0 else 1)
def paste(name, size, xy):
    im = Image.open(os.path.join(S, name)).convert('RGB'); im.thumbnail((size, size)); base.paste(im, xy)
paste('sample-character.png', 300, (BW // 2 - 150, BH // 2 - 150))
paste('sample-product.png', 150, (BW // 2 + 230, BH // 2 + 40))
paste('sample-product.png', 110, (BW // 2 - 380, BH // 2 - 160))
N = int(FPS * 1.6)
e = lambda u: 0.5 - 0.5 * math.cos(math.pi * u)  # ease in-out
def tri(u): return 1 - abs(2 * u - 1)
# move -> f(u in 0..1) = (dx, dy, zoom, rot_deg)  dx/dy are fractions of the frame
MOVES = {
  'push-in': lambda u: (0, 0, 1 + 0.35 * e(u), 0), 'pull-out': lambda u: (0, 0, 1.35 - 0.35 * e(u), 0),
  'pan-left': lambda u: (0.12 - 0.24 * e(u), 0, 1.3, 0), 'pan-right': lambda u: (-0.12 + 0.24 * e(u), 0, 1.3, 0),
  'tilt-up': lambda u: (0, 0.1 - 0.2 * e(u), 1.3, 0), 'tilt-down': lambda u: (0, -0.1 + 0.2 * e(u), 1.3, 0),
  'static': lambda u: (0, 0, 1.15, 0),
  'handheld': lambda u: (0.012 * math.sin(u * 13), 0.01 * math.sin(u * 9 + 1), 1.2, 0.6 * math.sin(u * 7)),
  'crane-up': lambda u: (0, 0.1 - 0.2 * e(u), 1.35 - 0.15 * e(u), 0),
  'orbit': lambda u: (0.12 - 0.24 * e(u), 0, 1.3, 4 - 8 * e(u)),
  'fpv': lambda u: (0, -0.05 + 0.1 * u, 1 + 0.6 * u * u, 0),
  'vertigo': lambda u: (0, 0, 1 + 0.4 * tri(u), 0),
  'flyover': lambda u: (0, -0.08 + 0.08 * u, 1.1 + 0.4 * e(u), 0),
  'whip': lambda u: (0 if u < 0.6 else -0.15 + 0 * u + 0.3 * e((u - 0.6) / 0.4) - 0.15 + 0.15, 0, 1.3, 0),
  'snap-zoom': lambda u: (0, 0, 1.05 if u < 0.6 else 1.05 + 0.6 * min(1, (u - 0.6) / 0.15), 0),
  'shake': lambda u: (0.02 * math.sin(u * 50), 0.025 * math.sin(u * 63), 1.2, 0),
  'roll': lambda u: (0, 0, 1.5, 360 * e(u) / 4),
  'focus-pull': lambda u: (0, 0, 1.1 + 0.05 * u, 0),
  'beat-zoom': lambda u: (0, 0, 1 + 0.25 * abs(math.sin(u * 3 * math.pi)), 0),
  'strobe': lambda u: (0, 0, 1 + 0.2 * (int(u * 4) % 2) + 0.2 * (u > 0.5), 0),
  'ltx-dolly-in': lambda u: (0, 0, 1 + 0.3 * e(u), 0), 'ltx-dolly-out': lambda u: (0, 0, 1.3 - 0.3 * e(u), 0),
  'ltx-dolly-left': lambda u: (0.1 - 0.2 * e(u), 0, 1.25, -1 + 2 * e(u)), 'ltx-dolly-right': lambda u: (-0.1 + 0.2 * e(u), 0, 1.25, 1 - 2 * e(u)),
  'ltx-jib-up': lambda u: (0, 0.09 - 0.18 * e(u), 1.25 + 0.05 * e(u), 0), 'ltx-jib-down': lambda u: (0, -0.09 + 0.18 * e(u), 1.3 - 0.05 * e(u), 0),
  'ltx-static': lambda u: (0, 0, 1.12, 0),
}
def whip(u):  # hold, then a fast pan right with blur
    return (0 if u < 0.55 else 0.15 * e(min(1, (u - 0.55) / 0.25)) * -1 + 0, 0, 1.35, 0)
MOVES['whip'] = lambda u: (-0.12 if u < 0.55 else -0.12 + 0.24 * e(min(1, (u - 0.55) / 0.25)), 0, 1.35, 0)
from PIL import ImageFilter
def frame(fn, u, move):
    dx, dy, z, r = fn(u)
    img = base.rotate(r, resample=Image.BICUBIC, expand=False) if r else base
    cw, ch = 960 / z, 540 / z
    cx, cy = BW / 2 + dx * 960, BH / 2 + dy * 540
    box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
    f = img.transform((W, H), Image.EXTENT, box, Image.BILINEAR)
    if move == 'focus-pull': f = f.filter(ImageFilter.GaussianBlur(3 * (1 - e(u))))
    if move == 'whip' and 0.55 < u < 0.85: f = f.filter(ImageFilter.BoxBlur(4))
    return f
for move, fn in MOVES.items():
    raw = b''.join(frame(fn, k / (N - 1), move).tobytes() for k in range(N))
    out = os.path.join(CAM, move)
    common = ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
    for args, ext in ((['-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'], 'mp4'),
                      (['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-deadline', 'good', '-cpu-used', '4'], 'webm'),
                      (['-vf', 'fps=10,scale=200:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48[p];[b][p]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0'], 'gif')):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *common, '-an', *args, f'{out}.{ext}'], input=raw, check=True)
print(f'camera previews: {len(MOVES)}')

# ---------- hub sample items: one distinct thumbnail per item (crop/grade/composite of repo stills) ----------
import json
HUB = os.path.join(S, 'hub'); os.makedirs(HUB, exist_ok=True)
items = json.load(open(os.path.join(ROOT, 'server/src/hub/sample.json')))['items']
stills = [Image.open(os.path.join(S, n)).convert('RGB') for n in ('sample-character.png', 'sample-product.png', 'sample-keyframe.png')]
from PIL import ImageOps
for i, it in enumerate(items):
    bg = stills[2].resize((480, 270), Image.LANCZOS).rotate((i * 37) % 360, expand=False, fillcolor=(20, 20, 30))
    bg = ImageOps.colorize(ImageOps.grayscale(bg), black=((i * 53) % 255, (i * 97) % 200, (i * 31) % 255), white=(255, 240 - (i * 7) % 120, 200 + (i * 11) % 55))
    fg = stills[i % 2].copy(); fg.thumbnail((150 + (i % 4) * 25,) * 2)
    fg = fg.rotate((i * 23) % 40 - 20, expand=True, fillcolor=(0, 0, 0)); mask = Image.eval(fg.convert('L'), lambda v: 255 if v > 8 else 0)
    bg.paste(fg, (40 + (i * 61) % (480 - fg.width - 40), (270 - fg.height) // 2 + (i % 3 - 1) * 30), mask)
    d = ImageDraw.Draw(bg); d.rectangle([0, 238, 480, 270], fill=(0, 0, 0)); d.text((10, 246), it['name'][:48], fill=(255, 255, 255))
    bg.save(os.path.join(HUB, f"{it['id']}.jpg"), quality=78)
print(f'hub thumbnails: {len(items)}')
video_preset_posters()
