/* The install guide opened from a company page (?company=<slug>) leads back to
 * that page: an app installed from the clean address has no company. External
 * because the CSP refuses inline scripts. */
(function () {
  var slug = new URLSearchParams(location.search).get('company');
  if (!slug) return;
  var path = '/?company=' + encodeURIComponent(slug);
  document.querySelector('.back').href = path;
  var address = document.querySelector('.url');
  address.href = path;
  address.querySelector('span').textContent = 'extrusion-calculator.com' + path;
})();
