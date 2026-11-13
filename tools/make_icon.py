"""生成安卓启动图标：黑底圆角方块 + 白色秒表环（方案 B）。"""
import pathlib
from PIL import Image, ImageDraw

S = 1024
R = int(S * 0.235)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=R, fill=(255, 255, 255, 255))
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=R, outline=(224, 224, 224, 255), width=6)

cx, cy = S // 2, S // 2
r = int(S * 0.21)
w = int(S * 0.055)
white = (11, 11, 11, 255)

# 表环（左上留缺口）
d.arc([cx - r, cy - r, cx + r, cy + r], start=-60, end=300, fill=white, width=w)
# 顶部按键
d.rounded_rectangle([cx - w // 2, cy - r - int(w * 1.4), cx + w // 2, cy - r], radius=w // 2, fill=white)
# 指针
d.line([cx, cy, cx + int(r * 0.55), cy - int(r * 0.42)], fill=white, width=w)
# 圆心
d.ellipse([cx - w // 2, cy - w // 2, cx + w // 2, cy + w // 2], fill=white)

res = pathlib.Path(__file__).resolve().parent.parent / "android" / "res"
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for name, px in sizes.items():
    out = res / f"mipmap-{name}"
    out.mkdir(parents=True, exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(out / "ic_launcher.png")

img.resize((512, 512), Image.LANCZOS).save(
    pathlib.Path(__file__).resolve().parent.parent / "shots" / "icon-final.png")

print("icons written")
