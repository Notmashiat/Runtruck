import { CLIENTS, type ClientCompany } from '../../../data/companies';

// The client register (empty until Create company adds the first client).
export function useClients(): ClientCompany[] {
  return CLIENTS;
}
