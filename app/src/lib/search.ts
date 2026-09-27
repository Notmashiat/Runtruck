// The top-bar search box filters whichever table is on screen: a row matches
// when any of its visible string or number fields contains the query.
// tagClass is presentation, not content, so it is skipped.
export function matchesQuery(row: object, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return Object.entries(row).some(
    ([key, v]) => key !== 'tagClass' && (typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q),
  );
}
