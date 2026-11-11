/* ============================================================
   随手账 · 备份与恢复 backup.js
   导出 JSON 下载 / 从备份恢复（校验 + 先备份当前数据可回滚）
   数据全程不出设备
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.backup = function (page) {
  const si = SSZ.storageInfo();
  const last = SSZ.DB.meta.lastBackup;

  let html = SSZ.pageHeader('备份与恢复', { back: 'mine' });

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div style="font-size:14px;font-weight:600;margin-bottom:6px">💾 导出备份</div>' +
    '<div class="tiny muted" style="line-height:1.7">把全部数据导出成一个 JSON 文件保存到本机。' +
    '建议每周导出一次——浏览器数据一旦被清理，只有备份能救回来。</div>' +
    '<button class="btn btn-primary mt16" id="bk-export" type="button">导出备份文件</button>' +
    '</div></div>';

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div style="font-size:14px;font-weight:600;margin-bottom:6px">📊 导出 CSV 流水</div>' +
    '<div class="tiny muted" style="line-height:1.7">Excel / WPS / 表格软件可直接打开，方便对账，' +
    '或迁移到别的记账软件（UTF-8 编码，中文不乱码）。</div>' +
    '<button class="btn btn-outline mt16" id="bk-csv-export" type="button">导出 CSV 流水</button>' +
    '</div></div>';

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div style="font-size:14px;font-weight:600;margin-bottom:6px">📥 导入微信 / 支付宝账单</div>' +
    '<div class="tiny muted" style="line-height:1.7">选导出的 CSV 账单，自动识别列名、' +
    '自动套用你的分类规则、跳过重复记录，预览确认后批量入账。</div>' +
    '<button class="btn btn-outline mt16" id="bk-csv-import" type="button">选择 CSV 文件</button>' +
    '</div></div>';

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div style="font-size:14px;font-weight:600;margin-bottom:6px">📥 从备份恢复</div>' +
    '<div class="tiny muted" style="line-height:1.7">选择之前导出的 JSON 文件恢复数据。' +
    '恢复会覆盖当前全部数据（当前数据会先自动留存，可随时回退）。</div>' +
    '<button class="btn btn-outline mt16" id="bk-import" type="button">选择备份文件</button>' +
    '<input type="file" id="bk-file" accept=".json,application/json" style="display:none">' +
    '</div></div>';

  html +=
    '<div class="block"><div class="card card-pad">' +
    '<div style="font-size:14px;font-weight:600;margin-bottom:6px">📊 当前数据</div>' +
    '<div class="tiny muted">' +
    '交易 ' + SSZ.DB.transactions.length + ' 笔 · 账户 ' + SSZ.DB.accounts.length + ' 个 · ' +
    '目标 ' + SSZ.DB.goals.length + ' 个 · 定期账 ' + SSZ.DB.recurring.length + ' 条<br>' +
    '占用约 ' + si.kb.toFixed(1) + ' KB' + (si.pct >= 80 ? '（占用偏高，建议导出备份并清理旧数据）' : '') + '<br>' +
    (last ? '上次导出：' + last : '还没有导出过备份') +
    '</div></div></div>';

  page.innerHTML = html;

  /* 导出 */
  page.querySelector('#bk-export').onclick = function () {
    const data = {
      app: 'suishouzhang', version: SSZ.VERSION,
      exportedAt: new Date().toISOString(),
      meta: SSZ.DB.meta,
      categories: SSZ.DB.categories,
      accounts: SSZ.DB.accounts,
      transactions: SSZ.DB.transactions,
      budgets: SSZ.DB.budgets,
      goals: SSZ.DB.goals,
      recurring: SSZ.DB.recurring,
      recents: SSZ.DB.recents,
      rules: SSZ.DB.rules || [],
      templates: SSZ.DB.templates || [],
      settings: SSZ.DB.settings || { theme: 'auto' }
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '随手账备份_' + SSZ.todayStr() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    SSZ.DB.meta.lastBackup = SSZ.todayStr();
    SSZ.persistNow();
    SSZ.toast('备份文件已导出', 'ok');
  };

  /* CSV 导出 / 导入 */
  page.querySelector('#bk-csv-export').onclick = function () { SSZ.exportCSV(); };
  page.querySelector('#bk-csv-import').onclick = function () { SSZ.openCsvImportSheet(); };

  /* 恢复 */
  const fileInput = page.querySelector('#bk-file');
  page.querySelector('#bk-import').onclick = function () { fileInput.click(); };
  fileInput.onchange = function () {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      let data = null;
      try { data = JSON.parse(reader.result); } catch (e) { /* 下面统一处理 */ }
      const chk = SSZ.validateBackup(data);
      if (!chk.ok) { SSZ.toast('备份文件无法识别：' + chk.reason, 'err'); return; }
      SSZ.confirm('恢复备份？', '将覆盖当前全部数据（共 ' + data.transactions.length + ' 笔交易）。当前数据会先自动留存，可回退。', { okText: '恢复' })
        .then(function (ok) {
          if (!ok) return;
          // 先把当前数据存到临时 key，失败可回滚
          try {
            localStorage.setItem('ssz.rollback', JSON.stringify({
              categories: SSZ.DB.categories, accounts: SSZ.DB.accounts,
              transactions: SSZ.DB.transactions, budgets: SSZ.DB.budgets,
              goals: SSZ.DB.goals, recurring: SSZ.DB.recurring, recents: SSZ.DB.recents,
              rules: SSZ.DB.rules || [], templates: SSZ.DB.templates || [],
              settings: SSZ.DB.settings || { theme: 'auto' }
            }));
          } catch (e) { /* 忽略 */ }
          SSZ.DB.categories = data.categories;
          SSZ.DB.accounts = data.accounts;
          SSZ.DB.transactions = data.transactions;
          SSZ.DB.budgets = data.budgets || [];
          SSZ.DB.goals = data.goals || [];
          SSZ.DB.recurring = data.recurring || [];
          SSZ.DB.recents = data.recents || [];
          SSZ.DB.rules = data.rules || [];
          SSZ.DB.templates = data.templates || [];
          SSZ.DB.settings = data.settings || { theme: 'auto' };
          SSZ.persistNow();
          SSZ.applyTheme();
          SSZ.toast('已从备份恢复', 'ok');
          SSZ.navigate('home');
        });
    };
    reader.readAsText(f);
    fileInput.value = '';
  };
};

/* 备份文件校验：结构完整 + 外键有效 */
SSZ.validateBackup = function (d) {
  if (!d || typeof d !== 'object') return { ok: false, reason: '不是有效的 JSON' };
  if (!Array.isArray(d.transactions)) return { ok: false, reason: '缺少交易记录' };
  if (!Array.isArray(d.categories) || !d.categories.length) return { ok: false, reason: '缺少分类' };
  if (!Array.isArray(d.accounts) || !d.accounts.length) return { ok: false, reason: '缺少账户' };
  const catIds = {}, accIds = {};
  d.categories.forEach(function (c) { if (c && c.id) catIds[c.id] = true; });
  d.accounts.forEach(function (a) { if (a && a.id) accIds[a.id] = true; });
  for (let i = 0; i < d.transactions.length; i++) {
    const t = d.transactions[i];
    if (!t || typeof t.amount !== 'number' || !Number.isInteger(t.amount)) return { ok: false, reason: '第' + (i + 1) + '笔金额异常' };
    if (!accIds[t.accountId]) return { ok: false, reason: '第' + (i + 1) + '笔账户无效' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) return { ok: false, reason: '第' + (i + 1) + '笔日期无效' };
    if (t.toAccountId && !accIds[t.toAccountId]) return { ok: false, reason: '第' + (i + 1) + '笔转入账户无效' };
    if (t.type === 'transfer') continue; // 转账无分类
    if (!catIds[t.categoryId]) return { ok: false, reason: '第' + (i + 1) + '笔分类无效' };
  }
  return { ok: true };
};

/* 回退到恢复前的数据（紧急情况用） */
SSZ.rollback = function () {
  const raw = localStorage.getItem('ssz.rollback');
  if (!raw) { SSZ.toast('没有可回退的数据', 'err'); return; }
  try {
    const d = JSON.parse(raw);
    SSZ.DB.categories = d.categories;
    SSZ.DB.accounts = d.accounts;
    SSZ.DB.transactions = d.transactions;
    SSZ.DB.budgets = d.budgets;
    SSZ.DB.goals = d.goals;
    SSZ.DB.recurring = d.recurring;
    SSZ.DB.recents = d.recents;
    SSZ.DB.rules = d.rules || [];
    SSZ.DB.templates = d.templates || [];
    SSZ.DB.settings = d.settings || { theme: 'auto' };
    SSZ.persistNow();
    SSZ.applyTheme();
    SSZ.toast('已回退到恢复前', 'ok');
    SSZ.renderCurrent();
  } catch (e) {
    SSZ.toast('回退失败', 'err');
  }
};
