import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { currentSession, lockedFor, logIn, sessionChanged } from '../lib/auth';
import { reportError } from '../lib/errorLog';

// /login: email and password for the RunTruck account.
// Signed-in people go straight to the app.
export function LoginPage() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const target = from && from.startsWith('/app') && from !== '/app/' ? from : '/app';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(lockedFor());
  const [forgot, setForgot] = useState(false);

  // Count down a lockout after too many wrong tries.
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait(lockedFor()), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  // Signed in already (here, or in another tab as a different account).
  if (sessionChanged()) {
    window.location.replace(target);
    return null;
  }
  if (currentSession()) return <Navigate to={target} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError(!email.trim() ? 'Enter your email.' : 'Enter your password.');
      return;
    }
    setBusy(true);
    let result: Awaited<ReturnType<typeof logIn>>;
    try {
      result = await logIn(email, password, remember);
    } catch (err) {
      // The check itself failed (e.g. the browser has no secure crypto on a
      // plain http page): say so rather than staying on "Checking…".
      reportError(err, { kind: 'promise', where: 'Log in' });
      setError('RunTruck could not check the password in this browser. Reload the page and try again.');
      return;
    } finally {
      setBusy(false);
    }
    if (result.ok) {
      // A full reload opens the app with this account's company and nothing else.
      window.location.replace(target);
      return;
    }
    setPassword('');
    if (result.reason === 'locked') {
      setWait(result.seconds ?? 60);
      setError('Too many tries. Wait a minute, then try again.');
    } else if (result.reason === 'email') {
      setError('No RunTruck account uses that email. Check it, or ask a RunTruck super admin.');
    } else if (result.reason === 'disabled') {
      setError('This account has been deactivated. Ask a RunTruck super admin to reactivate it.');
    } else if (result.reason === 'storage') {
      setError('This browser is blocking site data, so RunTruck cannot keep you signed in. Allow cookies and site data for this site, then try again.');
    } else if (result.reason === 'company') {
      setError(`${result.company ?? 'This company'} can’t sign in right now. Contact RunTruck.`);
    } else {
      setError('Wrong password. Paste it exactly as given, or use Show to check what you typed.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="login-brand" aria-label="RunTruck home">
          <span className="ui-brand-mark" />
          <span>RunTruck</span>
        </Link>
        <h1 className="login-title">Log in</h1>
        <p className="login-sub">to your RunTruck account</p>

        <form onSubmit={submit} noValidate className="login-form">
          <label className="ui-field">
            <span className="ui-field-label">Email</span>
            <input
              className="ui-input" type="email" autoComplete="username" autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error) && !email.trim()}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Password</span>
            <span className="login-password">
              <input
                className="ui-input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error) && !password}
              />
              <button type="button" className="login-show" onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <div className="login-row">
            <label className="ui-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Keep me signed in for 30 days
            </label>
            <button type="button" className="ui-link" onClick={() => setForgot(!forgot)}>Forgot password?</button>
          </div>
          {forgot && (
            <div className="ui-note">
              Ask your RunTruck administrator to reset it. Password reset by email arrives with RunTruck’s servers.
            </div>
          )}
          {error && <div className="ui-errors" role="alert">{error}{wait > 0 ? ` (${wait}s)` : ''}</div>}
          <button type="submit" className="ui-btn ui-btn-primary login-submit" disabled={busy || wait > 0}>
            {busy ? 'Checking…' : wait > 0 ? `Try again in ${wait}s` : 'Log in'}
          </button>
        </form>
      </div>
      <p className="login-foot">Not a RunTruck customer yet? <Link className="ui-link" to="/">See what RunTruck does</Link></p>
    </div>
  );
}
