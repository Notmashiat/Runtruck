import type { ReactNode } from 'react';
import type { ViewKey } from '../data/mock';

// The sidebar's icons: one line style throughout — a 24px grid, 1.8px
// rounded strokes in the current text colour, so they follow the nav's
// hover, active and dark-mode colours.
export type IconName = ViewKey | 'settings' | 'logout' | 'collapse' | 'expand';

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="9" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.8" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.8" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.8" />
    </>
  ),
  loads: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" />
      <path d="m4 7.5 8 4.5 8-4.5" />
      <path d="M12 12v9" />
      <path d="m8 5.3 8 4.5" />
    </>
  ),
  planner: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <rect x="7.5" y="13.3" width="3.2" height="3.2" rx="0.8" />
    </>
  ),
  fleet: (
    <>
      <rect x="2.5" y="5.5" width="11" height="9.5" rx="1.5" />
      <path d="M13.5 8.5h4.2l2.8 3.6V15h-7" />
      <circle cx="7" cy="17.5" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  ),
  crm: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.8c1.7.6 2.8 2.2 3.1 4.7" />
    </>
  ),
  facilities: (
    <>
      <path d="M3 9.5 12 4l9 5.5V20H3Z" />
      <path d="M7.5 20v-6.5h9V20" />
      <path d="M7.5 16.7h9" />
    </>
  ),
  accounting: (
    <>
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  hr: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <circle cx="9" cy="10.8" r="2" />
      <path d="M5.8 15.8c.5-1.5 1.7-2.3 3.2-2.3s2.7.8 3.2 2.3" />
      <path d="M14.5 10h3.5M14.5 13.5h3.5" />
    </>
  ),
  safety: (
    <>
      <path d="M12 3.2 19 6v5.6c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V6Z" />
      <path d="m8.8 12.2 2.2 2.2 4.3-4.4" />
    </>
  ),
  developer: (
    <>
      <path d="m8 7-5 5 5 5" />
      <path d="m16 7 5 5-5 5" />
      <path d="m13.5 4-3 16" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14" />
      <path d="M10 16.5 5.5 12 10 7.5" />
      <path d="M5.5 12H15" />
    </>
  ),
  collapse: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
      <path d="m15.5 10-2 2 2 2" />
    </>
  ),
  expand: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
      <path d="m13.5 10 2 2-2 2" />
    </>
  ),
};

export function NavIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="ui-nav-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
