/* ============================================================
   随手账 · 语音记账 voice.js (v1.1)
   方案：iOS 键盘原生语音输入 + 本地解析
   - 点输入框 → 点键盘上的 🎤 说话 → 文字进文本框
   - 本地即时解析：金额（分）/ 收支类型 / 分类
   - 零后端、零密钥、不上传任何数据
   ============================================================ */
window.SSZ = window.SSZ || {};

/* ---------- 中文数字 → 阿拉伯 ---------- */
SSZ._cnDigit = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
SSZ._cnUnit = { '十': 10, '百': 100, '千': 1000 };

SSZ._cnToNum = function (token) {
  var d = SSZ._cnDigit, u = SSZ._cnUnit;
  var total = 0, sec = 0, num = 0;
  for (var i = 0; i < token.length; i++) {
    var ch = token[i];
    if (d[ch] !== undefined) { num = d[ch]; }
    else if (u[ch]) {
      if (u[ch] === 10 && num === 0) num = 1; // 「十」单独=10；「十X」=1X
      sec += num * u[ch];
      num = 0;
    } else if (ch === '万') {
      total += (sec + num) * 10000; sec = 0; num = 0;
    }
  }
  return total + sec + num;
};

/* 把整段文字里的中文数字 token 先转成阿拉伯，方便后面统一用正则提金额 */
SSZ._normalizeNums = function (text) {
  return (text || '').replace(/[零一二两三四五六七八九十百千万]+/g, function (m) {
    return String(SSZ._cnToNum(m));
  });
};

/* ---------- 金额提取（返回「分」整数，识别不到返回 null） ---------- */
SSZ._extractAmountCents = function (raw) {
  var text = SSZ._normalizeNums(raw);
  var m, val = null;

  // 1) X块Y / X块Y毛  →  X.Y（Y 是角，单数字）如「56块5」
  m = text.match(/(\d+)\s*块\s*(\d)\s*(?:毛|角)?/);
  if (m) val = parseInt(m[1], 10) + parseInt(m[2], 10) / 10;

  // 2) 带单位的小数/整数：12元 / 12.5块
  if (val === null) {
    m = text.match(/(\d+(?:\.\d+)?)\s*(?:块|元|元钱|块钱)/);
    if (m) val = parseFloat(m[1]);
  }

  // 3) 纯数字兜底：咖啡28 / 花了二十
  if (val === null) {
    m = text.match(/(\d+(?:\.\d+)?)/);
    if (m) val = parseFloat(m[1]);
  }

  if (val === null || isNaN(val) || val <= 0) return null;
  if (val > 10000000) return null; // 单笔上限保护
  return Math.round(val * 100);
};

/* ---------- 收支类型识别 ---------- */
SSZ._incomeWords = ['收入', '工资', '薪水', '月薪', '奖金', '兼职', '外快', '红包', '报销', '收款', '收到', '进账', '返现', '利息', '收益', '理财', '分红'];
SSZ._detectType = function (text) {
  for (var i = 0; i < SSZ._incomeWords.length; i++) {
    if (text.indexOf(SSZ._incomeWords[i]) >= 0) return 'income';
  }
  return 'expense';
};

/* ---------- 分类关键词（按优先级，越靠前越优先） ---------- */
SSZ._catKeywords = {
  expense: [
    ['交通', ['打车', '出租车', '滴滴', '网约车', '地铁', '公交', '车票', '加油', '油费', '停车', '高铁', '火车', '机票', '飞机', '过路', '过桥', '摩的', '单车', '自行车', 'ride', 'uber']],
    ['医疗', ['药', '医院', '看病', '诊所', '医保', '体检', '牙', '眼科', '挂号', '问诊', '疫苗']],
    ['通讯', ['话费', '流量', '手机费', '通讯', '充值']],
    ['居住', ['房租', '水电', '水费', '电费', '物业', '燃气', '煤气', '宽带', '网费', '装修', '搬家', '取暖']],
    ['娱乐', ['电影', '游戏', '视频', '会员', '唱k', 'ktv', '旅游', '旅行', '演出', '演唱会', '门票', '酒吧', '密室', '桌游', '健身']],
    ['学习', ['书', '课程', '培训', '网课', '考试', '学费', '资料', '文具']],
    ['人情', ['红包', '送礼', '份子', '请客', '随礼', '人情', '礼金', '白事', '喜事']],
    ['餐饮', ['饭', '吃', '午餐', '午饭', '早饭', '早餐', '晚饭', '晚餐', '食堂', '餐厅', '餐馆', '外卖', '咖啡', '奶茶', '小吃', '宵夜', '夜宵', '汉堡', '面', '粉', '火锅', '烧烤', '饭店', '早茶', '下午茶', '甜品', '蛋糕', '面包', '水果', '零食', '饮料', '酒', '喝']],
    ['购物', ['买', '超市', '淘宝', '京东', '拼多多', '网购', '衣服', '服装', '鞋', '数码', '电器', '百货', '商场', '便利店', '日用品', '化妆品', '护肤', '礼品', '家居', '家具']]
  ],
  income: [
    ['工资', ['工资', '薪水', '月薪', '发工资']],
    ['奖金', ['奖金', '年终奖', '绩效']],
    ['兼职', ['兼职', '外快', '副业']],
    ['理财', ['利息', '理财', '分红', '收益', '基金']],
    ['红包', ['红包', '收红包']]
  ]
};

SSZ._catIdByName = function (name, type) {
  var cats = SSZ.DB.categories.filter(function (c) { return c.type === type; });
  var hit = cats.filter(function (c) { return c.name === name; })[0];
  if (hit) return hit.id;
  var other = cats.filter(function (c) { return c.name === '其他'; })[0];
  return other ? other.id : (cats[0] ? cats[0].id : null);
};

SSZ._detectCategoryId = function (text, type) {
  var list = SSZ._catKeywords[type] || [];
  for (var i = 0; i < list.length; i++) {
    var kws = list[i][1];
    for (var j = 0; j < kws.length; j++) {
      if (text.indexOf(kws[j]) >= 0) return SSZ._catIdByName(list[i][0], type);
    }
  }
  var other = SSZ.DB.categories.filter(function (c) { return c.type === type && c.name === '其他'; })[0];
  return other ? other.id : null;
};

/* ---------- 默认账户（优先现金） ---------- */
SSZ._defaultAccount = function () {
  var cash = SSZ.DB.accounts.filter(function (a) { return a.active && a.type === 'cash'; })[0];
  if (cash) return cash;
  return SSZ.DB.accounts.filter(function (a) { return a.active; })[0] || null;
};

/* ============================================================
   语音记账弹层
   ============================================================ */
SSZ.openVoiceSheet = function () {
  var acc = SSZ._defaultAccount();
  var st = {
    type: 'expense',
    typeManual: false,
    categoryId: null,
    catManual: false,
    amount: null,
    accountId: acc ? acc.id : null,
    text: ''
  };

  var s = SSZ.openSheet({
    title: '语音记账',
    body:
      '<p class="voice-hint">点下面输入框，再点键盘上的 🎤 说话。<br>例如：「午饭12块」「打车去机场38元」「超市买菜56块5」</p>' +
      '<textarea id="voice-text" class="voice-text" rows="3" placeholder="说点什么…"></textarea>' +
      '<div class="voice-preview">' +
        '<div class="vp-row"><span class="vp-label">类型</span>' +
          '<div class="seg vp-type">' +
            '<button class="seg-btn" data-t="expense" type="button">支出</button>' +
            '<button class="seg-btn" data-t="income" type="button">收入</button>' +
          '</div></div>' +
        '<div class="vp-row"><span class="vp-label">金额</span><span class="vp-val none" id="vp-amount">未识别</span></div>' +
        '<div class="vp-row"><span class="vp-label">账户</span>' +
          '<button class="vp-account" id="vp-account" type="button">' + (acc ? SSZ.esc(acc.name) : '请选账户') + '</button></div>' +
        '<div class="vp-label" style="margin-top:12px">分类</div>' +
        '<div id="voice-cat-wrap"></div>' +
      '</div>' +
      '<button class="key-ok" id="voice-save" type="button" disabled>确认入账</button>'
  });

  var $ = function (id) { return s.body.querySelector('#' + id); };
  var ta = $('voice-text');

  function renderCats() {
    var cats = SSZ.DB.categories.filter(function (c) { return c.type === st.type; });
    if (!st.categoryId || !cats.some(function (c) { return c.id === st.categoryId; })) {
      st.categoryId = (cats[0] && cats[0].id) || null;
    }
    var html = '<div class="cat-grid">';
    cats.forEach(function (c) {
      var cls = 'cat-cell' + (c.id === st.categoryId ? ' active' : '');
      html += '<button class="' + cls + '" data-id="' + c.id + '" type="button">' +
        '<span class="cat-ic">' + c.icon + '</span>' + SSZ.esc(c.name) + '</button>';
    });
    html += '</div>';
    var wrap = $('voice-cat-wrap');
    wrap.innerHTML = html;
    Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (b) {
      b.onclick = function () {
        st.catManual = true;
        st.categoryId = b.dataset.id;
        Array.prototype.forEach.call(wrap.querySelectorAll('.cat-cell'), function (x) {
          x.classList.toggle('active', x.dataset.id === st.categoryId);
        });
      };
    });
  }

  function syncTypeUI() {
    Array.prototype.forEach.call(s.body.querySelectorAll('.vp-type .seg-btn'), function (b) {
      b.classList.toggle('active', b.dataset.t === st.type);
    });
  }

  function updatePreview() {
    var amtEl = $('vp-amount');
    if (st.amount) {
      amtEl.textContent = '¥' + SSZ.fmtPlain(st.amount);
      amtEl.classList.remove('none');
    } else {
      amtEl.textContent = '未识别';
      amtEl.classList.add('none');
    }
    $('voice-save').disabled = !st.amount;
  }

  function reparse() {
    var text = ta.value.trim();
    st.text = text;
    st.amount = SSZ._extractAmountCents(text);
    if (!st.typeManual) {
      st.type = SSZ._detectType(text);
      syncTypeUI();
    }
    if (!st.catManual) {
      st.categoryId = SSZ._detectCategoryId(text, st.type);
    }
    renderCats();
    updatePreview();
  }

  /* 类型切换 */
  Array.prototype.forEach.call(s.body.querySelectorAll('.vp-type .seg-btn'), function (b) {
    b.onclick = function () {
      st.typeManual = true;
      st.type = b.dataset.t;
      st.catManual = false;
      syncTypeUI();
      st.categoryId = SSZ._detectCategoryId(ta.value.trim(), st.type);
      renderCats();
    };
  });

  /* 账户选择 */
  $('vp-account').onclick = function () {
    SSZ.pickAccount(st.accountId).then(function (id) {
      if (id) {
        st.accountId = id;
        var a = SSZ.accById(id);
        $('vp-account').textContent = a ? a.name : '请选账户';
      }
    });
  };

  /* 输入即解析 */
  ta.addEventListener('input', reparse);

  /* 保存 */
  $('voice-save').onclick = function () {
    if (!st.amount) { SSZ.toast('没识别到金额，请在上面补一下', 'err'); return; }
    if (!st.accountId) { SSZ.toast('请先选账户', 'err'); return; }
    if (!st.categoryId) { SSZ.toast('请选分类', 'err'); return; }
    SSZ.saveTransaction({
      type: st.type,
      amount: st.amount,
      categoryId: st.categoryId,
      accountId: st.accountId,
      date: SSZ.todayStr(),
      note: st.text,
      tags: []
    });
    s.close();
    SSZ.toast('已记一笔 ✓', 'ok');
    SSZ.renderCurrent();
  };

  /* 初始化 */
  syncTypeUI();
  renderCats();
  updatePreview();

  /* 自动聚焦输入框，唤起键盘（含 🎤 按钮） */
  setTimeout(function () { try { ta.focus(); } catch (e) {} }, 320);
};
