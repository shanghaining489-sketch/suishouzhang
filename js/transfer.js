/* ============================================================
   随手账 · 账户间转账 transfer.js (v1.3)
   借鉴 Firefly III / BeeCount：转账只影响双方余额，不计入收支统计
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.openTransferSheet = function (tx) {
  const isEdit = !!tx;
  const accs = SSZ.DB.accounts.filter(function (a) { return a.active; });
  if (accs.length < 2) {
    SSZ.toast('至少需要两个启用中的账户', 'err');
    return;
  }
  const st = {
    amountStr: tx ? SSZ.fmtPlain(tx.amount) : '',
    accountId: tx ? tx.accountId : accs[0].id,
    toAccountId: tx ? tx.toAccountId : accs[1].id,
    date: tx ? tx.date : SSZ.todayStr(),
    note: tx ? (tx.note || '') : ''
  };

  const s = SSZ.openSheet({
    title: isEdit ? '编辑转账' : '账户间转账',
    body:
      '<p class="voice-hint">从 A 账户划到 B 账户（如：银行卡取现到现金）。只改两边余额，不算收入也不算支出。</p>' +
      '<div class="amount-display"><span class="cur">¥</span>' +
      '<span class="num placeholder" id="tf-amount">0.00</span></div>' +
      '<div class="list-group">' +
      '<button class="field-row" id="tf-from" type="button"><span class="fl">转出账户</span><span class="fv" id="tf-from-name"></span></button>' +
      '<button class="field-row" id="tf-to" type="button"><span class="fl">转入账户</span><span class="fv" id="tf-to-name"></span></button>' +
      '<div class="field-row"><span class="fl">日期</span><input class="fv" type="date" id="tf-date"></div>' +
      '<div class="field-row"><span class="fl">备注</span><input class="fv" type="text" id="tf-note" placeholder="选填，如：取现" maxlength="50"></div>' +
      '</div>' +
      '<div class="keypad" id="tf-keypad"></div>' +
      '<button class="key-ok" id="tf-save" type="button">完成</button>' +
      (isEdit ? '<button class="btn btn-danger mt16" id="tf-delete" type="button">删除这笔转账</button>' : '')
  });

  const $ = function (id) { return s.body.querySelector('#' + id); };

  function renderNames() {
    const a = SSZ.accById(st.accountId), b = SSZ.accById(st.toAccountId);
    $('tf-from-name').textContent = a ? a.name + '（' + SSZ.fmt(a.balance) + '）' : '请选择';
    $('tf-to-name').textContent = b ? b.name + '（' + SSZ.fmt(b.balance) + '）' : '请选择';
  }
  function updateAmount() {
    $('tf-amount').textContent = st.amountStr || '0.00';
    $('tf-amount').classList.toggle('placeholder', !st.amountStr);
  }
  function inputKey(k) {
    if (k === 'del') st.amountStr = st.amountStr.slice(0, -1);
    else if (k === '.') { if (st.amountStr.indexOf('.') < 0) st.amountStr = (st.amountStr || '0') + '.'; }
    else {
      if (st.amountStr.indexOf('.') >= 0) {
        if ((st.amountStr.split('.')[1] || '').length >= 2) return;
      } else if (st.amountStr.replace(/[^0-9]/g, '').length >= 7) return;
      st.amountStr = st.amountStr === '0' ? k : st.amountStr + k;
    }
    updateAmount();
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  $('tf-keypad').innerHTML = keys.map(function (k) {
    return '<button class="key' + (k === '.' || k === 'del' ? ' key-fn' : '') + '" data-k="' + k + '" type="button">' +
      (k === 'del' ? '⌫' : k) + '</button>';
  }).join('');
  Array.prototype.forEach.call(s.body.querySelectorAll('.key'), function (b) {
    b.onclick = function () { inputKey(b.dataset.k); };
  });

  $('tf-from').onclick = function () {
    SSZ.pickAccount(st.accountId).then(function (id) { if (id) { st.accountId = id; renderNames(); } });
  };
  $('tf-to').onclick = function () {
    SSZ.pickAccount(st.toAccountId).then(function (id) { if (id) { st.toAccountId = id; renderNames(); } });
  };
  const dateEl = $('tf-date');
  dateEl.value = st.date;
  dateEl.onchange = function () { if (dateEl.value) st.date = dateEl.value; };
  const noteEl = $('tf-note');
  noteEl.value = st.note;
  noteEl.oninput = function () { st.note = noteEl.value; };

  $('tf-save').onclick = function () {
    const amount = SSZ.parseAmount(st.amountStr);
    if (!amount) { SSZ.toast('请输入金额', 'err'); return; }
    if (st.accountId === st.toAccountId) { SSZ.toast('转出和转入不能是同一账户', 'err'); return; }
    const payload = {
      type: 'transfer', amount: amount, categoryId: null,
      accountId: st.accountId, toAccountId: st.toAccountId,
      date: st.date, note: st.note.trim(), tags: []
    };
    if (isEdit) SSZ.updateTransaction(tx.id, payload);
    else SSZ.saveTransaction(payload);
    s.close();
    SSZ.toast(isEdit ? '已保存修改' : '转账已记录 ✓', 'ok');
    SSZ.renderCurrent();
  };

  if (isEdit) {
    $('tf-delete').onclick = function () {
      SSZ.confirm('删除这笔转账？', '两边账户余额会同步冲销', { okText: '删除', danger: true })
        .then(function (ok) {
          if (!ok) return;
          SSZ.deleteTransaction(tx.id);
          s.close();
          SSZ.toast('已删除', 'ok');
          SSZ.renderCurrent();
        });
    };
  }

  renderNames();
  updateAmount();
};
