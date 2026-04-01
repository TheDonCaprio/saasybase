// Reads a <template id="custom-head-snippet-data"> element and injects
// its contents into <head>.  Loaded as <script async src> so React 19
// treats it as a hoisted resource and does NOT emit a console warning.
(function () {
  try {
    var t = document.getElementById('custom-head-snippet-data');
    if (t && t.innerHTML) {
      document.head.insertAdjacentHTML('beforeend', t.innerHTML);
    }
  } catch (e) {
    console.error('theme head snippet failed', e);
  }
})();
