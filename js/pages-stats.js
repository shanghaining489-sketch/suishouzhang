/* ============================================================
   随手账 · 统计页 pages-stats.js
   月度汇总 + 支出占比饼图 + 近6/12个月收支趋势
   配色遵循国内资金流向习惯：收入红、支出绿
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.PIE_COLORS = ['#4C6EF5', '#F0413C', '#12B76A', '#F79009', '#8B5CF6', '#0EA5E9', '#EC4899', '#84CC16', '#F59E0B', '#64748B'];

SSZ.renderers.stats = function (page) {
  let ym = SSZ._statsMonth || SSZ.curMonth();
  SSZ._statsMonth = ym;
  let range = SSZ._statsRange || 6; // 6 或 12 个月
  SSZ.onMonthPicked = function (m) { SSZ._statsMonth = m; SSZ.renderCurrent(); };

  const st = SSZ.monthStats(ym);
  const saveRate = st.income > 0 ? Math.round(st.balance / st.income * 100) : null;

  let html = SSZ.pageHeader('统计', { right: SSZ.monthSwitch(ym) });

  /* 月度汇总四格 */
  html +=
    '<div class="block"><div class="stat-summary">' +
    '<div class="stat-cell"><div class="lb">总收入</div><div class="vl income">' + SSZ.fmt(st.income) + '</div></div>' +
    '<div class="stat-cell"><div class="lb">总支出</div><div class="vl expense">' + SSZ.fmt(st.expense) + '</div></div>' +
    '<div class="stat-cell"><div class="lb">结余</div><div class="vl">' + SSZ.fmt(st.balance) + '</div></div>' +
    '<div class="stat-cell"><div class="lb">储蓄率</div><div class="vl">' + (saveRate === null ? '—' : saveRate + '%') + '</div></div>' +
    '</div></div>';

  /* ===== v1.3 本月洞察（借鉴 BeeCount / Firefly III 报表） ===== */
  const ins = SSZ.monthInsight(ym);
  const momTxt = ins.mom === null ? '—' : (ins.mom > 0 ? '+' + ins.mom + '%' : ins.mom + '%');
  const momCls = ins.mom === null ? '' : (ins.mom > 0 ? 'is-income' : 'is-expense');
  html +=
    '<div class="block"><div class="block-title">本月洞察</div>' +
    '<div class="card card-pad">' +
      '<div class="ins-grid">' +
        '<div class="ins-cell"><div class="lb">较上月支出</div><div class="vl ' + momCls + '">' + momTxt + '</div>' +
          '<div class="sub">上月 ' + SSZ.fmt(ins.prevExpense) + '</div></div>' +
        '<div class="ins-cell"><div class="lb">日均支出</div><div class="vl">' + SSZ.fmt(ins.dailyAvg) + '</div>' +
          '<div class="sub">按 ' + ins.days + ' 天计</div></div>' +
        '<div class="ins-cell"><div class="lb">最大单笔</div><div class="vl">' + (ins.maxTx ? SSZ.fmt(ins.maxTx.amount) : '—') + '</div>' +
          '<div class="sub">' + (ins.maxTx ? SSZ.esc(SSZ.catName(ins.maxTx.categoryId)) : '无支出') + '</div></div>' +
        '<div class="ins-cell"><div class="lb">本月笔数</div><div class="vl">' + ins.count + '</div>' +
          '<div class="sub">储蓄率 ' + (ins.saveRate === null ? '—' : ins.saveRate + '%') + '</div></div>' +
      '</div>' +
      (ins.top.length ? '<div class="ins-top"><div class="ins-top-title">支出 TOP3</div>' +
        ins.top.map(function (x, i) {
          const pct = ins.st.expense > 0 ? Math.round(x.amount / ins.st.expense * 100) : 0;
          return '<div class="ins-bar"><span class="ib-name">' + (i + 1) + '. ' + SSZ.esc(SSZ.catName(x.id)) + '</span>' +
            '<span class="ib-track"><span style="width:' + Math.max(4, pct) + '%"></span></span>' +
            '<span class="ib-val">' + SSZ.fmt(x.amount) + '</span></div>';
        }).join('') + '</div>' : '') +
    '</div></div>';

  /* ===== v1.3 每日消费日历 ===== */
  const daily = SSZ.dailyExpense(ym);
  const yy = Number(ym.slice(0, 4)), mm = Number(ym.slice(5, 7));
  const dim = SSZ.daysInMonth(yy, mm);
  const offset = (new Date(yy, mm - 1, 1).getDay() + 6) % 7; // 周一起始
  const maxDay = Math.max.apply(null, [1].concat(Object.keys(daily).map(function (k) { return daily[k]; })));
  let cal = '<div class="block"><div class="block-title">每日消费 · ' + SSZ.monthLabel(ym) + '</div>' +
    '<div class="card card-pad"><div class="cal-week">' +
    ['一', '二', '三', '四', '五', '六', '日'].map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
    '<div class="cal-grid">';
  for (let i = 0; i < offset; i++) cal += '<span class="cal-cell empty"></span>';
  for (let d = 1; d <= dim; d++) {
    const ds = SSZ.ymd(yy, mm, d);
    const v = daily[ds] || 0;
    const lv = !v ? 0 : Math.min(4, Math.ceil(v / maxDay * 4));
    cal += '<button class="cal-cell lv' + lv + (ds === SSZ.todayStr() ? ' today' : '') + '" data-d="' + ds + '" type="button" title="' + ds + ' ' + SSZ.fmt(v) + '">' + d + '</button>';
  }
  cal += '</div><div class="cal-legend"><span>少</span><i class="lv1"></i><i class="lv2"></i><i class="lv3"></i><i class="lv4"></i><span>多</span>' +
    '<span class="cal-total">本月支出 ' + SSZ.fmt(ins.st.expense) + '</span></div></div></div>';
  html += cal;

  /* 支出占比饼图 */
  html += '<div class="block"><div class="block-title">支出构成 · ' + SSZ.monthLabel(ym) + '</div>';
  if (!st.expense) {
    html += '<div class="card"><div class="empty"><div class="ei">🥧</div><div class="et">这个月还没有支出记录</div></div></div>';
  } else {
    const entries = Object.keys(st.byCat).map(function (id) { return [id, st.byCat[id]]; })
      .sort(function (a, b) { return b[1] - a[1]; });
    const top8 = entries.slice(0, 8);
    const restSum = entries.slice(8).reduce(function (s, e) { return s + e[1]; }, 0);
    const labels = top8.map(function (e) { return SSZ.catName(e[0]); });
    const data = top8.map(function (e) { return e[1] / 100; });
    const colors = top8.map(function (e, i) { return SSZ.PIE_COLORS[i % SSZ.PIE_COLORS.length]; });
    if (restSum > 0) { labels.push('其他'); data.push(restSum / 100); colors.push('#C6CAD4'); }
    html += '<div class="card"><div class="chart-box"><canvas id="chart-pie"></canvas></div><div class="chart-legend">';
    labels.forEach(function (lb, i) {
      html += '<span class="lg"><span class="sw" style="background:' + colors[i] + '"></span>' + SSZ.esc(lb) + ' <b>' + SSZ.fmt(Math.round(data[i] * 100)) + '</b></span>';
    });
    html += '</div></div>';
  }
  html += '</div>';

  /* 收支趋势柱状图 */
  html +=
    '<div class="block"><div class="block-title">收支趋势' +
    '<span class="seg-mini"><button id="range-6" type="button">6个月</button><button id="range-12" type="button">12个月</button></span>' +
    '</div>' +
    '<div class="card"><div class="chart-box"><canvas id="chart-trend"></canvas></div>' +
    '<div class="chart-legend"><span class="lg"><span class="sw" style="background:#F0413C"></span>收入</span>' +
    '<span class="lg"><span class="sw" style="background:#12B76A"></span>支出</span></div>' +
    '</div></div>';

  page.innerHTML = html;

  /* 点日历某天 → 跳明细并筛出当天 */
  Array.prototype.forEach.call(page.querySelectorAll('.cal-cell[data-d]'), function (b) {
    b.onclick = function () {
      SSZ._txListMonth = b.dataset.d.slice(0, 7);
      SSZ._txFilter = { q: b.dataset.d, type: 'all', categoryId: '', accountId: '', range: 'month' };
      SSZ.navigate('tx-list', { month: b.dataset.d.slice(0, 7) });
    };
  });

  /* 月份范围切换 */
  const r6 = page.querySelector('#range-6');
  const r12 = page.querySelector('#range-12');
  if (r6) r6.onclick = function () { SSZ._statsRange = 6; SSZ.renderCurrent(); };
  if (r12) r12.onclick = function () { SSZ._statsRange = 12; SSZ.renderCurrent(); };
  if (r6) r6.classList.toggle('active', range === 6);
  if (r12) r12.classList.toggle('active', range === 12);

  /* 图表渲染（Chart.js 懒加载兜底） */
  SSZ.ensureChart(function () {
    if (!window.Chart) return;
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tickColor = dark ? '#9AA0AE' : '#8A8F99';
    const gridColor = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    const borderColor = dark ? '#242832' : '#fff';

    // 饼图
    if (st.expense) {
      const pieEl = page.querySelector('#chart-pie');
      if (pieEl) {
        const entries = Object.keys(st.byCat).map(function (id) { return [id, st.byCat[id]]; })
          .sort(function (a, b) { return b[1] - a[1]; });
        const top8 = entries.slice(0, 8);
        const restSum = entries.slice(8).reduce(function (s, e) { return s + e[1]; }, 0);
        const labels = top8.map(function (e) { return SSZ.catName(e[0]); });
        const data = top8.map(function (e) { return e[1] / 100; });
        const colors = top8.map(function (e, i) { return SSZ.PIE_COLORS[i % SSZ.PIE_COLORS.length]; });
        if (restSum > 0) { labels.push('其他'); data.push(restSum / 100); colors.push('#C6CAD4'); }
        new Chart(pieEl, {
          type: 'doughnut',
          data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: borderColor }] },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: function (c) { return c.label + ' ¥' + c.parsed.toFixed(2); } } }
            }
          }
        });
      }
    }

    // 趋势图：以所选月为最后一根，往前推 N-1 个月
    const trendEl = page.querySelector('#chart-trend');
    if (trendEl) {
      const months = [];
      for (let i = range - 1; i >= 0; i--) months.push(SSZ.addMonths(ym, -i));
      const inc = [], exp = [];
      months.forEach(function (mm) {
        const s = SSZ.monthStats(mm);
        inc.push(s.income / 100);
        exp.push(s.expense / 100);
      });
      new Chart(trendEl, {
        type: 'bar',
        data: {
          labels: months.map(function (mm) { return Number(mm.split('-')[1]) + '月'; }),
          datasets: [
            { label: '收入', data: inc, backgroundColor: '#F0413C', borderRadius: 4, barPercentage: .6 },
            { label: '支出', data: exp, backgroundColor: '#12B76A', borderRadius: 4, barPercentage: .6 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: tickColor } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { font: { size: 11 }, color: tickColor, callback: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; } } }
          }
        }
      });
    }
  });
};
