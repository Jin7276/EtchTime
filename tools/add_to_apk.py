"""把资源用正斜杠路径写进 APK（Windows 下 aapt2 -A 会写成反斜杠）。

用法：python add_to_apk.py <apk> [arcname=path ...]
      path 是目录时递归加入，弧名 = arcname/相对路径
      path 是文件时直接以 arcname 加入
"""
import pathlib
import sys
import zipfile

apk = sys.argv[1]

with zipfile.ZipFile(apk, "a", zipfile.ZIP_DEFLATED) as z:
    for spec in sys.argv[2:]:
        if "=" not in spec:
            print("skip (no arcname):", spec)
            continue
        arc, src = spec.split("=", 1)
        p = pathlib.Path(src)
        if not p.exists():
            print("missing:", src)
            continue
        if p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file():
                    name = arc.rstrip("/") + "/" + f.relative_to(p).as_posix()
                    z.write(f, name)
        else:
            z.write(p, arc)

print("packed:", apk)
