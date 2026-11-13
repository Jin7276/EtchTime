import sys
from PIL import Image

BG = (232, 232, 229)  # body 背景色，用于裁掉左右留白
TOL = 6

def close(px):
    return all(abs(px[i] - BG[i]) <= TOL for i in range(3))

def crop(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()

    # 取中间一行与四分之一行，横向找 app 的左右边界
    ys = [int(h * f) for f in (0.02, 0.25, 0.5, 0.75, 0.98)]
    left, right = w, 0
    for y in ys:
        for x in range(w):
            if not close(px[x, y]):
                left = min(left, x)
                break
        for x in range(w - 1, -1, -1):
            if not close(px[x, y]):
                right = max(right, x)
                break
    if right <= left:
        print("CROP SKIP (no edge found)", path)
        return
    im.crop((left, 0, right + 1, h)).save(path)
    print(f"cropped {path}: {w}x{h} -> {right + 1 - left}x{h}")

for p in sys.argv[1:]:
    crop(p)
