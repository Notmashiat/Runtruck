// Applies the saved dark theme before the page paints, so there is no flash
// of the light theme. Kept as its own small file (not inline in index.html)
// so the site can forbid inline scripts in its Content-Security-Policy.
try {
  if (localStorage.getItem('runtruck-theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch {
  // Storage is blocked: the light theme is used.
}
