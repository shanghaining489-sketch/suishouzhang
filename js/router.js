/* ============================================================
   随手账 · 路由 router.js
   hash 路由：#/home #/stats #/accounts #/mine #/tx-list #/account-detail?id=x
   各页面在 pages-*.js 里注册到 SSZ.renderers
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers = {};
SSZ.currentRoute = { name: 'home', params: {} };

SSZ.parseHash = function () {
  const h = location.hash || '#/home';
  const qi = h.indexOf('?');
  const path = (qi > 0 ? h.slice(0, qi) : h).replace(/^#\/?/, '') || 'home';
  const params = {};
  if (qi > 0) {
    h.slice(qi + 1).split('&').forEach(function (kv) {
      const p = kv.split('=');
      if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
  }
  return { name: path, params: params };
};

SSZ.navigate = function (name, params) {
  let h = '#/' + name;
  if (params) {
    const qs = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    if (qs) h += '?' + qs;
  }
  if (location.hash === h) SSZ.renderCurrent();
  else location.hash = h;
};

SSZ.renderCurrent = function () {
  const r = SSZ.parseHash();
  SSZ.currentRoute = r;
  const page = document.getElementById('page');
  Array.prototype.forEach.call(document.querySelectorAll('#tabbar .tab'), function (t) {
    t.classList.toggle('active', t.dataset.route === r.name);
  });
  const renderer = SSZ.renderers[r.name];
  page.innerHTML = '';
  if (!renderer) {
    page.innerHTML = '<div class="empty"><div class="ei">🧭</div><div class="et">页面不存在</div></div>';
    return;
  }
  renderer(page, r.params);
  window.scrollTo(0, 0);
};

SSZ.startRouter = function () {
  window.addEventListener('hashchange', SSZ.renderCurrent);
  Array.prototype.forEach.call(document.querySelectorAll('#tabbar .tab'), function (t) {
    t.addEventListener('click', function () { SSZ.navigate(t.dataset.route); });
  });
  SSZ.renderCurrent();
};

/* ---------------- 页面头（含返回/右侧自定义） ---------------- */

SSZ.pageHeader = function (title, opts) {
  opts = opts || {};
  const back = opts.back
    ? '<button class="ph-back" type="button" onclick="SSZ.navigate(\'' + opts.back + '\')">‹</button>'
    : '';
  return '<div class="page-header">' +
    '<div class="ph-left">' + back + '<div class="page-title">' + SSZ.esc(title) + '</div></div>' +
    (opts.right || '') +
    '</div>';
};

/* 月份切换按钮（首页/统计/明细共用） */
SSZ.monthSwitch = function (ym) {
  return '<button class="month-switch" type="button" onclick="SSZ._pickMonth(\'' + ym + '\')">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M8 2v3M16 2v3M3 9h18"/><rect x="3" y="5" width="18" height="17" rx="2"/></svg>' +
    SSZ.monthLabel(ym) + '</button>';
};

// 由各页面覆写：拿到新月份后重渲染
SSZ._pickMonth = function (ym) {
  SSZ.pickMonth(ym).then(function (m) {
    if (m && SSZ.onMonthPicked) SSZ.onMonthPicked(m);
  });
};
