"""把番茄Todo导出的 xls（已转 xlsx）转成本 App 的备份 JSON。"""
import json
import pathlib
import re
from datetime import datetime

import openpyxl

root = pathlib.Path(__file__).resolve().parent.parent
src = root / "tmp_history.xlsx"
out = root / "番茄todo-导入备份.json"

wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
ws = wb.worksheets[0]

rows = list(ws.iter_rows(values_only=True))
header = rows[1]
data = rows[2:]

todos, todo_map = [], {}
sessions = []
skipped = 0

pat = re.compile(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*至\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})")

for r in data:
    if not r or not r[0]:
        skipped += 1
        continue
    m = pat.search(str(r[0]))
    name = (r[1] or "").strip()
    if not m or not name:
        skipped += 1
        continue
    try:
        st = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M")
        en = datetime.strptime(m.group(2), "%Y-%m-%d %H:%M")
    except ValueError:
        skipped += 1
        continue

    dur_min = 0
    try:
        dur_min = float(r[2])
    except (TypeError, ValueError):
        dur_min = (en - st).total_seconds() / 60

    if name not in todo_map:
        tid = "t%03d" % (len(todos) + 1)
        todo_map[name] = tid
        todos.append({"id": tid, "name": name, "createdAt": int(st.timestamp() * 1000)})

    start_ms = int(st.timestamp() * 1000)
    end_ms = int(en.timestamp() * 1000)
    total = end_ms - start_ms
    active = int(dur_min * 60000)
    pauses = []
    if 0 < active < total:
        pauses = [[end_ms - (total - active), end_ms]]

    sessions.append({
        "id": "s%04d" % (len(sessions) + 1),
        "todoId": todo_map[name],
        "start": start_ms,
        "end": end_ms,
        "pauses": pauses,
    })

sessions.sort(key=lambda s: s["start"])

payload = {
    "app": "时间账本",
    "version": 1,
    "exportedAt": datetime.now().isoformat(timespec="seconds"),
    "todos": todos,
    "sessions": sessions,
}

out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

total_min = sum((s["end"] - s["start"]) / 60000 for s in sessions)
print("todos:", len(todos))
print("sessions:", len(sessions), "skipped:", skipped)
print("span:", datetime.fromtimestamp(sessions[0]["start"] / 1000),
      "->", datetime.fromtimestamp(sessions[-1]["start"] / 1000))
print("total hours:", round(total_min / 60, 1))
print("out:", out, round(out.stat().st_size / 1024, 1), "KB")
for t in todos:
    print(" -", t["name"])
