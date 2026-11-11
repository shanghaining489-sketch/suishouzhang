/* ============================================================
   随手账 · 我的 pages-mine.js
   功能入口 + 存储用量 + 关于
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.mine = function (page) {
  const si = SSZ.storageInfo();
  const txCount = SSZ.DB.transactions.length;
  const snaps = SSZ._snapList ? SSZ._snapList() : [];

  let html = SSZ.pageHeader('我的', {});

  html +=
    '<div class="block"><div class="list-group">' +
    SSZ.mineRow('🤖', 'AI 智能记账', '语音 + 截图自动识别', 'ai') +
    SSZ.mineRow('⚡', '常用模板', '一键记重复的账', 'templates') +
    SSZ.mineRow('🧩', '自动分类规则', '关键词 → 分类，识别更准', 'rules') +
    '<button class="list-row" id="mine-transfer" type="button"><span class="list-ic">🔄</span>' +
    '<span class="list-label">账户间转账</span><span class="list-chev">›</span></button>' +
    SSZ.mineRow('🏷️', '分类管理', '自定义收支分类', 'categories') +
    SSZ.mineRow('🎯', '月度预算', '控制每月花销', 'budget') +
    SSZ.mineRow('🐷', '存钱目标', '攒钱进度追踪', 'goals') +
    SSZ.mineRow('🔁', '定期记账', '房租工资自动提醒', 'recurring') +
    '</div></div>';

  html +=
    '<div class="block"><div class="list-group">' +
    SSZ.mineRow('💾', '备份与恢复', '导出 JSON / CSV 账单导入', 'backup') +
    SSZ.mineRow('📸', '快照与回滚',
      snaps.length ? (snaps.length + ' 个还原点 · ' + SSZ._snapTime(snaps[0].at)) : '存还原点，改错了能回来',
      'snapshots') +
    SSZ.mineRow('♻️', '重置数据', '清空测试数据 / 恢复出厂', 'reset') +
    '<button class="list-row" id="mine-theme" type="button"><span class="list-ic">🌗</span>' +
    '<span class="list-label">外观</span><span class="list-value">' + SSZ.themeLabel() + '</span><span class="list-chev">›</span></button>' +
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
  page.querySelector('#mine-transfer').onclick = function () { SSZ.openTransferSheet(); };
  page.querySelector('#mine-theme').onclick = function () { SSZ.cycleTheme(); SSZ.renderCurrent(); };
};

SSZ.mineRow = function (icon, label, value, route) {
  return '<button class="list-row" data-nav="' + route + '" type="button">' +
    '<span class="list-ic">' + icon + '</span>' +
    '<span class="list-label">' + label + '</span>' +
    '<span class="list-value">' + value + '</span>' +
    '<span class="list-chev">›</span></button>';
};
