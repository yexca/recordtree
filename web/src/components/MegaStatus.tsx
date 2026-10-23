import type { MegaAccountStatus, MegaCommandStatus } from '../api/types';
import { ToneIcon } from './StatusBadge';

const COMMANDS: [string, keyof Pick<MegaAccountStatus, 'mega_get' | 'mega_whoami' | 'mega_login' | 'mega_logout'>][] = [
  ['mega-get', 'mega_get'],
  ['mega-whoami', 'mega_whoami'],
  ['mega-login', 'mega_login'],
  ['mega-logout', 'mega_logout'],
];

export interface CheckRow {
  name: string;
  tone: 'good' | 'warn' | 'bad';
  message: string;
}

export function CheckList({ rows }: { rows: CheckRow[] }) {
  return (
    <div className="rt-checks">
      {rows.map((row) => (
        <div key={row.name} className="rt-check">
          <ToneIcon tone={row.tone} />
          <span className="rt-check-name">{row.name}</span>
          <span className="rt-check-message">{row.message || '-'}</span>
        </div>
      ))}
    </div>
  );
}

function commandRow(name: string, command: MegaCommandStatus): CheckRow {
  return { name, tone: command.available ? 'good' : 'bad', message: command.resolved || command.message };
}

export function megaCommandRows(status: MegaAccountStatus, includeLogin = false): CheckRow[] {
  const rows = COMMANDS.map(([name, key]) => commandRow(name, status[key]));
  if (!includeLogin) return rows;
  return [
    { name: 'login', tone: status.login.logged_in ? 'good' : 'bad', message: status.login.message },
    ...rows,
  ];
}
