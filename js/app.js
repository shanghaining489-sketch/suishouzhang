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
  // 测试辅助：?theme=dark 强制深色（供无头浏览器截图验证）
  if (location.search.indexOf('theme=dark') >= 0) {
    SSZ.DB.settings.theme = 'dark';
    SSZ.persistNow();
  }
  SSZ.applyTheme();
  // 测试辅助：URL 带 ?seed=demo 时生成演示数据（须在首帧渲染前）
  if (location.search.indexOf('seed=demo') >= 0) SSZ.seedDemo();
  SSZ.registerSW();
  document.getElementById('fab-add').addEventListener('click', function () {
    SSZ.openTxSheet(null);
  });
  SSZ.startRouter();
  // 测试辅助：?sheet=xxx 自动打开对应弹层（供无头浏览器截图验证）
  const sh = (location.search.match(/[?&]sheet=([a-z]+)/) || [])[1];
  if (sh) {
    setTimeout(function () {
      if (sh === 'add') SSZ.openTxSheet(null);
      else if (sh === 'transfer') SSZ.openTransferSheet();
      else if (sh === 'filter') SSZ.openTxFilterSheet(SSZ.curMonth());
      else if (sh === 'csv') SSZ.openCsvImportSheet();
    }, 300);
  }
  // 测试辅助：?snapdemo=1 预置两个快照样本（供无头浏览器截图验证）
  if (location.search.indexOf('snapdemo=1') >= 0) {
    setTimeout(function () {
      SSZ.takeSnapshot('正式开账前');
      SSZ.takeSnapshot('导入账单前', true);
      SSZ.renderCurrent();
    }, 400);
  }
  // 测试辅助：?measure=1 把弹层高度写进 title，供无头浏览器读取（判断是否一屏装完）
  if (location.search.indexOf('measure=1') >= 0) {
    setTimeout(function () {
      const p = document.querySelector('.sheet-tx');
      if (!p) { document.title = 'MEASURE:no-sheet'; return; }
      document.title = 'MEASURE vh=' + window.innerHeight +
        ' panel=' + p.clientHeight + ' scroll=' + p.scrollHeight +
        ' overflow=' + (p.scrollHeight - p.clientHeight) +
        ' strip=' + (function () {
          const st = p.querySelector('.cat-strip');
          return st ? (st.clientWidth + '/' + st.scrollWidth) : 'none';
        })();
    }, 900);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', SSZ.boot);
} else {
  SSZ.boot();
}
