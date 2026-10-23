/* ============================================================
   随手账 · 首页 pages-home.js
   月份切换 / 本月汇总 / 预算进度 / 定期账提醒 / 存钱目标 / 最近记账
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.home = function (page) {
  const ym = SSZ._homeMonth || SSZ.curMonth();
  SSZ._homeMonth = ym;
  SSZ.onMonthPicked = function (m) { SSZ._homeMonth = m; SSZ.renderCurrent(); };

  const st = SSZ.monthStats(ym);
  const txs = SSZ.DB.transactions.filter(function (t) { return t.date.slice(0, 7) === ym; });

  let html = SSZ.pageHeader('随手账', { right: SSZ.monthSwitch(ym) });

  /* 本月汇总卡 */
  html +=
    '<div class="block">' +
    '<div class="sum-card">' +
    '<div class="sum-label">本月支出</div>' +
    '<div class="sum-main"><span class="cur">¥</span><span class="num">' + SSZ.fmtPlain(st.expense) + '</span></div>' +
    '<div class="sum-sub">' +
    '<span class="item"><span class="dot" style="background:#FFD6D3"></span>收入 <b>' + SSZ.fmt(st.income) + '</b></span>' +
    '<span class="item"><span class="dot" style="background:#BFF0D6"></span>结余 <b>' + SSZ.fmt(st.balance) + '</b></span>' +
    '</div></div></div>';

  /* AI 智能记账入口（v1.2：语音 + 截图识别） */
  html +=
    '<div class="block">' +
    '<button class="voice-cta" id="home-ai" type="button">' +
    '<span class="vc-ic">🤖</span>' +
    '<span class="vc-text"><b>AI 智能记账</b><small>说一句，或传截图，自动识别多笔</small></span>' +
    '<span class="vc-go">›</span>' +
    '</button></div>';

  /* 预算进度 */
  const bs = SSZ.budgetStatus(ym);
  if (bs.set) {
    const state = bs.pct > 100 ? 'over' : (bs.pct >= 90 ? 'warn' : '');
    const foot = bs.left >= 0
      ? '本月预算还剩 <b>' + SSZ.fmt(bs.left) + '</b>'
      : '<b>已超支 ' + SSZ.fmt(-bs.left) + '</b>，注意控制';
    html +=
      '<div class="block"><div class="card prog-row">' +
      '<div class="prog-head"><span class="name">本月总预算</span>' +
      '<span class="val"><b>' + SSZ.fmt(bs.used) + '</b> / ' + SSZ.fmt(bs.total) + '</span></div>' +
      '<div class="progress ' + state + '"><div class="progress-bar" style="width:' + Math.min(100, bs.pct) + '%"></div></div>' +
      '<div class="prog-foot ' + (bs.left < 0 ? 'over' : '') + '">' + foot + '</div>' +
      '</div></div>';
  } else {
    html +=
      '<div class="block"><button class="card prog-row" id="home-budget-cta" type="button" style="width:100%;text-align:left">' +
      '<div class="prog-head" style="margin-bottom:0"><span class="name">💡 设置月度预算</span>' +
      '<span class="val">控制花销，从设预算开始 ›</span></div>' +
      '</button></div>';
  }

  /* 定期账到期提醒 */
  const due = SSZ.dueRecurring();
  if (due.length) {
    html +=
      '<div class="block"><div class="due-banner">' +
      '<span>⏰</span>' +
      '<div class="db-text">有 <b>' + due.length + '</b> 笔定期账待生成（如房租、工资）</div>' +
      '<button class="db-btn" id="due-gen" type="button">全部生成</button>' +
      '</div></div>';
  }

  /* 存钱目标横滑 */
  const goals = SSZ.DB.goals.filter(function (g) { return g.saved < g.target; }).slice(0, 3);
  if (goals.length) {
    let ghtml = '';
    goals.forEach(function (g) {
      const pct = g.target > 0 ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
      ghtml +=
        '<button class="goal-card" data-id="' + g.id + '" type="button">' +
        '<div class="g-name">' + SSZ.esc(g.name) + '</div>' +
        '<div class="g-num"><b>' + SSZ.fmt(g.saved) + '</b> / ' + SSZ.fmt(g.target) + '</div>' +
        '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="g-pct">已完成 ' + pct + '%' + (g.deadline ? ' · ' + g.deadline + ' 截止' : '') + '</div>' +
        '</button>';
    });
    html +=
      '<div class="block"><div class="block-title">存钱目标<span class="more" id="goals-more">管理 ›</span></div>' +
      '<div class="goal-scroll">' + ghtml + '</div></div>';
  }

  /* 最近记账 */
  const recent = txs.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  }).slice(0, 5);

  html += '<div class="block"><div class="block-title">最近记账' +
    (txs.length ? '<span class="more" id="tx-all">全部明细 ›</span>' : '') + '</div>';

  if (!recent.length) {
    html += '<div class="card"><div class="empty"><div class="ei">🧾</div>' +
      '<div class="et">这个月还没有记账<br>点下方 <b>+</b> 记第一笔吧</div></div></div>';
  } else {
    const groups = SSZ.groupByDay(recent);
    groups.forEach(function (gr) {
      html += '<div class="tx-day"><span>' + SSZ.dateLabel(gr.date) + '</span></div>';
      gr.items.forEach(function (t) { html += SSZ.txItemHTML(t); });
    });
  }
  html += '</div>';

  page.innerHTML = html;

  /* --- 事件绑定 --- */
  const cta = page.querySelector('#home-budget-cta');
  if (cta) cta.onclick = function () { SSZ.openBudgetSheet(ym); };

  const voice = page.querySelector('#home-ai');
  if (voice) voice.onclick = function () { SSZ.navigate('ai'); };

  const gen = page.querySelector('#due-gen');
  if (gen) {
    gen.onclick = function () {
      SSZ.dueRecurring().forEach(function (r) { SSZ.generateRecurring(r.id); });
      SSZ.toast('已生成 ' + due.length + ' 笔定期账', 'ok');
      SSZ.renderCurrent();
    };
  }

  const gm = page.querySelector('#goals-more');
  if (gm) gm.onclick = function () { SSZ.navigate('goals'); };

  Array.prototype.forEach.call(page.querySelectorAll('.goal-card'), function (el) {
    el.onclick = function () { SSZ.navigate('goals'); };
  });

  const all = page.querySelector('#tx-all');
  if (all) all.onclick = function () { SSZ.navigate('tx-list', { month: ym }); };

  SSZ.bindTxItems(page);
};

/* 交易条目 HTML（明细页/账户详情复用） */
SSZ.txItemHTML = function (t) {
  const c = SSZ.catById(t.categoryId);
  const a = SSZ.accById(t.accountId);
  const sign = t.type === 'income' ? '+' : '−';
  const cls = t.type === 'income' ? 'is-income' : 'is-expense';
  const note = [t.note, a ? a.name : ''].filter(Boolean).join(' · ');
  return '<button class="tx-item" data-id="' + t.id + '" type="button">' +
    '<span class="tx-icon">' + (c ? c.icon : '📦') + '</span>' +
    '<span class="tx-body">' +
    '<span class="tx-name">' + (c ? SSZ.esc(c.name) : '未分类') + '</span>' +
    (note ? '<span class="tx-note">' + SSZ.esc(note) + '</span>' : '') +
    '</span>' +
    '<span class="tx-amount ' + cls + '">' + sign + SSZ.fmt(t.amount) + '</span>' +
    '</button>';
};

/* 绑定交易条目点击 → 打开编辑 */
SSZ.bindTxItems = function (root) {
  Array.prototype.forEach.call(root.querySelectorAll('.tx-item'), function (el) {
    el.onclick = function () {
      const tx = SSZ.DB.transactions.find(function (t) { return t.id === el.dataset.id; });
      if (tx) SSZ.openTxSheet(tx);
    };
  });
};
