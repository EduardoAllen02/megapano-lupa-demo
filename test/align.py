import json, sys, os
from PIL import Image, ImageChops
import numpy as np

d = os.path.dirname(os.path.abspath(__file__))
for name in ["centro", "costura", "zenit", "nadir", "fueracentro"]:
    j = json.load(open(f"{d}/align_{name}.json"))
    on = Image.open(f"{d}/align_{name}_on.png").convert("RGB")
    off = Image.open(f"{d}/align_{name}_off.png").convert("RGB")
    x, y, r = j["x"], j["y"], 100  # radio interior (evita borde/brillo)
    box = (int(x - r), int(y - r), int(x + r), int(y + r))
    a = np.asarray(on.crop(box)).astype(float)
    b = np.asarray(off.crop(box)).astype(float)
    yy, xx = np.ogrid[:2 * r, :2 * r]
    mask = (yy - r) ** 2 + (xx - r) ** 2 < (r * 0.8) ** 2
    diff = np.abs(a - b).mean(axis=2)[mask]
    print(f"{name:8s} mean abs diff={diff.mean():5.2f}/255  p95={np.percentile(diff, 95):5.1f}  lensFov={j['info']['hf']:.2f}  {'OK' if diff.mean() < 8 else 'DESALINEADO'}")
