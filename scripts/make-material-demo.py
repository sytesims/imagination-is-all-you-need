"""Placeholder art for the Canvas demo "Sofa in every material": a drawn sofa and four procedural swatches.
Made from code (no AI, no photos), so they can ship in the repo until real photos replace them."""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1] if len(sys.argv) > 1 else "web/public/examples/demo/material"
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(7)

def noise(h, w, scale=1.0, blur=0):
    n = rng.standard_normal((h, w)).astype(np.float32)
    img = Image.fromarray(np.clip(128 + n * 40 * scale, 0, 255).astype(np.uint8))
    if blur: img = img.filter(ImageFilter.GaussianBlur(blur))
    return (np.asarray(img).astype(np.float32) - 128) / 128.0

def tint(base, light):
    """base rgb (0-255), light: HxW array around 0 -> image"""
    rgb = np.array(base, np.float32)[None, None, :] * (1 + light[..., None])
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))

S = 768
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
vign = -0.18 * (((xx - S / 2) ** 2 + (yy - S / 2) ** 2) / (S * S / 2))

# leather: warm brown, soft blotches + fine pebble grain + creases
leather = 0.25 * noise(S, S, 1, 18) + 0.10 * noise(S, S, 1, 1.2) + vign
crease = -0.10 * (np.abs(noise(S, S, 1, 5)) < 0.02) + 0.12 * noise(S, S, 1, 3)
tint((120, 70, 40), leather + crease).save(f'{out}/leather.webp', quality=86)

# velvet: deep green, strong soft sheen bands (pile direction)
sheen = 0.35 * np.sin((xx * 0.6 + yy) / 160 + 2 * noise(S, S, 1, 40)) + 0.06 * noise(S, S, 1, 0.8) + vign
tint((28, 92, 70), sheen).save(f'{out}/velvet.webp', quality=86)

# linen: oatmeal, a plain weave with slubs
warp = 0.07 * np.sin(xx * np.pi / 3) + 0.07 * np.sin(yy * np.pi / 3)
slub = 0.10 * noise(S, S, 1, 0.6) * (np.abs(noise(S, S, 1, 6)) > 0.25) + 0.05 * noise(S, S, 1, 25)
tint((214, 200, 174), warp + slub + vign * 0.6).save(f'{out}/linen.webp', quality=86)

# corduroy: rust, vertical wales
wale = 0.22 * (np.abs(np.sin(xx * np.pi / 14)) ** 0.6 - 0.6) + 0.05 * noise(S, S, 1, 0.8) + 0.06 * noise(S, S, 1, 30) + vign
tint((168, 82, 44), wale).save(f'{out}/corduroy.webp', quality=86)

# the sofa: a plain three-seater in light grey fabric, in a calm room (drawn, front view)
W, H = 1280, 854
room = Image.new('RGB', (W, H))
wall = np.linspace(238, 222, H // 1)[:, None].repeat(W, 1)
arr = np.stack([wall, wall - 6, wall - 14], -1)
floor_y = 610
arr[floor_y:] = np.array([176, 150, 122])[None, None, :] * (1 + 0.05 * noise(H - floor_y, W, 1, 3)[..., None])
room = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
d = ImageDraw.Draw(room)
# shadow
sh = Image.new('L', (W, H), 0); ImageDraw.Draw(sh).ellipse((230, 590, 1050, 660), fill=120); sh = sh.filter(ImageFilter.GaussianBlur(18))
room.paste((90, 76, 62), (0, 0), sh)
fab = (150, 152, 156); dark = (124, 126, 131); light = (170, 172, 176)
d.rounded_rectangle((300, 300, 980, 470), 38, fill=dark)            # back
for x0 in (318, 548, 778):                                          # back cushions
    d.rounded_rectangle((x0, 318, x0 + 214, 470), 30, fill=fab)
d.rounded_rectangle((300, 455, 980, 560), 26, fill=dark)            # base
for x0 in (318, 548, 778):                                          # seat cushions
    d.rounded_rectangle((x0, 440, x0 + 214, 520), 22, fill=light)
d.rounded_rectangle((240, 360, 340, 575), 34, fill=fab)              # arms
d.rounded_rectangle((940, 360, 1040, 575), 34, fill=fab)
for x in (280, 1000): d.rectangle((x, 575, x + 14, 612), fill=(70, 52, 38))   # legs
# a soft fabric grain over the sofa only
mask = Image.new('L', (W, H), 0); md = ImageDraw.Draw(mask)
for box in ((300, 300, 980, 560), (240, 360, 340, 575), (940, 360, 1040, 575)): md.rounded_rectangle(box, 34, fill=255)
grain = Image.fromarray(np.clip(128 + 18 * noise(H, W, 1, 0.7) * 128 / 40, 0, 255).astype(np.uint8)).convert('RGB')
room = Image.composite(Image.blend(room, grain, 0.08), room, mask)
room = room.filter(ImageFilter.GaussianBlur(0.6))
room.save(f'{out}/sofa.webp', quality=86)
for f in ('sofa', 'leather', 'velvet', 'linen', 'corduroy'):
    im = Image.open(f'{out}/{f}.webp'); im.thumbnail((480, 480)); im.save(f'{out}/{f}-480.webp', quality=82)
print('ok')
