import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { dollars, money } from '../../../data/accounting';
import { SETTLE_TAG, SETTLEMENTS } from '../../../data/mock';
import { matchesQuery } from '../../../lib/search';

export function PayrollTab() {
  const { query, approved, approveAll } = useAppShell();

  // "Approve all" flips every Ready settlement to Approved; holds and paid rows stay as they are.
  const settlementRows = SETTLEMENTS.map((x) => {
    const status = approved && x.status === 'Ready' ? 'Approved' : x.status;
    return { ...x, status, tagClass: SETTLE_TAG[status] };
  });
  const ready = settlementRows.filter((s) => s.status === 'Ready').length;
  const gross = settlementRows.reduce((sum, x) => sum + dollars(x.gross), 0);
  const deductions = settlementRows.reduce((sum, x) => sum + dollars(x.ded), 0);
  const net = settlementRows.reduce((sum, x) => sum + dollars(x.net), 0);
  const rows = settlementRows.filter((s) => matchesQuery(s, query));

  const kpis = [
    { label: 'Drivers', value: String(settlementRows.length), note: approved ? 'Approved for payment' : `${ready} ready to approve` },
    { label: 'Gross', value: money(gross), note: 'Week of Sep 1' },
    { label: 'Deductions', value: money(Math.abs(deductions)), note: 'Fuel advances and escrow' },
    { label: 'Net payable', value: money(net), note: approved ? 'Approved' : 'Awaiting approval' },
  ];

  return (
    <>
      <Kpis items={kpis} />

      <Card
        title="Driver settlements · week of Sep 1"
        flush
        action={<button type="button" className="ui-link" onClick={approveAll}>{approved ? 'Approved' : 'Approve all'}</button>}
      >
        <table className="ui-table">
          <thead>
            <tr>
              <th>Driver</th><th>Pay basis</th><th className="num">Loads</th><th className="num">Miles</th>
              <th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name}>
                <td className="strong">{s.name}</td>
                <td className="muted">{s.basis}</td>
                <td className="num">{s.loads}</td>
                <td className="num">{s.miles}</td>
                <td className="num">{s.gross}</td>
                <td className="num">{s.ded}</td>
                <td className="num strong">{s.net}</td>
                <td className="num"><Tag label={s.status} tagClass={s.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches “{query}”.</div>}
        <div className="ui-total">Net payable this week <strong>{money(net)}</strong></div>
      </Card>
    </>
  );
}
