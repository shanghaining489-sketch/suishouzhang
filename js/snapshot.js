/* ============================================================
   随手账 · 快照与重置 snapshot.js
   - 快照：把某一时刻的全部数据存成本机时间点，随时可回滚
   - 重置：清空测试数据 / 恢复出厂；重置前自动打快照兜底
   - 快照独立存 localStorage('ssz.snapshots')，不进 DB，不影响备份导出
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.SNAP_KEY = 'ssz.snapshots';
SSZ.SNAP_MAX = 6;                      // 最多保留几个快照
SSZ.SNAP_BUDGET = 2.5 * 1024 * 1024;   // 快照总占用上限（UTF-16 双字节口径）

/* ---------------- 底层读写 ---------------- */

SSZ._snapList = function () {
  try {
    const raw = localStorage.getItem(SSZ.SNAP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
};

SSZ._snapWrite = function (list) {
  try {
    localStorage.setItem(SSZ.SNAP_KEY, JSON.stringify(list));
    return true;
  } catch (e) { return false; }   // 容量不足
};

SSZ._bytes = function (obj) {
  try { return JSON.stringify(obj).length * 2; } catch (e) { return 0; }
};

SSZ._snapKb = function (b) { return ((b || 0) / 1024).toFixed(1) + ' KB'; };

SSZ._snapTime = function (iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || '';
  return (d.getMonth() + 1) + '-' + SSZ.pad2(d.getDate()) + ' ' +
    SSZ.pad2(d.getHours()) + ':' + SSZ.pad2(d.getMinutes());
};

/* 当前全量数据（快照与备份同构） */
SSZ.snapshotPayload = function () {
  const db = SSZ.DB;
  return {
    meta: db.meta,
    categories: db.categories, accounts: db.accounts, transactions: db.transactions,
    budgets: db.budgets, goals: db.goals, recurring: db.recurring, recents: db.recents,
    rules: db.rules || [], templates: db.templates || [],
    settings: db.settings || { theme: 'auto' }
  };
};

/* ---------------- 创建 / 删除 ---------------- */

// label 为空时按「手动」记；auto=true 标记为系统自动点
SSZ.takeSnapshot = function (label, auto) {
  // 先序列化一次拿到独立副本：直接存对象引用的话，
  // 之后记账改动账户余额会连快照一起改掉，回滚就废了
  let json = '';
  try {
    json = JSON.stringify(SSZ.snapshotPayload());
  } catch (e) {
    return { ok: false, reason: '数据无法序列化，快照没建成' };
  }
  const payload = JSON.parse(json);
  const item = {
    id: SSZ.uid('s'),
    at: new Date().toISOString(),
    label: String(label || '').trim().slice(0, 20) || (auto ? '自动' : '手动'),
    auto: !!auto,
    count: payload.transactions.length,
    bytes: json.length * 2,
    data: payload
  };
  if (item.bytes > SSZ.SNAP_BUDGET) {
    return { ok: false, reason: '数据量超过 2.5MB，快照装不下，请改用导出备份' };
  }
  const list = SSZ._snapList();   // [0] 最新 → 末位最旧
  while (list.length >= SSZ.SNAP_MAX) list.pop();
  let total = list.reduce(function (s, x) { return s + (x.bytes || 0); }, 0);
  while (list.length && total + item.bytes > SSZ.SNAP_BUDGET) {
    total -= (list[list.length - 1].bytes || 0);
    list.pop();
  }
  list.unshift(item);
  if (!SSZ._snapWrite(list)) {
    return { ok: false, reason: '浏览器存储空间不足，快照没建成' };
  }
  return { ok: true, item: item, dropped: list.length };
};

SSZ.deleteSnapshot = function (id) {
  const list = SSZ._snapList().filter(function (x) { return x.id !== id; });
  SSZ._snapWrite(list);
};

SSZ.clearSnapshots = function () {
  try { localStorage.removeItem(SSZ.SNAP_KEY); } catch (e) { /* 忽略 */ }
};

SSZ.snapshotTotal = function () {
  return SSZ._snapList().reduce(function (s, x) { return s + (x.bytes || 0); }, 0);
};

/* ---------------- 回滚 ---------------- */

SSZ.restoreSnapshot = function (id) {
  const item = SSZ._snapList().find(function (x) { return x.id === id; });
  if (!item || !item.data) return false;
  const d = item.data;
  // 先给「当前状态」留一个点：万一恢复的不是想要的，还能再回来
  SSZ.takeSnapshot('恢复前自动', true);
  SSZ.applySnapshotData(d);
  return true;
};

// 把一份快照/备份数据写回 DB 并落盘
SSZ.applySnapshotData = function (d) {
  const db = SSZ.DB;
  db.meta = d.meta || db.meta;
  db.categories = d.categories || db.categories;
  db.accounts = d.accounts || db.accounts;
  db.transactions = d.transactions || [];
  db.budgets = d.budgets || [];
  db.goals = d.goals || [];
  db.recurring = d.recurring || [];
  db.recents = d.recents || [];
  db.rules = d.rules || [];
  db.templates = d.templates || [];
  db.settings = d.settings || { theme: 'auto' };
  SSZ.persistNow();
  SSZ.applyTheme();
};

/* ---------------- 重置 ---------------- */

// 清空账目：流水/预算/目标/定期账全清、账户余额归零，分类与账户保留
SSZ.resetTransactions = function () {
  SSZ.takeSnapshot('重置前自动', true);
  const db = SSZ.DB;
  db.transactions = [];
  db.budgets = [];
  db.goals = [];
  db.recurring = [];
  db.recents = [];
  db.accounts.forEach(function (a) { a.balance = a.initialBalance || 0; });
  SSZ.persistNow();
};

// 恢复出厂：回到默认分类 + 默认账户 + 全空，连规则模板主题一起还原
SSZ.resetFactory = function () {
  SSZ.takeSnapshot('重置前自动', true);
  const db = SSZ.DB;
  db.meta = { v: 1, createdAt: SSZ.todayStr(), lastBackup: null };
  db.categories = SSZ.defaultCategories();
  db.accounts = SSZ.defaultAccounts();
  db.transactions = [];
  db.budgets = [];
  db.goals = [];
  db.recurring = [];
  db.recents = [];
  db.rules = [];
  db.templates = [];
  db.settings = { theme: 'auto' };
  SSZ.persistNow();
  SSZ.applyTheme();
  // 上次记账的偏好也清掉，避免沿用测试时的类型/账户
  try {
    localStorage.removeItem('ssz.pref.type');
    localStorage.removeItem('ssz.pref.account');
    localStorage.removeItem('ssz.rollback');
  } catch (e) { /* 忽略 */ }
};

/* ---------------- 页面：快照与回滚 ---------------- */

SSZ.renderers.snapshots = function (page) {
  const list = SSZ._snapList();
  const totalKb = (SSZ.snapshotTotal() / 1024).toFixed(1);

  let html = SSZ.pageHeader('快照与回滚', { back: 'mine' });

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div class="card-h">📸 时间点快照</div>' +
    '<div class="tiny muted" style="line-height:1.7">给当前数据存一个还原点。发现记错、导错、改乱了，' +
    '回到任意一个快照就行。快照只存本机，最多保留 ' + SSZ.SNAP_MAX + ' 个，超出自动淘汰最旧的。</div>' +
    '<button class="btn btn-primary mt16" id="snap-add" type="button">＋ 立即创建快照</button>' +
    '<div class="tiny muted mt8" style="text-align:center">已用 ' + totalKb + ' KB · 共 ' + list.length + ' 个</div>' +
    '</div></div>';

  html += '<div class="block">';
  if (!list.length) {
    html += '<div class="empty"><div class="ei">🕳️</div><div class="et">还没有快照</div>' +
      '<div class="tiny muted">点上面「立即创建快照」存第一个还原点</div></div>';
  } else {
    html += '<div class="list-group">';
    list.forEach(function (s, i) {
      html += '<div class="snap-item">' +
        '<div class="snap-info">' +
        '<div class="snap-t">' + SSZ._snapTime(s.at) +
        (i === 0 ? '<span class="snap-tag">最新</span>' : '') +
        (s.auto ? '<span class="snap-tag auto">自动</span>' : '') +
        '</div>' +
        '<div class="snap-s">' + SSZ.esc(s.label) + ' · ' + (s.count || 0) + ' 笔 · ' + SSZ._snapKb(s.bytes) + '</div>' +
        '</div>' +
        '<button class="snap-btn" data-act="restore" data-id="' + s.id + '" type="button">恢复</button>' +
        '<button class="snap-del" data-act="del" data-id="' + s.id + '" type="button" aria-label="删除">✕</button>' +
        '</div>';
    });
    html += '</div>';
    html += '<button class="btn btn-ghost mt16" id="snap-clear" type="button">清空全部快照</button>';
  }
  html += '</div>';

  html += '<div class="fab-hint">快照占用浏览器存储，不参与「导出备份」</div>';

  page.innerHTML = html;

  /* 新建 */
  page.querySelector('#snap-add').onclick = function () {
    const s = SSZ.openSheet({
      title: '创建快照',
      body:
        '<div class="tiny muted" style="line-height:1.7;margin-bottom:12px">可以写一句备注，方便以后认出来，比如「正式开账前」「导入账单前」。</div>' +
        '<input class="snap-input" id="snap-label" type="text" placeholder="备注（选填）" maxlength="20">' +
        '<button class="btn btn-primary mt16" id="snap-ok" type="button">创建快照</button>'
    });
    const inp = s.body.querySelector('#snap-label');
    s.body.querySelector('#snap-ok').onclick = function () {
      const r = SSZ.takeSnapshot(inp.value, false);
      s.close();
      if (!r.ok) { SSZ.toast(r.reason, 'err'); return; }
      SSZ.toast('快照已创建', 'ok');
      SSZ.renderCurrent();
    };
    setTimeout(function () { inp.focus(); }, 100);
  };

  /* 恢复 / 删除 */
  Array.prototype.forEach.call(page.querySelectorAll('[data-act]'), function (b) {
    b.onclick = function () {
      const id = b.dataset.id;
      if (b.dataset.act === 'del') {
        SSZ.confirm('删除这个快照？', '删掉后无法再从这个时间点恢复。', { okText: '删除', danger: true })
          .then(function (ok) {
            if (!ok) return;
            SSZ.deleteSnapshot(id);
            SSZ.toast('已删除', 'ok');
            SSZ.renderCurrent();
          });
        return;
      }
      const item = SSZ._snapList().find(function (x) { return x.id === id; });
      if (!item) { SSZ.toast('快照不存在', 'err'); return; }
      SSZ.confirm('恢复到 ' + SSZ._snapTime(item.at) + ' 的数据？',
        '当前 ' + SSZ.DB.transactions.length + ' 笔流水会被替换成快照里的 ' + (item.count || 0) + ' 笔。' +
        '恢复前会先自动存一个「恢复前自动」快照，点错了还能再回来。',
        { okText: '恢复' }).then(function (ok) {
          if (!ok) return;
          const done = SSZ.restoreSnapshot(id);
          if (!done) { SSZ.toast('恢复失败', 'err'); return; }
          SSZ.toast('已恢复到该时间点', 'ok');
          SSZ.navigate('home');
        });
    };
  });

  /* 清空全部 */
  const clearBtn = page.querySelector('#snap-clear');
  if (clearBtn) {
    clearBtn.onclick = function () {
      SSZ.confirm('清空全部快照？', '所有还原点都会被删掉，之后无法从这些时间点恢复。', { okText: '全部清空', danger: true })
        .then(function (ok) {
          if (!ok) return;
          SSZ.clearSnapshots();
          SSZ.toast('已清空快照', 'ok');
          SSZ.renderCurrent();
        });
    };
  }
};

/* ---------------- 页面：重置数据 ---------------- */

SSZ.renderers.reset = function (page) {
  const txCount = SSZ.DB.transactions.length;
  const snapCount = SSZ._snapList().length;

  let html = SSZ.pageHeader('重置数据', { back: 'mine' });

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div class="card-h">🧹 清空账目数据</div>' +
    '<div class="tiny muted" style="line-height:1.7">删掉全部流水、预算、存钱目标、定期记账，账户余额归零；' +
    '<b>分类、账户、自动规则、常用模板都保留</b>。测试记账用完了，走这个最省事。</div>' +
    '<div class="tiny muted mt8">当前共 <b>' + txCount + '</b> 笔流水</div>' +
    '<button class="btn btn-danger mt16" id="rs-clear" type="button">清空账目数据</button>' +
    '</div></div>';

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div class="card-h">♻️ 恢复出厂设置</div>' +
    '<div class="tiny muted" style="line-height:1.7">全部回到初始状态：默认 10 个支出 + 6 个收入分类、5 个账户、' +
    '零流水、零规则、零模板，外观恢复跟随系统。等于装了一个全新的随手账。</div>' +
    '<button class="btn btn-danger mt16" id="rs-factory" type="button">恢复出厂设置</button>' +
    '</div></div>';

  html +=
    '<div class="block"><div class="card card-pad safe-note">' +
    '<b>🛡️ 不会真的丢数据</b>' +
    '<div class="tiny muted" style="line-height:1.7;margin-top:6px">' +
    '每次重置前都会自动创建一个「重置前自动」快照（现有 ' + snapCount + ' 个）。' +
    '点错了去「快照与回滚」恢复即可。但快照只在本机浏览器里，装不下超过 2.5MB，' +
    '所以正式数据还是建议定期导出备份。</div>' +
    '</div></div>';

  page.innerHTML = html;

  page.querySelector('#rs-clear').onclick = function () {
    SSZ.confirm('清空账目数据？',
      '会删除 ' + txCount + ' 笔流水、预算、目标和定期账，账户余额归零。分类和账户保留。' +
      '重置前会自动创建快照，可在「快照与回滚」恢复。',
      { okText: '清空', danger: true }).then(function (ok) {
        if (!ok) return;
        SSZ.resetTransactions();
        SSZ.toast('已清空账目，可以正式用了', 'ok');
        SSZ.navigate('home');
      });
  };

  page.querySelector('#rs-factory').onclick = function () {
    SSZ.confirm('恢复出厂设置？',
      '所有流水、分类、账户、规则、模板、设置都会回到初始状态。' +
      '重置前会自动创建快照，可在「快照与回滚」恢复。',
      { okText: '恢复出厂', danger: true }).then(function (ok) {
        if (!ok) return;
        // 二次确认：这一步破坏面最大
        SSZ.confirm('再确认一次',
          '这是彻底重置，除了快照之外什么都留不下。确定继续？',
          { okText: '确定重置', danger: true }).then(function (ok2) {
            if (!ok2) return;
            SSZ.resetFactory();
            SSZ.toast('已恢复出厂设置', 'ok');
            SSZ.navigate('home');
          });
      });
  };
};
