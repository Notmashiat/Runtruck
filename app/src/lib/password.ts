// Passwords are never stored: only a PBKDF2-SHA-256 fingerprint (salted,
// 210,000 rounds). Nobody, super admins included, can read a password back;
// it can only be checked or replaced.

export interface PasswordRecord {
  salt: string;
  hash: string;
  iterations: number;
  changed?: string;
}

export const ITERATIONS = 210_000;
export const MIN_PASSWORD = 10;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string) => new Uint8Array(s.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

export async function fingerprint(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password) as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex) as BufferSource, iterations, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

export async function makePasswordRecord(password: string): Promise<PasswordRecord> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  return { salt, hash: await fingerprint(password, salt, ITERATIONS), iterations: ITERATIONS, changed: new Date().toISOString() };
}

export async function passwordFits(password: string, rec: PasswordRecord): Promise<boolean> {
  return (await fingerprint(password, rec.salt, rec.iterations)) === rec.hash;
}

// What is wrong with a new password ([] = fine).
export function passwordProblems(next: string, email: string): string[] {
  const out: string[] = [];
  if (next.length < MIN_PASSWORD) out.push(`At least ${MIN_PASSWORD} characters`);
  if (next !== next.trim()) out.push('No spaces at the start or end');
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) out.push('Letters and at least one number');
  const name = email.split('@')[0].toLowerCase();
  if (name.length >= 3 && next.toLowerCase().includes(name)) out.push('Not based on the email');
  return out;
}
