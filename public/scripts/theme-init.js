// Inline theme initialiser – must run before first paint to avoid FOUC.
// Loaded as <script async src> so React 19 treats it as a hoisted resource.
(function () {
  try {
    function setThemeResolvedCookie(theme) {
      document.cookie = 'themeResolved=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax';
    }

    var p = localStorage.getItem('themePreference');
    if (p === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      setThemeResolvedCookie('dark');
    } else if (p === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      setThemeResolvedCookie('light');
    } else {
      document.documentElement.classList.remove('light', 'dark');
      if (
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        document.documentElement.classList.add('dark');
        setThemeResolvedCookie('dark');
      } else {
        document.documentElement.classList.add('light');
        setThemeResolvedCookie('light');
      }
    }
  } catch {
    /* localStorage may be blocked */
  }
})();
