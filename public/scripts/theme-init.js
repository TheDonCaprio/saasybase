// Inline theme initialiser – must run before first paint to avoid FOUC.
// Loaded as <script async src> so React 19 treats it as a hoisted resource.
(function () {
  try {
    var p = localStorage.getItem('themePreference');
    if (p === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else if (p === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.remove('light', 'dark');
      if (
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.add('light');
      }
    }
  } catch {
    /* localStorage may be blocked */
  }
})();
