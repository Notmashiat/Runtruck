import { NavLink, useLocation } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import { SECTION_TABS, type ViewKey } from '../data/mock';

// The centred pill bar under the top bar. Only sections listed in
// SECTION_TABS have one; each tab is its own URL (/app/<section>/<tab>).
// Moving between tabs clears the search, as the sidebar does between sections.
export function SectionTabs() {
  const location = useLocation();
  const { setQuery } = useAppShell();
  const view = (location.pathname.toLowerCase().split('/')[2] || 'dashboard') as ViewKey;
  const tabs = SECTION_TABS[view];
  if (!tabs) return null;

  return (
    <nav className="ui-tabs">
      {tabs.map((t) => (
        <NavLink
          key={t.key}
          to={`/app/${view}/${t.key}`}
          onClick={() => setQuery('')}
          className={({ isActive }) => `ui-tab${isActive ? ' is-active' : ''}`}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
