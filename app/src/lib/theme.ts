// Light or dark for the whole site. The choice is kept in localStorage and
// applied as data-theme on <html>, which shell.css (the app) and app.css (the
// marketing site) key their colour tokens off.
import { readText, writeText } from './storage';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'runtruck-theme';

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  // Only when it changed: this runs on every settings change.
  if (readText(STORAGE_KEY) !== theme) writeText(STORAGE_KEY, theme);
}

// Runs before the first React render. index.html applies a saved dark theme
// even earlier, before the stylesheet paints, with a one-line inline script.
export function initTheme() {
  document.documentElement.dataset.theme = readText(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}
