import { useState, type ReactNode } from 'react';

// Long tables are shown a page at a time.
//
// Drawing ten thousand rows makes every click and keystroke slow, so a table
// draws PAGE_SIZE rows and a pager underneath moves through the rest. With
// PAGE_SIZE rows or fewer there is no pager and nothing changes. Sorting,
// filters and search work on every row, not just the page on screen.
//
//   const paged = usePaged(sort.rows);
//   … {paged.rows.map(…)} … {paged.pager}
//
// `reveal` jumps to the page holding a row (e.g. the one just created and
// opened): { key: openId, of: (row) => row.id }.

export const PAGE_SIZE = 50;

export interface Paged<T> {
  rows: T[];
  pager: ReactNode;
}

interface Reveal<T> {
  key: string | null | undefined;
  of: (row: T) => string;
}

export function usePaged<T>(all: T[], reveal?: Reveal<T>, size = PAGE_SIZE): Paged<T> {
  const [state, setState] = useState<{ page: number; count: number; revealed: string | null }>({ page: 0, count: all.length, revealed: null });
  let { page } = state;
  const wanted = reveal?.key ?? null;

  // A search or filter changed the list: start again from the first page. One
  // row added or removed keeps the page (it is an edit, not a new list).
  const jumped = Math.abs(all.length - state.count) > 1;
  if (jumped) page = 0;
  // A row was asked for: go to its page (once per row).
  let revealed = state.revealed;
  if (wanted !== revealed) {
    revealed = wanted;
    if (wanted !== null && reveal) {
      const at = all.findIndex((r) => reveal.of(r) === wanted);
      if (at >= 0) page = Math.floor(at / size);
    }
  }
  const pages = Math.max(1, Math.ceil(all.length / size));
  page = Math.min(page, pages - 1);
  if (page !== state.page || all.length !== state.count || revealed !== state.revealed) setState({ page, count: all.length, revealed });

  if (all.length <= size) return { rows: all, pager: null };

  const from = page * size;
  const to = Math.min(all.length, from + size);
  const go = (p: number) => setState((s) => ({ ...s, page: Math.max(0, Math.min(pages - 1, p)) }));
  const n = (x: number) => x.toLocaleString('en-US');
  const pager = (
    <nav className="ui-pager" aria-label="Pages">
      <span className="ui-pager-count">{n(from + 1)}–{n(to)} of {n(all.length)}</span>
      <button type="button" className="ui-btn ui-btn-sm" onClick={() => go(0)} disabled={page === 0} aria-label="First page">«</button>
      <button type="button" className="ui-btn ui-btn-sm" onClick={() => go(page - 1)} disabled={page === 0}>Previous</button>
      <span className="ui-pager-page">Page {n(page + 1)} of {n(pages)}</span>
      <button type="button" className="ui-btn ui-btn-sm" onClick={() => go(page + 1)} disabled={page >= pages - 1}>Next</button>
      <button type="button" className="ui-btn ui-btn-sm" onClick={() => go(pages - 1)} disabled={page >= pages - 1} aria-label="Last page">»</button>
    </nav>
  );
  return { rows: all.slice(from, to), pager };
}
