"""Corta pano.jpg en una pirámide de tiles para el adapter equirectangular-tiles de PSV.
Genera: tiles/base.jpg y tiles/L{nivel}_{col}_{row}.jpg, tiles de 512px, niveles 4096/8192/16384.
"""
import os, time
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC = "src/pano.jpg"
OUT = "tiles"
T = 512
WIDTHS = [4096, 8192, 16384]
Q = 80

t0 = time.time()
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(f"{OUT}/{f}")
src = Image.open(SRC).convert("RGB")
print("original", src.size)
src.resize((2048, 1024), Image.LANCZOS).save(f"{OUT}/base.jpg", quality=85)

for lvl, w in enumerate(WIDTHS):
    im = src.resize((w, w // 2), Image.LANCZOS)
    cols, rows = w // T, w // 2 // T
    total = 0
    for r in range(rows):
        for c in range(cols):
            p = f"{OUT}/L{lvl}_{c}_{r}.jpg"
            im.crop((c * T, r * T, (c + 1) * T, (r + 1) * T)).save(p, quality=Q, optimize=True)
            total += os.path.getsize(p)
    print(f"nivel {lvl}: {w}px, {cols}x{rows} tiles, {total/1e6:.1f} MB, {time.time()-t0:.1f}s")
