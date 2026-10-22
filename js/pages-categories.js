/* ============================================================
   随手账 · 分类管理 pages-categories.js
   增 / 改 / 删（内置不可删、有记录不可删）
   ============================================================ */
window.SSZ = window.SSZ || {};

SSZ.renderers.categories = function (page) {
  let html = SSZ.pageHeader('分类管理', { back: 'mine' });

  ['expense', 'income'].forEach(function (type) {
    const cats = SSZ.DB.categories.filter(function (c) { return c.type === type; });
    html += '<div class="block"><div class="block-title">' + (type === 'expense' ? '支出分类' : '收入分类') +
      '<span class="more" data-add="' + type + '">＋ 添加</span></div>';
    html += '<div class="card cat-manage">';
    cats.forEach(function (c) {
      html +=
        '<button class="cm" data-edit="' + c.id + '" type="button">' +
        '<span>' + c.icon + '</span>' + SSZ.esc(c.name) +
        (c.builtin ? '' : '<span class="del" data-del="' + c.id + '">✕</span>') +
        '</button>';
    });
    html += '</div></div>';
  });

  html += '<div class="tiny muted" style="padding:0 4px">提示：内置分类和已有记账记录的分类不能删除</div>';

  page.innerHTML = html;

  Array.prototype.forEach.call(page.querySelectorAll('[data-add]'), function (el) {
    el.onclick = function (e) {
      e.stopPropagation();
      SSZ.openCategorySheet(null, el.dataset.add);
    };
  });
  Array.prototype.forEach.call(page.querySelectorAll('[data-edit]'), function (el) {
    el.onclick = function () {
      const c = SSZ.catById(el.dataset.edit);
      if (c) SSZ.openCategorySheet(c, c.type);
    };
  });
  Array.prototype.forEach.call(page.querySelectorAll('[data-del]'), function (el) {
    el.onclick = function (e) {
      e.stopPropagation();
      const chk = SSZ.canDeleteCategory(el.dataset.del);
      if (!chk.ok) { SSZ.toast(chk.reason, 'err'); return; }
      SSZ.confirm('删除该分类？', '', { okText: '删除', danger: true }).then(function (ok) {
        if (!ok) return;
        SSZ.deleteCategory(el.dataset.del);
        SSZ.toast('已删除', 'ok');
        SSZ.renderCurrent();
      });
    };
  });
};

/* ---------------- 分类编辑弹层 ---------------- */

SSZ.openCategorySheet = function (cat, type) {
  const isEdit = !!cat;
  const st = {
    name: cat ? cat.name : '',
    icon: cat ? cat.icon : '📦',
    type: cat ? cat.type : type
  };

  const s = SSZ.openSheet({
    title: isEdit ? '编辑分类' : '添加分类',
    body:
      '<div class="list-group">' +
      '<div class="field-row"><span class="fl">名称</span><input class="fv" type="text" id="cat-name" placeholder="如：宠物" maxlength="10"></div>' +
      '<div class="field-row"><span class="fl">图标</span><button class="fv" id="cat-icon" type="button" style="font-size:22px">' + st.icon + '</button></div>' +
      '<div class="field-row"><span class="fl">类型</span><span class="fv">' + (st.type === 'expense' ? '支出' : '收入') + '</span></div>' +
      '</div>' +
      '<button class="btn btn-primary mt16" id="cat-save" type="button">保存</button>'
  });

  const $ = function (id) { return s.body.querySelector('#' + id); };
  $('cat-name').value = st.name;

  $('cat-icon').onclick = function () {
    SSZ.pickEmoji(st.icon).then(function (e) {
      if (e) { st.icon = e; $('cat-icon').textContent = e; }
    });
  };

  $('cat-save').onclick = function () {
    const name = $('cat-name').value.trim();
    if (!name) { SSZ.toast('请填写分类名称'); return; }
    if (isEdit) {
      SSZ.updateCategory(cat.id, { name: name, icon: st.icon });
      SSZ.toast('已保存', 'ok');
    } else {
      SSZ.addCategory(name, st.icon, st.type);
      SSZ.toast('已添加分类', 'ok');
    }
    s.close();
    SSZ.renderCurrent();
  };
};
