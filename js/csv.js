/* ============================================================
   随手账 · CSV 导入导出 csv.js (v1.3)
   借鉴 ezBookkeeping / BeeCount / Cent / ExpenseOwl：账单可迁移
   - 导出：UTF-8 BOM，Excel 直接打开
   - 导入：自动识别微信/支付宝/通用账单列名，去重预览后批量入账
   ============================================================ */
window.SSZ = window.SSZ || {};

/* ---------------- CSV 解析（支持引号、逗号、BOM、CRLF） ---------------- */

SSZ.parseCSV = function (text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
};

SSZ.csvCell = function (v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* ---------------- 导出 ---------------- */

SSZ.exportCSV = function () {
  const head = ['日期', '类型', '金额(元)', '分类', '账户', '转入账户', '备注', '标签'];
  const txs = SSZ.DB.transactions.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  const lines = [head.join(',')];
  txs.forEach(function (t) {
    const typeLabel = t.type === 'income' ? '收入' : (t.type === 'transfer' ? '转账' : '支出');
    const to = t.toAccountId ? SSZ.accName(t.toAccountId) : '';
    lines.push([
      t.date, typeLabel, (t.amount / 100).toFixed(2),
      t.type === 'transfer' ? '' : SSZ.catName(t.categoryId),
      SSZ.accName(t.accountId), to, t.note || '',
      (t.tags || []).join('|')
    ].map(SSZ.csvCell).join(','));
  });
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '随手账流水_' + SSZ.todayStr() + '.csv';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  SSZ.toast('已导出 ' + txs.length + ' 笔流水', 'ok');
};

/* ---------------- 列名识别 ---------------- */

SSZ._findCol = function (header, names) {
  for (let n = 0; n < names.length; n++) {
    for (let i = 0; i < header.length; i++) {
      const h = String(header[i] || '').replace(/[\s\u3000()（）]/g, '').toLowerCase();
      if (h.indexOf(String(names[n]).toLowerCase()) >= 0) return i;
    }
  }
  return -1;
};

// 返回所有匹配列（按表头顺序），用于把「交易对方 + 商品 + 备注」拼成一条说明
SSZ._findCols = function (header, names) {
  const out = [];
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] || '').replace(/[\s\u3000()（）]/g, '').toLowerCase();
    for (let n = 0; n < names.length; n++) {
      if (h.indexOf(String(names[n]).toLowerCase()) >= 0) { out.push(i); break; }
    }
  }
  return out;
};

SSZ._normDate = function (v) {
  let s = String(v || '').trim();
  if (!s) return SSZ.todayStr();
  let m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return SSZ.ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return SSZ.ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  return SSZ.todayStr();
};

SSZ._normAmount = function (v) {
  const s = String(v || '').replace(/[¥￥,，\s元]/g, '');
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(Math.abs(n) * 100);
};

// 返回 { records, skipped, header }
SSZ.csvToRecords = function (rows, defaultType) {
  // 找表头行：同时含「金额」和「时间/日期」
  let hIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const joined = rows[i].join('|').toLowerCase();
    if (/金额|amount/.test(joined) && /时间|日期|date|time/.test(joined)) { hIdx = i; break; }
  }
  if (hIdx < 0) return { records: [], skipped: rows.length, header: null, error: '没找到表头（需包含「金额」和「日期/时间」列）' };

  const header = rows[hIdx];
  const cDate = SSZ._findCol(header, ['交易时间', '交易创建时间', '付款时间', '交易日期', '日期', '时间', 'date', 'time']);
  const cAmt = SSZ._findCol(header, ['金额', 'amount', '交易金额']);
  const cType = SSZ._findCol(header, ['收/支', '收支', '交易类型', '方向', 'type', 'direction']);
  // 注意：不要用「商户」「商家」这类宽泛词，否则「商户单号 / 商家订单号」会被拼进备注
  const noteCols = SSZ._findCols(header, ['商品名称', '商品', '交易对方', '对方', '摘要', '备注', '描述', '说明', 'note', 'description', 'merchant', 'remark']);
  const cAcc = SSZ._findCol(header, ['支付方式', '收/付款方式', '付款方式', '账户', 'account', 'payment']);
  const cCat = SSZ._findCol(header, ['交易分类', '分类', 'category']);
  if (cAmt < 0) return { records: [], skipped: 0, header: header, error: '没找到金额列' };

  const records = [];
  let skipped = 0;
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const amount = SSZ._normAmount(r[cAmt]);
    if (!amount) { skipped++; continue; }

    let type = defaultType || 'expense';
    const tv = cType >= 0 ? String(r[cType] || '').trim() : '';
    if (/支出|付款|expense|out/.test(tv)) type = 'expense';
    else if (/收入|收款|income|in/.test(tv)) type = 'income';
    else if (/不计收支|不计|转账|transfer/.test(tv)) { skipped++; continue; }
    else if (/^-/.test(String(r[cAmt] || '').trim())) type = 'expense';

    const parts = [];
    noteCols.forEach(function (ci) {
      const v = String(r[ci] || '').trim();
      if (v && v !== '/' && parts.indexOf(v) < 0) parts.push(v);
    });
    const note = parts.join(' · ').slice(0, 80);
    const catName = cCat >= 0 ? String(r[cCat] || '').trim() : '';
    const accName = cAcc >= 0 ? String(r[cAcc] || '').trim() : '';

    records.push({
      type: type,
      amount: amount,
      categoryId: SSZ.autoCategory(note + ' ' + catName, type, catName),
      accountId: SSZ._accIdByName(accName),
      date: cDate >= 0 ? SSZ._normDate(r[cDate]) : SSZ.todayStr(),
      note: note,
      tags: ['导入']
    });
  }
  return { records: records, skipped: skipped, header: header };
};

SSZ._txDedupKey = function (t) {
  return [t.date, t.amount, t.type, (t.note || '').slice(0, 40)].join('|');
};

SSZ.importTransactions = function (records) {
  const seen = {};
  SSZ.DB.transactions.forEach(function (t) { seen[SSZ._txDedupKey(t)] = true; });
  const fresh = records.filter(function (r) {
    const k = SSZ._txDedupKey(r);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
  const now = Date.now();
  fresh.forEach(function (r, i) {
    SSZ.DB.transactions.push({
      id: SSZ.uid('t'), createdAt: now + i,
      type: r.type, amount: r.amount, categoryId: r.categoryId,
      accountId: r.accountId, date: r.date, note: r.note,
      tags: r.tags || [], toAccountId: null
    });
  });
  SSZ.correctBalances(); // 内含 persistNow
  return fresh.length;
};

/* ---------------- 导入弹层 ---------------- */

SSZ.openCsvImportSheet = function () {
  let parsed = null;
  const s = SSZ.openSheet({
    title: '导入账单 CSV',
    body:
      '<p class="voice-hint">支持微信支付、支付宝导出的 CSV 账单，以及任意含「日期 + 金额」列的表格。' +
      '自动识别列名、自动套用你的分类规则、自动跳过重复记录。</p>' +
      '<button class="btn btn-outline" id="csv-pick" type="button">选择 CSV 文件</button>' +
      '<input type="file" id="csv-file" accept=".csv,.txt,text/csv" style="display:none">' +
      '<div id="csv-result"></div>'
  });
  const $ = function (id) { return s.body.querySelector('#' + id); };
  let defaultType = 'expense';
  let rowsCache = null;

  function render() {
    if (!parsed) { $('csv-result').innerHTML = ''; return; }
    if (parsed.error) {
      $('csv-result').innerHTML = '<div class="csv-msg err">⚠️ ' + SSZ.esc(parsed.error) + '</div>';
      return;
    }
    const seen = {};
    SSZ.DB.transactions.forEach(function (t) { seen[SSZ._txDedupKey(t)] = true; });
    const fresh = parsed.records.filter(function (r) { return !seen[SSZ._txDedupKey(r)]; });
    const dup = parsed.records.length - fresh.length;

    let h = '<div class="csv-msg">识别到 <b>' + parsed.records.length + '</b> 条，' +
      '其中重复 <b>' + dup + '</b> 条将跳过，可导入 <b>' + fresh.length + '</b> 条</div>';
    h += '<div class="vp-row" style="margin-top:10px"><span class="vp-label">无方向列时默认</span>' +
      '<div class="seg vp-type"><button class="seg-btn" data-t="expense" type="button">支出</button>' +
      '<button class="seg-btn" data-t="income" type="button">收入</button></div></div>';
    h += '<div class="csv-preview">' + fresh.slice(0, 6).map(function (r) {
      const c = SSZ.catById(r.categoryId);
      return '<div class="csv-pv-row"><span>' + SSZ.esc(r.date) + '</span>' +
        '<span>' + (c ? c.icon + ' ' + SSZ.esc(c.name) : '未分类') + '</span>' +
        '<b>' + SSZ.fmt(r.amount) + '</b></div>' +
        (r.note ? '<div class="csv-pv-note">' + SSZ.esc(r.note) + '</div>' : '');
    }).join('') + '</div>';
    h += '<button class="key-ok" id="csv-confirm" type="button"' + (fresh.length ? '' : ' disabled') + '>确认导入 ' + fresh.length + ' 笔</button>';
    $('csv-result').innerHTML = h;

    Array.prototype.forEach.call(s.body.querySelectorAll('.vp-type .seg-btn'), function (b) {
      b.classList.toggle('active', b.dataset.t === defaultType);
      b.onclick = function () {
        defaultType = b.dataset.t;
        if (rowsCache) parsed = SSZ.csvToRecords(rowsCache, defaultType);
        render();
      };
    });
    const ok = $('csv-confirm');
    if (ok) ok.onclick = function () {
      const n = SSZ.importTransactions(fresh);
      s.close();
      SSZ.toast('已导入 ' + n + ' 笔 ✓', 'ok');
      SSZ.navigate('home');
      SSZ.renderCurrent();
    };
  }

  const fileInput = $('csv-file');
  $('csv-pick').onclick = function () { fileInput.click(); };
  fileInput.onchange = function () {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      rowsCache = SSZ.parseCSV(reader.result);
      parsed = SSZ.csvToRecords(rowsCache, defaultType);
      render();
    };
    reader.readAsText(f, 'UTF-8');
  };
};
