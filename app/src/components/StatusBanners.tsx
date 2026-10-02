import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeError, useErrorLog } from '../lib/errorLog';
import { storageUsage, useStorageProblem } from '../lib/storage';

// Warns while saving is not working, and before storage runs out.
// RunTruck keeps its records in this browser (lib/storage.ts); if the
// browser refuses a save, the person has to know before they close the tab.
const NEARLY_FULL = 0.8;
const CHECK_EVERY_MS = 60_000;

export function StorageBanner() {
  const problem = useStorageProblem();
  const [share, setShare] = useState(() => storageUsage().share);
  useEffect(() => {
    const t = window.setInterval(() => setShare(storageUsage().share), CHECK_EVERY_MS);
    return () => window.clearInterval(t);
  }, []);

  if (problem === 'full') {
    return (
      <div className="ui-banner is-danger" role="alert">
        <strong>Your latest changes are not saved.</strong> RunTruck keeps its records in this browser and that space is full. Keep this tab open,{' '}
        <Link to="/app/settings/export">export your data</Link>, then delete records you no longer need.
      </div>
    );
  }
  if (problem === 'blocked') {
    return (
      <div className="ui-banner is-danger" role="alert">
        <strong>Your changes are not being saved.</strong> This browser is blocking storage for RunTruck (private browsing, or site data turned off), so they will be lost when the tab closes.
      </div>
    );
  }
  if (share >= NEARLY_FULL) {
    return (
      <div className="ui-banner" role="status">
        <strong>Storage is {Math.min(100, Math.round(share * 100))}% full.</strong> RunTruck keeps its records in this browser; when the space runs out, new changes cannot be saved.{' '}
        <Link to="/app/settings/export">Export your data</Link> and delete records you no longer need.
      </div>
    );
  }
  return null;
}

// A short notice when an action failed behind the scenes (a click handler or
// a background task threw). The screen keeps working, but without this the
// person would not know their click did nothing. Screen faults are shown by
// the error boundaries and failed saves by the banner above.
const SHOW_FOR_MS = 12_000;

export function ErrorToast() {
  const newest = useErrorLog()[0];
  const key = newest && (newest.kind === 'script' || newest.kind === 'promise') ? `${newest.id}:${newest.count}` : '';
  // Errors already in the log when the page opens are not announced again.
  const [dismissed, setDismissed] = useState(key);
  const [copied, setCopied] = useState('');
  const showing = key !== '' && key !== dismissed;

  useEffect(() => {
    if (!showing) return;
    const t = window.setTimeout(() => setDismissed(key), SHOW_FOR_MS);
    return () => window.clearTimeout(t);
  }, [showing, key]);

  if (!showing || !newest) return null;
  const copy = () => {
    const text = describeError(newest);
    const done = () => setCopied(key);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy these details:', text));
    else window.prompt('Copy these details:', text);
  };
  return (
    <div className="ui-toast" role="alert">
      <span>Something went wrong and that action may not have finished. Reference <strong>{newest.id}</strong>.</span>
      <button type="button" className="ui-link" onClick={copy}>{copied === key ? 'Copied' : 'Copy details'}</button>
      <button type="button" className="ui-link" onClick={() => setDismissed(key)}>Dismiss</button>
    </div>
  );
}
