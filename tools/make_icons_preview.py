"""生成 3 个 App 图标方案 × 2 种配色，并拼成预览图。"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

S = 512
R = int(S * 0.235)
PAD = int(S * 0.20)

def rounded(bg):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=R, fill=bg)
    return im, d


def hourglass(bg, fg):
    im, d = rounded(bg)
    cx, cy = S // 2, S // 2
    w = int(S * 0.30)
    h = int(S * 0.40)
    top, bot = cy - h // 2, cy + h // 2
    bar = int(S * 0.035)
    d.rounded_rectangle([cx - w // 2 - bar, top - bar * 2, cx + w // 2 + bar, top], radius=bar // 2, fill=fg)
    d.rounded_rectangle([cx - w // 2 - bar, bot, cx + w // 2 + bar, bot + bar * 2], radius=bar // 2, fill=fg)
    d.polygon([(cx - w // 2, top), (cx + w // 2, top), (cx, cy - int(S * 0.02))], fill=fg)
    d.polygon([(cx - w // 2, bot), (cx + w // 2, bot), (cx, cy + int(S * 0.02))], fill=fg)
    d.rounded_rectangle([cx - bar, cy - bar, cx + bar, cy + bar], radius=bar // 2, fill=fg)
    return im


def clockring(bg, fg):
    im, d = rounded(bg)
    cx, cy = S // 2, S // 2
    r = int(S * 0.21)
    w = int(S * 0.055)
    d.arc([cx - r, cy - r, cx + r, cy + r], start=-60, end=300, fill=fg, width=w)
    d.rounded_rectangle([cx - w // 2, cy - r - int(w * 1.4), cx + w // 2, cy - r], radius=w // 2, fill=fg)
    d.line([cx, cy, cx + int(r * 0.55), cy - int(r * 0.42)], fill=fg, width=w)
    d.ellipse([cx - w // 2, cy - w // 2, cx + w // 2, cy + w // 2], fill=fg)
    return im


def ledger(bg, fg):
    im, d = rounded(bg)
    cx, cy = S // 2, S // 2
    line_w = int(S * 0.042)
    vx = cx - int(S * 0.17)
    d.rounded_rectangle([vx - line_w // 2, cy - int(S * 0.20), vx + line_w // 2, cy + int(S * 0.20)],
                        radius=line_w // 2, fill=fg)
    rows = [(0.62, -0.135), (0.46, -0.045), (0.54, 0.045), (0.34, 0.135)]
    for wf, off in rows:
        y = cy + int(S * off)
        x0 = vx + int(S * 0.06)
        x1 = x0 + int(S * 0.30 * wf / 0.62)
        d.rounded_rectangle([x0, y - line_w // 2, x1, y + line_w // 2], radius=line_w // 2, fill=fg)
    return im


BLACK = (11, 11, 11, 255)
WHITE = (255, 255, 255, 255)

schemes = [
    ("A · 沙漏", hourglass),
    ("B · 表环", clockring),
    ("C · 账本", ledger),
]

cell = 300
label_h = 46
sheet = Image.new("RGB", (cell * 3, (cell + label_h) * 2 + 30), (245, 245, 245))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 22)
except Exception:
    font = ImageFont.load_default()

for col, (name, fn) in enumerate(schemes):
    for row, (bg, fg, tag) in enumerate([(BLACK, WHITE, "深色"), (WHITE, BLACK, "浅色")]):
        icon = fn(bg, fg).resize((cell - 60, cell - 60), Image.LANCZOS)
        x = col * cell + 30
        y = row * (cell + label_h) + 20
        # 浅色方案加一圈描边，方便看清边界
        box = Image.new("RGB", (cell - 36, cell - 36), (255, 255, 255) if bg is WHITE else (11, 11, 11))
        sheet.paste(box, (x - 4, y - 4))
        sheet.paste(icon, (x, y), icon)
        label = f"{name} · {tag}"
        w = draw.textlength(label, font=font)
        draw.text((col * cell + (cell - w) / 2, y + cell - 46), label, fill=(60, 60, 60), font=font)

out = pathlib.Path(__file__).resolve().parent.parent / "shots" / "icons.png"
sheet.save(out)
print("wrote", out, sheet.size)
