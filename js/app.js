/* ============================================================
   随手账 · 启动入口 app.js
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.registerSW = function () {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return; // file:// 直开自动跳过
  navigator.serviceWorker.register('sw.js').catch(function (e) {
    console.warn('[随手账] Service Worker 注册失败：', e);
  });
};

SSZ.boot = function () {
  SSZ.loadAll();
  // 测试辅助：URL 带 ?seed=demo 时生成演示数据（须在首帧渲染前）
  if (location.search.indexOf('seed=demo') >= 0) SSZ.seedDemo();
  SSZ.registerSW();
  document.getElementById('fab-add').addEventListener('click', function () {
    SSZ.openTxSheet(null);
  });
  SSZ.startRouter();
  // 测试辅助：URL 带 ?sheet=add 时自动打开记账弹层（供无头浏览器截图验证）
  if (location.search.indexOf('sheet=add') >= 0) {
    setTimeout(function () { SSZ.openTxSheet(null); }, 300);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', SSZ.boot);
} else {
  SSZ.boot();
}
