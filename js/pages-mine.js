/* ============================================================
   随手账 · 我的 pages-mine.js
   功能入口 + 存储用量 + 关于
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.mine = function (page) {
  const si = SSZ.storageInfo();
  const txCount = SSZ.DB.transactions.length;

  let html = SSZ.pageHeader('我的', {});

  html +=
    '<div class="block"><div class="list-group">' +
    SSZ.mineRow('🏷️', '分类管理', '自定义收支分类', 'categories') +
    SSZ.mineRow('🎯', '月度预算', '控制每月花销', 'budget') +
    SSZ.mineRow('🐷', '存钱目标', '攒钱进度追踪', 'goals') +
    SSZ.mineRow('🔁', '定期记账', '房租工资自动提醒', 'recurring') +
    '</div></div>';

  html +=
    '<div class="block"><div class="list-group">' +
    SSZ.mineRow('💾', '备份与恢复', '导出 JSON，数据不出设备', 'backup') +
    '<div class="list-row"><span class="list-ic">📦</span>' +
    '<span class="list-label">存储用量</span>' +
    '<span class="list-value">' + txCount + ' 笔 · ' + si.kb.toFixed(1) + ' KB</span></div>' +
    SSZ.mineRow('ℹ️', '关于随手账', 'v' + SSZ.VERSION, 'about') +
    '</div></div>';

  html += '<div class="fab-hint">数据只存在本机浏览器 · 换设备请用备份迁移</div>';

  page.innerHTML = html;

  Array.prototype.forEach.call(page.querySelectorAll('[data-nav]'), function (el) {
    el.onclick = function () { SSZ.navigate(el.dataset.nav); };
  });
};

SSZ.mineRow = function (icon, label, value, route) {
  return '<button class="list-row" data-nav="' + route + '" type="button">' +
    '<span class="list-ic">' + icon + '</span>' +
    '<span class="list-label">' + label + '</span>' +
    '<span class="list-value">' + value + '</span>' +
    '<span class="list-chev">›</span></button>';
};
