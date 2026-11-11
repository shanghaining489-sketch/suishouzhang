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
  // 测试辅助：?acctlayer=1 停在「选择账户」这一层，供截图确认是叠在记一笔上面而不是替换
  if (location.search.indexOf('acctlayer=1') >= 0) {
    setTimeout(function () {
      SSZ.openTxSheet(null);
      const body = document.querySelector('.sheet-tx .sheet-body');
      ['1', '2', '3'].forEach(function (k) {
        const b = body.querySelector('.key[data-k="' + k + '"]');
        if (b) b.click();
      });
      body.querySelector('#tx-account-row').click();
    }, 500);
  }
  // 测试辅助：?acctest=1 验证「记一笔」里切换账户时父面板不被销毁、金额不丢
  if (location.search.indexOf('acctest=1') >= 0) {
    setTimeout(function () {
      const log = [];
      SSZ.openTxSheet(null);
      const body = document.querySelector('.sheet-tx .sheet-body');
      ['1', '2', '3'].forEach(function (k) {
        const b = body.querySelector('.key[data-k="' + k + '"]');
        if (b) b.click();
      });
      body.querySelector('#tx-account-row').click();
      log.push('layers=' + document.querySelectorAll('#sheet-root .sheet-panel').length);
      let target = null;
      Array.prototype.forEach.call(document.querySelectorAll('#sheet-root .sheet-panel'), function (p) {
        const t = p.querySelector('.sheet-title');
        if (!t || t.textContent !== '选择账户') return;
        Array.prototype.forEach.call(p.querySelectorAll('.cat-cell'), function (c) {
          if (c.textContent.indexOf('支付宝') >= 0) target = c;
        });
      });
      log.push('found=' + (target ? 'yes' : 'no'));
      if (target) target.click();
      setTimeout(function () {
        const panels = document.querySelectorAll('#sheet-root .sheet-panel').length;
        const nameEl = document.querySelector('#tx-account-name');
        const amtEl = document.querySelector('#tx-amount');
        log.push('layersAfter=' + panels);
        log.push('name=' + (nameEl ? nameEl.textContent : 'NULL'));
        log.push('amount=' + (amtEl ? amtEl.textContent : 'NULL'));
        const ok = panels === 1 && nameEl && nameEl.textContent.indexOf('支付宝') >= 0 &&
          amtEl && amtEl.textContent === '123';
        document.title = 'ACCTEST ' + (ok ? 'PASS' : 'FAIL') + ' | ' + log.join(' | ');
      }, 250);
    }, 500);
  }
  // 测试辅助：?nesttest=1 验证其余嵌套弹层（编辑账户选图标 / 选月份）同样不销毁父层
  if (location.search.indexOf('nesttest=1') >= 0) {
    setTimeout(function () {
      const log = [];
      SSZ.openAccountSheet(null);
      document.querySelector('#acc-icon').click();
      log.push('emojiLayers=' + document.querySelectorAll('#sheet-root .sheet-panel').length);
      const emojiBtn = document.querySelector('#sheet-root .emoji-grid button');
      if (emojiBtn) emojiBtn.click();
      setTimeout(function () {
        const iconEl = document.querySelector('#acc-icon');
        log.push('emojiLayersAfter=' + document.querySelectorAll('#sheet-root .sheet-panel').length);
        log.push('icon=' + (iconEl ? iconEl.textContent : 'NULL'));
        const accOk = iconEl && emojiBtn && iconEl.textContent === emojiBtn.dataset.e;
        // 关掉账户弹层，再测月份选择
        const closeBtn = document.querySelector('#sheet-root .sheet-panel .sheet-close');
        if (closeBtn) closeBtn.click();
        SSZ.pickMonth('2026-11').then(function (m) {
          log.push('month=' + m);
          const okAll = accOk && m === '2026-12';
          document.title = 'NESTTEST ' + (okAll ? 'PASS' : 'FAIL') + ' | ' + log.join(' | ');
        });
        setTimeout(function () {
          const next = document.querySelector('#sheet-root .sheet-panel .mp-nav[data-d="1"]');
          if (next) next.click();
          const okBtn = document.querySelector('#sheet-root #mp-ok');
          if (okBtn) okBtn.click();
        }, 150);
      }, 200);
    }, 500);
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
