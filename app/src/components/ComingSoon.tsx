import { Blueprint } from './Blueprint';

interface ComingSoonProps {
  title: string;
  body: string;
  items: string[];
  figure: string;
}

// Stand-in for an app section that is in the sidebar but not designed yet: what
// the section is for, what it will hold, and a hatched frame where its main view
// goes (the same treatment LoadDetailPage uses for the live map).
export function ComingSoon({ title, body, items, figure }: ComingSoonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <Blueprint style={{ padding: '28px 32px', maxWidth: 760 }}>
        <div className="lbl" style={{ color: 'var(--color-accent-700)' }}>Coming soon</div>
        <h4 style={{ fontSize: 24, marginTop: 8 }}>{title}</h4>
        <p style={{ fontSize: 15, lineHeight: '24px', margin: '12px 0 0', maxWidth: '58ch', color: 'var(--color-neutral-800)' }}>{body}</p>
        <div style={{ marginTop: 20 }}>
          {items.map((x) => (
            <div key={x} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid var(--color-divider)', fontSize: 14 }}>
              <span style={{ width: 6, height: 6, background: 'var(--color-accent)', marginTop: 8, flex: 'none' }} />
              <span>{x}</span>
            </div>
          ))}
        </div>
      </Blueprint>

      <Blueprint
        className="duotone"
        style={{
          height: 220,
          background: 'repeating-linear-gradient(135deg,var(--color-neutral-300) 0 6px,var(--color-neutral-200) 6px 12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div className="lbl" style={{ color: 'var(--color-neutral-700)', fontSize: 11 }}>{figure}</div>
      </Blueprint>
    </div>
  );
}
