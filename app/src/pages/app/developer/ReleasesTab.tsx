import { Fragment, useState } from 'react';
import { Card } from '../../../components/Card';
import { useModal } from '../../../components/FormBits';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { isPaying, type ClientCompany } from '../../../data/companies';
import { fmtDate } from '../../../data/invoicing';
import { USER } from '../../../data/mock';
import { LATEST, RELEASES, releaseIndex, type Change, type Release } from '../../../data/releases';
import { me } from '../../../lib/auth';
import { useCompanies } from '../../../lib/companyStore';
import { companyReleaseIndex, deploy, latestDeployedIndex, pendingReleases, rollBack, useDeployments } from '../../../lib/releases';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const KIND_TAG: Record<Change['kind'], string> = { New: 'tag-green', Updated: 'tag-accent', Fixed: 'tag-neutral' };

function Changes({ list }: { list: Change[] }) {
  return (
    <ul className="rel-changes">
      {list.map((c) => (
        <li key={c.id}>
          <Tag label={c.kind} tagClass={KIND_TAG[c.kind]} />
          <div>
            <div className="rel-change-title">{c.section} · {c.title}</div>
            <div className="ui-stop-meta">{c.details}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// Who a deployment can go to: paying companies always; trials and paused
// companies if ticked. Cancelled companies never.
function DeployDialog({ release, onClose }: { release: Release; onClose: () => void }) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const companies = useCompanies();
  const deployments = useDeployments();
  const [trials, setTrials] = useState(false);
  const [paused, setPaused] = useState(false);
  const target = releaseIndex(release.id);
  // Everything not deployed yet, up to and including this release.
  const included = RELEASES.slice(latestDeployedIndex(deployments) + 1, target + 1);
  const pick = (c: ClientCompany) => isPaying(c) || (trials && c.status === 'Trial') || (paused && c.status === 'Paused');
  const chosen = companies.filter((c) => pick(c) && companyReleaseIndex(c, deployments) < target);
  const already = companies.filter((c) => pick(c) && companyReleaseIndex(c, deployments) >= target).length;
  const count = (s: ClientCompany['status']) => companies.filter((c) => c.status === s).length;

  return (
    <dialog ref={ref} className="ui-dialog is-compact" aria-label={`Deploy ${release.id}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Deploy to paid accounts</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>RunTruck {release.id} · {release.title}</h2>
            <p className="ui-p" style={{ marginTop: 6 }}>
              Every account in the companies below gets these changes the next time it opens RunTruck. Companies created later start on this release too.
            </p>
          </div>
          {included.map((r) => (
            <div key={r.id}>
              <div className="ui-label" style={{ marginBottom: 6 }}>{r.id} · {r.title}</div>
              <Changes list={r.changes} />
            </div>
          ))}
          <div>
            <div className="ui-label" style={{ marginBottom: 6 }}>Goes to</div>
            <div className="ui-checks" style={{ flexDirection: 'column', gap: 6 }}>
              <label className="ui-check"><input type="checkbox" checked disabled /> Paying companies (Active, Past due) · {companies.filter(isPaying).length}</label>
              <label className="ui-check"><input type="checkbox" checked={trials} onChange={(e) => setTrials(e.target.checked)} /> Companies on a free trial · {count('Trial')}</label>
              <label className="ui-check"><input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} /> Paused companies · {count('Paused')}</label>
            </div>
            <p className="ui-stop-meta" style={{ marginTop: 8 }}>
              {chosen.length ? chosen.map((c) => `${c.name} (${c.companyId})`).join(', ') : 'No company needs it right now; it will still apply to new companies.'}
              {already ? ` · ${already} already ${already === 1 ? 'has' : 'have'} it.` : ''}
            </p>
          </div>
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button
            type="button" className="ui-btn ui-btn-primary"
            onClick={() => {
              deploy(release.id, chosen.map((c) => c.companyId), me()?.accountId ?? '', USER.name);
              closeNow();
            }}
          >
            Deploy {release.id} to {chosen.length} compan{chosen.length === 1 ? 'y' : 'ies'}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

// Developer › Releases: what is new or changed, what is waiting to go out,
// and who runs which release.
export function ReleasesTab() {
  const companies = useCompanies();
  const deployments = useDeployments();
  const [deploying, setDeploying] = useState<Release | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = pendingReleases(deployments);
  const deployedIdx = latestDeployedIndex(deployments);
  const paying = companies.filter(isPaying);
  const onLatest = paying.filter((c) => companyReleaseIndex(c, deployments) === RELEASES.length - 1).length;
  const waitingChanges = pending.reduce((n, r) => n + r.changes.length, 0);
  const lastDeployment = [...deployments].sort((a, b) => (a.at < b.at ? 1 : -1))[0];

  const kpis = [
    { label: 'Newest release', value: LATEST.id, note: LATEST.title },
    { label: 'Deployed to clients', value: RELEASES[deployedIdx].id, note: lastDeployment ? `${when(lastDeployment.at)} by ${lastDeployment.byName}` : 'Nothing deployed since 1.0' },
    { label: 'Waiting to deploy', value: String(pending.length), note: pending.length ? `${waitingChanges} change${waitingChanges === 1 ? '' : 's'}` : 'All caught up' },
    { label: 'Paying companies on newest', value: `${onLatest}/${paying.length}`, note: 'Super admins always run the newest' },
  ];

  const statusOf = (r: Release) => {
    const i = releaseIndex(r.id);
    if (r.baseline) return { label: 'Live for everyone', tag: 'tag-green' };
    if (i > deployedIdx) return { label: 'Ready to deploy', tag: 'tag-outline' };
    const have = paying.filter((c) => companyReleaseIndex(c, deployments) >= i).length;
    return { label: have === paying.length ? 'Deployed' : `Deployed to ${have}/${paying.length}`, tag: have === paying.length ? 'tag-green' : 'tag-accent' };
  };

  return (
    <>
      <Kpis items={kpis} />

      {pending.length > 0 ? (
        <Card title="Ready to deploy">
          <p className="ui-p" style={{ marginTop: 0 }}>
            These are live for super admins now. Client companies keep their current version until you deploy.
          </p>
          {[...pending].reverse().map((r) => (
            <div key={r.id} className="rel-pending">
              <div className="rel-pending-head">
                <div>
                  <div className="rel-version">RunTruck {r.id}</div>
                  <div className="ui-stop-meta">{r.title} · written {fmtDate(r.date)}{r !== pending[0] ? ` · includes ${pending.slice(0, pending.indexOf(r)).map((x) => x.id).join(', ')}` : ''}</div>
                </div>
                <div style={{ flex: 1 }} />
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => setDeploying(r)}>Deploy {r.id} to paid accounts</button>
              </div>
              <Changes list={r.changes} />
            </div>
          ))}
        </Card>
      ) : (
        <Card title="Ready to deploy">
          <div className="ui-stop-meta">Nothing waiting. Every release has been deployed; new features appear here as soon as they are added.</div>
        </Card>
      )}

      <Card title="All releases" flush>
        <table className="ui-table">
          <thead>
            <tr><th>Version</th><th>Written</th><th>What</th><th className="num">Changes</th><th className="num">Status</th></tr>
          </thead>
          <tbody>
            {[...RELEASES].reverse().map((r) => {
              const open = openId === r.id;
              const st = statusOf(r);
              return (
                <Fragment key={r.id}>
                  <tr className={`is-clickable${open ? ' is-open' : ''}`} onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
                    <td className="strong">{r.id}</td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.title}</td>
                    <td className="num">{r.changes.length}</td>
                    <td className="num"><Tag label={st.label} tagClass={st.tag} /></td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={5} className="ui-expand-cell">
                        <div className="ui-batch"><Changes list={r.changes} /></div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Deployment history" flush>
        <table className="ui-table">
          <thead>
            <tr><th>When</th><th>Release</th><th>By</th><th>Companies</th><th className="num" aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {[...deployments].sort((a, b) => (a.at < b.at ? 1 : -1)).map((d) => (
              <tr key={d.id}>
                <td>{when(d.at)}</td>
                <td className="strong">{d.release}</td>
                <td>{d.byName}</td>
                <td>{d.companies.length ? d.companies.map((id) => companies.find((c) => c.companyId === id)?.name ?? id).join(', ') : 'None at the time (applies to new companies)'}</td>
                <td className="num">
                  <button
                    type="button" className="ui-btn ui-btn-sm"
                    onClick={() => { if (window.confirm(`Roll back ${d.release}? Its companies go back to the release they had before.`)) rollBack(d.id); }}
                  >
                    Roll back
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {deployments.length === 0 && <div className="ui-empty">No deployments yet.</div>}
      </Card>

      {deploying && <DeployDialog release={deploying} onClose={() => setDeploying(null)} />}
    </>
  );
}
