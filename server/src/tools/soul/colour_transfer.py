#!/usr/bin/env python3
"""OpenSoul cloud colour match: target.png ref.png strength method  (in place). Reinhard transfer in CIE LAB (mean/std per channel),
the same maths as ComfyUI core ColorTransfer reinhard_lab; 'histogram' = per-channel CDF matching in RGB; mkl_lab falls back to reinhard_lab.
Result = target + strength · (transferred − target), strength 0.3–0.7 (validated by the tool)."""
import sys
import numpy as np
from PIL import Image, ImageCms

def lab(img):
    srgb = ImageCms.createProfile('sRGB'); labp = ImageCms.createProfile('LAB')
    return ImageCms.applyTransform(img, ImageCms.buildTransformFromOpenProfiles(srgb, labp, 'RGB', 'LAB')), ImageCms.buildTransformFromOpenProfiles(labp, srgb, 'LAB', 'RGB')

def reinhard(t, r):
    tl, back = lab(t); rl, _ = lab(r)
    a = np.asarray(tl).astype(np.float64); b = np.asarray(rl).astype(np.float64)
    m1, s1 = a.reshape(-1, 3).mean(0), a.reshape(-1, 3).std(0) + 1e-6; m2, s2 = b.reshape(-1, 3).mean(0), b.reshape(-1, 3).std(0) + 1e-6
    out = np.clip((a - m1) / s1 * s2 + m2, 0, 255).astype(np.uint8)
    return ImageCms.applyTransform(Image.fromarray(out, 'LAB'), back)

def histogram(t, r):
    a = np.asarray(t); b = np.asarray(r); out = np.empty_like(a)
    for c in range(3):
        sv, si, sc = np.unique(a[..., c].ravel(), return_inverse=True, return_counts=True); rv, rc = np.unique(b[..., c].ravel(), return_counts=True)
        out[..., c] = np.interp(np.cumsum(sc) / a[..., c].size, np.cumsum(rc) / b[..., c].size, rv)[si].reshape(a.shape[:2])
    return Image.fromarray(out, 'RGB')

def main():
    tp, rp, s, method = sys.argv[1], sys.argv[2], float(sys.argv[3]), (sys.argv[4] if len(sys.argv) > 4 else 'reinhard_lab')
    if not 0.0 <= s <= 1.0: sys.exit('strength out of range')
    t = Image.open(tp).convert('RGB'); r = Image.open(rp).convert('RGB')
    x = histogram(t, r) if method == 'histogram' else reinhard(t, r)
    o = np.asarray(t).astype(np.float64); y = o + s * (np.asarray(x).astype(np.float64) - o)
    Image.fromarray(np.clip(y, 0, 255).astype(np.uint8), 'RGB').save(tp)

if __name__ == '__main__': main()
