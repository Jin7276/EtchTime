"""生成一张演示用的深色氛围背景图（模糊光斑 + 暗角）。"""
import pathlib
import random
from PIL import Image, ImageDraw, ImageFilter

W, H = 1400, 900
random.seed(11)

base = Image.new("RGBA", (W, H), (14, 16, 22, 255))

palette = [
    (40, 120, 150),
    (170, 95, 45),
    (60, 70, 140),
    (140, 60, 95),
    (40, 110, 95),
    (180, 150, 70),
]

for _ in range(6):
    c = random.choice(palette)
    r = random.randint(220, 420)
    cx = random.randint(-80, W + 80)
    cy = random.randint(-60, H + 60)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c + (150,))
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.5))
    base = Image.alpha_composite(base, layer)

img = base.filter(ImageFilter.GaussianBlur(30)).convert("RGB")

# 暗角：中心亮、四周压暗，保证文字可读
vig = Image.new("L", (W, H), 0)
ImageDraw.Draw(vig).ellipse([-W * 0.2, -H * 0.25, W * 1.2, H * 1.25], fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(200))
dark = Image.new("RGB", (W, H), (8, 9, 13))
img = Image.composite(img, dark, vig)

out_dir = pathlib.Path(__file__).resolve().parent.parent / "web" / "assets"
out_dir.mkdir(parents=True, exist_ok=True)
out = out_dir / "bg-sample.jpg"
img.save(out, "JPEG", quality=86, optimize=True)
print("wrote", out, out.stat().st_size // 1024, "KB")
