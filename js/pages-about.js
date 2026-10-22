/* ============================================================
   随手账 · 关于 pages-about.js
   版本信息 + 数据说明 + 调试入口（连点版本号 5 次管理演示数据）
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.about = function (page) {
  let html = SSZ.pageHeader('关于', { back: 'mine' });

  html +=
    '<div class="about-logo">' +
    '<div class="al-ic">¥</div>' +
    '<div class="al-name">随手账</div>' +
    '<div class="al-ver" id="about-ver">版本 ' + SSZ.VERSION + '（点我 5 次有惊喜）</div>' +
    '</div>';

  html +=
    '<div class="block"><div class="card card-pad tiny muted" style="line-height:1.9">' +
    '· 一个简单的个人记账工具：打开就记，3 秒一笔<br>' +
    '· 所有数据只保存在本机浏览器，不上传任何服务器<br>' +
    '· 换手机/清缓存前，请先到「备份与恢复」导出 JSON<br>' +
    '· 收入显示红色、支出显示绿色（国内资金流向习惯）<br>' +
    '· 金额精确到分，月度预算超支会提醒<br>' +
    '· 可"添加到主屏"当 App 用，离线也能记' +
    '</div></div>';

  html +=
    '<div class="block"><div class="list-group">' +
    '<button class="list-row" id="about-rollback" type="button"><span class="list-ic">↩️</span>' +
    '<span class="list-label">回退到恢复备份前</span><span class="list-chev">›</span></button>' +
    '</div></div>';

  page.innerHTML = html;

  /* 连点版本号 5 次 → 演示数据管理 */
  let clicks = 0;
  let timer = null;
  page.querySelector('#about-ver').onclick = function () {
    clicks++;
    clearTimeout(timer);
    timer = setTimeout(function () { clicks = 0; }, 1500);
    if (clicks >= 5) {
      clicks = 0;
      SSZ.confirm('演示数据', '生成一批跨 6 个月的演示数据，或清空全部记账记录？', {
        okText: '生成演示数据', cancelText: '清空数据'
      }).then(function (ok) {
        if (ok) {
          SSZ.seedDemo();
          SSZ.toast('演示数据已生成', 'ok');
        } else {
          SSZ.confirm('确认清空？', '将删除全部交易、预算、目标和定期账，且不可恢复！', { okText: '全部清空', danger: true })
            .then(function (ok2) {
              if (!ok2) return;
              SSZ.clearDemo();
              SSZ.toast('已清空', 'ok');
            });
        }
        SSZ.renderCurrent();
      });
    }
  };

  page.querySelector('#about-rollback').onclick = function () { SSZ.rollback(); };
};
