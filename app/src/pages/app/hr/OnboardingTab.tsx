import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { ONBOARDING, type Onboarding } from '../../../data/hr';
import { matchesQuery } from '../../../lib/search';
import { isoOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

// Mon Aug 31 – Sun Sep 6, the week of "today" (Wed Sep 3).
const THIS_WEEK = ['Aug 31', 'Sep 1', 'Sep 2', 'Sep 3', 'Sep 4', 'Sep 5', 'Sep 6'];

const inProgress = ONBOARDING.filter((o) => o.stage !== 'Complete');
const startingThisWeek = ONBOARDING.filter((o) => THIS_WEEK.includes(o.started));
const awaitingDocs = ONBOARDING.filter((o) => o.docsPending);
const completed = ONBOARDING.filter((o) => o.stage === 'Complete');
const inOrientation = ONBOARDING.filter((o) => o.stage === 'Orientation');

const KPIS = [
  { label: 'In progress', value: String(inProgress.length), note: `${inOrientation.length} in orientation` },
  { label: 'Started this week', value: String(startingThisWeek.length), note: startingThisWeek.map((o) => `${o.candidate.split(' ').at(-1)} ${o.started}`).join(' · ') || 'None since Mon' },
  { label: 'Awaiting documents', value: String(awaitingDocs.length), note: awaitingDocs.map((o) => o.candidate.split(' ').at(-1)).join(' · ') || 'None' },
  { label: 'Completed this quarter', value: String(completed.length), note: 'Since Jul 1' },
];

const STAGES = ['Application', 'Background check', 'Road test', 'Orientation', 'Complete'];

const FILTERS: FilterDef<Onboarding>[] = [
  { key: 'stage', label: 'Stage', type: 'select', get: (o) => o.stage, options: STAGES },
  { key: 'role', label: 'Role', type: 'select', get: (o) => o.role },
  { key: 'owner', label: 'Owner', type: 'select', get: (o) => o.owner },
  { key: 'docs', label: 'Documents', type: 'toggle', get: (o) => o.docsPending, hint: 'Only candidates waiting on documents' },
  { key: 'started', label: 'Started', type: 'dates', get: (o) => isoOf(o.started) },
  { key: 'progress', label: 'Progress', type: 'range', get: (o) => o.progress, suffix: '%' },
];

export function OnboardingTab() {
  const { query } = useAppShell();
  const sort = useSort(usePageFilters(ONBOARDING.filter((o) => matchesQuery(o, query)), FILTERS), { stage: (o) => STAGES.indexOf(o.stage) });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={KPIS} />

      <Card title="Onboarding" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="candidate">Candidate</SortTh><SortTh sort={sort} k="role">Role</SortTh><SortTh sort={sort} k="stage">Stage</SortTh><SortTh sort={sort} k="started">Started</SortTh><SortTh sort={sort} k="owner">Owner</SortTh><SortTh sort={sort} k="progress">Progress</SortTh><SortTh sort={sort} k="nextStep">Next step</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.candidate}>
                <td className="strong">{o.candidate}</td>
                <td>{o.role}</td>
                <td><Tag label={o.stage} tagClass={o.tagClass} /></td>
                <td>{o.started}</td>
                <td>{o.owner}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="ui-bar-track" style={{ width: 120, flex: 'none' }}>
                      <div className="ui-bar-fill" style={{ width: `${o.progress}%` }} />
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--ui-muted)', fontVariantNumeric: 'tabular-nums' }}>{o.progress}%</span>
                  </div>
                </td>
                <td className="muted">{o.nextStep}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}
