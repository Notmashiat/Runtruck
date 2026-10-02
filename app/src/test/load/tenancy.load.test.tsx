// Load test: many companies, each with many accounts, all working in the
// same storage. It answers three questions:
//
//   1. Does any company's data ever reach another company?
//   2. Is everything every account saved still there, readable and intact?
//   3. Does the built-in demo company (Company ID 1) stay exactly as it was?
//
// Size: 6 companies × 5 accounts in the normal test run. The full run
// (`npm run test:load`) is 100 companies × 50 accounts: 5,000 sessions.
// Nothing is kept afterwards: storage is in memory (harness.tsx).
import { beforeAll, describe, expect, it } from 'vitest';
import {
  appCode, asAccount, marksIn, markOf, useMemoryFiles, useMemoryStorage, type MemoryStorage,
} from './harness';
import { addTally, noTally, officeWork, type Tally } from './work';

const [COMPANIES, ACCOUNTS] = String(import.meta.env.VITE_RT_LOAD ?? '6x5').split('x').map(Number);
const companyId = (c: number) => String(2001 + c);
// A line on the terminal while a long run is going.
const progress = (line: string) => (globalThis as { process?: { stdout?: { write: (s: string) => void } } }).process?.stdout?.write(`  … ${line}
`);
const memberId = (c: number, a: number) => String(700_000_000 + c * 1000 + a);

interface Report {
  sessions: number;
  seconds: number;
  slowestMs: number;
  // First session of each client company: records it started with.
  startedWith: Record<string, number>;
  // Storage keys that are neither one company's nor a known shared one.
  strayKeys: string[];
  // 'key: found the mark of company X'.
  leaks: string[];
  // What each company reads back, against what its accounts added.
  wrong: string[];
  faults: string[];
  demoBefore: Record<string, number>;
  demoAfter: Record<string, number>;
  storage: { keys: number; characters: number; largestKey: string; largestCharacters: number; writes: number };
  files: number;
}

const report: Report = {
  sessions: 0, seconds: 0, slowestMs: 0, startedWith: {}, strayKeys: [], leaks: [], wrong: [], faults: [],
  demoBefore: {}, demoAfter: {}, storage: { keys: 0, characters: 0, largestKey: '', largestCharacters: 0, writes: 0 }, files: 0,
};

const SHARED_KEYS = new Set(['runtruck-theme', 'runtruck-session', 'runtruck-login-fails']);
// Words that only the built-in demo company's records contain.
const DEMO_WORDS = ['Sunridge', 'Rosa Medina', 'Valley Commerce', 'TriPoint', 'Modesto'];

// How many records a session sees in each list.
const counts = (s: ReturnType<Parameters<Parameters<typeof asAccount>[2]>[0]['shell']>): Record<string, number> => ({
  loads: s.loads.length, customers: s.customers.length, invoices: s.invoices.length, bills: s.bills.length, drivers: s.drivers.length, trucks: s.trucks.length,
  trailers: s.trailers.length, facilities: s.facilities.length, employees: s.employees.length, payRuns: s.payRuns.length, contracts: s.contracts.length,
  onboardings: s.onboardings.length, workOrders: s.workOrders.length, violations: s.violations.length, claims: s.claims.length, batches: s.batches.length,
});

let storage: MemoryStorage;
let files: Map<string, unknown>;

beforeAll(async () => {
  storage = useMemoryStorage();
  files = useMemoryFiles();
  const started = Date.now();

  // The demo company, before anyone else has done anything.
  report.demoBefore = await asAccount('1', '100482731', async (s) => counts(s.shell()));

  // Everyone works, a company at a time and round after round, so the
  // companies' sessions are thoroughly mixed together.
  const expected: Record<string, Tally> = {};
  for (let a = 0; a < ACCOUNTS; a += 1) {
    for (let c = 0; c < COMPANIES; c += 1) {
      const id = companyId(c);
      const t0 = performance.now();
      await asAccount(id, memberId(c, a), async (session) => {
        if (a === 0) report.startedWith[id] = Object.values(counts(session.shell())).reduce((x, y) => x + y, 0);
        const code = await appCode();
        expected[id] = addTally(expected[id] ?? noTally(), await officeWork(session, code, a));
        const log = code.errorLog.getErrorLog();
        if (log.length) report.faults.push(`${id}: ${log.map((e) => e.message).join(' | ')}`);
      });
      report.slowestMs = Math.max(report.slowestMs, performance.now() - t0);
      report.sessions += 1;
      if (report.sessions % 250 === 0) progress(`${report.sessions} of ${COMPANIES * ACCOUNTS} sessions · ${Math.round((Date.now() - started) / 1000)} s`);
    }
  }

  // 1. Whose data is under each key?
  for (const key of storage.keys()) {
    const owner = /^runtruck-(\d+)-/.exec(key)?.[1];
    if (!owner) {
      if (!SHARED_KEYS.has(key)) report.strayKeys.push(key);
      continue;
    }
    for (const mark of marksIn(storage.getItem(key) ?? '')) if (mark !== owner) report.leaks.push(`${key}: has data of company ${mark}`);
    if (owner !== '1') for (const word of DEMO_WORDS) if ((storage.getItem(key) ?? '').includes(word)) report.leaks.push(`${key}: has the demo company's "${word}"`);
  }
  for (const [key, blob] of files) {
    const owner = key.split(':')[0];
    const text = await (blob as Blob).text();
    for (const mark of marksIn(text)) if (mark !== owner) report.leaks.push(`file ${key}: belongs to company ${mark}`);
  }
  report.files = files.size;

  // 2. Each company opens RunTruck again: is everything there, and only theirs?
  for (let c = 0; c < COMPANIES; c += 1) {
    const id = companyId(c);
    await asAccount(id, memberId(c, 0), async (session) => {
      const s = session.shell();
      const code = await appCode();
      const want = expected[id];
      const have = counts(s);
      for (const k of ['customers', 'loads', 'invoices', 'bills', 'drivers', 'trucks', 'employees', 'workOrders', 'violations', 'claims'] as const) {
        if (have[k] !== want[k]) report.wrong.push(`${id}: ${k} has ${have[k]}, its accounts added ${want[k]}`);
      }
      const everything = JSON.stringify([s.loads, s.customers, s.invoices, s.bills, s.drivers, s.trucks, s.employees, s.workOrders, s.violations, s.claims]);
      for (const mark of marksIn(everything)) if (mark !== id) report.leaks.push(`${id} sees a record of company ${mark}`);
      for (const [name, list] of Object.entries({ loads: s.loads, customers: s.customers, invoices: s.invoices, bills: s.bills, employees: s.employees })) {
        const ids = list.map((r) => r.id);
        if (new Set(ids).size !== ids.length) report.wrong.push(`${id}: two ${name} share an id`);
      }
      if (s.invoices.some((i) => code.invoicing.invoiceTotal(i) !== 2240)) report.wrong.push(`${id}: an invoice total is not line haul + fuel`);
      // A file of another company cannot be fetched.
      const foreign = [...files.keys()].find((k) => !k.startsWith(`${id}:`));
      if (foreign && (await code.fileStore.getFile(foreign.split(':')[1]))) report.leaks.push(`${id} can open file ${foreign}`);
      // Nothing of the demo company's in what a client company starts with.
      const startedFrom = JSON.stringify([code.settings.getSettings().company, code.settings.getSettings().invoicing, code.settings.getSettings().team]);
      for (const word of DEMO_WORDS) if (startedFrom.includes(word)) report.leaks.push(`${id}: its settings have the demo company's "${word}"`);
      // Each person's profile is their own.
      if (code.settings.getSettings().profile.name !== `${markOf(id)} Account 0`) report.wrong.push(`${id}: account 0 reads someone else's profile (${code.settings.getSettings().profile.name})`);
      if (storage.getItem(`runtruck-${id}-quarantine`)) report.wrong.push(`${id}: records were set aside as unreadable`);
    });
  }

  // 3. The demo company afterwards.
  report.demoAfter = await asAccount('1', '100482731', async (s) => counts(s.shell()));

  const sizes = storage.keys().map((k) => [k, (storage.getItem(k) ?? '').length] as const).sort((x, y) => y[1] - x[1]);
  report.storage = { keys: sizes.length, characters: storage.size(), largestKey: sizes[0]?.[0] ?? '', largestCharacters: sizes[0]?.[1] ?? 0, writes: storage.writes };
  report.seconds = Math.round((Date.now() - started) / 100) / 10;
  console.info(`\nLoad test: ${COMPANIES} companies × ${ACCOUNTS} accounts`, JSON.stringify({ ...report, startedWith: undefined, demoBefore: undefined, demoAfter: undefined }, null, 1));
}, 3_600_000);

describe(`${COMPANIES} companies × ${ACCOUNTS} accounts working in the same storage`, () => {
  it('ran every session', () => {
    expect(report.sessions).toBe(COMPANIES * ACCOUNTS);
  });

  it('gives a new company no records of the demo company', () => {
    expect(Object.entries(report.startedWith).filter(([, n]) => n > 0)).toEqual([]);
  });

  it('never puts one company’s data where another company’s is kept', () => {
    expect(report.leaks).toEqual([]);
    expect(report.strayKeys).toEqual([]);
  });

  it('keeps everything every account saved, intact', () => {
    expect(report.wrong).toEqual([]);
  });

  it('reports no faults while working', () => {
    expect(report.faults).toEqual([]);
  });

  it('leaves the demo company exactly as it was', () => {
    expect(report.demoAfter).toEqual(report.demoBefore);
    expect(report.demoBefore.loads).toBeGreaterThan(0);
  });
});
