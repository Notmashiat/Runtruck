import type { ReactNode } from 'react';

// One labelled value in a record's expanded details ('—' when empty).
export function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}
