import { useAppShell } from '../../../context/AppShellContext';
import { clientCompanies } from '../../../data/companies';
import { currentSession } from '../../../lib/auth';
import { useSettings } from '../../../lib/settingsStore';

// The client register with this company's live numbers filled in.
export function useClients() {
  const { trucks } = useAppShell();
  const [s] = useSettings();
  return clientCompanies({
    trucks: trucks.filter((t) => !t.archived).length,
    teamMembers: s.team.filter((m) => m.active).length,
    lastSignIn: currentSession()?.started,
  });
}
