// Mock data for the HR section (employee contracts and onboarding). Static
// in-memory data in the same style as mock.ts; dates move with the real clock.
import { shiftDemo } from '../lib/clock';

export type ContractRole = 'Company driver' | 'Owner-operator' | 'Dispatcher' | 'Mechanic';
export type ContractType = 'W-2' | '1099' | 'Lease-purchase';
export type ContractStatus = 'Active' | 'Renewal due' | 'Expiring' | 'Draft';

export interface Contract {
  employee: string;
  role: ContractRole;
  type: ContractType;
  start: string;
  renews: string;
  payBasis: string;
  status: ContractStatus;
  tagClass: string;
}

// Pay bases match SETTLEMENTS in mock.ts. 'Renewal due' rows renew within
// 30 days of today; 'Expiring' is a term that ends with no renewal on file.
const CONTRACTS_2026: Contract[] = [
  { employee: 'Marcus Hale', role: 'Company driver', type: 'W-2', start: 'Mar 14, 2022', renews: 'Mar 14, 2027', payBasis: '$0.62 / mi', status: 'Active', tagClass: 'tag-green' },
  { employee: 'Dara Whitfield', role: 'Company driver', type: 'W-2', start: 'Aug 2, 2021', renews: 'Aug 2, 2027', payBasis: '$0.60 / mi', status: 'Active', tagClass: 'tag-green' },
  { employee: 'Ellis Nakamura', role: 'Company driver', type: 'W-2', start: 'Oct 1, 2023', renews: 'Oct 1', payBasis: '25% of line haul', status: 'Renewal due', tagClass: 'tag-outline' },
  { employee: 'Priya Raman', role: 'Company driver', type: 'W-2', start: 'Sep 20, 2024', renews: 'Sep 20', payBasis: '$0.58 / mi', status: 'Renewal due', tagClass: 'tag-outline' },
  { employee: 'Ana Cortez', role: 'Company driver', type: 'W-2', start: 'Jan 12', renews: 'Jan 12, 2027', payBasis: '$0.58 / mi', status: 'Active', tagClass: 'tag-green' },
  { employee: 'Tobias Frey', role: 'Owner-operator', type: 'Lease-purchase', start: 'Nov 15, 2023', renews: 'Nov 15', payBasis: '$1.18 / mi', status: 'Expiring', tagClass: 'tag-outline' },
  { employee: 'Rosa Medina', role: 'Dispatcher', type: 'W-2', start: 'Jun 6, 2020', renews: 'Jun 6, 2027', payBasis: '$68,000 / yr', status: 'Active', tagClass: 'tag-green' },
  { employee: 'Luis Ortega', role: 'Mechanic', type: 'W-2', start: 'Feb 9, 2023', renews: 'Feb 9, 2027', payBasis: '$34.50 / hr', status: 'Active', tagClass: 'tag-green' },
  { employee: 'Evan Brooks', role: 'Dispatcher', type: 'W-2', start: 'Jul 27', renews: 'Jul 27, 2027', payBasis: '$52,000 / yr', status: 'Active', tagClass: 'tag-green' },
  { employee: 'Jamal Reed', role: 'Company driver', type: 'W-2', start: 'Sep 8', renews: 'Sep 8, 2027', payBasis: '$0.56 / mi', status: 'Draft', tagClass: 'tag-neutral' },
];

export type OnboardingStage = 'Application' | 'Background check' | 'Road test' | 'Orientation' | 'Complete';

export interface Onboarding {
  candidate: string;
  role: ContractRole;
  stage: OnboardingStage;
  started: string;
  owner: string;
  progress: number;
  nextStep: string;
  docsPending: boolean;
  tagClass: string;
}

// Jamal Reed is the '1 in orientation' on the Drivers tab; Evan Brooks
// finished this quarter and already has his contract above.
const ONBOARDING_2026: Onboarding[] = [
  { candidate: 'Jamal Reed', role: 'Company driver', stage: 'Orientation', started: 'Aug 17', owner: 'Rosa Medina', progress: 85, nextStep: 'Ride-along with Ana Cortez · Sep 5', docsPending: false, tagClass: 'tag-accent' },
  { candidate: 'Sofia Nguyen', role: 'Company driver', stage: 'Road test', started: 'Aug 24', owner: 'Luis Ortega', progress: 60, nextStep: 'Road test in T-103 · Sep 4', docsPending: false, tagClass: 'tag-accent' },
  { candidate: 'Derek Holt', role: 'Owner-operator', stage: 'Background check', started: 'Aug 28', owner: 'Rosa Medina', progress: 35, nextStep: 'Waiting on MVR consent and insurance certificate', docsPending: true, tagClass: 'tag-outline' },
  { candidate: 'Kevin Brandt', role: 'Company driver', stage: 'Background check', started: 'Sep 1', owner: 'Rosa Medina', progress: 30, nextStep: 'Waiting on medical card copy', docsPending: true, tagClass: 'tag-outline' },
  { candidate: 'Maya Patel', role: 'Company driver', stage: 'Application', started: 'Sep 2', owner: 'Rosa Medina', progress: 10, nextStep: 'Phone screen · Sep 4', docsPending: false, tagClass: 'tag-neutral' },
  { candidate: 'Evan Brooks', role: 'Dispatcher', stage: 'Complete', started: 'Jul 13', owner: 'Rosa Medina', progress: 100, nextStep: '90-day review · Oct 25', docsPending: false, tagClass: 'tag-green' },
];

// The demo records, moved to today's date.
export const CONTRACTS: Contract[] = shiftDemo(CONTRACTS_2026);
export const ONBOARDING: Onboarding[] = shiftDemo(ONBOARDING_2026);
