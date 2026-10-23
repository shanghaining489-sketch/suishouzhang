/* ============================================================
   随手账 · AI 记账 ai.js (v1.2)
   聊天式 AI 记账：语音（键盘听写）+ 上传截图/图片，AI 识别后批量入账
   - 纯前端、无后端：图片直接发给视觉大模型（浏览器直连，CORS 已验证可用）
   - API Key 仅存在本机 localStorage（ssz.ai），不上传、不入库
   ============================================================ */
window.SSZ = window.SSZ || {};

/* ---------------- AI 配置（本机存储） ---------------- */

SSZ.aiConfig = function () {
  try { return JSON.parse(localStorage.getItem('ssz.ai')) || {}; } catch (e) { return {}; }
};
SSZ.saveAiConfig = function (c) {
  try { localStorage.setItem('ssz.ai', JSON.stringify(c)); } catch (e) {}
};

// 服务商预设（baseUrl 兼容性接口 / OpenAI 格式）
SSZ.aiProviders = {
  dashscope: {
    name: '通义千问视觉',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-vl-max'
  },
  siliconflow: {
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'Qwen/Qwen2.5-VL-72B-Instruct'
  }
};

/* ---------------- 提示词 ---------------- */

SSZ.AI_SYS_PROMPT =
  '你是一个中文个人记账助手。用户会发来一张「消费/转账/账单截图」（可能是微信支付、支付宝、' +
  '银行 App、账单 Excel 截图等）。请逐条识别其中的每一笔交易，整理成 JSON 数组返回。' +
  '只返回 JSON，不要任何解释、不要 markdown 代码块。\n\n' +
  '每条格式：\n' +
  '{\n' +
  '  "date": "交易日期，YYYY-MM-DD，拿不到就写今天",\n' +
  '  "type": "expense" 或 "income"（退款/收款/红包写 income）,\n' +
  '  "amount": 数字，单位「元」，例如 12.5、38、56.5,\n' +
  '  "category": 从以下「支出」中选一个：餐饮、交通、购物、居住、娱乐、医疗、人情、学习、通讯、其他；' +
  '从以下「收入」中选一个：工资、奖金、兼职、理财、红包、其他（不要自造分类，挑最贴近的一个），\n' +
  '  "account": 从以下中选一个：微信、支付宝、现金、银行卡、信用卡,\n' +
  '  "merchant": "商户/对方名称，如「麦当劳」「微信红包」，拿不到写空字符串",\n' +
  '  "note": "补充说明，如「午饭」「地铁通勤」，拿不到写空字符串"\n' +
  '}\n' +
  '金额请使用正数；同一张截图里的多笔都要列出。';

SSZ.AI_USER_PROMPT = '这是我的账单截图，请识别里面所有交易并整理成 JSON 数组返回。';

/* ---------------- 图片压缩（发送前降分辨率，省 token/流量） ---------------- */

SSZ._compressImage = function (file) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 1280, w = img.width, h = img.height;
      if (w > max || h > max) {
        if (w >= h) { h = Math.round(h * max / w); w = max; }
        else { w = Math.round(w * max / h); h = max; }
      }
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      cv.toBlob(function (blob) {
        if (!blob) { reject(new Error('图片处理失败')); return; }
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = reject;
        r.readAsDataURL(blob);
      }, 'image/jpeg', 0.82);
    };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
};

/* ---------------- 账户名 → id ---------------- */

SSZ._defaultAccountId = function () {
  var a = SSZ._defaultAccount();
  return a ? a.id : null;
};

SSZ._accIdByName = function (name) {
  var accs = SSZ.DB.accounts;
  if (!name) return SSZ._defaultAccountId();
  var n = String(name);
  var byName = accs.find(function (a) { return a.name === n; });
  if (byName) return byName.id;
  if (n.indexOf('微信') >= 0) { var w = accs.find(function (a) { return a.type === 'wechat'; }); if (w) return w.id; }
  if (n.indexOf('支付宝') >= 0 || n.indexOf('支') >= 0) { var z = accs.find(function (a) { return a.type === 'alipay'; }); if (z) return z.id; }
  if (n.indexOf('现金') >= 0) { var c = accs.find(function (a) { return a.type === 'cash'; }); if (c) return c.id; }
  if (n.indexOf('信用') >= 0) { var cr = accs.find(function (a) { return a.type === 'credit'; }); if (cr) return cr.id; }
  if (n.indexOf('银行') >= 0 || n.indexOf('卡') >= 0) { var b = accs.find(function (a) { return a.type === 'bank'; }); if (b) return b.id; }
  return SSZ._defaultAccountId();
};

/* ---------------- 把 AI 返回的一条映射成本地记录 ---------------- */

SSZ._mapAiRecord = function (r) {
  if (!r || typeof r !== 'object') return null;
  var type = r.type === 'income' ? 'income' : 'expense';
  var amountYuan = Number(r.amount);
  if (!isFinite(amountYuan) || amountYuan <= 0) return null;
  var amount = Math.round(amountYuan * 100);
  var categoryId = SSZ._catIdByName((r.category || '') || (type === 'income' ? '其他' : '其他'), type);
  var accountId = SSZ._accIdByName(r.account);
  var date = /^(\d{4})-(\d{2})-(\d{2})$/.test(r.date || '') ? r.date : SSZ.todayStr();
  return {
    id: SSZ.uid('r'),
    type: type,
    amount: amount,
    categoryId: categoryId,
    accountId: accountId,
    date: date,
    merchant: r.merchant || '',
    note: r.note || ''
  };
};

/* ---------------- 解析模型返回的 JSON ---------------- */

SSZ._parseAiRecords = function (content) {
  var s = String(content || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '');
  var i = s.indexOf('['), j = s.lastIndexOf(']');
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  var arr;
  try { arr = JSON.parse(s); } catch (e) { throw new Error('无法解析识别结果'); }
  if (!Array.isArray(arr)) throw new Error('识别结果格式不对');
  var out = [];
  arr.forEach(function (r) {
    if (r && typeof r === 'object') {
      var rec = SSZ._mapAiRecord(r);
      if (rec) out.push(rec);
    }
  });
  return out;
};

/* ---------------- 调用视觉大模型 ---------------- */

SSZ.aiRecognize = function (dataUrl) {
  var cfg = SSZ.aiConfig();
  var p = SSZ.aiProviders[cfg.provider] || {};
  var baseUrl = cfg.baseUrl || p.baseUrl;
  var model = cfg.model || p.model;
  var key = cfg.apiKey;
  if (!key) return Promise.reject(new Error('未配置 AI 密钥'));
  if (!baseUrl) return Promise.reject(new Error('未配置接口地址'));

  var body = {
    model: model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: SSZ.AI_SYS_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: SSZ.AI_USER_PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  };

  return fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify(body)
  }).then(function (res) {
    return res.text().then(function (txt) {
      if (!res.ok) throw new Error('接口返回 ' + res.status + '：' + (txt || '').slice(0, 140));
      var json;
      try { json = JSON.parse(txt); } catch (e) { throw new Error('返回不是合法 JSON'); }
      var content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!content) throw new Error('返回内容为空');
      return SSZ._parseAiRecords(content);
    });
  });
};

/* ---------------- 本地解析（语音/文字，免密钥） ---------------- */

SSZ._localParseRecord = function (text) {
  var amt = SSZ._extractAmountCents(text);
  if (!amt) return null;
  var type = SSZ._detectType(text);
  var catId = SSZ._detectCategoryId(text, type);
  return {
    id: SSZ.uid('r'),
    type: type,
    amount: amt,
    categoryId: catId,
    accountId: SSZ._defaultAccountId(),
    date: SSZ.todayStr(),
    merchant: '',
    note: text
  };
};

/* ============================================================
   AI 记账页面（聊天式）
   ============================================================ */

SSZ._aiMsgs = SSZ._aiMsgs || [];

SSZ.renderers.ai = function (page) {
  var header = SSZ.pageHeader('AI 记账', {
    back: 'home',
    right: '<button class="ph-gear" type="button" onclick="SSZ.openAiSettings()" aria-label="设置">⚙️</button>'
  });

  var bar =
    '<div class="ai-bar">' +
      '<button class="ai-ic-btn" id="ai-img" type="button" aria-label="传图片">📷</button>' +
      '<input type="file" id="ai-file" accept="image/*" style="display:none">' +
      '<input type="text" id="ai-text" class="ai-text" placeholder="说点什么，或点 🎤 用键盘语音…" autocomplete="off">' +
      '<button class="ai-ic-btn" id="ai-mic" type="button" aria-label="语音">🎤</button>' +
      '<button class="ai-send" id="ai-send" type="button">发送</button>' +
    '</div>';

  page.innerHTML = header +
    '<div class="ai-chat" id="ai-chat"></div>' + bar;

  /* 绑定输入栏 */
  var fileInput = page.querySelector('#ai-file');
  page.querySelector('#ai-img').onclick = function () { fileInput.click(); };
  fileInput.onchange = function () {
    var f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f) SSZ._sendImage(f);
  };
  var textInput = page.querySelector('#ai-text');
  page.querySelector('#ai-mic').onclick = function () { try { textInput.focus(); } catch (e) {} };
  page.querySelector('#ai-send').onclick = function () {
    var v = textInput.value.trim();
    if (!v) return;
    textInput.value = '';
    SSZ._sendText(v);
  };
  textInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var v = textInput.value.trim();
      if (v) { textInput.value = ''; SSZ._sendText(v); }
    }
  });

  SSZ._renderAiChat();
};

SSZ.aiEmpty = function () {
  return '<div class="ai-empty"><div class="ae-ic">🤖</div>' +
    '<div class="ae-t">把账单截图发给我，或说一句</div>' +
    '<div class="ae-s">· 点 📷 上传微信/支付宝/银行截图，自动识别多笔<br>' +
    '· 点 🎤 用键盘语音说「午饭12块」<br>' +
    '· 识别后可逐条改、再批量保存</div></div>';
};

SSZ._renderAiChat = function () {
  var box = document.getElementById('ai-chat');
  if (!box) return;
  var msgs = SSZ._aiMsgs || [];
  if (!msgs.length) { box.innerHTML = SSZ.aiEmpty(); return; }

  var h = '';
  msgs.forEach(function (m) { h += SSZ.aiBubble(m); });
  box.innerHTML = h;

  /* 记录卡片点击 → 编辑 */
  Array.prototype.forEach.call(box.querySelectorAll('.ai-rec'), function (el) {
    el.onclick = function () {
      var id = el.dataset.id;
      var msg = msgs.find(function (x) { return x.records && x.records.some(function (r) { return r.id === id; }); });
      if (!msg) return;
      var rec = msg.records.find(function (r) { return r.id === id; });
      SSZ.openAiRecordSheet(rec, function (nr) { Object.assign(rec, nr); SSZ._renderAiChat(); });
    };
  });
  /* 删除单条 */
  Array.prototype.forEach.call(box.querySelectorAll('.ai-rec-del'), function (el) {
    el.onclick = function (e) {
      e.stopPropagation();
      var id = el.dataset.id;
      msgs.forEach(function (m) { if (m.records) m.records = m.records.filter(function (r) { return r.id !== id; }); });
      SSZ._renderAiChat();
    };
  });
  /* 批量保存 */
  var sb = box.querySelector('#ai-saveall');
  if (sb) sb.onclick = function () {
    var recs = (SSZ._aiMsgs.find(function (m) { return m.records; }) || {}).records || [];
    if (!recs.length) { SSZ.toast('没有可保存的', 'err'); return; }
    SSZ._aiSaveAll(recs);
  };

  box.scrollTop = box.scrollHeight;
};

SSZ.aiBubble = function (m) {
  if (m.role === 'user') {
    if (m.kind === 'image') {
      return '<div class="ai-row user"><div class="ai-bubble user">' +
        '<img src="' + m.src + '" class="ai-thumb" alt="截图"></div></div>';
    }
    return '<div class="ai-row user"><div class="ai-bubble user">' + SSZ.esc(m.text) + '</div></div>';
  }
  if (m.role === 'ai') {
    if (m.loading) {
      return '<div class="ai-row ai"><div class="ai-bubble ai"><span class="ai-loading">识别中<span class="dots"><i>.</i><i>.</i><i>.</i></span></span></div></div>';
    }
    if (m.error) {
      return '<div class="ai-row ai"><div class="ai-bubble ai ai-err">⚠️ ' + SSZ.esc(m.error) + '</div></div>';
    }
    if (m.records) return SSZ.aiRecordsBubble(m);
  }
  if (m.note) {
    return '<div class="ai-note">' + SSZ.esc(m.note) + '</div>';
  }
  return '';
};

SSZ.aiRecordsBubble = function (m) {
  var recs = m.records;
  var cards = recs.map(function (r) {
    var c = SSZ.catById(r.categoryId);
    var a = SSZ.accById(r.accountId);
    var sign = r.type === 'income' ? '+' : '−';
    var cls = r.type === 'income' ? 'is-income' : 'is-expense';
    var sub = [r.merchant, r.note].filter(Boolean).join(' · ');
    return '<div class="ai-rec" data-id="' + r.id + '">' +
      '<span class="ai-rec-ic">' + (c ? c.icon : '📦') + '</span>' +
      '<span class="ai-rec-body">' +
        '<span class="ai-rec-name">' + (c ? SSZ.esc(c.name) : '未分类') + '</span>' +
        (sub ? '<span class="ai-rec-sub">' + SSZ.esc(sub) + '</span>' : '') +
        '<span class="ai-rec-meta">' + SSZ.esc(r.date) + ' · ' + (a ? SSZ.esc(a.name) : '') + '</span>' +
      '</span>' +
      '<span class="ai-rec-right">' +
        '<span class="ai-rec-amt ' + cls + '">' + sign + SSZ.fmt(r.amount) + '</span>' +
        '<span class="ai-rec-del" data-id="' + r.id + '">✕</span>' +
      '</span>' +
      '</div>';
  }).join('');

  return '<div class="ai-row ai"><div class="ai-bubble ai">' +
    '<div class="ai-rec-head">小随共识别到 <b>' + recs.length + '</b> 条流水</div>' +
    cards +
    '<button class="ai-saveall" type="button" id="ai-saveall">✓ 保存全部 ' + recs.length + ' 条 ｜ 批量编辑 ›</button>' +
    '</div></div>';
};

/* ---------------- 发送：图片 ---------------- */

SSZ._sendImage = function (file) {
  var cfg = SSZ.aiConfig();
  if (!cfg.apiKey) {
    SSZ.toast('请先填写 AI 密钥', 'err');
    SSZ.openAiSettings();
    return;
  }
  var objUrl = URL.createObjectURL(file);
  SSZ._aiMsgs.push({ role: 'user', kind: 'image', src: objUrl });
  SSZ._aiMsgs.push({ role: 'ai', loading: true });
  SSZ._renderAiChat();

  SSZ._compressImage(file).then(function (dataUrl) {
    return SSZ.aiRecognize(dataUrl);
  }).then(function (records) {
    SSZ._aiMsgs = SSZ._aiMsgs.filter(function (m) { return !m.loading; });
    if (!records.length) SSZ._aiMsgs.push({ role: 'ai', error: '没识别到账单内容，换张清晰点的截图试试' });
    else SSZ._aiMsgs.push({ role: 'ai', records: records });
    SSZ._renderAiChat();
  }).catch(function (err) {
    SSZ._aiMsgs = SSZ._aiMsgs.filter(function (m) { return !m.loading; });
    SSZ._aiMsgs.push({ role: 'ai', error: (err && err.message) || '识别失败' });
    SSZ._renderAiChat();
  }).then(function () {
    try { URL.revokeObjectURL(objUrl); } catch (e) {}
  });
};

/* ---------------- 发送：文字/语音 ---------------- */

SSZ._sendText = function (text) {
  SSZ._aiMsgs.push({ role: 'user', kind: 'text', text: text });
  var rec = SSZ._localParseRecord(text);
  if (!rec) {
    SSZ._aiMsgs.push({ role: 'ai', error: '没识别到金额，换个说法试试，如「午饭12块」' });
  } else {
    SSZ._aiMsgs.push({ role: 'ai', records: [rec] });
  }
  SSZ._renderAiChat();
};

/* ---------------- 批量保存 ---------------- */

SSZ._aiSaveAll = function (records) {
  var n = 0;
  records.forEach(function (r) {
    SSZ.saveTransaction({
      type: r.type,
      amount: r.amount,
      categoryId: r.categoryId,
      accountId: r.accountId,
      date: r.date,
      note: [r.merchant, r.note].filter(Boolean).join(' · '),
      tags: ['AI']
    });
    n++;
  });
  SSZ._aiMsgs = [];
  SSZ.toast('已保存 ' + n + ' 笔 ✓', 'ok');
  SSZ.navigate('home');
  SSZ.renderCurrent();
};

/* ---------------- 单条编辑弹层 ---------------- */

SSZ.openAiRecordSheet = function (rec, onSave) {
  var st = {
    type: rec.type, amount: rec.amount, categoryId: rec.categoryId,
    accountId: rec.accountId, date: rec.date, note: rec.note || '', merchant: rec.merchant || ''
  };
  var s = SSZ.openSheet({
    title: '编辑这笔',
    body:
      '<div class="vp-row"><span class="vp-label">类型</span>' +
        '<div class="seg vp-type">' +
          '<button class="seg-btn" data-t="expense" type="button">支出</button>' +
          '<button class="seg-btn" data-t="income" type="button">收入</button>' +
        '</div></div>' +
      '<div class="field-row"><span class="fl">金额(元)</span>' +
        '<input class="fv" id="r-amt" inputmode="decimal" value="' + SSZ.fmtPlain(st.amount) + '"></div>' +
      '<div class="field-row"><span class="fl">日期</span>' +
        '<input class="fv" id="r-date" type="date" value="' + st.date + '"></div>' +
      '<div class="field-row"><span class="fl">账户</span>' +
        '<button class="fv" id="r-acc" type="button" style="text-align:right">' + SSZ.esc((SSZ.accById(st.accountId) || {}).name || '请选') + '</button></div>' +
      '<div class="field-row"><span class="fl">备注</span>' +
        '<input class="fv" id="r-note" value="' + SSZ.esc(st.note) + '"></div>' +
      '<div class="vp-label" style="margin:12px 2px 8px">分类</div>' +
      '<div id="r-cat-wrap"></div>' +
      '<button class="key-ok" id="r-save" type="button">完成</button>'
  });

  function renderCats() {
    var cats = SSZ.DB.categories.filter(function (c) { return c.type === st.type; });
    if (!cats.some(function (c) { return c.id === st.categoryId; })) st.categoryId = cats[0] && cats[0].id;
    var html = '<div class="cat-grid">';
    cats.forEach(function (c) {
      html += '<button class="cat-cell' + (c.id === st.categoryId ? ' active' : '') + '" data-id="' + c.id + '" type="button">' +
        '<span class="cat-ic">' + c.icon + '</span>' + SSZ.esc(c.name) + '</button>';
    });
    html += '</div>';
    var wrap = s.body.querySelector('#r-cat-wrap');
    wrap.innerHTML = html;
    Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (b) {
      b.onclick = function () {
        st.categoryId = b.dataset.id;
        Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (x) {
          x.classList.toggle('active', x.dataset.id === st.categoryId);
        });
      };
    });
  }
  function syncType() {
    Array.prototype.forEach.call(s.body.querySelectorAll('.vp-type .seg-btn'), function (b) {
      b.classList.toggle('active', b.dataset.t === st.type);
    });
  }

  Array.prototype.forEach.call(s.body.querySelectorAll('.vp-type .seg-btn'), function (b) {
    b.onclick = function () { st.type = b.dataset.t; syncType(); renderCats(); };
  });
  s.body.querySelector('#r-acc').onclick = function () {
    SSZ.pickAccount(st.accountId).then(function (id) {
      if (id) { st.accountId = id; s.body.querySelector('#r-acc').textContent = SSZ.accById(id).name; }
    });
  };
  s.body.querySelector('#r-note').addEventListener('input', function (e) { st.note = e.target.value; });
  s.body.querySelector('#r-date').addEventListener('change', function (e) { st.date = e.target.value || SSZ.todayStr(); });
  s.body.querySelector('#r-amt').addEventListener('input', function (e) { st.amount = SSZ.parseAmount(e.target.value); });
  s.body.querySelector('#r-save').onclick = function () {
    if (!st.amount) { SSZ.toast('金额不能为 0', 'err'); return; }
    onSave({ type: st.type, amount: st.amount, categoryId: st.categoryId, accountId: st.accountId, date: st.date, note: st.note, merchant: st.merchant });
    s.close();
  };

  syncType();
  renderCats();
};

/* ---------------- AI 设置弹层 ---------------- */

SSZ.openAiSettings = function () {
  var cfg = SSZ.aiConfig();
  var p = SSZ.aiProviders;
  var opts = Object.keys(p).map(function (k) {
    return '<option value="' + k + '"' + (cfg.provider === k ? ' selected' : '') + '>' + p[k].name + '</option>';
  }).join('');
  var s = SSZ.openSheet({
    title: 'AI 记账设置',
    body:
      '<p class="voice-hint">用于图片/截图识别账单。密钥仅存本机，不上传；截图只发给所选 AI 用于识别。</p>' +
      '<div class="field-row"><span class="fl">服务商</span>' +
        '<select class="fv" id="ai-prov">' + opts + '<option value="custom"' + (cfg.provider === 'custom' ? ' selected' : '') + '>自定义</option></select></div>' +
      '<div class="field-row"><span class="fl">模型</span>' +
        '<input class="fv" id="ai-model" value="' + SSZ.esc(cfg.model || '') + '" placeholder="如 qwen-vl-max"></div>' +
      '<div class="field-row"><span class="fl">接口地址</span>' +
        '<input class="fv" id="ai-url" value="' + SSZ.esc(cfg.baseUrl || '') + '" placeholder="https://..."></div>' +
      '<div class="field-row"><span class="fl">API Key</span>' +
        '<input class="fv" id="ai-key" type="password" value="' + SSZ.esc(cfg.apiKey || '') + '" placeholder="粘贴你的密钥"></div>' +
      '<button class="btn btn-primary mt16" id="ai-save" type="button">保存</button>' +
      '<button class="btn btn-ghost mt8" id="ai-clear" type="button">清除密钥</button>'
  });

  s.body.querySelector('#ai-prov').onchange = function () {
    var k = s.body.querySelector('#ai-prov').value;
    var pp = SSZ.aiProviders[k];
    if (pp) {
      s.body.querySelector('#ai-model').value = pp.model;
      s.body.querySelector('#ai-url').value = pp.baseUrl;
    }
  };
  s.body.querySelector('#ai-save').onclick = function () {
    var c = {
      provider: s.body.querySelector('#ai-prov').value,
      model: s.body.querySelector('#ai-model').value.trim(),
      baseUrl: s.body.querySelector('#ai-url').value.trim(),
      apiKey: s.body.querySelector('#ai-key').value.trim()
    };
    if (!c.apiKey) { SSZ.toast('请填写 API Key', 'err'); return; }
    if (!c.baseUrl) { SSZ.toast('请填写接口地址', 'err'); return; }
    SSZ.saveAiConfig(c);
    s.close();
    SSZ.toast('已保存 ✓', 'ok');
  };
  s.body.querySelector('#ai-clear').onclick = function () {
    SSZ.saveAiConfig({});
    s.close();
    SSZ.toast('已清除', 'ok');
  };
};
