// The marketing page: the scroll scene's arithmetic, and that what the page
// says matches what RunTruck bills.
import { describe, expect, it } from 'vitest';
import { progressOf } from '../lib/scrollFx';
import { PLANS, TRIAL_DAYS, monthlyPrice, type ClientCompany } from './companies';
import { FAQS, FEATURES, JOURNEY, PRICING, contactHref, stepAt } from './site';

describe('scroll progress', () => {
  // A 5,000px section on a 1,000px screen: the scene is pinned for 4,000px.
  it('runs from 0 to 1 while a pinned scene is on screen', () => {
    expect(progressOf(0, 5000, 1000, 'through')).toBe(0);
    expect(progressOf(-2000, 5000, 1000, 'through')).toBe(0.5);
    expect(progressOf(-4000, 5000, 1000, 'through')).toBe(1);
  });

  it('stays at the ends before and after the section', () => {
    expect(progressOf(600, 5000, 1000, 'through')).toBe(0);
    expect(progressOf(-9000, 5000, 1000, 'through')).toBe(1);
  });

  it('copes with a section no taller than the screen', () => {
    expect(progressOf(200, 800, 1000, 'through')).toBe(0);
    expect(progressOf(-10, 800, 1000, 'through')).toBe(1);
  });

  it('runs from 0 to 1 as something scrolls into view', () => {
    expect(progressOf(1000, 400, 1000, 'enter')).toBe(0);
    expect(progressOf(300, 400, 1000, 'enter')).toBe(1);
    expect(progressOf(650, 400, 1000, 'enter')).toBe(0.5);
  });
});

describe('the load’s journey', () => {
  it('starts at the beginning and its steps are in order', () => {
    expect(JOURNEY[0].from).toBe(0);
    expect(JOURNEY.map((s) => s.from)).toEqual([...JOURNEY.map((s) => s.from)].sort((a, b) => a - b));
  });

  it('shows the step the scroll position falls in', () => {
    expect(stepAt(0)).toBe(0);
    expect(JOURNEY[stepAt(0.2)].status).toBe('Dispatched');
    expect(JOURNEY[stepAt(0.6)].status).toBe('Delivered');
    expect(stepAt(1)).toBe(JOURNEY.length - 1);
  });
});

describe('what the page says', () => {
  it('quotes the prices RunTruck bills', () => {
    const company = (plan: 'Starter' | 'Growth', trucks: number) => ({ plan, trucks, customPrice: null }) as unknown as ClientCompany;
    expect(PRICING[0].price).toBe(`$${PLANS.Starter.perTruck}`);
    expect(PRICING[0].note).toContain(`$${monthlyPrice(company('Starter', 10))} a month`);
    expect(PRICING[1].price).toBe(`$${PLANS.Growth.perTruck}`);
    expect(PRICING[1].note).toContain(`$${monthlyPrice(company('Growth', 40))?.toLocaleString('en-US')} a month`);
  });

  it('quotes the real length of the trial', () => {
    expect(FAQS.some((f) => f.a.includes(`${TRIAL_DAYS} days`))).toBe(true);
  });

  it('has no empty entries', () => {
    for (const x of [...FEATURES, ...JOURNEY]) expect(x.title && x.body).toBeTruthy();
    for (const f of FAQS) expect(f.q && f.a).toBeTruthy();
  });

  it('sends the trial buttons to the Get started section until there is a contact address', () => {
    expect(contactHref('Trial')).toMatch(/^(#start|mailto:)/);
  });
});
