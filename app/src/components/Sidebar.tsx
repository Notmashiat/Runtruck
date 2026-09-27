import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV, USER, type ViewKey } from '../data/mock';
import { useAppShell } from '../context/AppShellContext';
import { SettingsDialog } from './SettingsDialog';

export function Sidebar() {
  const location = useLocation();
  const { setQuery } = useAppShell();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeKey = (location.pathname.toLowerCase().split('/')[2] || 'dashboard') as ViewKey;

  return (
    <aside className="ui-sidebar">
      <div className="ui-brand">
        <span className="ui-brand-mark" />
        RunTruck
      </div>

      <nav className="ui-nav">
        {NAV.map((n, i) =>
          'group' in n ? (
            <div key={`group-${i}`} className="ui-nav-group">
              {n.group}
            </div>
          ) : (
            <Link
              key={n.key}
              to={`/app/${n.key}`}
              onClick={() => setQuery('')}
              className={`ui-nav-item${n.key === activeKey ? ' is-active' : ''}`}
            >
              {n.label}
            </Link>
          ),
        )}
      </nav>

      <div className="ui-sidebar-foot">
        <div className="ui-user">
          <div className="ui-user-name">{USER.name}</div>
          <div className="ui-user-meta">{USER.role} · {USER.company}</div>
        </div>
        <button type="button" className="ui-nav-item" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        <Link to="/" className="ui-nav-item">
          Log out
        </Link>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </aside>
  );
}
