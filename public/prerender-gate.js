/*
 * Loaded by the prerendered pages only (TGLA-193), before first paint. The static HTML is English on
 * the night theme: apply the visitor's theme now, and hide the English text from a visitor who chose
 * another language until the app replaces it. Mirrors publicPreferencesSync.ts.
 */
/* global URLSearchParams, location, document, localStorage, setTimeout */
(function () {
  var read = function (name) {
    try {
      var fromUrl = new URLSearchParams(location.search).get(name === 'gf_public_lang' ? 'lang' : 'theme');
      if (fromUrl) return fromUrl.toLowerCase();
      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      if (match) return decodeURIComponent(match[1]).toLowerCase();
      var stored = localStorage.getItem(name);
      return stored ? stored.toLowerCase() : null;
    } catch {
      return null;
    }
  };
  var root = document.documentElement;
  var theme = read('gf_public_theme');
  if (theme === 'light' || theme === 'dark' || theme === 'night') {
    root.setAttribute('data-theme', theme);
    root.classList.toggle('dark', theme !== 'light');
  }
  if (read('gf_public_lang') === 'fr') {
    root.lang = 'fr';
    root.classList.add('prerender-pending');
    // Never leave a page hidden if the app fails to start
    setTimeout(function () { root.classList.remove('prerender-pending'); }, 4000);
  }
})();
