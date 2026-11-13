import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
html_p = root / "web" / "index.html"
css_p = root / "web" / "styles.css"
js_p = root / "web" / "app.js"

# ---------------- HTML ----------------
html = html_p.read_text(encoding="utf-8")

old = """            <div class="chart-head">
              <div class="segmented" data-seg="range">"""
new = """            <div class="chart-head">
              <button class="head-cal" id="dataCalBtn" aria-label="选择日期">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/></svg>
              </button>
              <div class="segmented" data-seg="range">"""
assert old in html, "chart head"
html = html.replace(old, new)

old = """              <button class="pal-btn" id="palBtn" aria-label="扇形图配色">"""
new = """              <button class="nav-btn prev" id="dayPrev" aria-label="前一天">‹</button>
              <button class="nav-btn next" id="dayNext" aria-label="后一天">›</button>
              <button class="pal-btn" id="palBtn" aria-label="扇形图配色">"""
assert old in html, "nav btns"
html = html.replace(old, new)

old = """  <!-- 扇形图配色 -->"""
new = """  <!-- 选日期 -->
  <div class="sheet" id="dayPicker">
    <div class="day-box">
      <div class="cal-head">
        <button class="chev" id="pkPrev">‹</button>
        <span class="cal-title" id="pkTitle">2026 年 11 月</span>
        <button class="chev" id="pkNext">›</button>
      </div>
      <div class="cal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
      <div class="cal-grid pk-grid" id="pkGrid"></div>
    </div>
  </div>

  <!-- 扇形图配色 -->"""
assert old in html, "day picker"
html = html.replace(old, new)
html_p.write_text(html, encoding="utf-8")

# ---------------- CSS ----------------
css = css_p.read_text(encoding="utf-8").replace("\r\n", "\n")
css += """
/* 日期切换 */
.head-cal{
  width:36px;height:36px;border-radius:50%;
  display:grid;place-items:center;color:var(--ink-2);
  margin-right:8px;
}
.head-cal:active{background:var(--card-2);}
.chart-head{align-items:center;}
.nav-btn{
  position:absolute;width:30px;height:30px;border-radius:50%;
  display:grid;place-items:center;
  color:var(--ink-2);font-size:19px;line-height:1;
  background:var(--card);
}
.nav-btn:active{background:var(--card-2);}
.nav-btn.prev{right:40px;top:72px;}
.nav-btn.next{right:-6px;top:72px;}

/* 选日期弹窗 */
.day-box{
  width:430px;max-width:calc(100% - 60px);
  background:var(--surface);border-radius:24px;padding:20px 22px 22px;
  box-shadow:0 24px 60px rgba(0,0,0,.22);
}
.pk-grid{gap:4px;}
.pk-grid .hday .hd{width:40px;height:40px;font-size:15px;}
body[data-theme="dark"] .day-box{background:#141414;border:1px solid rgba(255,255,255,.10);}
"""
css_p.write_text(css, encoding="utf-8")

# ---------------- JS ----------------
js = js_p.read_text(encoding="utf-8").replace("\r\n", "\n")

def rep(old, new, tag):
    global js
    if old not in js:
        raise SystemExit("MISS " + tag)
    js = js.replace(old, new)

# refreshData：支持选中某一天
rep("""  function refreshData() {
    const { total, items } = currentData();
    renderPie(total, items);
    renderLegend(total, items);
    renderTimeline();

    const [from, to] = rangeOf(ui.range);
    const days = Math.max(1, Math.ceil((to - from) / DAY));
    const list = db.sessions.filter(s => s.end > from && s.start < to && sessionMs(s) >= 10000);
    $('#stCount').textContent = list.length;
    $('#stTotal').textContent = total ? fmtMH(total) : '—';
    $('#stAvg').textContent = total ? fmtMH(total / days) : '—';
    $('#rangeText').textContent = ui.range === 'custom' && ui.custom
      ? `${dayKey(ui.custom[0])} 至 ${dayKey(ui.custom[1])}`
      : RANGE_LABEL[ui.range] || '全部';
  }""",
"""  function refreshData() {
    const { total, items } = currentData();
    renderPie(total, items);
    renderLegend(total, items);

    let from, to;
    if (ui.day) {
      from = new Date(ui.day + 'T00:00:00').getTime();
      to = addDays(from, 1);
    } else {
      [from, to] = rangeOf(ui.range);
    }

    renderTimeline(from, to, !!ui.day);

    const days = Math.max(1, Math.ceil((to - from) / DAY));
    const list = db.sessions.filter(s => s.end > from && s.start < to && sessionMs(s) >= 10000);
    $('#stCount').textContent = list.length;
    $('#stTotal').textContent = total ? fmtMH(total) : '—';
    $('#stAvg').textContent = total ? fmtMH(total / days) : '—';
  }""", "refreshData")

# 时间段：跟随选中日
old_tl = js[js.index("  function renderTimeline() {"):js.index("  /* ---------- 图例")]
new_tl = """  function renderTimeline(from, to, isDay) {
    const list = db.sessions
      .filter(s => s.end > from && s.start < to && sessionMs(s) >= 10000)
      .sort((a, b) => a.start - b.start);
    const hm = ts => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
    $('#timeline').innerHTML = list.length ? list.map((s, i) => `
      <li class="tl-item" data-sid="${s.id}">
        <span class="tl-num">${i + 1}</span>
        <div class="tl-main">
          <div class="tl-name">${esc(todoName(s.todoId))}</div>
          <div class="tl-time">${hm(s.start)} – ${hm(s.end)}</div>
        </div>
        <span class="tl-dur">${fmtMH(sessionMs(s))}</span>
      </li>`).join('') : `<li class="tl-empty">这天没有记录</li>`;

    const show = isDay || ui.range === 'today';
    $('#todayPanel').style.display = show ? '' : 'none';
    const d = new Date(from);
    $('#todayPanel .panel-title').textContent = isDay
      ? `${d.getMonth() + 1}月${d.getDate()}日 时间段` : '今日时间段';
  }

"""
js = js.replace(old_tl, new_tl)

# 切日期按钮 / 日历按钮
rep("""    if (e.target.closest('#palBtn')) { openPalSheet(); return; }""",
"""    if (e.target.closest('#dayPrev') || e.target.closest('#dayNext')) {
      const base = ui.day || dayKey(Date.now());
      const n = e.target.closest('#dayPrev') ? -1 : 1;
      const k = dayKey(addDays(new Date(base + 'T00:00:00').getTime(), n));
      if (k > dayKey(Date.now())) { toast('还没到那天'); return; }
      ui.day = k;
      $$('.segmented[data-seg="range"] button').forEach(b => b.classList.remove('on'));
      refreshData();
      return;
    }
    if (e.target.closest('#dataCalBtn')) { openDayPicker(); return; }
    if (e.target.closest('#pkPrev') || e.target.closest('#pkNext')) {
      ui.pickMonth += (e.target.closest('#pkPrev') ? -1 : 1);
      renderDayPicker();
      return;
    }
    if (e.target.closest('#pkGrid .hday[data-dkey]')) {
      ui.day = e.target.closest('.hday').dataset.dkey;
      $('#dayPicker').classList.remove('show');
      $$('.segmented[data-seg="range"] button').forEach(b => b.classList.remove('on'));
      refreshData();
      return;
    }
    if (e.target.id === 'dayPicker') { $('#dayPicker').classList.remove('show'); return; }
    if (e.target.closest('#palBtn')) { openPalSheet(); return; }""", "nav events")

# 分段切换时清掉选中日
rep("""      if (box.dataset.seg === 'range') {
        if (idx === 3) { openRangeSheet(); return; }
        ui.range = ['today', 'week', 'month'][idx];
      }""",
"""      if (box.dataset.seg === 'range') {
        if (idx === 3) { openRangeSheet(); return; }
        ui.day = null;
        ui.range = ['today', 'week', 'month'][idx];
      }""", "segmented clear day")

# 日期选择器实现
rep("""  function openPalSheet() {""",
"""  function openDayPicker() {
    ui.pickMonth = 0;
    renderDayPicker();
    $('#dayPicker').classList.add('show');
  }
  function renderDayPicker() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + (ui.pickMonth || 0);
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const today = dayKey(Date.now());
    const sel = ui.day || '';

    let html = '';
    for (let i = 0; i < lead; i++) html += '<div class="hday blank"></div>';
    for (let d = 1; d <= days; d++) {
      const ts = new Date(y, m, d).getTime();
      const k = dayKey(ts);
      const cls = ['hday', k === today ? 'today' : '', k === sel ? 'sel' : '',
        ts > Date.now() ? 'future' : ''].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-dkey="${k}"><span class="hd">${d}</span></button>`;
    }
    $('#pkGrid').innerHTML = html;
    $('#pkTitle').textContent = `${y} 年 ${m + 1} 月`;
  }

  function openPalSheet() {""", "day picker")

rep("const ui = { screen: 'todos', range: 'today', custom: null, day: null,",
    "const ui = { screen: 'todos', range: 'today', custom: null, day: null, pickMonth: 0,", "ui pickMonth")

js_p.write_text(js, encoding="utf-8")
print("ok")
