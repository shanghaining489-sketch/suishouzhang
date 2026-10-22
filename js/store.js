/* ============================================================
   随手账 · 数据层 store.js
   - 全量数据存 localStorage（统一前缀 ssz.），无后端无账号
   - 金额一律整数「分」，仅展示层 ÷100，杜绝浮点误差
   - 日期一律本地 'YYYY-MM-DD' 字符串，禁 new Date('YYYY-MM-DD')（UTC 坑）
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.KEYS = {
  meta: 'ssz.meta',
  categories: 'ssz.categories',
  accounts: 'ssz.accounts',
  transactions: 'ssz.transactions',
  budgets: 'ssz.budgets',
  goals: 'ssz.goals',
  recurring: 'ssz.recurring',
  recents: 'ssz.recents'
};

SSZ.VERSION = '1.0.0';

/* ---------------- 基础工具 ---------------- */

// ID 生成（不用 crypto.randomUUID：http 非安全上下文不可用）
SSZ.uid = function (p) {
  return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

SSZ.pad2 = function (n) { return String(n).padStart(2, '0'); };

// y/m/d → 'YYYY-MM-DD'（m 为 1-12）
SSZ.ymd = function (y, m, d) { return y + '-' + SSZ.pad2(m) + '-' + SSZ.pad2(d); };

SSZ.todayStr = function () {
  const t = new Date();
  return SSZ.ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
};

// 'YYYY-MM-DD' → 本地 Date（禁 new Date('YYYY-MM-DD')）
SSZ.parseYmd = function (s) {
  const p = s.split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
};

SSZ.daysInMonth = function (y, m) { return new Date(y, m, 0).getDate(); }; // m:1-12

SSZ.monthKey = function (ds) { return ds.slice(0, 7); };
SSZ.curMonth = function () { return SSZ.todayStr().slice(0, 7); };

// 'YYYY-MM' ± n 个月
SSZ.addMonths = function (ym, n) {
  const p = ym.split('-');
  let y = Number(p[0]), m = Number(p[1]) + n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return y + '-' + SSZ.pad2(m);
};

SSZ.monthLabel = function (ym) {
  const p = ym.split('-');
  return p[0] + '年' + Number(p[1]) + '月';
};

// 日期 → 今天/昨天/N天前/M月D日
SSZ.dateLabel = function (ds) {
  const today = SSZ.todayStr();
  if (ds === today) return '今天';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (ds === SSZ.ymd(y.getFullYear(), y.getMonth() + 1, y.getDate())) return '昨天';
  const d = SSZ.parseYmd(ds);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return (sameYear ? '' : d.getFullYear() + '年') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
};

// 分 → '¥1,234.56'
SSZ.fmt = function (cents) {
  const neg = cents < 0;
  const s = (Math.abs(cents) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (neg ? '-¥' : '¥') + s;
};

// 分 → '1234.56'（输入框场景）
SSZ.fmtPlain = function (cents) { return (Math.abs(cents) / 100).toFixed(2); };

// '1.5' / '12' → 150 / 1200（分）
SSZ.parseAmount = function (s) {
  const v = parseFloat(s);
  if (!isFinite(v) || v <= 0) return 0;
  return Math.round(v * 100);
};

SSZ.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

/* ---------------- 默认数据 ---------------- */

SSZ.defaultCategories = function () {
  const exp = [
    ['餐饮', '🍚'], ['交通', '🚌'], ['购物', '🛒'], ['居住', '🏠'],
    ['娱乐', '🎮'], ['医疗', '💊'], ['人情', '🎁'], ['学习', '📚'],
    ['通讯', '📱'], ['其他', '📦']
  ];
  const inc = [
    ['工资', '💰'], ['奖金', '🧧'], ['兼职', '💼'], ['理财', '📈'],
    ['红包', '🧨'], ['其他', '📦']
  ];
  const cats = [];
  exp.forEach(function (c) { cats.push({ id: SSZ.uid('c'), name: c[0], icon: c[1], type: 'expense', builtin: true }); });
  inc.forEach(function (c) { cats.push({ id: SSZ.uid('c'), name: c[0], icon: c[1], type: 'income', builtin: true }); });
  return cats;
};

SSZ.defaultAccounts = function () {
  const list = [
    ['现金', 'cash', '💵'], ['微信', 'wechat', '💬'], ['支付宝', 'alipay', '💰'],
    ['银行卡', 'bank', '🏦'], ['信用卡', 'credit', '💳']
  ];
  return list.map(function (a) {
    return { id: SSZ.uid('a'), name: a[0], type: a[1], icon: a[2], balance: 0, initialBalance: 0, active: true };
  });
};

/* ---------------- 读写与迁移 ---------------- */

SSZ.readJSON = function (key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[随手账] 数据损坏，已重置该键：', key, e);
    return null;
  }
};

// 数据迁移框架：以后任何结构变更，在这里加 case + meta.v +1
SSZ.migrate = function (db) {
  switch (db.meta.v) {
    case 1:
      // 当前版本，无需迁移
      break;
    default:
      db.meta.v = 1;
  }
};

SSZ.loadAll = function () {
  const db = {};
  let meta = SSZ.readJSON(SSZ.KEYS.meta);
  if (!meta || typeof meta.v !== 'number') meta = { v: 1, createdAt: SSZ.todayStr(), lastBackup: null };
  db.meta = meta;
  SSZ.migrate(db);

  db.categories = SSZ.readJSON(SSZ.KEYS.categories) || SSZ.defaultCategories();
  db.accounts = SSZ.readJSON(SSZ.KEYS.accounts) || SSZ.defaultAccounts();
  db.transactions = SSZ.readJSON(SSZ.KEYS.transactions) || [];
  db.budgets = SSZ.readJSON(SSZ.KEYS.budgets) || [];
  db.goals = SSZ.readJSON(SSZ.KEYS.goals) || [];
  db.recurring = SSZ.readJSON(SSZ.KEYS.recurring) || [];
  db.recents = SSZ.readJSON(SSZ.KEYS.recents) || [];
  SSZ.DB = db;
  return db;
};

SSZ.persistNow = function () {
  const db = SSZ.DB;
  try {
    localStorage.setItem(SSZ.KEYS.meta, JSON.stringify(db.meta));
    localStorage.setItem(SSZ.KEYS.categories, JSON.stringify(db.categories));
    localStorage.setItem(SSZ.KEYS.accounts, JSON.stringify(db.accounts));
    localStorage.setItem(SSZ.KEYS.transactions, JSON.stringify(db.transactions));
    localStorage.setItem(SSZ.KEYS.budgets, JSON.stringify(db.budgets));
    localStorage.setItem(SSZ.KEYS.goals, JSON.stringify(db.goals));
    localStorage.setItem(SSZ.KEYS.recurring, JSON.stringify(db.recurring));
    localStorage.setItem(SSZ.KEYS.recents, JSON.stringify(db.recents));
  } catch (e) {
    console.error('[随手账] 保存失败', e);
    if (SSZ.toast) SSZ.toast('存储空间不足，请先导出备份再清理旧数据', 'err');
  }
};

// 页面隐藏前确保落盘
window.addEventListener('pagehide', function () { if (SSZ.DB) SSZ.persistNow(); });

/* ---------------- 查询 ---------------- */

SSZ.catById = function (id) { return SSZ.DB.categories.find(function (c) { return c.id === id; }); };
SSZ.accById = function (id) { return SSZ.DB.accounts.find(function (a) { return a.id === id; }); };
SSZ.catName = function (id) { const c = SSZ.catById(id); return c ? c.name : '未分类'; };
SSZ.catIcon = function (id) { const c = SSZ.catById(id); return c ? c.icon : '📦'; };
SSZ.accName = function (id) { const a = SSZ.accById(id); return a ? a.name : '未知账户'; };

// 某月收支统计（整数分）
SSZ.monthStats = function (ym) {
  let income = 0, expense = 0;
  const byCat = {};
  const txs = SSZ.DB.transactions;
  for (let i = 0; i < txs.length; i++) {
    const t = txs[i];
    if (t.date.slice(0, 7) !== ym) continue;
    if (t.type === 'income') income += t.amount;
    else {
      expense += t.amount;
      byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
    }
  }
  return { income: income, expense: expense, byCat: byCat, balance: income - expense };
};

SSZ.getBudget = function (ym) {
  return SSZ.DB.budgets.find(function (b) { return b.month === ym; }) || null;
};

SSZ.netWorth = function () {
  return SSZ.DB.accounts.filter(function (a) { return a.active; })
    .reduce(function (s, a) { return s + a.balance; }, 0);
};

SSZ.assetsLiabilities = function () {
  let assets = 0, liab = 0;
  SSZ.DB.accounts.forEach(function (a) {
    if (!a.active) return;
    if (a.balance >= 0) assets += a.balance; else liab += -a.balance;
  });
  return { assets: assets, liabilities: liab };
};

// 最近交易（倒序，可选条数）
SSZ.recentTx = function (n) {
  const arr = SSZ.DB.transactions.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return n ? arr.slice(0, n) : arr;
};

// 按日期倒序分组的交易
SSZ.groupByDay = function (list) {
  const groups = [];
  let cur = null;
  list.forEach(function (t) {
    if (!cur || cur.date !== t.date) { cur = { date: t.date, items: [] }; groups.push(cur); }
    cur.items.push(t);
  });
  return groups;
};

SSZ.pushRecent = function (catId) {
  const arr = SSZ.DB.recents.filter(function (id) { return id !== catId; });
  arr.unshift(catId);
  SSZ.DB.recents = arr.slice(0, 8);
};

/* ---------------- 交易增删改 ---------------- */

// 新增一笔（余额联动 + recents + 预算检查）
SSZ.saveTransaction = function (tx) {
  const db = SSZ.DB;
  const rec = {
    id: SSZ.uid('t'),
    createdAt: Date.now(),
    type: tx.type,
    amount: tx.amount,
    categoryId: tx.categoryId,
    accountId: tx.accountId,
    date: tx.date,
    note: tx.note || '',
    tags: tx.tags || []
  };
  db.transactions.push(rec);
  const acc = SSZ.accById(rec.accountId);
  if (acc) acc.balance += (rec.type === 'income' ? rec.amount : -rec.amount);
  SSZ.pushRecent(rec.categoryId);
  SSZ.persistNow();
  if (rec.type === 'expense') SSZ.checkBudgetAlert(rec);
  return rec;
};

// 删除一笔（反向冲销余额）
SSZ.deleteTransaction = function (id) {
  const db = SSZ.DB;
  const idx = db.transactions.findIndex(function (t) { return t.id === id; });
  if (idx < 0) return false;
  const tx = db.transactions[idx];
  const acc = SSZ.accById(tx.accountId);
  if (acc) acc.balance -= (tx.type === 'income' ? tx.amount : -tx.amount);
  db.transactions.splice(idx, 1);
  SSZ.persistNow();
  return true;
};

// 修改一笔 = 删旧 + 增新（保留 id 与 createdAt）
SSZ.updateTransaction = function (id, patch) {
  const old = SSZ.DB.transactions.find(function (t) { return t.id === id; });
  if (!old) return null;
  SSZ.deleteTransaction(id);
  const rec = SSZ.saveTransaction(Object.assign({}, old, patch));
  rec.id = id;
  rec.createdAt = old.createdAt;
  return rec;
};

// 余额校正：initialBalance + 全量交易重算（修复漂移的兜底）
SSZ.correctBalances = function () {
  SSZ.DB.accounts.forEach(function (a) { a.balance = a.initialBalance; });
  SSZ.DB.transactions.forEach(function (t) {
    const acc = SSZ.accById(t.accountId);
    if (acc) acc.balance += (t.type === 'income' ? t.amount : -t.amount);
  });
  SSZ.persistNow();
};

/* ---------------- 预算 ---------------- */

// 保存/更新某月预算（total 单位分；byCategory: {catId: limit}）
SSZ.setBudget = function (ym, total, byCategory) {
  let b = SSZ.getBudget(ym);
  if (!b) {
    b = { month: ym, total: 0, byCategory: {} };
    SSZ.DB.budgets.push(b);
  }
  b.total = total || 0;
  b.byCategory = byCategory || {};
  SSZ.persistNow();
};

// 某月总预算已用/剩余
SSZ.budgetStatus = function (ym) {
  const b = SSZ.getBudget(ym);
  const st = SSZ.monthStats(ym);
  if (!b || !b.total) return { set: false, total: 0, used: st.expense, left: 0, pct: 0 };
  const left = b.total - st.expense;
  return {
    set: true, total: b.total, used: st.expense, left: left,
    pct: b.total > 0 ? Math.round(st.expense / b.total * 100) : 0
  };
};

// 保存支出后检查是否跨过超支阈值（只报实际，不预测）
SSZ.checkBudgetAlert = function (tx) {
  const ym = tx.date.slice(0, 7);
  const b = SSZ.getBudget(ym);
  if (!b) return;
  const st = SSZ.monthStats(ym);
  const crossed = [];
  if (b.total > 0 && st.expense - tx.amount <= b.total && st.expense > b.total) crossed.push('本月总预算');
  const catLimit = b.byCategory && b.byCategory[tx.categoryId];
  if (catLimit > 0) {
    const used = st.byCat[tx.categoryId] || 0;
    if (used - tx.amount <= catLimit && used > catLimit) crossed.push('「' + SSZ.catName(tx.categoryId) + '」分类预算');
  }
  if (crossed.length && SSZ.toast) SSZ.toast('⚠️ ' + crossed.join('、') + '已超支');
};

/* ---------------- 分类管理 ---------------- */

SSZ.addCategory = function (name, icon, type) {
  const c = { id: SSZ.uid('c'), name: name, icon: icon || '📦', type: type, builtin: false };
  SSZ.DB.categories.push(c);
  SSZ.persistNow();
  return c;
};

SSZ.updateCategory = function (id, patch) {
  const c = SSZ.catById(id);
  if (!c) return;
  Object.assign(c, patch);
  SSZ.persistNow();
};

// 删除分类：内置不可删；被引用过的分类禁止删（先无引用才允许）
SSZ.canDeleteCategory = function (id) {
  const c = SSZ.catById(id);
  if (!c || c.builtin) return { ok: false, reason: '内置分类不可删除' };
  const used = SSZ.DB.transactions.some(function (t) { return t.categoryId === id; });
  if (used) return { ok: false, reason: '该分类下已有记账记录，不能删除' };
  return { ok: true };
};

SSZ.deleteCategory = function (id) {
  const chk = SSZ.canDeleteCategory(id);
  if (!chk.ok) { if (SSZ.toast) SSZ.toast(chk.reason, 'err'); return false; }
  const idx = SSZ.DB.categories.findIndex(function (c) { return c.id === id; });
  if (idx >= 0) SSZ.DB.categories.splice(idx, 1);
  SSZ.persistNow();
  return true;
};

/* ---------------- 存钱目标 ---------------- */

SSZ.addGoal = function (name, target, deadline) {
  const g = { id: SSZ.uid('g'), name: name, target: target, saved: 0, deadline: deadline || '', createdAt: SSZ.todayStr(), deposits: [] };
  SSZ.DB.goals.push(g);
  SSZ.persistNow();
  return g;
};

// 存入一笔：从某账户支出 → 目标 saved + deposits
SSZ.goalDeposit = function (goalId, amount, accountId) {
  const g = SSZ.DB.goals.find(function (x) { return x.id === goalId; });
  if (!g) return;
  const cat = SSZ.DB.categories.find(function (c) { return c.type === 'expense' && c.name === '其他'; });
  SSZ.saveTransaction({
    type: 'expense', amount: amount,
    categoryId: cat ? cat.id : SSZ.DB.categories[0].id,
    accountId: accountId, date: SSZ.todayStr(),
    note: '存入目标：' + g.name, tags: ['存钱目标']
  });
  g.saved += amount;
  g.deposits.push({ date: SSZ.todayStr(), amount: amount });
  SSZ.persistNow();
};

SSZ.deleteGoal = function (id) {
  const idx = SSZ.DB.goals.findIndex(function (g) { return g.id === id; });
  if (idx >= 0) SSZ.DB.goals.splice(idx, 1);
  SSZ.persistNow();
};

/* ---------------- 定期账 ---------------- */

// 到期项：active 且 nextDate <= 今天
SSZ.dueRecurring = function () {
  const today = SSZ.todayStr();
  return SSZ.DB.recurring.filter(function (r) { return r.active && r.nextDate <= today; });
};

// 推进 nextDate（monthly 用 day 钳位到月末）
SSZ.advanceRecurring = function (r) {
  const p = r.nextDate.split('-').map(Number);
  const y = p[0], m = p[1], d = p[2];
  if (r.freq === 'weekly') {
    const dt = new Date(y, m - 1, d + 7);
    r.nextDate = SSZ.ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  } else if (r.freq === 'monthly') {
    const day = r.day || d;
    let ny = y, nm = m + 1;
    if (nm > 12) { nm = 1; ny++; }
    r.nextDate = SSZ.ymd(ny, nm, Math.min(day, SSZ.daysInMonth(ny, nm)));
  } else if (r.freq === 'yearly') {
    r.nextDate = SSZ.ymd(y + 1, m, d);
  }
};

// 生成一笔定期账（日期用 nextDate），成功后推进
SSZ.generateRecurring = function (id) {
  const r = SSZ.DB.recurring.find(function (x) { return x.id === id; });
  if (!r) return null;
  SSZ.saveTransaction({
    type: r.type, amount: r.amount, categoryId: r.categoryId,
    accountId: r.accountId, date: r.nextDate, note: r.name, tags: ['定期']
  });
  SSZ.advanceRecurring(r);
  SSZ.persistNow();
  return r;
};

SSZ.addRecurring = function (r) {
  const rec = Object.assign({
    id: SSZ.uid('r'), name: r.name, type: r.type, amount: r.amount,
    categoryId: r.categoryId, accountId: r.accountId, freq: r.freq,
    day: r.day || null, nextDate: r.nextDate, active: true
  });
  SSZ.DB.recurring.push(rec);
  SSZ.persistNow();
  return rec;
};

SSZ.updateRecurring = function (id, patch) {
  const r = SSZ.DB.recurring.find(function (x) { return x.id === id; });
  if (r) { Object.assign(r, patch); SSZ.persistNow(); }
};

SSZ.deleteRecurring = function (id) {
  const idx = SSZ.DB.recurring.findIndex(function (x) { return x.id === id; });
  if (idx >= 0) SSZ.DB.recurring.splice(idx, 1);
  SSZ.persistNow();
};

/* ---------------- 存储用量 ---------------- */

SSZ.storageInfo = function () {
  let bytes = 0;
  Object.keys(SSZ.KEYS).forEach(function (k) {
    const raw = localStorage.getItem(SSZ.KEYS[k]);
    if (raw) bytes += raw.length * 2; // UTF-16 近似
  });
  const kb = bytes / 1024;
  return { kb: kb, pct: Math.min(100, Math.round(kb / 5120 * 100)) }; // 按 5MB 估
};

/* ---------------- 演示数据（验收/调试用） ---------------- */

// 生成约 60 笔跨 6 个月的交易 + 预算 + 目标 + 一条昨天到期的定期账
SSZ.seedDemo = function () {
  const db = SSZ.DB;
  const expCats = db.categories.filter(function (c) { return c.type === 'expense'; });
  const incCats = db.categories.filter(function (c) { return c.type === 'income'; });
  const accs = db.accounts.filter(function (a) { return a.active; });
  if (!expCats.length || !accs.length) return;

  const notes = ['午饭', '地铁通勤', '奶茶', '超市采购', '电影票', '药店', '书店', '外卖', '话费充值', '健身房'];
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const monthsAgo = Math.floor(i / 12);
    const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1 + (i % 27));
    if (d > today) continue;
    const isIncome = (i % 17 === 0);
    const cat = isIncome ? incCats[i % incCats.length] : expCats[(i * 7) % expCats.length];
    const amount = isIncome
      ? (800000 + Math.floor(Math.random() * 3) * 100000)
      : (500 + Math.floor(Math.random() * 45000));
    db.transactions.push({
      id: SSZ.uid('t'), createdAt: Date.now() - i * 60000,
      type: isIncome ? 'income' : 'expense',
      amount: amount, categoryId: cat.id, accountId: accs[i % accs.length].id,
      date: SSZ.ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      note: isIncome ? '' : notes[i % notes.length], tags: []
    });
  }

  // 第一个账户给点初始余额，再全量重算
  if (accs[0]) { accs[0].initialBalance = 200000; }
  SSZ.correctBalances();

  // 本月预算 + 一个进行中目标
  const exp0 = expCats[0], exp2 = expCats[2] || expCats[0];
  SSZ.setBudget(SSZ.curMonth(), 500000, {});
  if (exp0) SSZ.getBudget(SSZ.curMonth()).byCategory[exp0.id] = 150000;
  if (exp2) SSZ.getBudget(SSZ.curMonth()).byCategory[exp2.id] = 100000;
  if (!db.goals.length) SSZ.addGoal('旅行基金', 800000, '2027-06');

  // 一条昨天到期的月度定期账（房租），用于演示到期提醒
  const y = new Date(); y.setDate(y.getDate() - 1);
  const ymdY = SSZ.ymd(y.getFullYear(), y.getMonth() + 1, y.getDate());
  if (!db.recurring.some(function (r) { return r.name === '房租'; })) {
    SSZ.addRecurring({
      name: '房租', type: 'expense', amount: 300000,
      categoryId: (expCats[3] || exp0).id, accountId: accs[0].id,
      freq: 'monthly', day: 1, nextDate: ymdY
    });
  }
  SSZ.persistNow();
};

// 清空演示数据（交易/预算/目标/定期账全清，恢复账户初始余额）
SSZ.clearDemo = function () {
  SSZ.DB.transactions = [];
  SSZ.DB.budgets = [];
  SSZ.DB.goals = [];
  SSZ.DB.recurring = [];
  SSZ.DB.recents = [];
  SSZ.correctBalances();
};
