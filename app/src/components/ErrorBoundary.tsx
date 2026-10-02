import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describeError, isLoadFailure, reportError, type ErrorEntry } from '../lib/errorLog';

// Keeps one broken part of the screen from taking the rest down.
//
// React removes the whole screen when a component throws while drawing,
// unless a boundary above it catches the error. RunTruck wraps each
// independent part — the app, the sidebar, the top bar, the page, a tab, a
// form, a dashboard widget — so a fault in one leaves the others working.
// The fault is recorded (lib/errorLog.ts) and the person sees what happened,
// a reference to quote, and ways to carry on.
//
// `where` names the part ('Page', 'Top bar'…); it is what the error log
// shows. `resetKey` clears the fault when it changes (e.g. the address, so
// moving to another page recovers by itself).

interface Props {
  where: string;
  resetKey?: string | number | null;
  // 'page' fills the content area; 'strip' is one line (bars, forms, widgets);
  // 'app' is the whole window, when nothing else could be drawn.
  variant?: 'page' | 'strip' | 'app';
  // For a part that can simply be closed (a form): adds a Dismiss button.
  onDismiss?: () => void;
  children: ReactNode;
}

interface State {
  error: unknown;
  entry: ErrorEntry | null;
  copied: boolean;
}

const CLEAR: State = { error: null, entry: null, copied: false };

export class ErrorBoundary extends Component<Props, State> {
  state: State = CLEAR;

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error('Unknown error') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const entry = reportError(error, { kind: isLoadFailure(error) ? 'update' : 'screen', where: this.props.where, componentStack: info.componentStack });
    this.setState({ entry });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error !== null && prev.resetKey !== this.props.resetKey) this.setState(CLEAR);
  }

  retry = () => this.setState(CLEAR);

  copy = () => {
    const { entry } = this.state;
    if (!entry) return;
    const done = () => this.setState({ copied: true });
    // The clipboard needs a secure page and permission; fall back to showing the text.
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(describeError(entry)).then(done, () => window.prompt('Copy these details:', describeError(entry)));
    else window.prompt('Copy these details:', describeError(entry));
  };

  render() {
    const { error, entry, copied } = this.state;
    if (error === null) return this.props.children;

    const variant = this.props.variant ?? 'page';
    const offline = isLoadFailure(error);
    const reference = entry ? entry.id : '';
    const actions = (
      <>
        {!offline && <button type="button" className="ui-btn ui-btn-sm" onClick={this.retry}>Try again</button>}
        <button type="button" className={`ui-btn ui-btn-sm${offline ? ' ui-btn-primary' : ''}`} onClick={() => window.location.reload()}>Reload</button>
        {entry && <button type="button" className="ui-btn ui-btn-sm" onClick={this.copy}>{copied ? 'Copied' : 'Copy error details'}</button>}
        {this.props.onDismiss && <button type="button" className="ui-btn ui-btn-sm" onClick={() => { this.props.onDismiss?.(); this.retry(); }}>Dismiss</button>}
      </>
    );

    if (variant === 'strip') {
      return (
        <div className="ui-fault is-strip" role="alert">
          <span><strong>{this.props.where}</strong> hit a problem{reference ? ` (${reference})` : ''}. The rest of RunTruck still works.</span>
          <span className="ui-fault-actions">{actions}</span>
        </div>
      );
    }

    return (
      <div className={`ui-fault${variant === 'app' ? ' is-app' : ''}`} role="alert">
        <h2 className="ui-h2" style={{ margin: 0 }}>{offline ? 'This page could not be loaded' : variant === 'app' ? 'RunTruck hit a problem' : 'This page hit a problem'}</h2>
        <p className="ui-p" style={{ margin: 0 }}>
          {offline
            ? 'Check your connection, then reload. If RunTruck was just updated, reloading gets the new version.'
            : variant === 'app'
              ? 'Something went wrong while drawing the screen. Your saved data is not affected. Reload to carry on.'
              : 'Something went wrong while drawing this page. Your saved data is not affected, and the rest of RunTruck still works: use the menu to go elsewhere, or try again.'}
        </p>
        <div className="ui-fault-actions">{actions}</div>
        {entry && (
          <p className="ui-stop-meta" style={{ margin: 0 }}>
            Reference <strong>{entry.id}</strong> · {entry.message}
            <br />If it keeps happening, send the copied details to RunTruck support.
          </p>
        )}
      </div>
    );
  }
}
