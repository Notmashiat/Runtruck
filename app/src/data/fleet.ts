// Fleet-section data that mock.ts does not carry.
import { COMPLIANCE } from './mock';

export interface WatchItem {
  name: string;
  item: string;
  due: string;
}

// Drivers-tab compliance watchlist: the shared COMPLIANCE items plus the
// other document expiring soon in Safety › Driver Documents (data/safety.ts).
export const WATCHLIST: WatchItem[] = [
  ...COMPLIANCE,
  { name: 'Marcus Hale', item: 'Clearinghouse query', due: 'Sep 20' },
];
