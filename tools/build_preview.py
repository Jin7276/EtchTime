"""把 web/ 下的 index.html + styles.css + app.js 合成单文件 preview.html，
并把演示用背景图内联成 data URI，方便直接双击打开或发给别人看。"""
import base64
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
web = root / "web"

html = (web / "index.html").read_text(encoding="utf-8")
css = (web / "styles.css").read_text(encoding="utf-8")
js = (web / "app.js").read_text(encoding="utf-8")

html = re.sub(r'<link rel="stylesheet" href="styles\.css">',
              "<style>\n" + css + "\n</style>", html)
html = re.sub(r'<script src="app\.js"></script>',
              "<script>\n" + js + "\n</script>", html)

sample = web / "assets" / "bg-sample.jpg"
if sample.exists():
    b64 = base64.b64encode(sample.read_bytes()).decode("ascii")
    html = html.replace("assets/bg-sample.jpg", "data:image/jpeg;base64," + b64)

out = root / "preview.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out}  ({out.stat().st_size / 1024:.1f} KB)")
