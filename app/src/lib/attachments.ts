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

// Open an attached file in a new tab (PDFs and images show in the browser).
export async function openDocument(d: BillDocument) {
  // Open the tab first, while the click still counts, then fill it.
  const tab = window.open('', '_blank');
  const blob = await blobOf(d);
  if (!blob) {
    tab?.close();
    window.alert(`${d.name} is not saved in this browser. Attach it again.`);
    return;
  }
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: d.type }));
  if (tab) tab.location.href = url;
  else window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadDocument(d: BillDocument) {
  const blob = await blobOf(d);
  if (!blob) {
    window.alert(`${d.name} is not saved in this browser. Attach it again.`);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = d.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
