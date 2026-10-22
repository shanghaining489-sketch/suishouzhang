/* ============================================================
   随手账 · 预算 budget.js
   预算页（总额+分类额度进度）+ 预算设置弹层
   超支判定：>100% 红、>=90% 橙；只报实际，不预测
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.budget = function (page) {
  let ym = SSZ._budgetMonth || SSZ.curMonth();
  SSZ._budgetMonth = ym;
  SSZ.onMonthPicked = function (m) { SSZ._budgetMonth = m; SSZ.renderCurrent(); };

  const b = SSZ.getBudget(ym);
  const st = SSZ.monthStats(ym);
  const bs = SSZ.budgetStatus(ym);
  const expCats = SSZ.DB.categories.filter(function (c) { return c.type === 'expense'; });

  let html = SSZ.pageHeader('月度预算', { back: 'mine', right: SSZ.monthSwitch(ym) });

  if (!b || !b.total) {
    html +=
      '<div class="block"><div class="card"><div class="empty"><div class="ei">🎯</div>' +
      '<div class="et">' + SSZ.monthLabel(ym) + '还没有设置预算<br>设一个预算，管住每个月的花销</div>' +
      '<button class="btn btn-primary mt16" id="budget-set" type="button" style="width:auto;padding:0 26px">设置预算</button>' +
      '</div></div></div>';
    page.innerHTML = html;
    page.querySelector('#budget-set').onclick = function () { SSZ.openBudgetSheet(ym); };
    return;
  }

  /* 总预算卡 */
  const state = bs.pct > 100 ? 'over' : (bs.pct >= 90 ? 'warn' : '');
  html +=
    '<div class="block"><div class="card prog-row">' +
    '<div class="prog-head"><span class="name">本月总预算</span>' +
    '<span class="val"><b>' + SSZ.fmt(bs.used) + '</b> / ' + SSZ.fmt(bs.total) + '</span></div>' +
    '<div class="progress ' + state + '"><div class="progress-bar" style="width:' + Math.min(100, bs.pct) + '%"></div></div>' +
    '<div class="prog-foot ' + (bs.left < 0 ? 'over' : '') + '">' +
    (bs.left >= 0 ? '本月预算还剩 <b>' + SSZ.fmt(bs.left) + '</b>（已用 ' + bs.pct + '%）'
      : '<b>已超支 ' + SSZ.fmt(-bs.left) + '</b>（已用 ' + bs.pct + '%）') +
    '</div></div></div>';

  /* 分类预算列表 */
  const catLimits = expCats.filter(function (c) { return b.byCategory && b.byCategory[c.id] > 0; });
  if (catLimits.length) {
    html += '<div class="block"><div class="block-title">分类预算</div><div class="card">';
    catLimits.forEach(function (c) {
      const limit = b.byCategory[c.id];
      const used = st.byCat[c.id] || 0;
      const pct = Math.round(used / limit * 100);
      const st2 = pct > 100 ? 'over' : (pct >= 90 ? 'warn' : '');
      html +=
        '<div class="prog-row" style="border-bottom:1px solid var(--border)">' +
        '<div class="prog-head"><span class="name">' + c.icon + ' ' + SSZ.esc(c.name) + '</span>' +
        '<span class="val"><b>' + SSZ.fmt(used) + '</b> / ' + SSZ.fmt(limit) + '</span></div>' +
        '<div class="progress ' + st2 + '"><div class="progress-bar" style="width:' + Math.min(100, pct) + '%"></div></div>' +
        '<div class="prog-foot ' + (used > limit ? 'over' : '') + '">' +
        (used > limit ? '已超支 ' + SSZ.fmt(used - limit) : '还剩 ' + SSZ.fmt(limit - used)) +
        '</div></div>';
    });
    html += '</div></div>';
  }

  html += '<div class="block"><button class="btn btn-ghost" id="budget-edit" type="button">修改预算</button></div>';

  page.innerHTML = html;
  page.querySelector('#budget-edit').onclick = function () { SSZ.openBudgetSheet(ym); };
};

/* ---------------- 预算设置弹层 ---------------- */

SSZ.openBudgetSheet = function (ym) {
  const b = SSZ.getBudget(ym) || { total: 0, byCategory: {} };
  const expCats = SSZ.DB.categories.filter(function (c) { return c.type === 'expense'; });

  let catRows = '';
  expCats.forEach(function (c) {
    const v = b.byCategory && b.byCategory[c.id] ? SSZ.fmtPlain(b.byCategory[c.id]) : '';
    catRows +=
      '<div class="field-row"><span class="fl">' + c.icon + ' ' + SSZ.esc(c.name) + '</span>' +
      '<input class="fv" type="text" inputmode="decimal" placeholder="不设上限" data-cat="' + c.id + '" value="' + v + '"></div>';
  });

  const s = SSZ.openSheet({
    title: SSZ.monthLabel(ym) + '预算',
    body:
      '<div class="list-group">' +
      '<div class="field-row"><span class="fl">月度总预算</span>' +
      '<input class="fv" type="text" inputmode="decimal" id="budget-total" placeholder="0.00" value="' + (b.total ? SSZ.fmtPlain(b.total) : '') + '"></div>' +
      '</div>' +
      '<div class="cat-sub mt16">分类额度（选填，超出会提醒）</div>' +
      '<div class="list-group">' + catRows + '</div>' +
      '<button class="btn btn-primary mt16" id="budget-save" type="button">保存</button>'
  });

  s.body.querySelector('#budget-save').onclick = function () {
    const total = SSZ.parseAmount(s.body.querySelector('#budget-total').value);
    if (!total) { SSZ.toast('请填写月度总预算'); return; }
    const byCat = {};
    Array.prototype.forEach.call(s.body.querySelectorAll('[data-cat]'), function (el) {
      const v = SSZ.parseAmount(el.value);
      if (v > 0) byCat[el.dataset.cat] = v;
    });
    SSZ.setBudget(ym, total, byCat);
    s.close();
    SSZ.toast('预算已保存', 'ok');
    SSZ.renderCurrent();
  };
};
