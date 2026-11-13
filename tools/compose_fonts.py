"""把四张计时页变体拼成一张对比图。"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parent.parent
shots = root / "shots"

labels = [
    ("① 粗体 700", "font1.png"),
    ("② 等宽（数码感）", "font2.png"),
    ("③ 超粗 900", "font3.png"),
    ("④ 细体 250（原版）", "font4.png"),
]

cell_w, cell_h = 640, 400
canvas = Image.new("RGB", (cell_w * 2, cell_h * 2), (255, 255, 255))

try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
except Exception:
    font = ImageFont.load_default()

for i, (label, name) in enumerate(labels):
    img = Image.open(shots / name).convert("RGB").resize((cell_w, cell_h), Image.LANCZOS)
    canvas.paste(img, ((i % 2) * cell_w, (i // 2) * cell_h))

draw = ImageDraw.Draw(canvas)
for i, (label, _) in enumerate(labels):
    x = (i % 2) * cell_w
    y = (i // 2) * cell_h
    draw.rectangle([x, y, x + cell_w - 1, y + cell_h - 1], outline=(228, 228, 228))
    tw = draw.textlength(label, font=font)
    draw.rounded_rectangle([x + 16, y + 14, x + 16 + tw + 26, y + 14 + 40], radius=20,
                           fill=(255, 255, 255), outline=(226, 226, 226))
    draw.text((x + 29, y + 22), label, fill=(11, 11, 11), font=font)

out = shots / "font-options.png"
canvas.save(out)
print("wrote", out, out.stat().st_size // 1024, "KB")
