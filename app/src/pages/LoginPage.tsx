import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { COMPANY_ID } from '../lib/account';
import { currentSession, emailHint, lockedFor, logIn } from '../lib/auth';
import { getSettings } from '../lib/settingsStore';

// /login: email and password for the RunTruck account (company 30017).
// Signed-in people go straight to the app.
export function LoginPage() {
  const navigate = useNavigate();
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

  if (currentSession()) return <Navigate to={target} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError(!email.trim() ? 'Enter your email.' : 'Enter your password.');
      return;
    }
    setBusy(true);
    const result = await logIn(email, password, remember);
    setBusy(false);
    if (result.ok) {
      navigate(target, { replace: true });
      return;
    }
    setPassword('');
    if (result.reason === 'locked') {
      setWait(result.seconds ?? 60);
      setError('Too many tries. Wait a minute, then try again.');
    } else if (result.reason === 'email') {
      setError(`That isn’t this account’s email. Use the account email (${emailHint()}).`);
    } else {
      setError('Wrong password. Paste it exactly as given, or use Show to check what you typed.');
    }
  };

  const company = getSettings().company.name;

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="login-brand" aria-label="RunTruck home">
          <span className="ui-brand-mark" />
          <span>RunTruck</span>
        </Link>
        <h1 className="login-title">Log in</h1>
        <p className="login-sub">to {company} · Company ID {COMPANY_ID}</p>

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
              Ask your company administrator to reset it, or contact RunTruck support with your Company ID ({COMPANY_ID}). Password reset by email arrives with RunTruck accounts.
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
