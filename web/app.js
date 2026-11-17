/* ===========================================================
   时间账本 · 正式版
   正计时 + 按代办归类 + 日/周/月/总计统计 + 本地备份
   =========================================================== */
(() => {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const pad2 = n => String(n).padStart(2, '0');
  const DAY = 86400000;
  const K_DB = 'timelog.db.v1';
  const K_CUR = 'timelog.current.v1';
  const K_PREF = 'timelog.pref.v1';

  /* ---------------- 工具 ---------------- */
  const fmtHMS = ms => {
    const sec = Math.round(ms / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s2 = sec % 60;
    if (h) return `${h} 小时 ${pad2(m)} 分`;
    if (m) return `${m} 分 ${pad2(s2)} 秒`;
    return `${s2} 秒`;
  };
  const fmtMH = ms => {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.round(sec / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${pad2(m % 60)}m`;
  };
  const fmtCN = ms => {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec} 秒`;
    const m = Math.round(sec / 60);
    const h = Math.floor(m / 60), mm = m % 60;
    if (h && mm) return `${h} 小时 ${pad2(mm)} 分钟`;
    if (h) return `${h} 小时`;
    return `${mm} 分钟`;
  };
  const fmtCell = ms => {
    const m = Math.round(ms / 60000);
    return m >= 60 ? `${+(m / 60).toFixed(1)}h` : `${m}m`;
  };
  const fmtClock = ms => {
    const t = Math.max(0, Math.floor(ms / 1000));
    return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)}`;
  };
  const DAY_OFFSET = 4 * 3600 * 1000;   // 凌晨 4 点前算前一天
  const dayKey = ts => { const d = new Date(ts - DAY_OFFSET); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const startOfDay = ts => { const d = new Date(ts - DAY_OFFSET); d.setHours(0, 0, 0, 0); return d.getTime() + DAY_OFFSET; };
  const dayStart = key => new Date(key + 'T00:00:00').getTime() + DAY_OFFSET;
  const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
  const startOfWeek = ts => { const d = new Date(startOfDay(ts)); return addDays(d.getTime(), -((d.getDay() + 6) % 7)); };
  const startOfMonth = ts => {
    const d = new Date(ts);
    return dayStart(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`);
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // 蓝阶：按代办数量自动插值
  const SCHEMES = {
    blue:   { name: '蓝', from: [206, 52, 46], to: [203, 45, 84] },
    green:  { name: '绿', from: [154, 42, 44], to: [150, 36, 84] },
    orange: { name: '橙', from: [22, 72, 56], to: [34, 70, 88] },
    purple: { name: '紫', from: [266, 42, 50], to: [270, 38, 86] },
    gray:   { name: '灰', from: [220, 7, 44], to: [220, 6, 84] },
    pink:   { name: '粉', from: [340, 52, 58], to: [346, 48, 88] },
  };
  const scheme = () => SCHEMES[prefs.scheme] || SCHEMES.blue;

  function rampColors(n) {
    const from = scheme().from, to = scheme().to;
    return Array.from({ length: n }, (_, i) => {
      const t = n <= 1 ? 0 : i / (n - 1);
      return `hsl(${(from[0] + (to[0] - from[0]) * t).toFixed(0)} ` +
             `${(from[1] + (to[1] - from[1]) * t).toFixed(0)}% ` +
             `${(from[2] + (to[2] - from[2]) * t).toFixed(0)}%)`;
    });
  }

  function rampLight(i, n) {
    const from = scheme().from, to = scheme().to;
    const t = n <= 1 ? 0 : i / (n - 1);
    const l = from[2] + (to[2] - from[2]) * t;
    return l < 58;
  }

  /* ---------------- 存储 ---------------- */
  let db = { todos: [], sessions: [] };
  let prefs = { theme: 'light', bg: '', keep: true, scheme: 'blue' };
  let cur = null;          // 进行中的计时
  let colors = [];

  function load() {
    try { db = JSON.parse(localStorage.getItem(K_DB)) || db; } catch (e) { db = { todos: [], sessions: [] }; }
    db.todos = db.todos || [];
    db.sessions = db.sessions || [];
    try { prefs = Object.assign(prefs, JSON.parse(localStorage.getItem(K_PREF)) || {}); } catch (e) {}
    try { cur = JSON.parse(localStorage.getItem(K_CUR)) || null; } catch (e) { cur = null; }
    colors = rampColors(Math.max(db.todos.length, 1));
  }
  let dbCache = '';
  const saveDB = () => {
    const s = JSON.stringify(db);
    if (s === dbCache) return;
    dbCache = s;
    localStorage.setItem(K_DB, s);
    aggCache.clear();
  };
  const saveCur = () => cur ? localStorage.setItem(K_CUR, JSON.stringify(cur))
                            : localStorage.removeItem(K_CUR);
  const savePrefs = () => localStorage.setItem(K_PREF, JSON.stringify(prefs));
  const todoIndex = id => db.todos.findIndex(t => t.id === id);
  const todoName = id => (db.todos.find(t => t.id === id) || {}).name || '已删除';
  const colorOf = id => colors[Math.max(0, todoIndex(id))] || colors[0];

  /* ---------------- 计时核算 ---------------- */
  // 一次计时里真正在跑的时间段（去掉暂停）
  function activeIntervals(s) {
    const out = [];
    let c = s.start;
    for (const p of (s.pauses || [])) {
      if (p[0] > c) out.push([c, Math.min(p[0], s.end)]);
      c = Math.max(c, p[1]);
    }
    if (c < s.end) out.push([c, s.end]);
    return out.filter(([a, b]) => b > a);
  }
  const sessionMs = s => activeIntervals(s).reduce((a, [x, y]) => a + (y - x), 0);

  // 把区间按时段裁剪 + 按天切分
  function accumulate(intervals, from, to, onDay, onTotal) {
    for (const [a0, b0] of intervals) {
      let a = Math.max(a0, from), b = Math.min(b0, to);
      while (a < b) {
        const nextDay = addDays(startOfDay(a), 1);
        const end = Math.min(b, nextDay);
        if (end > a) {
          onDay(dayKey(a), end - a);
          onTotal(end - a);
        }
        a = end;
        if (a <= b0 && a >= b) break;
      }
    }
  }

  // 区间内的统计（结果按区间缓存，数据变化时清空）
  const aggCache = new Map();
  function aggregate(from, to) {
    const ck = dayKey(from) + ':' + dayKey(to);
    const hit = aggCache.get(ck);
    if (hit) return hit;
    const perTodo = new Map(), perDay = new Map();
    let total = 0;
    for (const s of db.sessions) {
      if (s.end <= from || s.start >= to) continue;
      if (sessionMs(s) < 10000) continue;   // 不足 10 秒不计入统计
      accumulate(activeIntervals(s), from, to,
        (d, ms) => perDay.set(d, (perDay.get(d) || 0) + ms),
        ms => { total += ms; perTodo.set(s.todoId, (perTodo.get(s.todoId) || 0) + ms); });
    }
    const res = { perTodo, perDay, total };
    if (aggCache.size > 300) aggCache.clear();
    aggCache.set(ck, res);
    return res;
  }

  function rangeOf(kind) {
    const now = Date.now();
    if (kind === 'today') return [startOfDay(now), now];
    if (kind === 'week') return [startOfWeek(now), now];
    if (kind === 'month') return [startOfMonth(now), now];
    if (kind === 'custom' && ui.custom) return ui.custom;
    return [0, now];
  }

  /* ---------------- 界面状态 ---------------- */
  const ui = { screen: 'todos', range: 'today', custom: null, day: null, pickMonth: 0, calMonth: 0, calDay: null, detailTodo: null, detailDayKey: null, detailMonth: 0 };

  /* ---------------- 渲染：代办列表 ---------------- */
  function todayAll() {
    const [d0, d1] = rangeOf('today');
    const agg = aggregate(d0, d1);
    const cnt = new Map();
    for (const s of db.sessions) {
      if (s.end <= d0 || s.start >= d1) continue;
      cnt.set(s.todoId, (cnt.get(s.todoId) || 0) + 1);
    }
    return { ms: agg.perTodo, cnt };
  }
  function todoStats(id) {
    const { ms, cnt } = todayAll();
    return { today: ms.get(id) || 0, cnt: cnt.get(id) || 0 };
  }

  function renderTodos() {
    const list = $('#todoList');
    if (!db.todos.length) {
      list.innerHTML = `<li class="todo-empty">还没有代办，点右上角「新建代办」开始</li>`;
      return;
    }
    const all = todayAll();
    list.innerHTML = db.todos.map(t => {
      const st = { today: all.ms.get(t.id) || 0, cnt: all.cnt.get(t.id) || 0 };
      return `
      <li class="todo" data-id="${t.id}">
        <div class="todo-main">
          <div class="todo-name">${esc(t.name)}</div>
          <div class="todo-meta">${st.today ? `今天 <b>${fmtMH(st.today)}</b>　${st.cnt} 次` : ''}</div>
        </div>
        <button class="btn-start" data-start="${t.id}">开始</button>
      </li>`;
    }).join('');
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- 渲染：扇形图 ---------------- */
  const VB = { w: 580, h: 440, cx: 290, cy: 220, r: 148 };

  function arcPath(a0, a1) {
    const { cx, cy, r } = VB;
    const pol = deg => { const rad = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]; };
    if (a1 - a0 >= 359.99) return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
    const [x0, y0] = pol(a0), [x1, y1] = pol(a1);
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
  }

  // 名称在扇形内，时长/占比用直线从名称处拉出（带上下防重叠）
  function buildLabels(items, total) {
    const { cx, cy, r, w, h } = VB;
    if (!items.length) return '';

    const placed = [];
    let acc = -90;
    items.forEach(it => {
      const ang = (it.ms / total) * 360;
      if (ang <= 0) return;
      const mid = acc + ang / 2;
      acc += ang;
      if (ang < 16) return;
      const rad = (mid - 90) * Math.PI / 180;
      const side = Math.cos(rad) >= 0 ? 1 : -1;
      placed.push({
        it, side, ang,
        cos: Math.cos(rad), sin: Math.sin(rad),
        y: cy + Math.sin(rad) * (r + 16),
      });
    });

    // 同一侧按 y 排序后强制拉开，避免文字叠在一起
    const GAP = 24, PAD = 22;
    [1, -1].forEach(side => {
      const g = placed.filter(p => p.side === side).sort((a, b) => a.y - b.y);
      for (let i = 1; i < g.length; i++) {
        if (g[i].y - g[i - 1].y < GAP) g[i].y = g[i - 1].y + GAP;
      }
      const last = g[g.length - 1];
      if (last && last.y > h - PAD) {
        const d = last.y - (h - PAD);
        g.forEach(p => { p.y -= d; });
      }
      const first = g[0];
      if (first && first.y < PAD) {
        const d = PAD - first.y;
        g.forEach(p => { p.y += d; });
      }
    });

    return placed.map(p => {
      const { it, side, cos, sin, y } = p;
      const ix = cx + cos * r * 0.56;
      const iy = cy + sin * r * 0.56;
      const sx = cx + cos * r * 0.82;
      const sy = cy + sin * r * 0.82;
      const ex = cx + side * (r + 26);

      const val = `${fmtCN(it.ms)} ${Math.round(it.ms / total * 100)}%`;
      const est = val.length * 12.5 * 0.62;
      let anchor = side > 0 ? 'start' : 'end';
      let tx = ex + side * 6;
      // 折线终点必须落在文字外侧，不能伸进文字里
      let lineEnd = tx - side * 5;
      if (side > 0 && tx + est > w - 4) {
        anchor = 'end'; tx = w - 4; lineEnd = Math.min(lineEnd, tx - est - 5);
      } else if (side < 0 && tx - est < 4) {
        anchor = 'start'; tx = 4; lineEnd = Math.max(lineEnd, tx + est + 5);
      }
      // 折线拐点若比文字更靠内，则直接连到文字外侧
      const elbow = side > 0 ? Math.min(ex, lineEnd - 12) : Math.max(ex, lineEnd + 12);

      return `
        <text x="${ix}" y="${iy + 5}" text-anchor="middle" font-size="14" font-weight="600" fill="#0B0B0B">${esc(it.name)}</text>
        <path d="M ${sx} ${sy} L ${elbow} ${y} L ${lineEnd} ${y}" fill="none" stroke="#9A9A9A" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="${tx}" y="${y + 4}" text-anchor="${anchor}" font-size="12.5" fill="#7A7A7A">${val}</text>`;
    }).join('');
  }

  function renderPie(total, items) {
    if (!total) {
      $('#pie').innerHTML = `<div class="pie-empty">这段时间还没有记录</div>`;
      $('#totalNum').textContent = '0 分钟';
      return;
    }
    let acc = -90, slices = '';
    items.forEach(it => {
      const ang = (it.ms / total) * 360;
      if (ang <= 0) return;
      slices += `<path d="${arcPath(acc, acc + ang)}" fill="${it.color}" shape-rendering="geometricPrecision"/>`;
      acc += ang;
    });
    $('#pie').innerHTML = `<svg viewBox="0 0 ${VB.w} ${VB.h}" role="img">${slices}${buildLabels(items, total)}</svg>`;
    $('#totalNum').textContent = fmtCN(total);
  }

  function renderLegend(total, items) {
    $('#legend').innerHTML = items.filter(i => i.ms > 0).map(i => `
      <li data-todo="${i.id}">
        <span class="lg-dot" style="background:${i.color}"></span>
        <span class="lg-name">${esc(i.name)}</span>
        <span class="lg-time">${fmtMH(i.ms)}</span>
        <span class="lg-pct">${Math.round(i.ms / total * 100)}%</span>
      </li>`).join('') || `<li class="legend-empty">暂无数据</li>`;
  }

  /* ---------------- 渲染：日历 ---------------- */
  // 五档热度：1h 内 / 1-3h / 3-5h / 5-7h / 7h 以上
  function heatClass(ms) {
    const m = ms / 60000;
    if (!m) return '';
    if (m >= 420) return 'h5';
    if (m >= 300) return 'h4';
    if (m >= 180) return 'h3';
    if (m >= 60) return 'h2';
    return 'h1';
  }

  function calDayOf(d) { return dayKey(new Date(y0(), m0(), d).getTime()); }
  function y0() { return new Date().getFullYear(); }
  function m0() { return new Date().getMonth() + ui.calMonth; }

  function renderCalendar() {
    const y = y0(), m = m0();
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const todayKey = dayKey(Date.now());
    const from = first.getTime(), to = new Date(y, m + 1, 1).getTime();
    const perDay = aggregate(from, to).perDay;

    let html = '';
    for (let i = 0; i < lead; i++) html += '<div class="day blank"></div>';
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const ts = dayStart(key);
      const ms = perDay.get(key) || 0;
      const future = ts > Date.now();
      const cls = ['day', future ? 'future' : heatClass(ms),
        key === todayKey ? 'today' : '', key === ui.calDay ? 'sel' : ''].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-day="${key}" ${future ? 'data-future="1"' : ''}>
        <span class="d">${d}</span><span class="v">${!future && ms ? fmtCell(ms) : ''}</span></button>`;
    }
    $('#calGrid').innerHTML = html;
    $('.cal-title').textContent = `${y} 年 ${m + 1} 月`;

    // 右侧当天占比 + 时间段
    const k = ui.calDay || todayKey;
    const dd = new Date(dayStart(k));
    const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dFrom = dd.getTime(), dTo = addDays(dFrom, 1);
    const list = sessionsForRange(dFrom, dTo).sort((a, b) => a.s.start - b.s.start);
    const perTodo = new Map();
    let total = 0;
    for (const x of list) {
      total += x.ms;
      perTodo.set(x.s.todoId, (perTodo.get(x.s.todoId) || 0) + x.ms);
    }
    const items = assignColors(perTodo, dFrom, dTo).sort((a, b) => b.ms - a.ms);

    const hm = ts => { const x = new Date(ts); return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`; };

    $('#dayTitle').textContent = `${dd.getMonth() + 1}月${dd.getDate()}日 ${WD[dd.getDay()]}` + (total ? ` · ${fmtCN(total)}` : '');
    $('#dayLegend').innerHTML = items.length ? items.map(i => `
      <li>
        <span class="lg-dot" style="background:${i.color}"></span>
        <span class="lg-name">${esc(i.name)}</span>
        <span class="lg-time">${fmtMH(i.ms)}</span>
        <span class="lg-pct">${Math.round(i.ms / total * 100)}%</span>
      </li>`).join('') : '<li class="legend-empty">没有记录</li>';

    $('#dayTimeline').innerHTML = list.length ? list.map((s, i) => `
      <li class="tl-item" data-sid="${s.id}">
        <span class="tl-num">${i + 1}</span>
        <div class="tl-main">
          <div class="tl-name">${esc(todoName(s.todoId))}</div>
          <div class="tl-time">${hm(s.start)} – ${hm(s.end)}</div>
        </div>
        <span class="tl-dur">${fmtMH(sessionMs(s))}</span>
      </li>`).join('') : '<li class="tl-empty">这天没有记录</li>';
  }

  /* ---------------- 数据页 ---------------- */
  // 按「区间内最先开始」排序分配渐变色，数据页与日历页共用
  function assignColors(perTodo, from, to) {
    const ordered = db.todos
      .filter(t => (perTodo.get(t.id) || 0) > 0)
      .sort((a, b) => (perTodo.get(b.id) || 0) - (perTodo.get(a.id) || 0));
    const ramp = rampColors(Math.max(ordered.length, 1));
    return ordered.map((t, i) => ({
      id: t.id, name: t.name, color: ramp[i], ms: perTodo.get(t.id) || 0,
    }));
  }

  function currentData() {
    let from, to;
    if (ui.day) {
      from = dayStart(ui.day);
      to = addDays(from, 1);
    } else {
      [from, to] = rangeOf(ui.range);
    }
    const agg = aggregate(from, to);
    const items = assignColors(agg.perTodo, from, to).sort((a, b) => b.ms - a.ms);
    return { total: agg.total, items };
  }

  const RANGE_LABEL = { today: '今天', week: '本周', month: '本月', custom: '自定义时间段', all: '全部' };

  function refreshData() {
    const { total, items } = currentData();
    renderPie(total, items);
    renderLegend(total, items);

    let from, to;
    if (ui.day) {
      from = dayStart(ui.day);
      to = addDays(from, 1);
    } else {
      [from, to] = rangeOf(ui.range);
    }

    renderTimeline(from, to, !!ui.day);

    const lab = $('#dayLabel');
    if (lab) {
      if (ui.day) {
        const d = new Date(from);
        lab.textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
      } else {
        lab.textContent = { today: '今天', week: '本周', month: '本月', custom: '自定义', all: '全部' }[ui.range] || '今天';
      }
    }

    const days = Math.max(1, Math.ceil((to - from) / DAY));
    $('#stCount').textContent = sessionsForRange(from, to).filter(x => x.ms >= 10000).length;
    $('#stTotal').textContent = total ? fmtMH(total) : '—';
    $('#stAvg').textContent = total ? fmtMH(total / days) : '—';
  }

  // 时间段（今日或选中某天）
  // 区间内每条记录「切片后」的时长（跨天只算落在本区间的那部分）
  function sessionsForRange(from, to) {
    const out = [];
    for (const s of db.sessions) {
      if (s.end <= from || s.start >= to) continue;
      let ms = 0;
      accumulate(activeIntervals(s), from, to, () => {}, m => { ms += m; });
      if (ms <= 0) continue;
      out.push({ s, ms, from: Math.max(s.start, from), to: Math.min(s.end, to) });
    }
    return out;
  }

  function renderTimeline(from, to, isDay) {
    const list = sessionsForRange(from, to)
      .filter(x => x.ms >= 10000)
      .sort((a, b) => a.s.start - b.s.start);
    const hm = ts => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
    $('#timeline').innerHTML = list.length ? list.map((x, i) => `
      <li class="tl-item" data-sid="${x.s.id}">
        <span class="tl-num">${i + 1}</span>
        <div class="tl-main">
          <div class="tl-name">${esc(todoName(x.s.todoId))}</div>
          <div class="tl-time">${hm(x.from)} – ${hm(x.to)}</div>
        </div>
        <span class="tl-dur">${fmtMH(x.ms)}</span>
      </li>`).join('') : `<li class="tl-empty">这天没有记录</li>`;

    const show = isDay || ui.range === 'today';
    $('#todayPanel').style.display = show ? '' : 'none';
    const isToday = dayKey(from) === dayKey(Date.now());
    $('#todayPanel .panel-title').textContent = (isDay && !isToday) ? '当日时间段' : '今日时间段';
  }


  // 取区间内用时最多的代办；统计里被过滤掉的短记录也能进历史
  function topTodoIn(from, to) {
    const agg = aggregate(from, to);
    const arr = [...agg.perTodo.entries()].sort((a, b) => b[1] - a[1]);
    if (arr.length) return arr[0][0];
    const s = db.sessions.find(x => x.end > from && x.start < to);
    return s ? s.todoId : null;
  }

  /* ---------------- 历史页 ---------------- */
  function renderDetail() {
    const id = ui.detailTodo;
    if (!id) return;
    const t = db.todos.find(x => x.id === id);
    if (!t) { go('todos'); return; }
    $('#detailName').textContent = t.name;

    const key = ui.detailDayKey || dayKey(Date.now());
    const from = dayStart(key), to = addDays(from, 1);
    const list = sessionsForRange(from, to)
      .filter(x => x.s.todoId === id)
      .sort((a, b) => b.s.start - a.s.start);
    const total = list.reduce((a, x) => a + x.ms, 0);

    const d = new Date(from);
    $('#detailSub').textContent = `${d.getMonth() + 1}月${d.getDate()}日 · ` +
      (list.length ? `${fmtCN(total)} · ${list.length} 次` : '没有记录');

    const hm = ts => { const x = new Date(ts); return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`; };
    const MAXR = 60;
    const shown = list.slice(0, MAXR);
    const moreNote = list.length > MAXR
      ? `<div class="rec-empty">当天记录较多，先显示最近 ${MAXR} 条</div>` : '';
    $('#records').innerHTML = list.length ? shown.map((x, i) => `
      <div class="rec" data-sid="${x.s.id}">
        <span class="r-num">${i + 1}</span>
        <div>
          <div class="r-time">${hm(x.from)} – ${hm(x.to)}</div>
        </div>
        <div class="r-dur">${fmtMH(x.ms)}</div>
      </div>`).join('') + moreNote : `<div class="rec-empty">这天没有记录</div>`;

    renderDayStrip();
  }

  // 月历
  function renderDayStrip() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + ui.detailMonth;
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const key = ui.detailDayKey || dayKey(Date.now());
    const today = dayKey(Date.now());
    const has = new Set(db.sessions.filter(s => s.todoId === ui.detailTodo).map(s => dayKey(s.start)));

    let html = '';
    for (let i = 0; i < lead; i++) html += '<div class="hday blank"></div>';
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const ts = dayStart(k);
      const cls = ['hday', has.has(k) ? 'has' : '', k === today ? 'today' : '',
        k === key ? 'sel' : '', ts > Date.now() ? 'future' : ''].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-dkey="${k}"><span class="hd">${d}</span></button>`;
    }
    $('#histGrid').innerHTML = html;
    $('#histTitle').textContent = `${y} 年 ${m + 1} 月`;
  }

  // 单条记录弹窗
  let recId = null;
  function openRecSheet(sid) {
    const s = db.sessions.find(x => x.id === sid);
    if (!s) return;
    recId = sid;
    const hm = ts => { const x = new Date(ts); return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`; };
    $('#recTitle').textContent = todoName(s.todoId);
    $('#recSub').textContent = `${hm(s.start)} – ${hm(s.end)}  ·  ${fmtHMS(sessionMs(s))}`;
    $('#recSheet').classList.add('show');
  }
  function closeRecSheet() { $('#recSheet').classList.remove('show'); }

  /* ---------------- 我的 ---------------- */
  function renderMe() {
    const weekFrom = startOfWeek(Date.now());
    const perDay = aggregate(0, Date.now()).perDay;
    const allMs = [...perDay.values()].reduce((a, b) => a + b, 0);
    const totalCount = db.sessions.length;
    const sub = document.querySelector('.p-sub');
    if (sub) sub.textContent = `已专注 ${fmtCN(allMs)} · ${totalCount} 次计时`;
  }

  /* ---------------- 路由 ---------------- */
  function go(screen) {
    ui.screen = screen;
    document.body.dataset.screen = screen;
    if (screen === 'detail' || screen === 'timer') {
      const el = document.querySelector(`.screen[data-screen="${screen}"]`);
      if (el) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    }
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.go === screen));
    refreshKeepScreen();
    if (screen === 'data') refreshData();
    if (screen === 'calendar') renderCalendar();
    if (screen === 'me') renderMe();
    if (screen === 'detail') renderDetail();
  }

  /* ---------------- 计时 ---------------- */
  let tickTimer = null, pauseTimer = null;

  function elapsedMs() {
    if (!cur) return 0;
    const now = Date.now();
    const pauses = (cur.pauses || []).reduce((a, p) => a + (p[1] - p[0]), 0);
    const live = cur.pausedAt ? now - cur.pausedAt : 0;
    return now - cur.start - pauses - live;
  }

  function openTimer() {
    if (!cur) { go('todos'); return; }
    $('#ttTodo').textContent = todoName(cur.todoId);
    go('timer');
    renderLaps();
    tick();
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 1000);
  }

  let clockEl = null;
  function tick() {
    if (!cur) return;
    clockEl = clockEl || $('#clock');
    clockEl.textContent = fmtClock(elapsedMs());
    const live = $('#lapLive');
    if (live) {
      const laps = cur.laps || [];
      const base = laps.length ? laps[laps.length - 1] : 0;
      live.textContent = fmtMS(elapsedMs() - base);
    }
  }

  function renderLaps() {
    const panel = $('#lapPanel');
    if (!panel) return;
    const laps = (cur && cur.laps) || [];
    panel.hidden = laps.length === 0;
    if (!laps.length) return;
    const rows = laps.map((v, i) => ({
      no: i + 1,
      iv: v - (i ? laps[i - 1] : 0),
      cu: v,
    })).reverse();
    $('#lapList').innerHTML = rows.map(r => `
      <div class="lap">
        <span class="no">${r.no}</span>
        <span class="iv">${fmtMS(r.iv)}</span>
        <span class="cu">${fmtClock(r.cu)}</span>
      </div>`).join('');
    $('#lapLive').textContent = fmtMS(elapsedMs() - laps[laps.length - 1]);
  }

  function syncNative() {
    const B = window.AndroidBridge;
    if (!B || !B.syncTimer) return;
    try {
      if (!cur) { B.syncTimer(''); return; }
      const pausedTotal = (cur.pauses || []).reduce((a, p) => a + (p[1] - p[0]), 0);
      B.syncTimer([cur.start, pausedTotal, cur.pausedAt || 0, todoName(cur.todoId), prefs.theme === 'dark' ? 'D' : 'L'].join(';'));
    } catch (e) {}
  }

  function abortTimer() {
    cur = null;
    saveCur();
    syncNative();
    clearInterval(tickTimer);
    clearInterval(pauseTimer);
    $('#pauseOverlay').classList.remove('show');
    const lp = $('#lapPanel');
    if (lp) lp.hidden = true;
    refreshKeepScreen();
  }

  function startTimer(todoId) {
    if (cur) {                  // 已有进行中的计时，先结束它
      openDialog({
        title: '还有计时在进行',
        msg: `「${todoName(cur.todoId)}」还在计时，要先结束它再开始新的吗？`,
        okText: '结束并开始',
        onOk: () => { closeDialog(); finishTimer(true); startTimer(todoId); },
      });
      return;
    }
    cur = { todoId, start: Date.now(), pauses: [], pausedAt: null, laps: [] };
    saveCur();
    syncNative();
    openTimer();
  }

  const fmtMS = ms => {
    const t = Math.max(0, Math.floor(ms / 1000));
    return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
  };

  function pausedTotal() {
    const done = (cur.pauses || []).reduce((a, p) => a + (p[1] - p[0]), 0);
    return done + (cur.pausedAt ? Date.now() - cur.pausedAt : 0);
  }

  function pauseTimerFn() {
    if (!cur || cur.pausedAt) return;
    cur.pausedAt = Date.now();
    saveCur(); syncNative();
    $('#pauseOverlay').classList.add('show');
    refreshKeepScreen();
    const paint = () => { $('#pauseTime').textContent = fmtMS(pausedTotal()); };
    paint();
    clearInterval(pauseTimer);
    pauseTimer = setInterval(paint, 500);
  }

  function resumeTimerFn() {
    if (!cur || !cur.pausedAt) return;
    cur.pauses.push([cur.pausedAt, Date.now()]);
    cur.pausedAt = null;
    saveCur(); syncNative();
    clearInterval(pauseTimer);
    $('#pauseOverlay').classList.remove('show');
    refreshKeepScreen();
    tick();
  }

  function finishTimer(silent) {
    if (!cur) return;
    if (cur.pausedAt) { cur.pauses.push([cur.pausedAt, Date.now()]); cur.pausedAt = null; }
    const end = Date.now();
    const ms = activeIntervals({ start: cur.start, end, pauses: cur.pauses }).reduce((a, [x, y]) => a + (y - x), 0);
    const tooShort = ms < 10000;
    if (!tooShort) {
      db.sessions.push({ id: uid(), todoId: cur.todoId, start: cur.start, end, pauses: cur.pauses || [], laps: cur.laps || [] });
      saveDB();
    }
    cur = null;
    saveCur(); syncNative();
    clearInterval(tickTimer);
    clearInterval(pauseTimer);
    $('#pauseOverlay').classList.remove('show');
    if (!silent) {
      renderTodos(); go('todos');
      if (tooShort) setTimeout(() => toast('本次不足 10 秒，不计入数据'), 80);
    }
  }

  /* ---------------- 弹窗 ---------------- */
  let dlgOk = null, dlgCancel = null, dlgDanger = null;
  function buildWheel(id, max, val) {
    const el = document.getElementById(id);
    el.innerHTML = Array.from({ length: max + 1 }, (_, i) => `<div class="witem">${pad2(i)}</div>`).join('');
    el.scrollTop = val * 40;
  }
  function readWheels() {
    const g = id => Math.round(document.getElementById(id).scrollTop / 40);
    return [g('wSh'), g('wSm'), g('wEh'), g('wEm')];
  }
  function setWheel(id, v) {
    const el = document.getElementById(id);
    if (el) el.scrollTop = v * 40;
  }
  let syncing = false;
  function durationMinutes() {
    const [h1, m1, h2, m2] = readWheels();
    let d = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (d < 0) d += 1440;
    return d;
  }
  function paintDuration() {
    const d = durationMinutes();
    const el = $('#durVal');
    if (el) el.textContent = d >= 60 ? `${Math.floor(d / 60)} 小时 ${pad2(d % 60)} 分` : `${d} 分`;
  }
  function bindWheels() {
    ['wSh', 'wSm', 'wEh', 'wEm'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.dataset.bound) {
        el.dataset.bound = '1';
        el.addEventListener('scroll', () => { if (!syncing) paintDuration(); }, { passive: true });
      }
    });
    paintDuration();
  }
  function openDayPicker() {
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
      const k = `${y}-${pad2(m + 1)}-${pad2(d)}`;
      const ts = dayStart(k);
      const cls = ['hday', k === today ? 'today' : '', k === sel ? 'sel' : '',
        ts > Date.now() ? 'future' : ''].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-dkey="${k}"><span class="hd">${d}</span></button>`;
    }
    $('#pkGrid').innerHTML = html;
    $('#pkTitle').textContent = `${y} 年 ${m + 1} 月`;
  }

  function openPalSheet() {
    $('#palRow').innerHTML = Object.entries(SCHEMES).map(([k, v]) => {
      const g = `linear-gradient(135deg, hsl(${v.from[0]} ${v.from[1]}% ${v.from[2]}%), hsl(${v.to[0]} ${v.to[1]}% ${v.to[2]}%))`;
      const on = (prefs.scheme || 'blue') === k ? ' on' : '';
      return `<button class="pal-chip${on}" data-scheme="${k}" style="background:${g}"></button>`;
    }).join('');
    $('#palSheet').classList.add('show');
  }

  function editDuration() {
    const d = durationMinutes();
    const el = $('#durVal');
    if (!el || el.tagName === 'INPUT') return;
    el.outerHTML = `<input class="dur-input" id="durVal" value="${d}" inputmode="numeric">`;
    const inp = $('#durVal');
    inp.focus(); inp.select();
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') inp.blur(); });
    inp.addEventListener('blur', () => {
      const v = parseInt(inp.value, 10);
      const box = document.createElement('span');
      box.className = 'dur-val';
      box.id = 'durVal';
      inp.replaceWith(box);
      if (!isNaN(v) && v > 0) applyDuration(v - durationMinutes());
      paintDuration();
    });
  }

  function applyDuration(delta) {
    let d = durationMinutes() + delta;
    if (d < 1) d = 1;
    const [h1, m1] = readWheels();
    const end = (h1 * 60 + m1 + d) % 1440;
    syncing = true;
    setWheel('wEh', Math.floor(end / 60));
    setWheel('wEm', end % 60);
    setTimeout(() => { syncing = false; paintDuration(); }, 30);
  }

  function openDialog({ title, input, value, msg, okText = '确定', onOk, cancelText = '取消', onCancel, dangerText, onDanger, timeStart, timeEnd }) {
    const isTime = timeStart !== undefined || timeEnd !== undefined;
    $('#dlgTitle').textContent = title;
    $('#dlgInput').style.display = (input && !isTime) ? '' : 'none';
    $('#dlgInput').value = value || '';
    $('#dlgTimeRow').hidden = !isTime;
    $('#durRow').hidden = !isTime;
    if (isTime) {
      const [sh, sm] = (timeStart || '00:00').split(':').map(Number);
      const [eh, em] = (timeEnd || '00:00').split(':').map(Number);
      buildWheel('wSh', 23, sh); buildWheel('wSm', 59, sm);
      buildWheel('wEh', 23, eh); buildWheel('wEm', 59, em);
      $('#durRow').hidden = false;
      setTimeout(bindWheels, 30);
    }
    $('#dlgMsg').style.display = msg ? '' : 'none';
    $('#dlgMsg').textContent = msg || '';
    $('#dlgOk').textContent = okText;
    $('#dlgCancel').textContent = cancelText;
    dlgOk = onOk;
    dlgCancel = onCancel || null;
    dlgDanger = onDanger || null;
    $('#dlgDanger').hidden = !dangerText;
    $('#dlgDanger').textContent = dangerText || '';
    $('#dialog').classList.add('show');
    if (input) setTimeout(() => $('#dlgInput').focus(), 60);
  }
  function closeDialog() {
    $('#dialog').classList.remove('show');
    dlgOk = null; dlgCancel = null; dlgDanger = null;
    $('#dlgDanger').hidden = true;
  }

  let toastTimer = null;
  function toast(msg) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      $('.app').appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  let menuTodoId = null;
  function openMenu(todoId) {
    const t = db.todos.find(x => x.id === todoId);
    if (!t) return;
    menuTodoId = todoId;
    const list = db.sessions.filter(s => s.todoId === todoId);
    const total = list.reduce((a, s) => a + sessionMs(s), 0);
    $('#menuName').textContent = t.name;
    $('#menuCount').textContent = list.length;
    $('#menuTotal').textContent = fmtMH(total);
    $('#actions').classList.add('show');
  }
  function closeMenu() {
    $('#actions').classList.remove('show');
    menuTodoId = null;
  }

  function openRangeSheet() {
    const [from, to] = ui.custom || rangeOf('today');
    $('#rgFrom').value = dayKey(ui.range === 'custom' && ui.custom ? ui.custom[0] : Date.now());
    $('#rgTo').value = dayKey(ui.range === 'custom' && ui.custom ? ui.custom[1] : Date.now());
    $('#rgMsg').textContent = '';
    $('#rangeSheet').classList.add('show');
  }
  function closeRangeSheet() { $('#rangeSheet').classList.remove('show'); }

  function applyRange() {
    const a = $('#rgFrom').value, b = $('#rgTo').value;
    if (!a || !b) { $('#rgMsg').textContent = '两个日期都要选'; return; }
    let from = dayStart(a);
    let to = addDays(dayStart(b), 1);
    if (to <= from) { $('#rgMsg').textContent = '结束日期要晚于开始日期'; return; }
    ui.custom = [from, to];
    ui.range = 'custom';
    $$('.segmented[data-seg="range"] button').forEach((b2, i) => b2.classList.toggle('on', i === 3));
    closeRangeSheet();
    refreshData();
  }

  function editTodo(id) {
    const t = db.todos.find(x => x.id === id);
    openDialog({
      title: '编辑代办', input: true, value: t.name,
      msg: '改名字不影响已有的计时记录',
      dangerText: '删除这个代办',
      onDanger: () => { closeDialog(); delTodo(id); },
      onOk: () => {
        const v = $('#dlgInput').value.trim();
        if (!v) return;
        t.name = v.slice(0, 20);
        saveDB(); renderTodos(); closeDialog();
        if (cur && cur.todoId === id) syncNative();
        if (ui.detailTodo === id) renderDetail();
      },
    });
  }

  function renameTodo(id) {
    const t = db.todos.find(x => x.id === id);
    openDialog({
      title: '重命名代办', input: true, value: t.name,
      onOk: () => {
        const v = $('#dlgInput').value.trim();
        if (!v) return;
        t.name = v.slice(0, 20);      // 只改名字，计时记录仍挂在同一个 id 上
        saveDB(); renderTodos(); closeDialog();
        if (ui.detailTodo === id) renderDetail();
      },
    });
  }

  function delTodo(id) {
    const n = db.sessions.filter(s => s.todoId === id).length;
    openDialog({
      title: '删除代办', msg: `「${todoName(id)}」的 ${n} 条计时记录会一起删除，不可恢复。`,
      okText: '删除',
      onOk: () => {
        db.todos = db.todos.filter(t => t.id !== id);
        db.sessions = db.sessions.filter(s => s.todoId !== id);
        if (cur && cur.todoId === id) abortTimer();
        saveDB(); renderTodos(); closeDialog();
        if (ui.screen === 'data') refreshData();
        if (ui.detailTodo === id) go('todos');
      },
    });
  }

  function addTodo() {
    openDialog({
      title: '新建代办', input: true, value: '',
      onOk: () => {
        const v = $('#dlgInput').value.trim();
        if (!v) return;
        db.todos.push({ id: uid(), name: v.slice(0, 20), createdAt: Date.now() });
        colors = rampColors(Math.max(db.todos.length, 1));
        saveDB(); renderTodos(); closeDialog();
        if (ui.screen === 'data') refreshData();
      },
    });
  }

  /* ---------------- 备份 ---------------- */
  function exportBackup() {
    const data = { app: '刻时', version: 1, exportedAt: new Date().toISOString(), todos: db.todos, sessions: db.sessions };
    const json = JSON.stringify(data, null, 2);
    const d = new Date();
    const name = `刻时-备份-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`;
    if (window.AndroidBridge && window.AndroidBridge.saveBackup) {
      const r = window.AndroidBridge.saveBackup(json, name);
      toast(r === 'ok' ? `已保存到 手机存储/Download/${name}` : '保存失败：' + r);
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function importBackup(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(fr.result);
        if (!Array.isArray(data.todos) || !Array.isArray(data.sessions)) throw 0;
        openDialog({
          title: '导入备份',
          msg: `会覆盖当前数据：导入 ${data.todos.length} 个代办、${data.sessions.length} 条记录。`,
          okText: '导入',
          onOk: () => {
            db = { todos: data.todos, sessions: data.sessions };
            colors = rampColors(Math.max(db.todos.length, 1));
            saveDB(); renderTodos(); refreshData(); renderMe(); closeDialog();
            toast('导入完成');
          },
        });
      } catch (e) { toast('文件格式不对，导入失败'); }
    };
    fr.readAsText(file);
  }

  /* ---------------- 设置：主题 / 背景 ---------------- */
  function refreshKeepScreen() {
    const on = !!prefs.keep && ui.screen === 'timer' && !!cur && !cur.pausedAt;
    if (window.AndroidBridge && window.AndroidBridge.setKeepScreen) {
      try { window.AndroidBridge.setKeepScreen(on); } catch (e) {}
    }
  }

  function applyPrefs() {
    document.body.dataset.theme = prefs.theme;
    const kb = $('#keepBtn');
    if (kb) kb.classList.toggle('off', !prefs.keep);
    refreshKeepScreen();
    if (window.AndroidBridge && window.AndroidBridge.setBars) {
      try { window.AndroidBridge.setBars(prefs.theme === 'dark'); } catch (e) {}
    }
    if (prefs.bg) {
      document.body.dataset.bg = '1';
      document.body.style.setProperty('--bg-img', `url("${prefs.bg}")`);
      $('#bgClear').hidden = false;
    } else {
      document.body.removeAttribute('data-bg');
      document.body.style.removeProperty('--bg-img');
      $('#bgClear').hidden = true;
    }
  }
  function setBg(src) {
    prefs.bg = src || '';
    savePrefs(); applyPrefs();
  }
  function toggleTheme() {
    prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark';
    savePrefs(); applyPrefs();
  }
  function shrinkImage(file) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', async e => {
    if (skipClick) { skipClick = false; return; }
    const tab = e.target.closest('.tab');
    if (tab) { go(tab.dataset.go); return; }

    const startBtn = e.target.closest('[data-start]');
    if (startBtn) { e.stopPropagation(); startTimer(startBtn.dataset.start); return; }

    // 只有点卡片左侧（文字那一半）才弹菜单
    const card = e.target.closest('.todo');
    if (card && !e.target.closest('.btn-start')) {
      const r = card.getBoundingClientRect();
      if ((e.clientX - r.left) < r.width * 0.58) { openMenu(card.dataset.id); return; }
      return;
    }

    if (e.target.closest('#addBtn')) { addTodo(); return; }

    const segBtn = e.target.closest('.segmented button');
    if (segBtn) {
      const box = segBtn.parentElement;
      const idx = [...box.children].indexOf(segBtn);
      $$('button', box).forEach(b => b.classList.remove('on'));
      segBtn.classList.add('on');
      if (box.dataset.seg === 'range') {
        if (idx === 3) { openRangeSheet(); return; }
        ui.day = null;
        ui.range = ['today', 'week', 'month'][idx];
      } else if (box.dataset.seg === 'detail') {
        ui.detailRange = ['week', 'month', 'all'][idx];
      }
      if (ui.screen === 'data') refreshData();
      else if (ui.screen === 'detail') renderDetail();
      return;
    }

    const dayBtn = e.target.closest('.day[data-day]');
    if (dayBtn && !dayBtn.dataset.future) {
      ui.calDay = dayBtn.dataset.day;
      renderCalendar();
      return;
    }

    if (e.target.closest('.chev-prev')) { ui.calMonth--; renderCalendar(); return; }
    if (e.target.closest('.chev-next')) { ui.calMonth++; renderCalendar(); return; }

    const recRow = e.target.closest('.rec[data-sid]') || e.target.closest('.tl-item[data-sid]');
    if (recRow) { openRecSheet(recRow.dataset.sid); return; }

    const chip = e.target.closest('#histGrid .hday[data-dkey]');
    if (chip) { ui.detailDayKey = chip.dataset.dkey; renderDetail(); return; }

    if (e.target.closest('#recEdit')) {
      const s = db.sessions.find(x => x.id === recId);
      if (s) {
        const hm = ts => { const x = new Date(ts); return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`; };
        closeRecSheet();
        openDialog({
          title: '修改时间', timeStart: hm(s.start), timeEnd: hm(s.end),
          onOk: () => {
            const [h1, m1, h2, m2] = readWheels();
            const d0 = new Date(s.start); d0.setHours(0, 0, 0, 0);
            const base = d0.getTime();
            const st = base + (h1 * 60 + m1) * 60000;
            const en = base + (h2 * 60 + m2) * 60000;
            if (en <= st) { $('#dlgMsg').textContent = '结束时间要晚于开始时间'; return; }
            s.start = st; s.end = en;
            s.pauses = (s.pauses || []).filter(p => p[0] >= st && p[1] <= en);
            saveDB(); closeDialog(); renderDetail(); refreshData();
          },
        });
      }
      return;
    }
    if (e.target.closest('#recDelete')) {
      closeRecSheet();
      openDialog({
        title: '删除这条记录', msg: '删除后无法恢复。', okText: '删除',
        onOk: () => {
          db.sessions = db.sessions.filter(x => x.id !== recId);
          saveDB(); closeDialog(); renderDetail(); refreshData();
        },
      });
      return;
    }
    if (e.target.id === 'recSheet') { closeRecSheet(); return; }


    if (e.target.closest('#backToData')) { ui.detailDay = null; go('data'); return; }

    if (e.target.closest('#themeBtn') || e.target.closest('#themeBtn2')) { toggleTheme(); return; }
    if (e.target.closest('#dayPrev') || e.target.closest('#dayNext')) {
      const base = ui.day || dayKey(Date.now());
      const n = e.target.closest('#dayPrev') ? -1 : 1;
      const k = dayKey(addDays(dayStart(base), n));
      if (k > dayKey(Date.now())) { toast('还没到那天'); return; }
      ui.day = k;
      $$('.segmented[data-seg="range"] button').forEach(b => b.classList.remove('on'));
      refreshData();
      return;
    }
    if (e.target.closest('#dataCalBtn') || e.target.closest('#dayLabel')) { openDayPicker(); return; }
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
    if (e.target.closest('#palBtn')) { openPalSheet(); return; }
    if (e.target.closest('.pal-chip')) {
      prefs.scheme = e.target.closest('.pal-chip').dataset.scheme;
      savePrefs(); colors = rampColors(Math.max(db.todos.length, 1));
      $('#palSheet').classList.remove('show'); refreshData();
      return;
    }
    if (e.target.id === 'palSheet') { $('#palSheet').classList.remove('show'); return; }
    if (e.target.closest('#durVal')) { editDuration(); return; }
    if (e.target.closest('#eyeBtn')) {
      $('#statsRow').classList.toggle('hide');
      $('#eyeBtn').classList.toggle('off');
      return;
    }
    if (e.target.closest('#bgBtn')) { $('#bgInput').click(); return; }
    if (e.target.closest('#bgClear')) { setBg(''); return; }

    if (e.target.closest('#keepBtn')) {
      prefs.keep = !prefs.keep;
      savePrefs();
      $('#keepBtn').classList.toggle('off', !prefs.keep);
      if (window.AndroidBridge && window.AndroidBridge.setKeepScreen) {
        try { window.AndroidBridge.setKeepScreen(!!prefs.keep); } catch (err) {}
      }
      toast(prefs.keep ? '屏幕将保持常亮' : '已关闭屏幕常亮');
      return;
    }
    if (e.target.closest('#lapBtn')) {
      if (!cur) return;
      cur.laps = cur.laps || [];
      if (cur.laps.length >= 99) return;
      cur.laps.push(elapsedMs());
      saveCur();
      renderLaps(); tick();
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) {} }
      return;
    }
    if (e.target.closest('#pauseBtn')) { pauseTimerFn(); return; }
    if (e.target.closest('#resumeBtn')) { resumeTimerFn(); return; }
    if (e.target.closest('#endBtn')) {
      openDialog({
        title: '结束本次计时？',
        msg: '时长会记到「' + todoName(cur ? cur.todoId : '') + '」，结束后回到代办页。',
        okText: '结束',
        onOk: () => { closeDialog(); finishTimer(false); },
      });
      return;
    }

    if (e.target.closest('#exportBtn')) { exportBackup(); return; }
    if (e.target.closest('#importBtn')) { $('#importInput').click(); return; }
    if (e.target.closest('#clearBtn')) {
      openDialog({
        title: '清空所有数据', msg: '所有代办和计时记录都会删除，不可恢复。建议先导出备份。',
        okText: '清空',
        onOk: () => {
          abortTimer();
          localStorage.removeItem(K_CUR);
          db = { todos: [], sessions: [] };
          saveDB();
          aggCache.clear();
          renderTodos(); closeDialog(); go('todos');
        },
      });
      return;
    }

    if (e.target.closest('#actRename')) { const id = menuTodoId; closeMenu(); if (id) renameTodo(id); return; }
    if (e.target.closest('#actEdit')) { const id = menuTodoId; closeMenu(); if (id) editTodo(id); return; }
    if (e.target.closest('#actHistory')) {
      const id = menuTodoId; closeMenu();
      if (id) {
        ui.detailTodo = id; ui.detailDayKey = dayKey(Date.now()); ui.detailMonth = 0;
        go('detail');
      }
      return;
    }
    if (e.target.closest('#dlgDanger')) { const f = dlgDanger; closeDialog(); if (f) f(); return; }
    if (e.target.closest('#rgCancel')) { closeRangeSheet(); return; }
    if (e.target.closest('#rgAll')) {
      ui.custom = null; ui.range = 'all';
      $$('.segmented[data-seg="range"] button').forEach((b, i) => b.classList.toggle('on', i === 3));
      closeRangeSheet(); refreshData(); return;
    }
    if (e.target.closest('#durPlus')) { applyDuration(1); return; }
    if (e.target.closest('#durMinus')) { applyDuration(-1); return; }
    if (e.target.closest('#rgOk')) { applyRange(); return; }
    if (e.target.id === 'rangeSheet') { closeRangeSheet(); return; }
    if (e.target.closest('#actCancel')) { closeMenu(); return; }
    if (e.target.id === 'actions') { closeMenu(); return; }

    if (e.target.closest('#dlgCancel')) { const f = dlgCancel; closeDialog(); if (f) f(); return; }
    if (e.target.closest('#dlgOk')) { if (dlgOk) dlgOk(); else closeDialog(); return; }
    if (e.target.id === 'dialog') { closeDialog(); return; }
  });

  document.addEventListener('change', async e => {
    if (e.target.id === 'bgInput') {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const d = await shrinkImage(f);
      if (d) setBg(d);
      return;
    }
    if (e.target.id === 'importInput') {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importBackup(f);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && $('#dialog').classList.contains('show') && dlgOk) dlgOk();
    if (e.key === 'Escape') closeDialog();
  });

  window.addEventListener('beforeunload', () => { if (cur) saveCur(); });

  /* ---------------- 长按拖动排序 ---------------- */
  let dragEl = null, pressTimer = null, dragOrigin = null, dragOffset = { x: 0, y: 0 }, skipClick = false;

  const blockScroll = e => { if (dragEl) e.preventDefault(); };

  function beginDrag(card, e) {
    dragEl = card;
    skipClick = true;
    const r = card.getBoundingClientRect();
    dragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
    card.classList.add('dragging');
    card.style.width = r.width + 'px';
    card.style.height = r.height + 'px';
    card.style.left = r.left + 'px';
    card.style.top = r.top + 'px';
    document.addEventListener('touchmove', blockScroll, { passive: false });
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) {} }
  }

  function onDragMove(e) {
    if (!dragEl) return;
    dragEl.style.left = (e.clientX - dragOffset.x) + 'px';
    dragEl.style.top = (e.clientY - dragOffset.y) + 'px';

    const items = [...$('#todoList').children].filter(li => li !== dragEl && li.dataset.id);
    for (const li of items) {
      const r = li.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const before = (e.clientY - r.top) < r.height / 2;
        $('#todoList').insertBefore(dragEl, before ? li : li.nextSibling);
        break;
      }
    }
  }

  function endDrag() {
    document.removeEventListener('touchmove', blockScroll);
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl.removeAttribute('style');
    dragEl = null;
    document.removeEventListener('pointermove', onDragMove);
    const ids = [...$('#todoList').children].map(li => li.dataset.id).filter(Boolean);
    const byId = new Map(db.todos.map(t => [t.id, t]));
    db.todos = ids.map(id => byId.get(id)).filter(Boolean);
    saveDB();
    colors = rampColors(Math.max(db.todos.length, 1));
    renderTodos();
    setTimeout(() => { skipClick = false; }, 80);
  }

  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.sheet') || e.target.closest('.tabbar')) return;
    const card = e.target.closest('.todo');
    if (!card || e.target.closest('.btn-start')) return;
    dragOrigin = { x: e.clientX, y: e.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => beginDrag(card, e), 380);
    const watch = ev => {
      if (dragEl) return;
      if (Math.abs(ev.clientX - dragOrigin.x) > 8 || Math.abs(ev.clientY - dragOrigin.y) > 8) {
        clearTimeout(pressTimer);
        document.removeEventListener('pointermove', watch);
      }
    };
    document.addEventListener('pointermove', watch);
    document.addEventListener('pointerup', () => {
      clearTimeout(pressTimer);
      document.removeEventListener('pointermove', watch);
    }, { once: true });
  });

  // 历史页月历：上下滑切月
  let calY = null;
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('#histCal')) calY = e.clientY;
  });
  document.addEventListener('pointerup', e => {
    if (calY === null) return;
    const dy = e.clientY - calY;
    calY = null;
    if (Math.abs(dy) > 45) {
      ui.detailMonth += dy < 0 ? 1 : -1;
      ui.detailDayKey = null;
      renderDetail();
    }
  });
  document.addEventListener('pointermove', e => { if (dragEl) onDragMove(e); });
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  /* ---------------- 启动 ---------------- */
  // 安卓返回键
  window.__back = () => {
    if (document.querySelector('#dialog').classList.contains('show')) { closeDialog(); return 1; }
    if (ui.screen === 'timer') return 1;
    if (ui.screen === 'detail') { go('data'); return 1; }
    if (ui.screen !== 'todos') { go('todos'); return 1; }
    return 0;
  };

  load();
  applyPrefs();
  renderTodos();
  renderMe();

  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  go(q.get('screen') || 'todos');


  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && cur) syncNative();
  });
  if (cur) {
    syncNative();      // 重开 App 时立刻恢复通知，不用等操作
    openTimer();
    if (cur.pausedAt) {
      $('#pauseTime').textContent = fmtMS(pausedTotal());
      $('#pauseOverlay').classList.add('show');
      pauseTimer = setInterval(() => {
        if (cur && cur.pausedAt) $('#pauseTime').textContent = fmtMS(pausedTotal());
      }, 500);
    }
  }
})();
