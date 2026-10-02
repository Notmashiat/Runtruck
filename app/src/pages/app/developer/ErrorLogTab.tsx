import { Fragment, useState } from 'react';
import { Card } from '../../../components/Card';
import { Kpis } from '../../../components/Kpis';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { BUILD, clearErrorLog, describeError, useErrorLog, type ErrorEntry, type ErrorKind } from '../../../lib/errorLog';
import { when } from '../../../lib/format';
import { usePaged } from '../../../lib/paging';
import { currentRelease } from '../../../lib/releases';
import { matchesQuery } from '../../../lib/search';
import { STORAGE_LIMIT, storageUsage } from '../../../lib/storage';

// Developer › Error log: every problem RunTruck caught on this device, newest
// first, with what a developer needs to trace it (lib/errorLog.ts). A person
// who hits a problem sees its reference (ERR-…) and can copy the same
// details from the message on their screen.
const KIND: Record<ErrorKind, { label: string; tag: string; about: string }> = {
  screen: { label: 'Screen', tag: 'tag-outline', about: 'A part of the screen failed to draw; the rest kept working.' },
  script: { label: 'Action', tag: 'tag-outline', about: 'A click or timer failed; the screen stayed up.' },
  promise: { label: 'Background', tag: 'tag-outline', about: 'Work in the background failed and nothing caught it.' },
  storage: { label: 'Storage', tag: 'tag-accent', about: 'Something could not be saved to or read from this browser.' },
  update: { label: 'Download', tag: 'tag-neutral', about: 'A screen could not be downloaded (offline, or RunTruck was updated).' },
};

export function ErrorLogTab() {
  const { query } = useAppShell();
  const log = useErrorLog();
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const rows = log.filter((e) => matchesQuery({ ...e, stack: '' }, query));
  const paged = usePaged(rows, { key: open, of: (e) => e.id });
  const usage = storageUsage();
  const dayAgo = Date.now() - 86_400_000;

  const kpis = [
    { label: 'Problems recorded', value: String(log.length), note: 'On this device · newest 50 kept' },
    { label: 'Last 24 hours', value: String(log.filter((e) => Date.parse(e.last) > dayAgo).length), note: log[0] ? `Latest ${when(log[0].last)}` : 'Nothing recorded' },
    { label: 'Running', value: currentRelease().id, note: `Build ${BUILD}` },
    { label: 'Storage used', value: `${Math.min(100, Math.round(usage.share * 100))}%`, note: `${usage.used.toLocaleString('en-US')} of about ${STORAGE_LIMIT.toLocaleString('en-US')} characters` },
  ];

  const copy = (e: ErrorEntry) => {
    const text = describeError(e);
    const done = () => setCopied(e.id);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy these details:', text));
    else window.prompt('Copy these details:', text);
  };

  return (
    <>
      <Kpis items={kpis} />
      <div className="ui-note" style={{ marginBottom: 16 }}>
        This is what <strong>this browser</strong> recorded. RunTruck has no server yet, so a problem on a client’s computer is recorded on theirs: ask them for the reference on their screen (ERR-…) and the details from “Copy error details”. When a server is added, lib/errorLog.ts is the one place to send these to it.
      </div>
      <Card
        title="Error log"
        flush
        action={log.length > 0 && <button type="button" className="ui-link" onClick={() => { if (window.confirm('Clear the error log on this device?')) clearErrorLog(); }}>Clear log</button>}
      >
        <table className="ui-table">
          <thead>
            <tr><th>Reference</th><th>Kind</th><th>Where</th><th>What</th><th>Last seen</th><th className="num">Times</th></tr>
          </thead>
          <tbody>
            {paged.rows.map((e) => {
              const isOpen = open === e.id;
              const kind = KIND[e.kind] ?? KIND.script;
              return (
                <Fragment key={e.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                    <td className="strong">{e.id}</td>
                    <td><Tag label={kind.label} tagClass={kind.tag} /></td>
                    <td>{e.where}<div className="ui-stop-meta">{e.path}</div></td>
                    <td>{e.message.length > 120 ? `${e.message.slice(0, 120)}…` : e.message}</td>
                    <td>{when(e.last)}</td>
                    <td className="num">{e.count}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>{kind.about} First seen {when(e.at)} · company {e.companyId} · account {e.memberId} · release {e.release || '—'} · build {e.build}</div>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => copy(e)}>{copied === e.id ? 'Copied' : 'Copy details'}</button>
                          </div>
                          <pre className="ui-stack">{e.message}{e.stack ? `\n\n${e.stack}` : ''}</pre>
                          <div className="ui-stop-meta">{e.agent}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{log.length ? 'Nothing matches the search.' : 'No problems recorded on this device.'}</div>}
        {paged.pager}
      </Card>
    </>
  );
}
