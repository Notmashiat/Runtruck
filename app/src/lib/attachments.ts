// Attached documents (bills, customers, loads): reading a file into an
// attachment, and opening or downloading one. Attaching always goes through
// components/AttachDialog.tsx (drag and drop or browse). There is no size
// limit: the file itself is kept in IndexedDB (lib/fileStore.ts) and the
// record keeps its name, type, size and id.
import type { BillDocument } from '../data/bills';
import { getFile, putFile } from './fileStore';

export const fileSize = (n: number) =>
  n >= 1024 * 1024 * 1024 ? `${(n / 1024 / 1024 / 1024).toFixed(1)} GB` : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

// Save a file and return its attachment, or why it could not be saved.
export async function readAttachment(f: File, kind?: string): Promise<BillDocument | string> {
  const id = `DOC-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await putFile(id, f);
  } catch (e) {
    return `${f.name}: ${e instanceof Error && /quota/i.test(e.name + e.message) ? 'this browser is out of storage space' : 'could not be saved in this browser'}`;
  }
  return {
    id, name: f.name, type: f.type || 'application/octet-stream', size: f.size, added: new Date().toISOString(), stored: true, ...(kind ? { kind } : {}),
  };
}

// The file's contents: from IndexedDB, or (files attached before) the record itself.
async function blobOf(d: BillDocument): Promise<Blob | null> {
  if (d.stored) return (await getFile(d.id)) ?? null;
  return d.data ? (await fetch(d.data)).blob() : null;
}

// The only kinds of file shown inside the browser. Anything else is
// downloaded instead: a web page or an SVG picture can carry a script, and
// opened in a tab it would run as RunTruck, with this company's records.
const SHOWN_IN_TAB = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export const opensInTab = (d: Pick<BillDocument, 'type'>) => SHOWN_IN_TAB.has((d.type || '').toLowerCase().split(';')[0].trim());

const missing = (d: BillDocument) => window.alert(`${d.name} is not saved in this browser. Attach it again.`);

async function safeBlob(d: BillDocument): Promise<Blob | null> {
  try {
    return await blobOf(d);
  } catch {
    return null;
  }
}

// Open an attached file in a new tab (PDFs and images show in the browser;
// every other kind of file is downloaded).
export async function openDocument(d: BillDocument) {
  if (!opensInTab(d)) return downloadDocument(d);
  const type = d.type.toLowerCase().split(';')[0].trim();
  // Open the tab first, while the click still counts, then fill it.
  const tab = window.open('', '_blank');
  const blob = await safeBlob(d);
  if (!blob) {
    tab?.close();
    missing(d);
    return;
  }
  // Served as the allowed type on the record, whatever the file itself claims.
  const url = URL.createObjectURL(new Blob([blob], { type }));
  if (tab) {
    // The new tab gets no handle back to RunTruck.
    try {
      tab.opener = null;
    } catch {
      // Some browsers do not allow it; the type check above is the real guard.
    }
    tab.location.href = url;
  } else window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadDocument(d: BillDocument) {
  const blob = await safeBlob(d);
  if (!blob) {
    missing(d);
    return;
  }
  // A plain "file" type, so no browser tries to show it instead of saving it.
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = d.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
