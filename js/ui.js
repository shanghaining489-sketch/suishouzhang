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

SSZ.openSheet = function (opts) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = '';
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const panel = document.createElement('div');
  panel.className = 'sheet-panel';
  panel.innerHTML =
    '<div class="sheet-head">' +
    '<div class="sheet-title">' + SSZ.esc(opts.title || '') + '</div>' +
    '<button class="sheet-close" aria-label="关闭">✕</button>' +
    '</div>' +
    '<div class="sheet-body">' + (opts.body || '') + '</div>';
  root.appendChild(mask);
  root.appendChild(panel);
  function close() {
    root.innerHTML = '';
    document.body.style.overflow = '';
    if (opts.onClose) opts.onClose();
  }
  mask.onclick = close;
  panel.querySelector('.sheet-close').onclick = close;
  document.body.style.overflow = 'hidden';
  return { panel: panel, body: panel.querySelector('.sheet-body'), close: close };
};

/* ---------------- 月份选择（返回 Promise<'YYYY-MM' | null>） ---------------- */

SSZ.pickMonth = function (cur) {
  return new Promise(function (resolve) {
    let y = Number(cur.split('-')[0]);
    let m = Number(cur.split('-')[1]);
    const s = SSZ.openSheet({
      title: '选择月份',
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
      s.close();
      resolve(y + '-' + SSZ.pad2(m));
    };
    s.onClose = function () { resolve(null); };
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
      body: '<div class="emoji-grid">' + grid + '</div>'
    });
    Array.prototype.forEach.call(s.body.querySelectorAll('button'), function (b) {
      b.onclick = function () { s.close(); resolve(b.dataset.e); };
    });
    s.onClose = function () { resolve(null); };
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
