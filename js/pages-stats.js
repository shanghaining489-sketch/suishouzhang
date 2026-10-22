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
          data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
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
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { beginAtZero: true, ticks: { font: { size: 11 }, callback: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; } } }
          }
        }
      });
    }
  });
};
