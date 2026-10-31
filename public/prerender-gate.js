/*
 * Loaded by the prerendered pages only (TGLA-193), before first paint. The static HTML is English on
 * the night theme: apply the visitor's theme now, and keep the page hidden until the app is ready to
 * play its entry animations. Crawlers read the HTML either way, and without JavaScript this file never
 * runs, so the page stays visible. Mirrors publicPreferencesSync.ts.
 */
/* global URLSearchParams, location, document, localStorage, setTimeout, window */
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
  // French URLs ship French HTML; elsewhere a visitor who chose French waits for the app
  var languageDiffers = !/^\/fr(\/|$)/.test(location.pathname) && read('gf_public_lang') === 'fr';
  if (languageDiffers) root.lang = 'fr';
  // Nothing to wait for when the visitor asked for less motion, unless the text must change
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (languageDiffers || !reducedMotion) root.classList.add('prerender-pending');
  // Never leave a page hidden if the app fails to start
  setTimeout(function () { root.classList.remove('prerender-pending'); }, 4000);
})();
