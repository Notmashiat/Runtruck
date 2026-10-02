import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearErrorLog, getErrorLog } from '../lib/errorLog';
import { ErrorBoundary } from './ErrorBoundary';

function Broken({ broken }: { broken: boolean }) {
  if (broken) throw new Error('this part is broken');
  return <span>works</span>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    clearErrorLog();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('shows a message instead of a blank screen, and leaves the rest of the app standing', () => {
    render(
      <div>
        <nav>Menu</nav>
        <ErrorBoundary where="Page"><Broken broken /></ErrorBoundary>
      </div>,
    );
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('This page hit a problem');
    expect(screen.getByRole('alert').textContent).toContain('this part is broken');
  });

  it('records the fault with the part of the screen it came from', () => {
    render(<ErrorBoundary where="Top bar" variant="strip"><Broken broken /></ErrorBoundary>);
    const [entry] = getErrorLog();
    expect(entry.kind).toBe('screen');
    expect(entry.where).toBe('Top bar');
    expect(entry.stack).toContain('Broken');
    expect(screen.getByRole('alert').textContent).toContain(entry.id);
  });

  it('recovers by itself when the reset key changes (moving to another page)', () => {
    const { rerender } = render(<ErrorBoundary where="Page" resetKey="/app/loads"><Broken broken /></ErrorBoundary>);
    expect(screen.queryByRole('alert')).not.toBeNull();
    rerender(<ErrorBoundary where="Page" resetKey="/app/fleet"><Broken broken={false} /></ErrorBoundary>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('works')).toBeTruthy();
  });

  it('tries again on request', () => {
    let broken = true;
    function Flaky() {
      if (broken) throw new Error('first time only');
      return <span>recovered</span>;
    }
    render(<ErrorBoundary where="Page"><Flaky /></ErrorBoundary>);
    broken = false;
    fireEvent.click(screen.getByText('Try again'));
    expect(screen.getByText('recovered')).toBeTruthy();
  });

  it('explains a page that could not be downloaded differently from a fault', () => {
    function Stale(): never {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/BillsTab-abc.js');
    }
    render(<ErrorBoundary where="Page"><Stale /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
    expect(getErrorLog()[0].kind).toBe('update');
  });
});
