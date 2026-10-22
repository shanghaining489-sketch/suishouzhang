/* ============================================================
   随手账 · 账户页 pages-accounts.js
   净资产卡 / 账户列表 / 账户详情 / 增改停用 / 余额校正
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.ACC_TYPES = [
  ['cash', '现金', '💵'], ['wechat', '微信', '💬'], ['alipay', '支付宝', '💰'],
  ['bank', '银行卡', '🏦'], ['credit', '信用卡', '💳'], ['other', '其他', '📦']
];

SSZ.accTypeName = function (t) {
  const f = SSZ.ACC_TYPES.find(function (x) { return x[0] === t; });
  return f ? f[1] : '其他';
};
SSZ.accTypeIcon = function (t) {
  const f = SSZ.ACC_TYPES.find(function (x) { return x[0] === t; });
  return f ? f[2] : '📦';
};

/* 账户余额显示：信用卡负值显示"欠款" */
SSZ.accBalanceText = function (a) {
  if (a.type === 'credit' && a.balance < 0) {
    return { main: SSZ.fmt(-a.balance), sub: '欠款' };
  }
  return { main: SSZ.fmt(a.balance), sub: a.type === 'credit' ? '可用额度' : '' };
};

SSZ.renderers.accounts = function (page) {
  const al = SSZ.assetsLiabilities();
  const nw = SSZ.netWorth();
  const active = SSZ.DB.accounts.filter(function (a) { return a.active; });
  const inactive = SSZ.DB.accounts.filter(function (a) { return !a.active; });

  let html = SSZ.pageHeader('账户', {});

  /* 净资产卡 */
  html +=
    '<div class="block"><div class="nw-card">' +
    '<div class="nw-label">净资产</div>' +
    '<div class="nw-num' + (nw < 0 ? ' neg' : '') + '">' + SSZ.fmt(nw) + '</div>' +
    '<div class="nw-sub">' +
    '<span>总资产 <b>' + SSZ.fmt(al.assets) + '</b></span>' +
    '<span>总负债 <b>' + SSZ.fmt(al.liabilities) + '</b></span>' +
    '</div></div></div>';

  /* 账户列表 */
  html += '<div class="block"><div class="block-title">我的账户</div><div class="list-group">';
  if (!active.length) {
    html += '<div class="empty" style="padding:26px"><div class="et">还没有账户，点下方添加</div></div>';
  }
  active.forEach(function (a) {
    const bt = SSZ.accBalanceText(a);
    html +=
      '<button class="acc-item" data-id="' + a.id + '" type="button">' +
      '<span class="acc-ic" style="background:' + SSZ.accTint(a.type) + '">' + a.icon + '</span>' +
      '<span><span class="acc-name">' + SSZ.esc(a.name) + '</span><br><span class="acc-type">' + SSZ.accTypeName(a.type) + '</span></span>' +
      '<span class="acc-bal">' + bt.main + (bt.sub ? '<span class="sub">' + bt.sub + '</span>' : '') + '</span>' +
      '</button>';
  });
  html += '</div></div>';

  /* 添加账户 */
  html += '<div class="block"><button class="btn btn-primary" id="acc-add" type="button">＋ 添加账户</button></div>';

  /* 已停用 */
  if (inactive.length) {
    html += '<div class="block"><div class="block-title">已停用（不计入净资产）</div><div class="list-group">';
    inactive.forEach(function (a) {
      html +=
        '<button class="acc-item inactive" data-id="' + a.id + '" type="button">' +
        '<span class="acc-ic" style="background:#F2F3F7">' + a.icon + '</span>' +
        '<span><span class="acc-name">' + SSZ.esc(a.name) + '</span><br><span class="acc-type">' + SSZ.accTypeName(a.type) + '</span></span>' +
        '<span class="acc-bal">' + SSZ.fmt(a.balance) + '</span>' +
        '</button>';
    });
    html += '</div></div>';
  }

  page.innerHTML = html;

  Array.prototype.forEach.call(page.querySelectorAll('.acc-item'), function (el) {
    el.onclick = function () { SSZ.navigate('account-detail', { id: el.dataset.id }); };
  });
  page.querySelector('#acc-add').onclick = function () { SSZ.openAccountSheet(null); };
};

/* 账户类型淡色背景 */
SSZ.accTint = function (type) {
  const map = {
    cash: '#E8F5EC', wechat: '#E6F6EC', alipay: '#E8F0FE',
    bank: '#FFF4E5', credit: '#FCE8E6', other: '#F2F3F7'
  };
  return map[type] || '#F2F3F7';
};

/* ---------------- 账户详情页 ---------------- */

SSZ.renderers['account-detail'] = function (page, params) {
  const a = SSZ.accById(params.id);
  if (!a) { SSZ.navigate('accounts'); return; }
  const bt = SSZ.accBalanceText(a);
  const txs = SSZ.DB.transactions.filter(function (t) { return t.accountId === a.id; })
    .sort(function (x, y) {
      if (x.date !== y.date) return x.date < y.date ? 1 : -1;
      return (y.createdAt || 0) - (x.createdAt || 0);
    });

  let html = SSZ.pageHeader(SSZ.esc(a.name), { back: 'accounts' });

  html +=
    '<div class="block"><div class="nw-card">' +
    '<div class="nw-label">' + SSZ.accTypeName(a.type) + (bt.sub ? ' · ' + bt.sub : '') + '</div>' +
    '<div class="nw-num' + (a.balance < 0 ? ' neg' : '') + '">' + bt.main + '</div>' +
    '<div class="nw-sub"><span>初始余额 <b>' + SSZ.fmt(a.initialBalance) + '</b></span>' +
    '<span>共 <b>' + txs.length + '</b> 笔记录</span></div>' +
    '</div></div>';

  html +=
    '<div class="block" style="display:flex;gap:10px">' +
    '<button class="btn btn-ghost" id="acc-edit" type="button" style="flex:1">编辑</button>' +
    '<button class="btn ' + (a.active ? 'btn-danger' : 'btn-primary') + '" id="acc-toggle" type="button" style="flex:1">' + (a.active ? '停用' : '恢复启用') + '</button>' +
    '</div>';

  html += '<div class="block"><div class="block-title">账户流水</div>';
  if (!txs.length) {
    html += '<div class="card"><div class="empty" style="padding:30px"><div class="et">这个账户还没有记录</div></div></div>';
  } else {
    const groups = SSZ.groupByDay(txs);
    groups.forEach(function (gr) {
      html += '<div class="tx-day"><span>' + SSZ.dateLabel(gr.date) + '</span></div>';
      gr.items.forEach(function (t) { html += SSZ.txItemHTML(t); });
    });
  }
  html += '</div>';

  page.innerHTML = html;
  SSZ.bindTxItems(page);

  page.querySelector('#acc-edit').onclick = function () { SSZ.openAccountSheet(a); };
  page.querySelector('#acc-toggle').onclick = function () {
    if (a.active) {
      const cnt = SSZ.DB.accounts.filter(function (x) { return x.active; }).length;
      if (cnt <= 1) { SSZ.toast('至少保留一个启用中的账户', 'err'); return; }
    }
    a.active = !a.active;
    SSZ.persistNow();
    SSZ.toast(a.active ? '已恢复启用' : '已停用', 'ok');
    SSZ.renderCurrent();
  };
};

/* ---------------- 账户编辑弹层 ---------------- */

SSZ.openAccountSheet = function (acc) {
  const isEdit = !!acc;
  const st = {
    name: acc ? acc.name : '',
    type: acc ? acc.type : 'cash',
    icon: acc ? acc.icon : '💵',
    initialStr: acc ? SSZ.fmtPlain(acc.initialBalance) : ''
  };

  const typeOpts = SSZ.ACC_TYPES.map(function (t) {
    return '<option value="' + t[0] + '"' + (st.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
  }).join('');

  const s = SSZ.openSheet({
    title: isEdit ? '编辑账户' : '添加账户',
    body:
      '<div class="list-group">' +
      '<div class="field-row"><span class="fl">名称</span><input class="fv" type="text" id="acc-name" placeholder="如：招行信用卡" maxlength="20"></div>' +
      '<div class="field-row"><span class="fl">类型</span><select class="fv" id="acc-type">' + typeOpts + '</select></div>' +
      '<div class="field-row"><span class="fl">图标</span><button class="fv" id="acc-icon" type="button" style="font-size:22px">' + st.icon + '</button></div>' +
      '<div class="field-row"><span class="fl">初始余额</span><input class="fv" type="text" id="acc-init" inputmode="decimal" placeholder="0.00"></div>' +
      '</div>' +
      '<div class="tiny muted mt8">初始余额是开始记账前该账户已有的金额（信用卡可填 0 或正数，支出后显示为欠款）</div>' +
      '<button class="btn btn-primary mt16" id="acc-save" type="button">保存</button>'
  });

  const $ = function (id) { return s.body.querySelector('#' + id); };
  $('acc-name').value = st.name;
  $('acc-init').value = st.initialStr;

  $('acc-icon').onclick = function () {
    SSZ.pickEmoji(st.icon).then(function (e) {
      if (e) { st.icon = e; $('acc-icon').textContent = e; }
    });
  };

  $('acc-save').onclick = function () {
    const name = $('acc-name').value.trim();
    if (!name) { SSZ.toast('请填写账户名称'); return; }
    const init = SSZ.parseAmount($('acc-init').value);
    const type = $('acc-type').value;
    if (isEdit) {
      const oldInit = acc.initialBalance;
      acc.name = name; acc.type = type; acc.icon = st.icon;
      acc.initialBalance = init;
      acc.balance += (init - oldInit); // 初始余额变动同步到当前余额
      SSZ.persistNow();
      SSZ.toast('已保存', 'ok');
    } else {
      const a = { id: SSZ.uid('a'), name: name, type: type, icon: st.icon, balance: init, initialBalance: init, active: true };
      SSZ.DB.accounts.push(a);
      SSZ.persistNow();
      SSZ.toast('已添加账户', 'ok');
    }
    s.close();
    SSZ.renderCurrent();
  };
};
