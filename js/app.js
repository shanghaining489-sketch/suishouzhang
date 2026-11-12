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
  // 测试辅助：?aiset=1 直接打开 AI 设置弹层（截图用）
  if (location.search.indexOf('aiset=1') >= 0) {
    setTimeout(function () { SSZ.openAiSettings(); }, 400);
  }
  // 测试辅助：?aiping=1 用假密钥打一次真实请求，验证网络/CORS/错误翻译链路
  if (location.search.indexOf('aiping=1') >= 0) {
    setTimeout(function () {
      var cfg = {
        provider: 'dashscope',
        model: 'qwen3-vl-plus',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: 'sk-invalid-probe-000'
      };
      SSZ._aiPing(cfg).then(function (r) {
        document.title = 'PING OK | ' + r.model + ' | ' + r.ms + 'ms';
      }, function (e) {
        document.title = 'PING ERR | ' + ((e && e.message) || 'unknown');
      });
    }, 400);
  }
  // 测试辅助：?aiold=1 模拟「老配置里躺着已下线模型」的场景
  if (location.search.indexOf('aiold=1') >= 0) {
    setTimeout(function () {
      SSZ.saveAiConfig({
        provider: 'dashscope',
        model: 'qwen-vl-plus',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: 'sk-old-key-000'
      });
      SSZ.openAiSettings();
    }, 400);
  }
  // 测试辅助：?aichip=1 验证 v2.0 只保留两个模型，且老配置里的 qwen3-vl-flash 会被红条提示
  if (location.search.indexOf('aichip=1') >= 0) {
    setTimeout(function () {
      SSZ.saveAiConfig({
        provider: 'dashscope',
        model: 'qwen3-vl-flash',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: 'sk-old-key-000'
      });
      SSZ.openAiSettings();
      setTimeout(function () {
        var chips = document.querySelectorAll('#ai-model-chips .ai-chip');
        var names = Array.prototype.map.call(chips, function (b) { return b.dataset.m; }).join(',');
        var warnEl = document.querySelector('.ai-test-out.err');
        var warnTxt = warnEl ? (warnEl.textContent.indexOf('下线') >= 0 ? 'warn=1' : 'warn=0') : 'warn=none';
        document.title = 'CHIP n=' + chips.length + ' | ' + names + ' | ' + warnTxt;
      }, 300);
    }, 400);
  }
  // 测试辅助：?aierr=1 用假密钥走一遍「上传截图→失败」，验证错误气泡与重试按钮
  if (location.search.indexOf('aierr=1') >= 0) {
    setTimeout(function () {
      SSZ.saveAiConfig({
        provider: 'dashscope',
        model: 'qwen3-vl-plus',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: 'sk-invalid-probe-000'
      });
      SSZ.navigate('ai');
      setTimeout(function () {
        var cv = document.createElement('canvas');
        cv.width = 300; cv.height = 420;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 420);
        ctx.fillStyle = '#111'; ctx.font = '18px sans-serif';
        ctx.fillText('账单测试图', 20, 60);
        ctx.fillText('午饭 12.50', 20, 120);
        cv.toBlob(function (blob) {
          var file = new File([blob], 'test.png', { type: 'image/png' });
          SSZ._sendImage(file);
          setTimeout(function () {
            var errEl = document.querySelector('#ai-chat .ai-err');
            var retry = document.querySelector('#ai-chat .ai-retry');
            document.title = 'AIERR err=' + (errEl ? errEl.textContent.slice(0, 40) : 'none') +
              ' | retry=' + (retry ? 'yes' : 'no');
          }, 4000);
        }, 'image/png');
      }, 400);
    }, 400);
  }
  // 测试辅助：?aimock=1 拦截 fetch 返回一份真实的 qwen 风格响应，验证识别结果卡片渲染
  if (location.search.indexOf('aimock=1') >= 0) {
    setTimeout(function () {
      SSZ.saveAiConfig({
        provider: 'dashscope',
        model: 'qwen3-vl-plus',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: 'sk-mock'
      });
      window.fetch = function () {
        return Promise.resolve({
          ok: true, status: 200,
          text: function () {
            return Promise.resolve(JSON.stringify({
              choices: [{ message: { content: '```json\n[{"date":"2026-11-11","type":"expense","amount":12.5,"category":"餐饮","account":"微信","merchant":"麦当劳","note":"午饭"},{"date":"2026-11-10","type":"expense","amount":38,"category":"交通","account":"支付宝","merchant":"滴滴出行","note":""},{"date":"2026-11-09","type":"income","amount":200,"category":"红包","account":"微信","merchant":"微信红包","note":""}]\n```' } }]
            }));
          }
        });
      };
      SSZ.navigate('ai');
      setTimeout(function () {
        var cv = document.createElement('canvas');
        cv.width = 300; cv.height = 420;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 420);
        cv.toBlob(function (blob) {
          SSZ._sendImage(new File([blob], 'test.png', { type: 'image/png' }));
          setTimeout(function () {
            var cards = document.querySelectorAll('#ai-chat .ai-rec').length;
            var saveBtn = document.querySelector('#ai-chat #ai-saveall');
            document.title = 'AIMOCK cards=' + cards + ' | save=' + (saveBtn ? saveBtn.textContent.trim() : 'no');
          }, 3200);
        }, 'image/png');
      }, 400);
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
