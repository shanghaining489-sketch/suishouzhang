/* ============================================================
   随手账 · UI 组件 ui.js
   toast / confirm / 底部弹层 sheet / 月份选择 / emoji 选择
   ============================================================ */
window.SSZ = window.SSZ || {};

/* ---------------- Toast ---------------- */

SSZ.toast = function (msg, type, dur) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function () {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 260);
  }, dur || 1800);
};

/* ---------------- 确认对话框（返回 Promise<boolean>） ---------------- */

SSZ.confirm = function (title, msg, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    const mask = document.createElement('div');
    mask.className = 'dialog-mask';
    mask.innerHTML =
      '<div class="dialog">' +
      '<div class="dialog-body">' +
      '<div class="dialog-title">' + SSZ.esc(title) + '</div>' +
      (msg ? '<div class="dialog-msg">' + SSZ.esc(msg) + '</div>' : '') +
      '</div>' +
      '<div class="dialog-btns">' +
      '<button class="cancel">' + SSZ.esc(opts.cancelText || '取消') + '</button>' +
      '<button class="ok' + (opts.danger ? ' danger' : '') + '">' + SSZ.esc(opts.okText || '确定') + '</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    function done(v) { mask.remove(); resolve(v); }
    mask.querySelector('.cancel').onclick = function () { done(false); };
    mask.querySelector('.ok').onclick = function () { done(true); };
    mask.onclick = function (e) { if (e.target === mask) done(false); };
  });
};

/* ---------------- 底部弹层 ---------------- */

/* 支持多层堆叠：
   - 页面级弹层（不传 stack）：先清空已有内容，再打开，避免快速连点产生重复层
   - 嵌套弹层（stack:true）：保留父层，往上追加。用于「记一笔」里再选账户、编辑账户时再选图标
     以前这里无条件 root.innerHTML=''，会把父面板连 DOM 一起销毁，导致选完账户回调报错、表单丢失 */
SSZ.openSheet = function (opts) {
  opts = opts || {};
  const root = document.getElementById('sheet-root');
  if (!opts.stack) root.innerHTML = '';
  const depth = root.querySelectorAll('.sheet-panel').length;
  const zBase = 200 + depth * 4;

  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  mask.style.zIndex = String(zBase);
  const panel = document.createElement('div');
  panel.className = 'sheet-panel';
  panel.style.zIndex = String(zBase + 1);
  panel.innerHTML =
    '<div class="sheet-head">' +
    '<div class="sheet-title">' + SSZ.esc(opts.title || '') + '</div>' +
    '<button class="sheet-close" aria-label="关闭">✕</button>' +
    '</div>' +
    '<div class="sheet-body">' + (opts.body || '') + '</div>';
  root.appendChild(mask);
  root.appendChild(panel);

  let closed = false;
  const api = { panel: panel, body: panel.querySelector('.sheet-body'), close: null, onClose: null };
  api.close = function () {
    if (closed) return;
    closed = true;
    mask.remove();
    panel.remove();
    /* 只有全部层都关完才恢复页面滚动，否则内层关闭会把外层的滚动锁解掉 */
    if (!root.querySelector('.sheet-panel')) document.body.style.overflow = '';
    if (opts.onClose) opts.onClose();
    if (typeof api.onClose === 'function') api.onClose();
  };
  mask.onclick = api.close;
  panel.querySelector('.sheet-close').onclick = api.close;
  document.body.style.overflow = 'hidden';
  return api;
};

/* ---------------- 月份选择（返回 Promise<'YYYY-MM' | null>） ---------------- */

SSZ.pickMonth = function (cur) {
  return new Promise(function (resolve) {
    let y = Number(cur.split('-')[0]);
    let m = Number(cur.split('-')[1]);
    const s = SSZ.openSheet({
      title: '选择月份',
      stack: true,
      body:
        '<div class="month-pick">' +
        '<div class="mp-row">' +
        '<button class="mp-nav" data-d="-1" type="button">‹</button>' +
        '<div class="mp-cur"></div>' +
        '<button class="mp-nav" data-d="1" type="button">›</button>' +
        '</div>' +
        '<button class="btn btn-primary mt16" id="mp-ok" type="button">看这一月</button>' +
        '</div>'
    });
    let picked = null;
    const curEl = s.body.querySelector('.mp-cur');
    function render() { curEl.textContent = y + '年' + m + '月'; }
    render();
    Array.prototype.forEach.call(s.body.querySelectorAll('.mp-nav'), function (b) {
      b.onclick = function () {
        m += Number(b.dataset.d);
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        render();
      };
    });
    s.body.querySelector('#mp-ok').onclick = function () {
      picked = y + '-' + SSZ.pad2(m);
      s.close();
    };
    s.onClose = function () { resolve(picked); };
  });
};

/* ---------------- emoji 选择（返回 Promise<emoji|null>） ---------------- */

SSZ.EMOJI_POOL = [
  '🍚', '🍜', '🍱', '🍺', '☕', '🚌', '🚕', '🚇', '⛽', '🚗',
  '🛒', '👕', '💄', '🏠', '💡', '💧', '📦', '🎮', '🎬', '🎵',
  '💊', '🏥', '🎁', '🧧', '📚', '✏️', '📱', '💻', '📶', '🐱',
  '💰', '🧧', '💼', '📈', '🏦', '💳', '💵', '🎂', '🌹', '✈️',
  '🏋️', '⚽', '🎨', '🔧', '🧹', '🐶', '🌳', '⭐', '❤️', '✅'
];

SSZ.pickEmoji = function (current) {
  return new Promise(function (resolve) {
    const grid = SSZ.EMOJI_POOL.map(function (e) {
      return '<button type="button" data-e="' + e + '"' + (e === current ? ' class="active"' : '') + '>' + e + '</button>';
    }).join('');
    const s = SSZ.openSheet({
      title: '选择图标',
      stack: true,
      body: '<div class="emoji-grid">' + grid + '</div>'
    });
    let picked = null;
    Array.prototype.forEach.call(s.body.querySelectorAll('button'), function (b) {
      b.onclick = function () { picked = b.dataset.e; s.close(); };
    });
    s.onClose = function () { resolve(picked); };
  });
};

/* ---------------- Chart.js 兜底加载 ---------------- */

SSZ.ensureChart = function (cb) {
  if (window.Chart) return cb();
  const s = document.createElement('script');
  s.src = 'libs/chart.umd.min.js';
  s.onload = cb;
  s.onerror = function () { if (SSZ.toast) SSZ.toast('图表组件加载失败，请检查网络', 'err'); };
  document.head.appendChild(s);
};
