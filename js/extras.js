/* ============================================================
   随手账 · 增强模块 extras.js (v1.3)
   借鉴 Firefly III / Actual Budget 的「规则引擎」、
   Cent / BeeCount 的「快捷模板」与「明暗主题」
   - 自定义分类规则：关键词 → 分类，优先于内置关键词
   - 常用交易模板：一键预填记账
   - 主题：跟随系统 / 强制浅色 / 强制深色（纯 CSS，无需重绘）
   必须在 voice.js 之后、ai.js 之前加载
   ============================================================ */
window.SSZ = window.SSZ || {};

/* ============================================================
   一、自定义分类规则
   ============================================================ */

// 保留内置关键词解析，包装一层用户规则
SSZ._detectCategoryIdBuiltin = SSZ._detectCategoryId;

SSZ._detectCategoryId = function (text, type) {
  const rules = (SSZ.DB && SSZ.DB.rules) || [];
  const t = String(text || '').toLowerCase();
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!r || !r.keyword) continue;
    if (r.type && r.type !== type) continue;
    const kws = String(r.keyword).split(/[,，|\s]+/).filter(Boolean);
    for (let j = 0; j < kws.length; j++) {
      if (t.indexOf(kws[j].toLowerCase()) >= 0) {
        const c = SSZ.catById(r.categoryId);
        if (c && c.type === type) return r.categoryId;
      }
    }
  }
  return SSZ._detectCategoryIdBuiltin(text, type);
};

// 给 AI / CSV 用：优先采纳外部给的分类名，落到「其他」时用文本+规则重猜
SSZ.autoCategory = function (text, type, preferredName) {
  let cid = SSZ._catIdByName(preferredName || '', type);
  const c = SSZ.catById(cid);
  if (!c || c.name !== '其他') return cid;
  const guessed = SSZ._detectCategoryId(text || '', type);
  const g = SSZ.catById(guessed);
  if (g && g.name !== '其他') return guessed;
  return cid;
};

SSZ.addRule = function (keyword, categoryId, type) {
  const r = { id: SSZ.uid('ru'), keyword: String(keyword || '').trim(), categoryId: categoryId, type: type };
  SSZ.DB.rules.push(r);
  SSZ.persistNow();
  return r;
};
SSZ.deleteRule = function (id) {
  SSZ.DB.rules = SSZ.DB.rules.filter(function (r) { return r.id !== id; });
  SSZ.persistNow();
};

SSZ.renderers.rules = function (page) {
  let html = SSZ.pageHeader('自动分类规则', { back: 'mine' });
  html +=
    '<div class="block"><div class="card card-pad tiny muted" style="line-height:1.8">' +
    '语音记账、截图识别、CSV 导入时，先按这里的关键词匹配分类，匹配不到才用内置词库。<br>' +
    '多个关键词用逗号或空格分隔，例如「星巴克, 瑞幸, 咖啡」→ 餐饮。' +
    '</div></div>';

  const rules = SSZ.DB.rules;
  html += '<div class="block"><div class="block-title">我的规则（' + rules.length + '）</div>';
  if (!rules.length) {
    html += '<div class="card"><div class="empty"><div class="ei">🧩</div><div class="et">还没有规则，点下面添加</div></div></div>';
  } else {
    html += '<div class="card">';
    rules.forEach(function (r) {
      const c = SSZ.catById(r.categoryId);
      html += '<div class="rule-row" data-id="' + r.id + '">' +
        '<span class="rr-ic">' + (c ? c.icon : '📦') + '</span>' +
        '<span class="rr-body"><b>' + SSZ.esc(r.keyword) + '</b>' +
        '<small>→ ' + (c ? SSZ.esc(c.name) : '已失效分类') + ' · ' + (r.type === 'income' ? '收入' : '支出') + '</small></span>' +
        '<button class="rr-del" data-id="' + r.id + '" type="button">✕</button></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  html +=
    '<div class="block"><button class="btn btn-primary" id="rule-add" type="button">+ 添加规则</button></div>';

  page.innerHTML = html;

  Array.prototype.forEach.call(page.querySelectorAll('.rr-del'), function (b) {
    b.onclick = function () {
      SSZ.deleteRule(b.dataset.id);
      SSZ.toast('已删除', 'ok');
      SSZ.renderCurrent();
    };
  });

  page.querySelector('#rule-add').onclick = function () {
    const cats = SSZ.DB.categories;
    let type = 'expense';
    let catId = (cats.find(function (c) { return c.type === 'expense'; }) || {}).id;
    const s = SSZ.openSheet({
      title: '添加规则',
      body:
        '<p class="voice-hint">命中关键词时自动归入指定分类。语音 / 截图 / CSV 导入都会走这套规则。</p>' +
        '<div class="vp-row"><span class="vp-label">类型</span><div class="seg vp-type">' +
        '<button class="seg-btn" data-t="expense" type="button">支出</button>' +
        '<button class="seg-btn" data-t="income" type="button">收入</button></div></div>' +
        '<div class="field-row"><span class="fl">关键词</span>' +
        '<input class="fv" id="ru-kw" placeholder="星巴克, 瑞幸, 咖啡"></div>' +
        '<div class="vp-label" style="margin:12px 2px 8px">归入分类</div>' +
        '<div id="ru-cats"></div>' +
        '<button class="key-ok" id="ru-save" type="button">保存规则</button>'
    });
    function renderCats() {
      const list = cats.filter(function (c) { return c.type === type; });
      if (!list.some(function (c) { return c.id === catId; })) catId = list[0] && list[0].id;
      const wrap = s.body.querySelector('#ru-cats');
      wrap.innerHTML = '<div class="cat-grid">' + list.map(function (c) {
        return '<button class="cat-cell' + (c.id === catId ? ' active' : '') + '" data-id="' + c.id + '" type="button">' +
          '<span class="cat-ic">' + c.icon + '</span>' + SSZ.esc(c.name) + '</button>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (b) {
        b.onclick = function () {
          catId = b.dataset.id;
          Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (x) {
            x.classList.toggle('active', x.dataset.id === catId);
          });
        };
      });
    }
    function syncType() {
      Array.prototype.forEach.call(s.body.querySelectorAll('.vp-type .seg-btn'), function (b) {
        b.classList.toggle('active', b.dataset.t === type);
      });
    }
    Array.prototype.forEach.call(s.body.querySelectorAll('.vp-type .seg-btn'), function (b) {
      b.onclick = function () { type = b.dataset.t; syncType(); renderCats(); };
    });
    s.body.querySelector('#ru-save').onclick = function () {
      const kw = s.body.querySelector('#ru-kw').value.trim();
      if (!kw) { SSZ.toast('请填关键词', 'err'); return; }
      SSZ.addRule(kw, catId, type);
      s.close();
      SSZ.toast('规则已添加', 'ok');
      SSZ.renderCurrent();
    };
    syncType();
    renderCats();
  };
};

/* ============================================================
   二、常用交易模板
   ============================================================ */

SSZ.addTemplate = function (t) {
  const rec = {
    id: SSZ.uid('tp'), name: t.name, type: t.type, amount: t.amount,
    categoryId: t.categoryId, accountId: t.accountId,
    note: t.note || '', tags: t.tags || []
  };
  SSZ.DB.templates.push(rec);
  SSZ.persistNow();
  return rec;
};
SSZ.deleteTemplate = function (id) {
  SSZ.DB.templates = SSZ.DB.templates.filter(function (t) { return t.id !== id; });
  SSZ.persistNow();
};

SSZ.templatesHTML = function () {
  const list = SSZ.DB.templates || [];
  if (!list.length) return '';
  return '<div class="block"><div class="block-title">常用模板<span class="more" id="tpl-more">管理 ›</span></div>' +
    '<div class="tpl-scroll">' + list.map(function (t) {
      const c = SSZ.catById(t.categoryId);
      return '<button class="tpl-card" data-id="' + t.id + '" type="button">' +
        '<span class="tp-ic">' + (c ? c.icon : '📦') + '</span>' +
        '<span class="tp-name">' + SSZ.esc(t.name) + '</span>' +
        '<span class="tp-amt">' + SSZ.fmt(t.amount) + '</span></button>';
    }).join('') + '</div></div>';
};

SSZ.bindTemplates = function (page) {
  const more = page.querySelector('#tpl-more');
  if (more) more.onclick = function () { SSZ.navigate('templates'); };
  Array.prototype.forEach.call(page.querySelectorAll('.tpl-card'), function (b) {
    b.onclick = function () {
      const t = (SSZ.DB.templates || []).find(function (x) { return x.id === b.dataset.id; });
      if (!t) return;
      SSZ.openTxSheet(null, {
        type: t.type, amount: t.amount, categoryId: t.categoryId,
        accountId: t.accountId, note: t.note, tags: t.tags
      });
    };
  });
};

SSZ.renderers.templates = function (page) {
  let html = SSZ.pageHeader('常用模板', { back: 'mine' });
  html +=
    '<div class="block"><div class="card card-pad tiny muted" style="line-height:1.8">' +
    '把每天重复的账（通勤、午饭、咖啡）存成模板，首页点一下就预填好，确认即入账。' +
    '</div></div>';

  const list = SSZ.DB.templates || [];
  html += '<div class="block"><div class="block-title">我的模板（' + list.length + '）</div>';
  if (!list.length) {
    html += '<div class="card"><div class="empty"><div class="ei">⚡</div><div class="et">还没有模板<br>从最近一笔账创建，或手动添加</div></div></div>';
  } else {
    html += '<div class="card">';
    list.forEach(function (t) {
      const c = SSZ.catById(t.categoryId);
      const a = SSZ.accById(t.accountId);
      html += '<div class="rule-row">' +
        '<span class="rr-ic">' + (c ? c.icon : '📦') + '</span>' +
        '<span class="rr-body"><b>' + SSZ.esc(t.name) + '</b>' +
        '<small>' + (c ? SSZ.esc(c.name) : '未分类') + ' · ' + (a ? SSZ.esc(a.name) : '') + (t.note ? ' · ' + SSZ.esc(t.note) : '') + '</small></span>' +
        '<span class="rr-amt">' + SSZ.fmt(t.amount) + '</span>' +
        '<button class="rr-del" data-id="' + t.id + '" type="button">✕</button></div>';
    });
    html += '</div>';
  }
  html += '</div>';

  html +=
    '<div class="block"><div class="list-group">' +
    '<button class="list-row" id="tpl-from-tx" type="button"><span class="list-ic">🧾</span>' +
    '<span class="list-label">从最近一笔账创建</span><span class="list-chev">›</span></button>' +
    '<button class="list-row" id="tpl-new" type="button"><span class="list-ic">➕</span>' +
    '<span class="list-label">手动添加模板</span><span class="list-chev">›</span></button>' +
    '</div></div>';

  page.innerHTML = html;

  Array.prototype.forEach.call(page.querySelectorAll('.rr-del'), function (b) {
    b.onclick = function () {
      SSZ.deleteTemplate(b.dataset.id);
      SSZ.toast('已删除', 'ok');
      SSZ.renderCurrent();
    };
  });

  page.querySelector('#tpl-from-tx').onclick = function () {
    const txs = SSZ.recentTx(20).filter(function (t) { return t.type !== 'transfer'; });
    if (!txs.length) { SSZ.toast('还没有记账记录', 'err'); return; }
    const s = SSZ.openSheet({
      title: '选一笔存为模板',
      body: '<div class="tpl-pick">' + txs.map(function (t) {
        const c = SSZ.catById(t.categoryId);
        return '<button class="tpl-pick-row" data-id="' + t.id + '" type="button">' +
          '<span>' + (c ? c.icon : '📦') + ' ' + (c ? SSZ.esc(c.name) : '未分类') + '</span>' +
          '<span>' + SSZ.esc(t.note || SSZ.dateLabel(t.date)) + '</span>' +
          '<b>' + SSZ.fmt(t.amount) + '</b></button>';
      }).join('') + '</div>'
    });
    Array.prototype.forEach.call(s.body.querySelectorAll('.tpl-pick-row'), function (b) {
      b.onclick = function () {
        const t = txs.find(function (x) { return x.id === b.dataset.id; });
        const c = SSZ.catById(t.categoryId);
        SSZ.addTemplate({
          name: (t.note || (c ? c.name : '常用')).slice(0, 12),
          type: t.type, amount: t.amount, categoryId: t.categoryId,
          accountId: t.accountId, note: t.note, tags: t.tags || []
        });
        s.close();
        SSZ.toast('模板已创建', 'ok');
        SSZ.renderCurrent();
      };
    });
  };

  page.querySelector('#tpl-new').onclick = function () {
    const s = SSZ.openSheet({
      title: '添加模板',
      body:
        '<div class="field-row"><span class="fl">名称</span><input class="fv" id="tp-name" placeholder="如：午饭"></div>' +
        '<div class="field-row"><span class="fl">金额(元)</span><input class="fv" id="tp-amt" inputmode="decimal" placeholder="15"></div>' +
        '<div class="field-row"><span class="fl">备注</span><input class="fv" id="tp-note" placeholder="选填"></div>' +
        '<div class="vp-label" style="margin:12px 2px 8px">分类</div><div id="tp-cats"></div>' +
        '<button class="key-ok" id="tp-save" type="button">保存模板</button>'
    });
    let catId = (SSZ.DB.categories.find(function (c) { return c.type === 'expense'; }) || {}).id;
    const cats = SSZ.DB.categories.filter(function (c) { return c.type === 'expense'; });
    const wrap = s.body.querySelector('#tp-cats');
    function render() {
      wrap.innerHTML = '<div class="cat-grid">' + cats.map(function (c) {
        return '<button class="cat-cell' + (c.id === catId ? ' active' : '') + '" data-id="' + c.id + '" type="button">' +
          '<span class="cat-ic">' + c.icon + '</span>' + SSZ.esc(c.name) + '</button>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (b) {
        b.onclick = function () {
          catId = b.dataset.id;
          Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (x) {
            x.classList.toggle('active', x.dataset.id === catId);
          });
        };
      });
    }
    s.body.querySelector('#tp-save').onclick = function () {
      const name = s.body.querySelector('#tp-name').value.trim();
      const amt = SSZ.parseAmount(s.body.querySelector('#tp-amt').value);
      if (!name) { SSZ.toast('请填名称', 'err'); return; }
      if (!amt) { SSZ.toast('请填金额', 'err'); return; }
      const acc = SSZ._defaultAccount();
      SSZ.addTemplate({
        name: name, type: 'expense', amount: amt, categoryId: catId,
        accountId: acc ? acc.id : null, note: s.body.querySelector('#tp-note').value.trim(), tags: []
      });
      s.close();
      SSZ.toast('模板已创建', 'ok');
      SSZ.renderCurrent();
    };
    render();
  };
};

/* ============================================================
   三、明暗主题
   ============================================================ */

SSZ.themeLabel = function () {
  const t = (SSZ.DB && SSZ.DB.settings && SSZ.DB.settings.theme) || 'auto';
  return { auto: '跟随系统', light: '浅色', dark: '深色' }[t] || '跟随系统';
};

SSZ.applyTheme = function () {
  const t = (SSZ.DB && SSZ.DB.settings && SSZ.DB.settings.theme) || 'auto';
  let dark = false;
  if (t === 'dark') dark = true;
  else if (t === 'auto' && window.matchMedia) dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1A1D26' : '#4C6EF5');
};

SSZ.cycleTheme = function () {
  const cur = (SSZ.DB.settings && SSZ.DB.settings.theme) || 'auto';
  const next = cur === 'auto' ? 'light' : (cur === 'light' ? 'dark' : 'auto');
  SSZ.DB.settings.theme = next;
  SSZ.persistNow();
  SSZ.applyTheme();
  SSZ.toast('外观：' + SSZ.themeLabel(), 'ok');
};

if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', function () { if (SSZ.DB) SSZ.applyTheme(); });
}
