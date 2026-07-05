// i18n phía client: tải từ điển đồng bộ (tránh nháy), cung cấp t() và applyI18n().
// Nạp TRƯỚC các script khác của trang để window.t sẵn sàng.
(function () {
  var lang = 'vi';
  try { lang = localStorage.getItem('tbit-lang') || 'vi'; } catch (e) { /* bỏ qua */ }
  var dict = {};
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/i18n?lang=' + encodeURIComponent(lang), false); // đồng bộ, chấp nhận cho công cụ nội bộ
    x.send();
    if (x.status === 200) dict = (JSON.parse(x.responseText).dict) || {};
  } catch (e) { /* dùng key làm fallback */ }

  window.I18N_LANG = lang;
  window.t = function (key, fallback) {
    return (dict && Object.prototype.hasOwnProperty.call(dict, key)) ? dict[key] : (fallback != null ? fallback : key);
  };
  window.applyI18n = function (root) {
    var r = root || document;
    r.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = window.t(el.getAttribute('data-i18n')); });
    r.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = window.t(el.getAttribute('data-i18n-html')); });
    r.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', window.t(el.getAttribute('data-i18n-ph'))); });
    r.querySelectorAll('[data-i18n-title]').forEach(function (el) { el.setAttribute('title', window.t(el.getAttribute('data-i18n-title'))); });
  };
  window.setLang = function (l) {
    try { localStorage.setItem('tbit-lang', l); } catch (e) { /* bỏ qua */ }
    location.reload();
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.setAttribute('lang', lang);
    window.applyI18n(document);
  });
})();
