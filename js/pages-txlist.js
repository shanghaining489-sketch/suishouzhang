/* ============================================================
   随手账 · 全部明细页 pages-txlist.js
   按月切换 + 按日分组 + 点击编辑/删除
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers['tx-list'] = function (page, params) {
  let ym = params.month || SSZ._txListMonth || SSZ.curMonth();
  SSZ._txListMonth = ym;
  SSZ.onMonthPicked = function (m) { SSZ._txListMonth = m; SSZ.renderCurrent(); };

  const st = SSZ.monthStats(ym);
  const txs = SSZ.DB.transactions.filter(function (t) { return t.date.slice(0, 7) === ym; })
    .sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  let html = SSZ.pageHeader('全部明细', { back: 'home', right: SSZ.monthSwitch(ym) });

  // 月度小结条
  html +=
    '<div class="block"><div class="card" style="display:flex;padding:13px 16px;font-size:13px">' +
    '<div style="flex:1">收入<br><b style="color:var(--income)">' + SSZ.fmt(st.income) + '</b></div>' +
    '<div style="flex:1">支出<br><b style="color:var(--expense)">' + SSZ.fmt(st.expense) + '</b></div>' +
    '<div style="flex:1;text-align:right">结余<br><b>' + SSZ.fmt(st.balance) + '</b></div>' +
    '</div></div>';

  if (!txs.length) {
    html += '<div class="card"><div class="empty"><div class="ei">🗓️</div>' +
      '<div class="et">' + SSZ.monthLabel(ym) + '还没有记账记录</div></div></div>';
  } else {
    const groups = SSZ.groupByDay(txs);
    groups.forEach(function (gr) {
      const dayExpense = gr.items.reduce(function (s, t) { return s + (t.type === 'expense' ? t.amount : 0); }, 0);
      html += '<div class="tx-day"><span>' + SSZ.dateLabel(gr.date) + '</span>' +
        (dayExpense ? '<span>支 ' + SSZ.fmt(dayExpense) + '</span>' : '') + '</div>';
      gr.items.forEach(function (t) { html += SSZ.txItemHTML(t); });
    });
  }

  page.innerHTML = html;
  SSZ.bindTxItems(page);
};
