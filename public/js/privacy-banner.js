/**
 * Minimal privacy notice (GDPR-friendly). Essential storage only until accept.
 * Meridian does not use ad trackers.
 */
(function () {
  var KEY = 'mdn_privacy_notice_v1';
  try {
    if (localStorage.getItem(KEY) === '1') return;
  } catch (e) {}

  var bar = document.createElement('div');
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Privacy notice');
  bar.style.cssText =
    'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:14px 18px;background:#141413;color:#F5F5F4;border-top:1px solid rgba(255,255,255,.1);font:500 13px/1.45 system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center';
  bar.innerHTML =
    '<span style="max-width:52rem">We use essential cookies/storage for the site and chat. No ad trackers. ' +
    '<a href="/privacy" style="color:#3DDC84">Privacy</a> · ' +
    '<a href="/privacy#your-rights" style="color:#3DDC84">Your rights (GDPR/PIPEDA)</a></span>' +
    '<button type="button" id="mdn-privacy-ok" style="cursor:pointer;border:0;border-radius:999px;padding:10px 16px;font-weight:600;background:#F5F5F4;color:#0A0A09">OK</button>';
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(bar);
    document.getElementById('mdn-privacy-ok').onclick = function () {
      try {
        localStorage.setItem(KEY, '1');
      } catch (e2) {}
      bar.remove();
    };
  });
})();
