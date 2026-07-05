// Component cấu hình trường dùng chung (tạo phiên / cấu hình phiên).
// createFieldConfigurator(container, fields, { lang, onChange }) -> { get(), fields() }
(function () {
  const CORE = [
    { key: 'cccd', vi: 'Số CCCD', en: 'ID number' },
    { key: 'full_name', vi: 'Họ và tên', en: 'Full name' },
    { key: 'unit', vi: 'Đơn vị', en: 'Unit' },
    { key: 'phone', vi: 'Số điện thoại', en: 'Phone' },
    { key: 'email', vi: 'Email', en: 'Email' },
  ];
  const CORE_KEYS = CORE.map((c) => c.key);

  window.createFieldConfigurator = function (container, fields, opts) {
    opts = opts || {};
    const lang = opts.lang || 'vi';
    const t = window.t || ((k, fb) => fb || k);
    const esc = window.esc || ((s) => String(s == null ? '' : s));
    const CORE_LABEL = {};
    CORE.forEach((c) => { CORE_LABEL[c.key] = c; });
    // Bổ sung nhãn cho trường lõi nếu đầu vào chỉ có key (VD từ list_fields của phiên)
    let state = (fields || []).map((f) => {
      const o = { ...f };
      if (CORE_LABEL[o.key]) { o.label_vi = CORE_LABEL[o.key].vi; o.label_en = CORE_LABEL[o.key].en; }
      return o;
    });

    function rowHtml(f, i) {
      const isCore = CORE_KEYS.includes(f.key);
      const nameCells = isCore
        ? `<td><b>${esc(f.label_vi)}</b></td><td class="muted">${esc(f.label_en)}</td>`
        : `<td><input value="${esc(f.label_vi)}" maxlength="40" data-vi="${i}" style="margin:0;font-size:14px;"></td>
           <td><input value="${esc(f.label_en)}" maxlength="40" data-en="${i}" style="margin:0;font-size:14px;"></td>`;
      return `<tr>
        ${nameCells}
        <td style="text-align:center;"><input type="checkbox" ${f.enabled ? 'checked' : ''} data-enable="${i}"></td>
        <td style="text-align:center;"><input type="checkbox" ${f.required ? 'checked' : ''} ${!f.enabled ? 'disabled' : ''} data-req="${i}"></td>
        <td style="text-align:right;"><button type="button" class="btn danger small" data-del="${i}">${t('common.delete', 'Xoá')}</button></td>
      </tr>`;
    }

    function render() {
      const missing = CORE.filter((c) => !state.some((f) => f.key === c.key));
      container.innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr>
            <th>${t('admin.fields.nameVi', 'Tên (Tiếng Việt)')}</th>
            <th>${t('admin.fields.nameEn', 'Tên (English)')}</th>
            <th style="text-align:center;">${t('admin.fields.colInTemplate', 'Có trong mẫu')}</th>
            <th style="text-align:center;">${t('admin.fields.colRequired', 'Bắt buộc')}</th>
            <th></th>
          </tr></thead>
          <tbody>${state.map(rowHtml).join('')}</tbody>
        </table></div>
        ${missing.length ? `<div class="chip-list" style="margin:8px 0;">${missing.map((c) => `<button type="button" class="chip" data-addcore="${c.key}">＋ ${esc(lang === 'en' ? c.en : c.vi)}</button>`).join('')}</div>` : ''}
        <div class="row" style="margin-top:6px;">
          <input class="fc-vi" placeholder="${t('admin.fields.addViPh', 'Tên (Tiếng Việt)')}" maxlength="40" style="flex:1;min-width:130px;margin:0;">
          <input class="fc-en" placeholder="${t('admin.fields.addEnPh', 'Name (English)')}" maxlength="40" style="flex:1;min-width:130px;margin:0;">
          <button type="button" class="btn secondary small fc-add">${t('admin.fields.add', '＋ Thêm trường')}</button>
        </div>`;
      bind();
      if (opts.onChange) opts.onChange();
    }

    function bind() {
      container.querySelectorAll('[data-vi]').forEach((inp) => { inp.oninput = () => { state[+inp.dataset.vi].label_vi = inp.value; }; });
      container.querySelectorAll('[data-en]').forEach((inp) => { inp.oninput = () => { state[+inp.dataset.en].label_en = inp.value; }; });
      container.querySelectorAll('[data-enable]').forEach((inp) => {
        inp.onchange = () => { const i = +inp.dataset.enable; state[i].enabled = inp.checked; if (!inp.checked) state[i].required = false; render(); };
      });
      container.querySelectorAll('[data-req]').forEach((inp) => { inp.onchange = () => { state[+inp.dataset.req].required = inp.checked; if (opts.onChange) opts.onChange(); }; });
      container.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { state.splice(+b.dataset.del, 1); render(); }; });
      container.querySelectorAll('[data-addcore]').forEach((b) => {
        b.onclick = () => { const c = CORE.find((x) => x.key === b.dataset.addcore); state.push({ key: c.key, enabled: true, required: false, label_vi: c.vi, label_en: c.en }); render(); };
      });
      container.querySelector('.fc-add').onclick = () => {
        const vi = container.querySelector('.fc-vi').value.trim();
        const en = container.querySelector('.fc-en').value.trim() || vi;
        if (!vi) return;
        state.push({ key: '', enabled: true, required: false, label_vi: vi, label_en: en });
        render();
      };
    }

    render();
    return {
      get: () => state.map((f) => ({ key: f.key, enabled: f.enabled, required: f.required, label_vi: f.label_vi, label_en: f.label_en })),
      fields: () => state,
    };
  };
})();
