import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html_p = root / "web" / "index.html"
css_p = root / "web" / "styles.css"
js_p = root / "web" / "app.js"

html = html_p.read_text(encoding="utf-8")
old = """      <div class="timer-corner">
        <button class="tool" id="bgClear" aria-label="移除背景图" hidden>"""
new = """      <div class="timer-corner">
        <button class="tool" id="keepBtn" aria-label="保持屏幕常亮">
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="13" rx="2.5"/><path d="M8.5 20.5h7"/><circle cx="12" cy="11" r="2.6"/></svg>
        </button>
        <button class="tool" id="bgClear" aria-label="移除背景图" hidden>"""
assert old in html, "keep btn"
html = html.replace(old, new)
html_p.write_text(html, encoding="utf-8")

css = css_p.read_text(encoding="utf-8").replace("\r\n", "\n")
css += """
.tool.on{background:var(--ink);color:var(--bg);}
body[data-theme="dark"] .tool.on{background:#F2F2F2;color:#0B0B0B;}
"""
css_p.write_text(css, encoding="utf-8")

js = js_p.read_text(encoding="utf-8").replace("\r\n", "\n")

def rep(old, new, tag):
    global js
    if old not in js:
        raise SystemExit("MISS " + tag)
    js = js.replace(old, new)

rep("""      slices += `<path d="${arcPath(acc, acc + ang)}" fill="${it.color}" stroke="#fff" stroke-width="2.5"/>`;""",
"""      slices += `<path d="${arcPath(acc, acc + ang)}" fill="${it.color}" shape-rendering="geometricPrecision"/>`;""", "pie stroke")

rep("      if (sessionMs(s) < 5000) continue;    // 5 秒以内当误触，不进统计",
    "      if (sessionMs(s) < 10000) continue;   // 不足 10 秒不计入统计", "filter")

js = js.replace("sessionMs(s) >= 5000", "sessionMs(s) >= 10000")

rep("""    const ms = activeIntervals({ start: cur.start, end, pauses: cur.pauses }).reduce((a, [x, y]) => a + (y - x), 0);
    if (ms >= 1000) {
      db.sessions.push({ id: uid(), todoId: cur.todoId, start: cur.start, end, pauses: cur.pauses || [] });
      saveDB();
    }""",
"""    const ms = activeIntervals({ start: cur.start, end, pauses: cur.pauses }).reduce((a, [x, y]) => a + (y - x), 0);
    const tooShort = ms < 10000;
    if (!tooShort) {
      db.sessions.push({ id: uid(), todoId: cur.todoId, start: cur.start, end, pauses: cur.pauses || [] });
      saveDB();
    }""", "end rule A")

rep("""    if (!silent) { renderTodos(); go('todos'); }""",
"""    if (!silent) {
      renderTodos(); go('todos');
      if (tooShort) setTimeout(() => toast('本次不足 10 秒，不计入数据'), 80);
    }""", "end rule B")

rep("""    if (e.target.closest('#pauseBtn')) { pauseTimerFn(); return; }""",
"""    if (e.target.closest('#keepBtn')) {
      prefs.keep = !prefs.keep;
      savePrefs();
      $('#keepBtn').classList.toggle('on', !!prefs.keep);
      if (window.AndroidBridge && window.AndroidBridge.setKeepScreen) {
        try { window.AndroidBridge.setKeepScreen(!!prefs.keep); } catch (err) {}
      }
      toast(prefs.keep ? '屏幕将保持常亮' : '已关闭屏幕常亮');
      return;
    }
    if (e.target.closest('#pauseBtn')) { pauseTimerFn(); return; }""", "keep handler")

rep("""  function applyPrefs() {
    document.body.dataset.theme = prefs.theme;""",
"""  function applyPrefs() {
    document.body.dataset.theme = prefs.theme;
    $('#keepBtn').classList.toggle('on', !!prefs.keep);
    if (window.AndroidBridge && window.AndroidBridge.setKeepScreen) {
      try { window.AndroidBridge.setKeepScreen(!!prefs.keep); } catch (e) {}
    }""", "applyPrefs keep")

js_p.write_text(js, encoding="utf-8")
print("ok")
