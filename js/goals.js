/* ============================================================
   随手账 · 存钱目标 goals.js
   目标列表 + 创建 + 存入一笔（联动账户支出）+ 删除
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.goals = function (page) {
  const goals = SSZ.DB.goals;

  let html = SSZ.pageHeader('存钱目标', { back: 'mine' });

  html += '<div class="block"><button class="btn btn-primary" id="goal-add" type="button">＋ 新建目标</button></div>';

  if (!goals.length) {
    html += '<div class="card"><div class="empty"><div class="ei">🐷</div>' +
      '<div class="et">还没有存钱目标<br>定个小目标，比如"旅行基金 ¥8,000"</div></div></div>';
  } else {
    html += '<div class="block"><div class="list-group">';
    goals.forEach(function (g) {
      const pct = g.target > 0 ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
      const done = g.saved >= g.target;
      html +=
        '<div class="goal-item">' +
        '<div class="g-head"><span class="g-name">' + SSZ.esc(g.name) + (done ? ' ✅' : '') + '</span>' +
        '<span class="g-pct">' + pct + '%</span></div>' +
        '<div class="progress"><div class="progress-bar" style="width:' + pct + '%;' + (done ? 'background:var(--expense)' : '') + '"></div></div>' +
        '<div class="g-foot"><span><b>' + SSZ.fmt(g.saved) + '</b> / ' + SSZ.fmt(g.target) + '</span>' +
        '<span>' + (g.deadline ? g.deadline + ' 截止' : '') + '</span></div>' +
        '<div class="btn-row" style="margin-top:10px">' +
        (done ? '' : '<button class="btn btn-ghost" style="height:36px;font-size:13px" data-dep="' + g.id + '" type="button">存入一笔</button>') +
        '<button class="btn btn-danger" style="height:36px;font-size:13px" data-del="' + g.id + '" type="button">删除</button>' +
        '</div></div>';
    });
    html += '</div></div>';
  }

  page.innerHTML = html;

  page.querySelector('#goal-add').onclick = function () { SSZ.openGoalSheet(null); };
  Array.prototype.forEach.call(page.querySelectorAll('[data-dep]'), function (el) {
    el.onclick = function () {
      const g = SSZ.DB.goals.find(function (x) { return x.id === el.dataset.dep; });
      if (g) SSZ.openDepositSheet(g);
    };
  });
  Array.prototype.forEach.call(page.querySelectorAll('[data-del]'), function (el) {
    el.onclick = function () {
      const g = SSZ.DB.goals.find(function (x) { return x.id === el.dataset.del; });
      if (!g) return;
      SSZ.confirm('删除目标「' + g.name + '」？', '只删除目标本身，已生成的存钱记录不受影响', { okText: '删除', danger: true })
        .then(function (ok) {
          if (!ok) return;
          SSZ.deleteGoal(g.id);
          SSZ.toast('已删除', 'ok');
          SSZ.renderCurrent();
        });
    };
  });
};

/* ---------------- 新建/编辑目标 ---------------- */

SSZ.openGoalSheet = function (goal) {
  const isEdit = !!goal;
  const s = SSZ.openSheet({
    title: isEdit ? '编辑目标' : '新建存钱目标',
    body:
      '<div class="list-group">' +
      '<div class="field-row"><span class="fl">名称</span><input class="fv" type="text" id="goal-name" placeholder="如：旅行基金" maxlength="20"></div>' +
      '<div class="field-row"><span class="fl">目标金额</span><input class="fv" type="text" inputmode="decimal" id="goal-target" placeholder="0.00"></div>' +
      '<div class="field-row"><span class="fl">截止日期</span><input class="fv" type="month" id="goal-deadline"></div>' +
      '</div>' +
      '<button class="btn btn-primary mt16" id="goal-save" type="button">保存</button>'
  });
  const $ = function (id) { return s.body.querySelector('#' + id); };
  if (isEdit) {
    $('goal-name').value = goal.name;
    $('goal-target').value = SSZ.fmtPlain(goal.target);
    $('goal-deadline').value = goal.deadline || '';
  }
  $('goal-save').onclick = function () {
    const name = $('goal-name').value.trim();
    const target = SSZ.parseAmount($('goal-target').value);
    if (!name) { SSZ.toast('请填写目标名称'); return; }
    if (!target) { SSZ.toast('请填写目标金额'); return; }
    if (isEdit) {
      goal.name = name; goal.target = target; goal.deadline = $('goal-deadline').value || '';
      SSZ.persistNow();
      SSZ.toast('已保存', 'ok');
    } else {
      SSZ.addGoal(name, target, $('goal-deadline').value || '');
      SSZ.toast('目标已创建', 'ok');
    }
    s.close();
    SSZ.renderCurrent();
  };
};

/* ---------------- 存入一笔 ---------------- */

SSZ.openDepositSheet = function (goal) {
  SSZ.pickAccount(null).then(function (accId) {
    if (!accId) return;
    // 金额用一个简单输入弹层
    const s = SSZ.openSheet({
      title: '存入「' + goal.name + '」',
      body:
        '<div class="list-group">' +
        '<div class="field-row"><span class="fl">存入金额</span><input class="fv" type="text" inputmode="decimal" id="dep-amount" placeholder="0.00"></div>' +
        '<div class="field-row"><span class="fl">从账户</span><span class="fv">' + SSZ.esc(SSZ.accName(accId)) + '</span></div>' +
        '</div>' +
        '<div class="tiny muted mt8">会在记账里生成一笔"其他"支出，账户余额同步扣减</div>' +
        '<button class="btn btn-primary mt16" id="dep-save" type="button">存入</button>'
    });
    s.body.querySelector('#dep-save').onclick = function () {
      const amount = SSZ.parseAmount(s.body.querySelector('#dep-amount').value);
      if (!amount) { SSZ.toast('请填写存入金额'); return; }
      SSZ.goalDeposit(goal.id, amount, accId);
      s.close();
      SSZ.toast('已存入 ' + SSZ.fmt(amount), 'ok');
      SSZ.renderCurrent();
    };
  });
};
