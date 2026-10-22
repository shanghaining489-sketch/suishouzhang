/* ============================================================
   随手账 · 记账核心 tx.js
   全屏记账弹层：①支出|收入 ②选分类（最近常用置顶）③金额+日期+账户+备注+标签+数字键盘
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ._prefs = function () {
  return {
    type: localStorage.getItem('ssz.pref.type') || 'expense',
    account: localStorage.getItem('ssz.pref.account') || null
  };
};

/* ---------------- 打开记账/编辑弹层 ---------------- */

SSZ.openTxSheet = function (tx) {
  const isEdit = !!tx;
  const prefs = SSZ._prefs();
  const st = {
    isEdit: isEdit,
    id: tx ? tx.id : null,
    type: tx ? tx.type : (prefs.type === 'income' ? 'income' : 'expense'),
    categoryId: tx ? tx.categoryId : null,
    amountStr: tx ? SSZ.fmtPlain(tx.amount) : '',
    date: tx ? tx.date : SSZ.todayStr(),
    accountId: tx ? tx.accountId : null,
    note: tx ? (tx.note || '') : '',
    tags: tx ? (tx.tags || []).join(', ') : ''
  };
  if (!st.accountId) {
    const a = SSZ.accById(prefs.account && prefs.account) || SSZ.DB.accounts.find(function (x) { return x.active; });
    st.accountId = a ? a.id : null;
  }
  SSZ._txState = st;

  const s = SSZ.openSheet({
    title: isEdit ? '编辑记账' : '记一笔',
    body:
      '<div class="seg tx-type-wrap">' +
      '<button class="seg-btn" data-t="expense" type="button">支出</button>' +
      '<button class="seg-btn" data-t="income" type="button">收入</button>' +
      '</div>' +
      '<div class="amount-display">' +
      '<span class="cur">¥</span>' +
      '<span class="num placeholder" id="tx-amount">0.00</span>' +
      '</div>' +
      '<div id="tx-cat-wrap"></div>' +
      '<div class="list-group">' +
      '<div class="field-row"><span class="fl">日期</span><input class="fv" type="date" id="tx-date"></div>' +
      '<button class="field-row" id="tx-account-row" type="button"><span class="fl">账户</span><span class="fv" id="tx-account-name"></span></button>' +
      '<div class="field-row"><span class="fl">备注</span><input class="fv" type="text" id="tx-note" placeholder="选填，如：午饭" maxlength="50"></div>' +
      '<div class="field-row"><span class="fl">标签</span><input class="fv" type="text" id="tx-tags" placeholder="选填，逗号分隔" maxlength="60"></div>' +
      '</div>' +
      '<div class="keypad" id="tx-keypad"></div>' +
      '<button class="key-ok" id="tx-save" type="button">完成</button>' +
      (isEdit ? '<button class="btn btn-danger mt16" id="tx-delete" type="button">删除这笔</button>' : '')
  });

  const $ = function (id) { return s.body.querySelector('#' + id); };

  /* --- 分类区渲染 --- */
  function renderCats() {
    const cats = SSZ.DB.categories.filter(function (c) { return c.type === st.type; });
    const recents = SSZ.DB.recents.filter(function (id) {
      return cats.some(function (c) { return c.id === id; });
    }).slice(0, 6);
    if (!st.categoryId || !cats.some(function (c) { return c.id === st.categoryId; })) {
      st.categoryId = (recents[0] || (cats[0] && cats[0].id)) || null;
    }
    let html = '';
    if (recents.length) html += '<div class="cat-sub">最近常用</div>';
    html += '<div class="cat-grid">';
    const order = recents.concat(cats.filter(function (c) { return recents.indexOf(c.id) < 0; }).map(function (c) { return c.id; }));
    order.forEach(function (id) {
      const c = SSZ.catById(id);
      if (!c) return;
      const cls = 'cat-cell' + (id === st.categoryId ? ' active' : '') + (recents.indexOf(id) >= 0 ? ' recent' : '');
      html += '<button class="' + cls + '" data-id="' + id + '" type="button">' +
        '<span class="cat-ic">' + c.icon + '</span>' + SSZ.esc(c.name) + '</button>';
    });
    html += '</div>';
    $('tx-cat-wrap').innerHTML = html;
    Array.prototype.forEach.call(s.body.querySelectorAll('.cat-cell'), function (b) {
      b.onclick = function () {
        st.categoryId = b.dataset.id;
        Array.prototype.forEach.call(s.body.querySelectorAll('.cat-cell'), function (x) {
          x.classList.toggle('active', x.dataset.id === st.categoryId);
        });
      };
    });
  }

  /* --- 金额显示 --- */
  function updateAmount() {
    const el = $('tx-amount');
    el.textContent = st.amountStr || '0.00';
    el.classList.toggle('placeholder', !st.amountStr);
  }

  /* --- 数字键盘 --- */
  function buildKeypad() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
    let html = '';
    keys.forEach(function (k) {
      const label = k === 'del' ? '⌫' : k;
      const cls = 'key' + (k === '.' || k === 'del' ? ' key-fn' : '');
      html += '<button class="' + cls + '" data-k="' + k + '" type="button">' + label + '</button>';
    });
    $('tx-keypad').innerHTML = html;
    Array.prototype.forEach.call(s.body.querySelectorAll('.key'), function (b) {
      b.onclick = function () { inputKey(b.dataset.k); };
    });
  }

  function inputKey(k) {
    if (k === 'del') {
      st.amountStr = st.amountStr.slice(0, -1);
    } else if (k === '.') {
      if (st.amountStr.indexOf('.') < 0) st.amountStr = (st.amountStr || '0') + '.';
    } else {
      if (st.amountStr.indexOf('.') >= 0) {
        const dec = st.amountStr.split('.')[1] || '';
        if (dec.length >= 2) return; // 最多两位小数
      } else if (st.amountStr.replace(/[^0-9]/g, '').length >= 7) {
        return; // 整数最多 7 位
      }
      st.amountStr = (st.amountStr === '0') ? k : st.amountStr + k;
    }
    updateAmount();
  }

  /* --- 账户名显示 --- */
  function renderAccount() {
    const a = SSZ.accById(st.accountId);
    $('tx-account-name').textContent = a ? a.name + '（' + SSZ.fmt(a.balance) + '）' : '请先添加账户';
  }

  /* --- 类型切换 --- */
  Array.prototype.forEach.call(s.body.querySelectorAll('.seg-btn'), function (b) {
    b.onclick = function () {
      st.type = b.dataset.t;
      Array.prototype.forEach.call(s.body.querySelectorAll('.seg-btn'), function (x) {
        x.classList.toggle('active', x === b);
      });
      renderCats();
    };
  });

  /* --- 日期 / 账户 / 备注 / 标签 --- */
  const dateEl = $('tx-date');
  dateEl.value = st.date;
  dateEl.onchange = function () { if (dateEl.value) st.date = dateEl.value; };

  $('tx-account-row').onclick = function () {
    SSZ.pickAccount(st.accountId).then(function (id) {
      if (id) { st.accountId = id; renderAccount(); }
    });
  };

  const noteEl = $('tx-note');
  noteEl.value = st.note;
  noteEl.oninput = function () { st.note = noteEl.value; };

  const tagsEl = $('tx-tags');
  tagsEl.value = st.tags;
  tagsEl.oninput = function () { st.tags = tagsEl.value; };

  /* --- 保存 --- */
  function save() {
    const amount = SSZ.parseAmount(st.amountStr);
    if (!amount) { SSZ.toast('请先输入金额'); return; }
    if (!st.categoryId) { SSZ.toast('请选择分类'); return; }
    if (!st.accountId) { SSZ.toast('请先到账户页添加一个账户'); return; }
    const tags = st.tags.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    const payload = {
      type: st.type, amount: amount, categoryId: st.categoryId,
      accountId: st.accountId, date: st.date, note: st.note.trim(), tags: tags
    };
    if (st.isEdit) SSZ.updateTransaction(st.id, payload);
    else SSZ.saveTransaction(payload);
    localStorage.setItem('ssz.pref.type', st.type);
    localStorage.setItem('ssz.pref.account', st.accountId);
    s.close();
    SSZ.toast(st.isEdit ? '已保存修改' : '已记一笔 ✓', 'ok');
    SSZ.renderCurrent();
  }

  $('tx-save').onclick = save;

  /* --- 编辑模式：删除 --- */
  if (isEdit) {
    $('tx-delete').onclick = function () {
      SSZ.confirm('删除这笔记账？', '删除后账户余额会同步冲销，此操作不可恢复', { okText: '删除', danger: true })
        .then(function (ok) {
          if (!ok) return;
          SSZ.deleteTransaction(st.id);
          s.close();
          SSZ.toast('已删除', 'ok');
          SSZ.renderCurrent();
        });
    };
  }

  /* --- 初始化 --- */
  Array.prototype.forEach.call(s.body.querySelectorAll('.seg-btn'), function (b) {
    b.classList.toggle('active', b.dataset.t === st.type);
  });
  renderCats();
  updateAmount();
  buildKeypad();
  renderAccount();
};

/* ---------------- 账户选择器 ---------------- */

SSZ.pickAccount = function (cur) {
  return new Promise(function (resolve) {
    const accs = SSZ.DB.accounts.filter(function (a) { return a.active; });
    if (!accs.length) {
      SSZ.toast('还没有可用账户，请先添加', 'err');
      resolve(null);
      return;
    }
    let html = '<div class="cat-grid">';
    accs.forEach(function (a) {
      const cls = 'cat-cell' + (a.id === cur ? ' active' : '');
      html += '<button class="' + cls + '" data-id="' + a.id + '" type="button">' +
        '<span class="cat-ic">' + a.icon + '</span>' + SSZ.esc(a.name) + '</button>';
    });
    html += '</div>';
    const s = SSZ.openSheet({ title: '选择账户', body: html });
    Array.prototype.forEach.call(s.body.querySelectorAll('.cat-cell'), function (b) {
      b.onclick = function () { s.close(); resolve(b.dataset.id); };
    });
    s.onClose = function () { resolve(null); };
  });
};
