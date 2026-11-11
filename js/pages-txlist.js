/* ============================================================
   随手账 · 全部明细页 pages-txlist.js (v1.3)
   搜索 + 多选筛选（类型/分类/账户/时间）+ 按月小结 + 按日分组
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ._txFilter = SSZ._txFilter || { q: '', type: 'all', categoryId: '', accountId: '', range: 'month' };

SSZ._filterActive = function (f) {
  return !!(f.q || (f.type && f.type !== 'all') || f.categoryId || f.accountId || f.range !== 'month');
};

SSZ.renderers['tx-list'] = function (page, params) {
  const ym = params.month || SSZ._txListMonth || SSZ.curMonth();
  SSZ._txListMonth = ym;
  SSZ.onMonthPicked = function (m) { SSZ._txListMonth = m; SSZ.renderCurrent(); };
  const f = SSZ._txFilter;

  const filterBtn = '<button class="ph-gear" id="tx-filter" type="button" aria-label="筛选">⚙️</button>';
  let html = SSZ.pageHeader('全部明细', {
    back: 'home',
    right: '<div style="display:flex;gap:8px;align-items:center">' + SSZ.monthSwitch(ym) + filterBtn + '</div>'
  });

  html +=
    '<div class="block"><div class="tx-search">' +
    '<span class="ts-ic">🔍</span>' +
    '<input id="tx-q" type="search" placeholder="搜备注 / 分类 / 账户 / 标签" value="' + SSZ.esc(f.q) + '" autocomplete="off">' +
    (f.q ? '<button class="ts-clear" id="tx-q-clear" type="button">✕</button>' : '') +
    '</div></div>';

  /* 生效中的筛选条件 chips */
  if (SSZ._filterActive(f) && f.range !== 'month') {
    html += '<div class="block" style="margin-bottom:10px"><span class="filter-note">🔎 跨月搜索：' +
      ({ '3m': '近 3 个月', year: '今年', all: '全部时间' }[f.range] || '') + '</span></div>';
  }

  html += '<div id="tx-result"></div>';
  page.innerHTML = html;

  /* 搜索框：只重绘结果区，避免输入焦点丢失 */
  const qEl = page.querySelector('#tx-q');
  qEl.oninput = function () { f.q = qEl.value; renderResult(); };
  const clear = page.querySelector('#tx-q-clear');
  if (clear) clear.onclick = function () { f.q = ''; qEl.value = ''; renderResult(); };

  page.querySelector('#tx-filter').onclick = function () { SSZ.openTxFilterSheet(ym); };

  function renderResult() {
    const box = document.getElementById('tx-result');
    if (!box) return;
    const list = SSZ.searchTransactions({
      q: f.q, type: f.type, categoryId: f.categoryId,
      accountId: f.accountId, range: f.range, month: ym
    });
    const income = list.reduce(function (s, t) { return s + (t.type === 'income' ? t.amount : 0); }, 0);
    const expense = list.reduce(function (s, t) { return s + (t.type === 'expense' ? t.amount : 0); }, 0);

    let h = '<div class="block"><div class="card" style="display:flex;padding:13px 16px;font-size:13px">' +
      '<div style="flex:1">' + (f.range === 'month' ? SSZ.monthLabel(ym) : '筛选结果') + '<br><b>' + list.length + ' 笔</b></div>' +
      '<div style="flex:1">收入<br><b style="color:var(--income)">' + SSZ.fmt(income) + '</b></div>' +
      '<div style="flex:1">支出<br><b style="color:var(--expense)">' + SSZ.fmt(expense) + '</b></div>' +
      '</div></div>';

    if (!list.length) {
      h += '<div class="card"><div class="empty"><div class="ei">🗓️</div>' +
        '<div class="et">' + (SSZ._filterActive(f) ? '没有符合条件的记录<br>换个关键词或重置筛选' : SSZ.monthLabel(ym) + '还没有记账记录') + '</div></div></div>';
    } else {
      const groups = SSZ.groupByDay(list);
      groups.forEach(function (gr) {
        const dayExpense = gr.items.reduce(function (s, t) { return s + (t.type === 'expense' ? t.amount : 0); }, 0);
        h += '<div class="tx-day"><span>' + SSZ.dateLabel(gr.date) + '</span>' +
          (dayExpense ? '<span>支 ' + SSZ.fmt(dayExpense) + '</span>' : '') + '</div>';
        gr.items.forEach(function (t) { h += SSZ.txItemHTML(t); });
      });
    }
    box.innerHTML = h;
    SSZ.bindTxItems(box);
  }

  renderResult();
};

/* ---------------- 筛选弹层 ---------------- */

SSZ.openTxFilterSheet = function (ym) {
  const f = SSZ._txFilter;
  let type = f.type, catId = f.categoryId, accId = f.accountId, range = f.range;

  const cats = SSZ.DB.categories;
  const accs = SSZ.DB.accounts.filter(function (a) { return a.active; });
  const s = SSZ.openSheet({
    title: '筛选流水',
    body:
      '<div class="vp-label" style="margin:6px 2px 8px">交易类型</div>' +
      '<div class="seg f-type" style="margin-bottom:14px">' +
      ['all', 'expense', 'income', 'transfer'].map(function (t) {
        return '<button class="seg-btn" data-t="' + t + '" type="button">' +
          ({ all: '全部', expense: '支出', income: '收入', transfer: '转账' }[t]) + '</button>';
      }).join('') + '</div>' +
      '<div class="vp-label" style="margin:6px 2px 8px">时间范围</div>' +
      '<div class="seg f-range" style="margin-bottom:14px">' +
      ['month', '3m', 'year', 'all'].map(function (t) {
        return '<button class="seg-btn" data-t="' + t + '" type="button">' +
          ({ month: '本月', '3m': '近3月', year: '今年', all: '全部' }[t]) + '</button>';
      }).join('') + '</div>' +
      '<div class="field-row"><span class="fl">分类</span><select class="fv" id="f-cat">' +
      '<option value="">全部分类</option>' +
      cats.map(function (c) { return '<option value="' + c.id + '">' + c.icon + ' ' + SSZ.esc(c.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="field-row"><span class="fl">账户</span><select class="fv" id="f-acc">' +
      '<option value="">全部账户</option>' +
      accs.map(function (a) { return '<option value="' + a.id + '">' + SSZ.esc(a.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<div class="btn-row"><button class="btn btn-ghost" id="f-reset" type="button">重置</button>' +
      '<button class="btn btn-primary" id="f-ok" type="button">应用筛选</button></div>'
  });

  function sync(cls, val) {
    Array.prototype.forEach.call(s.body.querySelectorAll(cls + ' .seg-btn'), function (b) {
      b.classList.toggle('active', b.dataset.t === val);
    });
  }
  Array.prototype.forEach.call(s.body.querySelectorAll('.f-type .seg-btn'), function (b) {
    b.onclick = function () { type = b.dataset.t; sync('.f-type', type); };
  });
  Array.prototype.forEach.call(s.body.querySelectorAll('.f-range .seg-btn'), function (b) {
    b.onclick = function () { range = b.dataset.t; sync('.f-range', range); };
  });
  s.body.querySelector('#f-cat').value = catId;
  s.body.querySelector('#f-acc').value = accId;
  sync('.f-type', type);
  sync('.f-range', range);

  s.body.querySelector('#f-reset').onclick = function () {
    SSZ._txFilter = { q: '', type: 'all', categoryId: '', accountId: '', range: 'month' };
    s.close();
    SSZ.renderCurrent();
  };
  s.body.querySelector('#f-ok').onclick = function () {
    f.type = type;
    f.categoryId = s.body.querySelector('#f-cat').value;
    f.accountId = s.body.querySelector('#f-acc').value;
    f.range = range;
    s.close();
    SSZ.renderCurrent();
  };
};
