"""把四种字重的时钟裁出来拼成一张对比图。"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parent.parent
shots = root / "shots"

rows = [
    ("400  当前", "timer.png"),
    ("300  更细", "w2.png"),
    ("500  中粗", "w3.png"),
    ("600  粗", "w4.png"),
]

box = (760, 640, 1800, 940)          # 时钟所在区域
w = box[2] - box[0]
h = box[3] - box[1]
label_w = 230
row_h = h + 16

canvas = Image.new("RGB", (w + label_w, row_h * len(rows)), (255, 255, 255))
draw = ImageDraw.Draw(canvas)

try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 30)
except Exception:
    font = ImageFont.load_default()

for i, (label, name) in enumerate(rows):
    img = Image.open(shots / name).convert("RGB").crop(box)
    y = i * row_h
    canvas.paste(img, (label_w, y))
    draw.text((28, y + h // 2 - 18), label, fill=(110, 110, 110), font=font)
    draw.line([(label_w, y + h), (canvas.size[0], y + h)], fill=(236, 236, 236), width=2)

out = shots / "font-weights.png"
canvas.save(out)
print("wrote", out, out.stat().st_size // 1024, "KB", canvas.size)
