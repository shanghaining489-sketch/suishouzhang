/* ============================================================
   随手账 · 定期记账 recurring.js
   周期账规则管理 + 到期检测 + 一键生成 + nextDate 推进（含月末钳位）
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.recurring = function (page) {
  const list = SSZ.DB.recurring;
  const due = SSZ.dueRecurring();

  let html = SSZ.pageHeader('定期记账', { back: 'mine' });

  if (due.length) {
    html +=
      '<div class="block"><div class="due-banner">' +
      '<span>⏰</span><div class="db-text">有 <b>' + due.length + '</b> 笔待生成</div>' +
      '<button class="db-btn" id="rec-gen-all" type="button">全部生成</button>' +
      '</div></div>';
  }

  html += '<div class="block"><button class="btn btn-primary" id="rec-add" type="button">＋ 添加定期账</button></div>';

  if (!list.length) {
    html += '<div class="card"><div class="empty"><div class="ei">🔁</div>' +
      '<div class="et">还没有定期账<br>房租、工资、话费这类固定收支，设一次就自动提醒</div></div></div>';
  } else {
    html += '<div class="block"><div class="list-group">';
    list.forEach(function (r) {
      const c = SSZ.catById(r.categoryId);
      const freqText = r.freq === 'monthly' ? '每月' + (r.day || '') + '日'
        : r.freq === 'weekly' ? '每周' : '每年';
      html +=
        '<div class="rec-item' + (r.active ? '' : ' inactive') + '">' +
        '<span class="tx-icon">' + (c ? c.icon : '📦') + '</span>' +
        '<span class="tx-body"><span class="tx-name">' + SSZ.esc(r.name) + '</span>' +
        '<span class="tx-note">' + (r.type === 'income' ? '收入' : '支出') + ' · ' + SSZ.fmt(r.amount) + ' · ' + SSZ.esc(SSZ.accName(r.accountId)) + '</span></span>' +
        '<span style="text-align:right"><span class="rec-freq">' + freqText + '</span><br>' +
        '<span class="tiny muted">下次 ' + r.nextDate + '</span></span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;padding:0 16px 12px">' +
        '<button class="btn btn-ghost" style="height:34px;font-size:13px;flex:1" data-edit="' + r.id + '" type="button">编辑</button>' +
        (r.active && r.nextDate <= SSZ.todayStr()
          ? '<button class="btn btn-primary" style="height:34px;font-size:13px;flex:1" data-gen="' + r.id + '" type="button">立即生成</button>' : '') +
        '<button class="btn btn-danger" style="height:34px;font-size:13px;flex:1" data-del="' + r.id + '" type="button">删除</button>' +
        '</div>';
    });
    html += '</div></div>';
  }

  page.innerHTML = html;

  const genAll = page.querySelector('#rec-gen-all');
  if (genAll) {
    genAll.onclick = function () {
      SSZ.dueRecurring().forEach(function (r) { SSZ.generateRecurring(r.id); });
      SSZ.toast('已全部生成', 'ok');
      SSZ.renderCurrent();
    };
  }
  page.querySelector('#rec-add').onclick = function () { SSZ.openRecurringSheet(null); };
  Array.prototype.forEach.call(page.querySelectorAll('[data-gen]'), function (el) {
    el.onclick = function () {
      SSZ.generateRecurring(el.dataset.gen);
      SSZ.toast('已生成一笔', 'ok');
      SSZ.renderCurrent();
    };
  });
  Array.prototype.forEach.call(page.querySelectorAll('[data-edit]'), function (el) {
    el.onclick = function () {
      const r = SSZ.DB.recurring.find(function (x) { return x.id === el.dataset.edit; });
      if (r) SSZ.openRecurringSheet(r);
    };
  });
  Array.prototype.forEach.call(page.querySelectorAll('[data-del]'), function (el) {
    el.onclick = function () {
      SSZ.confirm('删除这条定期账？', '删除后不再自动提醒，已生成的记录保留', { okText: '删除', danger: true })
        .then(function (ok) {
          if (!ok) return;
          SSZ.deleteRecurring(el.dataset.del);
          SSZ.toast('已删除', 'ok');
          SSZ.renderCurrent();
        });
    };
  });
};

/* ---------------- 添加/编辑定期账 ---------------- */

SSZ.openRecurringSheet = function (r) {
  const isEdit = !!r;
  const st = {
    name: r ? r.name : '',
    type: r ? r.type : 'expense',
    amountStr: r ? SSZ.fmtPlain(r.amount) : '',
    categoryId: r ? r.categoryId : null,
    accountId: r ? r.accountId : null,
    freq: r ? r.freq : 'monthly',
    day: r ? r.day : 1,
    nextDate: r ? r.nextDate : SSZ.todayStr()
  };

  const expCats = SSZ.DB.categories.filter(function (c) { return c.type === 'expense'; });
  const incCats = SSZ.DB.categories.filter(function (c) { return c.type === 'income'; });
  if (!st.categoryId) st.categoryId = (st.type === 'income' ? incCats[0] : expCats[0]).id;
  if (!st.accountId) {
    const a = SSZ.DB.accounts.find(function (x) { return x.active; });
    st.accountId = a ? a.id : null;
  }

  const catOpts = (st.type === 'income' ? incCats : expCats).map(function (c) {
    return '<option value="' + c.id + '"' + (st.categoryId === c.id ? ' selected' : '') + '>' + c.icon + ' ' + SSZ.esc(c.name) + '</option>';
  }).join('');
  const accOpts = SSZ.DB.accounts.filter(function (a) { return a.active; }).map(function (a) {
    return '<option value="' + a.id + '"' + (st.accountId === a.id ? ' selected' : '') + '>' + SSZ.esc(a.name) + '</option>';
  }).join('');

  const s = SSZ.openSheet({
    title: isEdit ? '编辑定期账' : '添加定期账',
    body:
      '<div class="seg tx-type-wrap">' +
      '<button class="seg-btn" data-t="expense" type="button">支出</button>' +
      '<button class="seg-btn" data-t="income" type="button">收入</button>' +
      '</div>' +
      '<div class="list-group">' +
      '<div class="field-row"><span class="fl">名称</span><input class="fv" type="text" id="rec-name" placeholder="如：房租" maxlength="20"></div>' +
      '<div class="field-row"><span class="fl">金额</span><input class="fv" type="text" inputmode="decimal" id="rec-amount" placeholder="0.00"></div>' +
      '<div class="field-row"><span class="fl">分类</span><select class="fv" id="rec-cat">' + catOpts + '</select></div>' +
      '<div class="field-row"><span class="fl">账户</span><select class="fv" id="rec-acc">' + accOpts + '</select></div>' +
      '<div class="field-row"><span class="fl">频率</span><select class="fv" id="rec-freq">' +
      '<option value="monthly">每月</option><option value="weekly">每周</option><option value="yearly">每年</option>' +
      '</select></div>' +
      '<div class="field-row" id="rec-day-row"><span class="fl">每月几号</span><input class="fv" type="number" id="rec-day" min="1" max="31" value="1"></div>' +
      '<div class="field-row"><span class="fl">下次日期</span><input class="fv" type="date" id="rec-next"></div>' +
      '</div>' +
      '<button class="btn btn-primary mt16" id="rec-save" type="button">保存</button>'
  });

  const $ = function (id) { return s.body.querySelector('#' + id); };
  $('rec-name').value = st.name;
  $('rec-amount').value = st.amountStr;
  $('rec-freq').value = st.freq;
  $('rec-day').value = st.day;
  $('rec-next').value = st.nextDate;

  function refreshDayRow() {
    $('rec-day-row').style.display = st.freq === 'monthly' ? '' : 'none';
  }
  refreshDayRow();

  Array.prototype.forEach.call(s.body.querySelectorAll('.seg-btn'), function (b) {
    b.classList.toggle('active', b.dataset.t === st.type);
    b.onclick = function () {
      st.type = b.dataset.t;
      Array.prototype.forEach.call(s.body.querySelectorAll('.seg-btn'), function (x) {
        x.classList.toggle('active', x === b);
      });
      // 切换类型时刷新分类下拉
      const cats = st.type === 'income' ? incCats : expCats;
      $('rec-cat').innerHTML = cats.map(function (c) {
        return '<option value="' + c.id + '">' + c.icon + ' ' + SSZ.esc(c.name) + '</option>';
      }).join('');
    };
  });

  $('rec-save').onclick = function () {
    const name = $('rec-name').value.trim();
    const amount = SSZ.parseAmount($('rec-amount').value);
    if (!name) { SSZ.toast('请填写名称'); return; }
    if (!amount) { SSZ.toast('请填写金额'); return; }
    const payload = {
      name: name, type: st.type, amount: amount,
      categoryId: $('rec-cat').value, accountId: $('rec-acc').value,
      freq: $('rec-freq').value,
      day: $('rec-freq').value === 'monthly' ? Math.max(1, Math.min(31, Number($('rec-day').value) || 1)) : null,
      nextDate: $('rec-next').value || SSZ.todayStr()
    };
    if (isEdit) SSZ.updateRecurring(r.id, payload);
    else SSZ.addRecurring(payload);
    s.close();
    SSZ.toast(isEdit ? '已保存' : '已添加', 'ok');
    SSZ.renderCurrent();
  };
};
