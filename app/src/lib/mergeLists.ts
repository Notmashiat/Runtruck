// Two tabs saving the same list at the same moment.
//
// Each tab keeps a whole list (every customer, every load) and saves the
// whole list. Normally a tab hears about another tab's save before its next
// one (lib/storage.ts) and so starts from the newest list. In the rare case
// that it saves first, writing its own copy would wipe out what the other
// tab just added. These functions put the two together instead: what the
// other tab saved, plus this tab's own changes since it last read the list.

interface Row { id: string }

const isRows = (v: unknown): v is Row[] => Array.isArray(v) && v.every((r) => r && typeof r === 'object' && typeof (r as Row).id === 'string');

// An id like the one given that nothing in `taken` uses: same prefix, the
// next number up ('CUS-1004' → 'CUS-1006' when 1005 is the highest in use).
export function freeId(id: string, taken: Iterable<string>): string {
  const m = /^(.*?)(\d+)$/.exec(id);
  if (!m) return `${id}-2`;
  let top = Number(m[2]);
  for (const t of taken) {
    const x = /^(.*?)(\d+)$/.exec(t);
    if (x && x[1] === m[1]) top = Math.max(top, Number(x[2]));
  }
  return `${m[1]}${top + 1}`;
}

// When a record was made, for the kinds that note it (loads note it as the
// first line of their history). Two records with the same id but made at
// different moments are two different records.
export function bornAt(record: unknown): string {
  const r = record as { created?: unknown; createdAt?: unknown; history?: { at?: unknown }[] } | null;
  const at = r?.created ?? r?.createdAt ?? r?.history?.[0]?.at;
  return typeof at === 'string' ? at : '';
}

// `theirs` (what storage holds now) with this tab's changes since `base`
// (what this tab last read) applied: the records it added, changed and
// deleted. Lists of records are merged record by record; anything else is
// this tab's value as it is.
//
// A record this tab added whose id the other tab also just used for a
// different record gets the next free id, so neither is lost. Records added
// here go where this tab put them: at the top of the list if it adds new
// records at the top (as the load board does), otherwise at the end.
export function mergeChanges<T>(base: T, ours: T, theirs: T): T {
  if (!isRows(base) || !isRows(ours) || !isRows(theirs)) return ours;
  const before = new Map(base.map((r) => [r.id, r]));
  const mine = new Map(ours.map((r) => [r.id, r]));
  const out = theirs.filter((r) => !before.has(r.id) || mine.has(r.id));
  const at = new Map(out.map((r, i) => [r.id, i]));
  const taken = new Set([...out.map((r) => r.id), ...ours.map((r) => r.id)]);
  const firstKnown = ours.findIndex((r) => before.has(r.id));
  const top: Row[] = [];
  ours.forEach((r, n) => {
    const was = before.get(r.id);
    const i = at.get(r.id);
    if (was === r) return; // untouched here: keep the other tab's copy
    if (was && i !== undefined) {
      out[i] = r; // changed here
      return;
    }
    let added = r; // added here (or changed here and deleted there: the change wins)
    if (!was && i !== undefined) {
      if (JSON.stringify(out[i]) === JSON.stringify(r)) return; // the same record, saved by both
      // Added here and there under the same id: two records, so renumber ours.
      const id = freeId(r.id, taken);
      taken.add(id);
      added = { ...r, id };
    }
    if (n < firstKnown) top.push(added);
    else out.push(added);
  });
  return [...top, ...out] as T;
}
