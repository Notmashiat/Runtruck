import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import { SETTLE_TAG, SETTLEMENTS } from '../../data/mock';

export function SettlementsPage() {
  const { approved, approveAll } = useAppShell();

  const settlementRows = SETTLEMENTS.map((x) => {
    const status = approved && x.status === 'Ready' ? 'Approved' : x.status;
    return { ...x, status, tagClass: SETTLE_TAG[status] };
  });
  const net = settlementRows.reduce((sum, x) => sum + Number(x.net.replace(/[$,]/g, '')), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="sect" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h4 style={{ fontSize: 19 }}>Driver settlements · week of Sep 1</h4>
        <div style={{ flex: 1 }} />
        <div onClick={() => approveAll()} className="lbl" style={{ color: 'var(--color-accent-700)', cursor: 'pointer' }}>
          {approved ? 'Approved' : 'Approve all'}
        </div>
      </div>
      <div style={{ minWidth: 0, overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Driver</th><th>Pay basis</th><th style={{ textAlign: 'right' }}>Loads</th>
              <th style={{ textAlign: 'right' }}>Miles</th><th style={{ textAlign: 'right' }}>Gross</th>
              <th style={{ textAlign: 'right' }}>Deductions</th><th style={{ textAlign: 'right' }}>Net</th><th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {settlementRows.map((s) => (
              <tr key={s.name}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td style={{ color: 'var(--color-neutral-700)' }}>{s.basis}</td>
                <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{s.loads}</td>
                <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{s.miles}</td>
                <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{s.gross}</td>
                <td className="num" style={{ textAlign: 'right', fontSize: 15 }}>{s.ded}</td>
                <td className="num" style={{ textAlign: 'right', fontSize: 15, fontWeight: 600 }}>{s.net}</td>
                <td style={{ textAlign: 'right' }}><Tag label={s.status} tagClass={s.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 16, paddingTop: 8, fontSize: 14 }}>
        <div style={{ flex: 1 }} />
        <div style={{ color: 'var(--color-neutral-700)' }}>Net payable this week</div>
        <div className="num" style={{ fontSize: 22 }}>${net.toLocaleString()}</div>
      </div>
    </div>
  );
}
