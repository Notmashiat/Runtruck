import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { SectionTabs } from './SectionTabs';

// Layout for a sidebar section that is split into tabs: the pill bar, then
// whichever tab route is active.
export function TabbedSection() {
  return (
    <>
      <SectionTabs />
      <Suspense fallback={<div className="ui-empty">Loading…</div>}>
        <Outlet />
      </Suspense>
    </>
  );
}
