import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, usePaged } from './paging';

const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `R-${i + 1}` }));

function Table({ rows, open }: { rows: { id: string }[]; open?: string | null }) {
  const paged = usePaged(rows, { key: open, of: (r) => r.id });
  return (
    <div>
      <ul>{paged.rows.map((r) => <li key={r.id}>{r.id}</li>)}</ul>
      {paged.pager}
    </div>
  );
}

describe('usePaged', () => {
  it('shows a short list whole, with no pager', () => {
    const { result } = renderHook(() => usePaged(rowsOf(PAGE_SIZE)));
    expect(result.current.rows).toHaveLength(PAGE_SIZE);
    expect(result.current.pager).toBeNull();
  });

  it('shows a long list one page at a time', () => {
    render(<Table rows={rowsOf(120)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.getByText('1–50 of 120')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('51–100 of 120')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect((screen.getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  });

  it('goes back to the first page when a search or filter changes the list', () => {
    const { rerender } = render(<Table rows={rowsOf(200)} />);
    fireEvent.click(screen.getByText('Next'));
    rerender(<Table rows={rowsOf(90)} />);
    expect(screen.getByText('1–50 of 90')).toBeTruthy();
  });

  it('stays on the page when one row is added or removed', () => {
    const { rerender } = render(<Table rows={rowsOf(200)} />);
    fireEvent.click(screen.getByText('Next'));
    rerender(<Table rows={rowsOf(199)} />);
    expect(screen.getByText('51–100 of 199')).toBeTruthy();
  });

  it('jumps to the page that holds a row asked for', () => {
    const { rerender } = render(<Table rows={rowsOf(200)} open={null} />);
    rerender(<Table rows={rowsOf(200)} open="R-130" />);
    expect(screen.getByText('R-130')).toBeTruthy();
    expect(screen.getByText('101–150 of 200')).toBeTruthy();
  });

  it('never lands past the last page', () => {
    const { rerender } = render(<Table rows={rowsOf(101)} />);
    fireEvent.click(screen.getByLabelText('Last page'));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    rerender(<Table rows={rowsOf(100)} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.getByText('51–100 of 100')).toBeTruthy();
  });
});
