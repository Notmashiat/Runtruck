// Attached documents (bills, customers, loads): reading a file into an
// attachment, and opening or downloading one. Attaching always goes through
// components/AttachDialog.tsx (drag and drop or browse).
import { MAX_DOC_BYTES, type BillDocument } from '../data/bills';

export const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function readFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

// A file read into an attachment, or its name when it is too big.
export async function readAttachment(f: File, kind?: string): Promise<BillDocument | string> {
  if (f.size > MAX_DOC_BYTES) return f.name;
  return {
    id: `DOC-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: f.name, type: f.type || 'application/octet-stream',
    size: f.size, data: await readFile(f), added: new Date().toISOString(), ...(kind ? { kind } : {}),
  };
}

// Open an attached file in a new tab (PDFs and images show in the browser).
export async function openDocument(d: BillDocument) {
  const blob = await (await fetch(d.data)).blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadDocument(d: BillDocument) {
  const a = document.createElement('a');
  a.href = d.data;
  a.download = d.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
