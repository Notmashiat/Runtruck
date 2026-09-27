// Light or dark for the whole site. The choice is kept in localStorage and
// applied as data-theme on <html>, which shell.css (the app) and app.css (the
// marketing site) key their colour tokens off.
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'runtruck-theme';

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice just lasts for this visit.
  }
}

// Runs before the first React render. index.html applies a saved dark theme
// even earlier, before the stylesheet paints, with a one-line inline script.
export function initTheme() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Same as above: fall back to light.
  }
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
}
