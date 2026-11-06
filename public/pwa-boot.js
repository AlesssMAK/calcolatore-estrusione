/* Points the page at its company's PWA manifest (api/manifest.ts). A blocking
 * script right after the <link>, so nothing can read the static manifest first:
 * its start_url would drop ?company= from the installed app. External because
 * the CSP refuses inline scripts. */
(function () {
  var slug = new URLSearchParams(location.search).get('company');
  var link = document.querySelector('link[rel="manifest"]');
  if (slug && link) {
    link.href = '/api/manifest?company=' + encodeURIComponent(slug);
  }
})();
