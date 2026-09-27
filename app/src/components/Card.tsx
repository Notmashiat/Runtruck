import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  title?: string;
  action?: ReactNode;
  flush?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

// White rounded panel. `flush` drops the body padding so a table can run
// edge to edge (its header row then sits directly under the card head).
export function Card({ title, action, flush = false, className = '', style, children }: CardProps) {
  return (
    <section className={`ui-card ${className}`} style={style}>
      {(title || action) && (
        <div className="ui-card-head">
          <div className="ui-card-title">{title}</div>
          <div style={{ flex: 1 }} />
          {action}
        </div>
      )}
      <div className={flush ? 'ui-card-flush' : 'ui-card-body'}>{children}</div>
    </section>
  );
}
