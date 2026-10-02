// Load test: accounts working at the same time in tabs that share a browser.
// (Accounts on different computers do not share anything until RunTruck has
// a server; see ARCHITECTURE.md.)
import { beforeEach, describe, expect, it } from 'vitest';
import { markOf, useMemoryFiles, useMemoryStorage, type MemoryStorage } from './harness';
import { tabs, type Tab } from './tabs';

let storage: MemoryStorage;
let browser: ReturnType<typeof tabs>;

beforeEach(() => {
  storage = useMemoryStorage();
  useMemoryFiles();
  browser = tabs(storage);
});

// A new customer as the Add customer form makes it, numbered when the form opens.
async function customerForm(tab: Tab, name: string) {
  return browser.as(tab.name, async () => {
    const data = await import('../../data/customers');
    const clock = await import('../../lib/clock');
    const s = tab.shell();
    return data.customerFromForm({ ...data.blankCustomerForm(clock.todayIso(), tab.name), name }, data.nextCustomerId(s.customers), [], tab.name);
  });
}
const names = (tab: Tab) => tab.shell().customers.map((c) => c.name).sort();
const stored = (companyId: string) => (JSON.parse(storage.getItem(`runtruck-${companyId}-customers`) ?? '[]') as { id: string; name: string }[]);

describe('two tabs of the same company', () => {
  it('each sees what the other saves, one after the other', async () => {
    const a = await browser.open('tab A', '3001', '901');
    const b = await browser.open('tab B', '3001', '902');
    const first = await customerForm(a, 'Acme');
    await a.act((s) => s.saveCustomer(first));
    await browser.deliver();
    const second = await customerForm(b, 'Bolt');
    await b.act((s) => s.saveCustomer(second));
    await browser.deliver();
    expect(names(a)).toEqual(['Acme', 'Bolt']);
    expect(names(b)).toEqual(['Acme', 'Bolt']);
    expect(new Set(stored('3001').map((c) => c.id)).size).toBe(2);
    a.close();
    b.close();
  });

  it('keeps both records when the same form was open in both tabs', async () => {
    const a = await browser.open('tab A', '3002', '901');
    const b = await browser.open('tab B', '3002', '902');
    // Both forms open before either is saved, so both are given the same number.
    const first = await customerForm(a, 'Acme');
    const second = await customerForm(b, 'Bolt');
    expect(second.id).toBe(first.id);
    await a.act((s) => s.saveCustomer(first));
    await browser.deliver();
    await new Promise((r) => setTimeout(r, 5));
    await b.act((s) => s.saveCustomer({ ...second, created: new Date().toISOString() }));
    await browser.deliver();
    expect(names(a)).toEqual(['Acme', 'Bolt']);
    expect(names(b)).toEqual(['Acme', 'Bolt']);
    expect(new Set(stored('3002').map((c) => c.id)).size).toBe(2);
    a.close();
    b.close();
  });

  it('keeps both records when two tabs save at the very same moment', async () => {
    const a = await browser.open('tab A', '3003', '901');
    const b = await browser.open('tab B', '3003', '902');
    const first = await customerForm(a, 'Acme');
    const second = await customerForm(b, 'Bolt');
    // Neither tab has heard of the other's save when it makes its own.
    await a.act((s) => s.saveCustomer(first));
    await b.act((s) => s.saveCustomer(second));
    await browser.deliver();
    expect(stored('3003').map((c) => c.name).sort()).toEqual(['Acme', 'Bolt']);
    expect(new Set(stored('3003').map((c) => c.id)).size).toBe(2);
    expect(names(a)).toEqual(['Acme', 'Bolt']);
    expect(names(b)).toEqual(['Acme', 'Bolt']);
    a.close();
    b.close();
  });

  it('keeps an edit made in each tab at the same moment', async () => {
    const a = await browser.open('tab A', '3004', '901');
    const one = await customerForm(a, 'Acme');
    await a.act((s) => s.saveCustomer(one));
    const two = await customerForm(a, 'Bolt');
    await a.act((s) => s.saveCustomer(two));
    const b = await browser.open('tab B', '3004', '902');
    await browser.deliver();
    await a.act((s) => s.saveCustomer({ ...s.customers[0], notes: 'edited in A' }));
    await b.act((s) => s.saveCustomer({ ...s.customers[1], notes: 'edited in B' }));
    await browser.deliver();
    const notes = (tab: Tab) => tab.shell().customers.map((c) => c.notes);
    expect(notes(a)).toEqual(['edited in A', 'edited in B']);
    expect(notes(b)).toEqual(['edited in A', 'edited in B']);
    a.close();
    b.close();
  });
});

describe('two companies open in two tabs of one browser', () => {
  it('never show each other’s records, however their saves interleave', async () => {
    const a = await browser.open('tab A', '3005', '901');
    const b = await browser.open('tab B', '3006', '902');
    for (let i = 0; i < 5; i += 1) {
      const mine = await customerForm(a, `${markOf('3005')} Customer ${i}`);
      const theirs = await customerForm(b, `${markOf('3006')} Customer ${i}`);
      await a.act((s) => s.saveCustomer(mine));
      await b.act((s) => s.saveCustomer(theirs));
      if (i % 2) await browser.deliver();
    }
    await browser.deliver();
    expect(names(a).every((n) => n.startsWith(markOf('3005')))).toBe(true);
    expect(names(b).every((n) => n.startsWith(markOf('3006')))).toBe(true);
    expect(names(a)).toHaveLength(5);
    expect(names(b)).toHaveLength(5);
    a.close();
    b.close();
  });
});
