// Sets window.__CLERK_ENABLED from a <meta name="x-clerk-enabled"> tag.
// Loaded as <script async src> so React 19 treats it as a hoisted
// resource and does NOT emit a console warning.
(function () {
  try {
    var m = document.querySelector('meta[name="x-clerk-enabled"]');
    window.__CLERK_ENABLED = m ? m.content === 'true' : false;
  } catch {
    /* noop */
  }
})();
