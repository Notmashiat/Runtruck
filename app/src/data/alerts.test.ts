import { describe, expect, it } from 'vitest';
import { urgentAlerts } from './alerts';
import type { FleetDriver } from './fleet';
import type { Load } from './mock';
import type { WorkOrder } from './safetyRecords';

const today = '2026-10-02';
const load = (id: string, status: string, more: Partial<Load> = {}) =>
  ({ id, status, unit: 'T-123 / RF-9', driver: 'Ana Cortez', route: 'Fresno, CA → Reno, NV', pickup: '', pickupDate: today, ...more }) as unknown as Load;
const order = (more: Partial<WorkOrder>) =>
  ({ id: 'WO-1', unit: 'T-123', unitKind: 'Truck', type: 'Brakes', source: 'Driver report', status: 'In shop', outOfService: true, ...more }) as unknown as WorkOrder;
const driver = (name: string, details: Record<string, string>) => ({ id: 'D-1', name, details, archived: false }) as unknown as FleetDriver;

describe('urgent alerts', () => {
  it('reports a breakdown on a truck that is on a load', () => {
    const alerts = urgentAlerts([load('L-123', 'In transit')], [order({ source: 'Breakdown' })], [], today);
    expect(alerts.map((a) => a.text)).toEqual(['Truck T-123 reported a breakdown while en route with load L-123']);
    expect(alerts[0].to).toBe('/app/loads/L-123');
  });

  it('says out of service when it was not a breakdown, and ignores units with no load or closed orders', () => {
    expect(urgentAlerts([load('L-1', 'Dispatched')], [order({})], [], today)[0].text).toBe('Truck T-123 is out of service while dispatched on load L-1');
    expect(urgentAlerts([load('L-1', 'Booked')], [order({})], [], today)).toEqual([]);
    expect(urgentAlerts([load('L-1', 'In transit')], [order({ status: 'Done' })], [], today)).toEqual([]);
    expect(urgentAlerts([load('L-1', 'In transit')], [order({ outOfService: false })], [], today)).toEqual([]);
  });

  it('reports late loads and pickups with no driver', () => {
    const texts = urgentAlerts([
      load('L-2', 'Delayed'),
      load('L-3', 'Needs driver', { pickupDate: today }),
      load('L-4', 'Needs driver', { pickupDate: '2026-09-30' }),
      load('L-5', 'Needs driver', { pickupDate: '2026-10-05' }),
    ], [], [], today).map((a) => a.text);
    expect(texts).toEqual([
      'Load L-2 is delayed · Fresno, CA → Reno, NV',
      'Load L-3 picks up today and has no driver',
      'Load L-4 was due for pickup on Sep 30 and has no driver',
    ]);
  });

  it('reports a driver on a load with an expired medical card', () => {
    const texts = urgentAlerts([load('L-6', 'In transit')], [], [driver('Ana Cortez', { cdlExpiry: '2030-01-01', medicalExpiry: '2026-01-01' })], today).map((a) => a.text);
    expect(texts).toContain('Ana Cortez is on load L-6 with an expired medical card');
  });

  it('has nothing to say when all is well', () => {
    expect(urgentAlerts([load('L-7', 'In transit')], [], [], today)).toEqual([]);
  });
});
