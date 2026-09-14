import { useParams } from 'react-router-dom';
import { Blueprint } from '../../components/Blueprint';
import { LOADS } from '../../data/mock';

export function LoadDetailPage() {
  const { id } = useParams();
  const sel = LOADS.find((l) => l.id === id) ?? LOADS[0];
  const delivered = sel.status === 'Delivered';

  const stops = [
    { kind: sel.status === 'At pickup' ? 'Pickup · at shipper' : 'Pickup · complete', name: sel.from, address: sel.fromAddr, window: `Pickup ${sel.pickup} · 08:00–14:00`, fill: 'var(--color-accent)' },
    { kind: 'Fuel stop', name: 'Planned · 92 gal, DEF top-off', address: 'Routed automatically on the lane', window: `${sel.pickup} · 16:40`, fill: 'transparent' },
    { kind: delivered ? 'Delivery · complete' : 'Delivery', name: sel.to, address: sel.toAddr, window: `Deliver ${sel.delivery} · 06:00–12:00`, fill: delivered ? 'var(--color-accent)' : 'transparent' },
  ];

  const facts = [
    { k: 'Miles', v: sel.miles }, { k: 'Line haul', v: sel.rate }, { k: 'Rate / mile', v: sel.rpm },
    { k: 'Driver pay', v: sel.pay }, { k: 'Margin', v: sel.margin },
  ];
  const freight = [
    { k: 'Commodity', v: sel.commodity }, { k: 'Weight', v: sel.weight }, { k: 'Equipment', v: sel.equip },
    { k: 'Temperature', v: sel.temp }, { k: 'Reference', v: sel.ref },
  ];
  const docs = [
    { name: 'Rate confirmation', state: 'Attached' },
    { name: 'Bill of lading', state: delivered || sel.status === 'Needs POD' ? 'Attached' : 'Pending' },
    { name: 'Proof of delivery', state: delivered ? 'Attached' : 'Pending' },
  ];
  const activity = [
    { when: 'Today 07:12', what: 'Driver accepted the load in the app' },
    { when: 'Today 08:41', what: `Arrived at ${sel.from}` },
    { when: 'Today 10:05', what: 'Bill of lading uploaded from the cab' },
    { when: 'Today 10:06', what: delivered ? 'Invoice queued for billing' : 'Dispatch notified the consignee' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,400px),1fr))', gap: 44, alignItems: 'start' }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div className="sect"><h4 style={{ fontSize: 19 }}>Stops</h4></div>
        {stops.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr)', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 10, height: 10, marginTop: 5, background: s.fill, border: '1px solid var(--color-accent)' }} />
              <div style={{ width: 1, flex: 1, background: 'var(--color-divider)' }} />
            </div>
            <div style={{ paddingBottom: 18 }}>
              <div className="lbl" style={{ color: 'var(--color-accent-700)' }}>{s.kind}</div>
              <div style={{ fontSize: 17, fontWeight: 500, marginTop: 5 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginTop: 3 }}>{s.address}</div>
              <div className="num" style={{ fontSize: 15, marginTop: 6 }}>{s.window}</div>
            </div>
          </div>
        ))}
        <Blueprint
          className="duotone"
          style={{
            height: 150,
            background: 'repeating-linear-gradient(135deg,var(--color-neutral-300) 0 6px,var(--color-neutral-200) 6px 12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div className="lbl" style={{ color: 'var(--color-neutral-700)', fontSize: 11 }}>Live map / ELD trace</div>
        </Blueprint>
      </div>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Blueprint style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', background: 'var(--color-neutral-100)' }}>
          {facts.map((f) => (
            <div key={f.k} style={{ padding: '14px 12px', borderRight: '1px solid var(--color-divider)' }}>
              <div className="lbl" style={{ color: 'var(--color-neutral-600)', fontSize: 9 }}>{f.k}</div>
              <div className="num" style={{ fontSize: 22, marginTop: 6, lineHeight: 1.1 }}>{f.v}</div>
            </div>
          ))}
        </Blueprint>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sect"><h4 style={{ fontSize: 19 }}>Freight &amp; pay</h4></div>
          {freight.map((f) => (
            <div key={f.k} style={{ display: 'flex', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
              <div style={{ flex: 1, color: 'var(--color-neutral-700)' }}>{f.k}</div>
              <div className="num" style={{ fontSize: 15 }}>{f.v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sect"><h4 style={{ fontSize: 19 }}>Documents</h4></div>
          {docs.map((d) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--color-divider)' }}>
              <div style={{ width: 26, height: 32, background: 'repeating-linear-gradient(135deg,var(--color-neutral-200) 0 5px,transparent 5px 10px)', border: '1px solid var(--color-divider)', flex: 'none' }} />
              <div style={{ flex: 1, fontSize: 14 }}>{d.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{d.state}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sect"><h4 style={{ fontSize: 19 }}>Activity</h4></div>
          {activity.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '9px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
              <div className="num" style={{ width: 96, color: 'var(--color-neutral-600)', fontSize: 14 }}>{a.when}</div>
              <div style={{ flex: 1 }}>{a.what}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
