import {
  IconBuildingBroadcastTower,
  IconDownload,
  IconFileImport,
  IconLayoutDashboard,
  IconListSearch,
  IconSettings,
  IconTool,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

export type RouteName =
  | 'dashboard'
  | 'records'
  | 'record'
  | 'actors'
  | 'platforms'
  | 'import'
  | 'downloads'
  | 'settings'
  | 'maintenance';

export interface Route {
  name: RouteName;
  recordId?: string;
  section?: string;
}

/** Parses `#/...` hashes. Legacy paths (`#/search`, `#/platform`, `#/status`) stay valid. */
export function parseHash(hash: string): Route {
  const [head = '', second, third] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (head) {
    case 'records':
      return second ? { name: 'record', recordId: second } : { name: 'records' };
    case 'search':
      return second === 'records' && third ? { name: 'record', recordId: third } : { name: 'records' };
    case 'actors':
      return { name: 'actors' };
    case 'platforms':
    case 'platform':
      return { name: 'platforms' };
    case 'import':
      return { name: 'import' };
    case 'downloads':
      return { name: 'downloads' };
    case 'settings':
      return { name: 'settings', section: second };
    case 'maintenance':
    case 'status':
      return { name: 'maintenance' };
    default:
      return { name: 'dashboard' };
  }
}

export const recordHref = (id: number | string) => `/records/${encodeURIComponent(String(id))}`;

export interface NavItem {
  route: RouteName;
  href: string;
  label: string;
  icon: Icon;
  /** Extra routes that keep this item highlighted. */
  alsoActive?: RouteName[];
  jobs?: 'download' | 'import';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ route: 'dashboard', href: '/', label: 'Dashboard', icon: IconLayoutDashboard }],
  },
  {
    label: 'Library',
    items: [
      { route: 'records', href: '/records', label: 'Records', icon: IconListSearch, alsoActive: ['record'] },
      { route: 'actors', href: '/actors', label: 'Actors', icon: IconUsers },
      { route: 'platforms', href: '/platforms', label: 'Platforms', icon: IconBuildingBroadcastTower },
    ],
  },
  {
    label: 'Transfers',
    items: [
      { route: 'downloads', href: '/downloads', label: 'Downloads', icon: IconDownload, jobs: 'download' },
      { route: 'import', href: '/import', label: 'Import', icon: IconFileImport, jobs: 'import' },
    ],
  },
  {
    label: 'System',
    items: [
      { route: 'settings', href: '/settings', label: 'Settings', icon: IconSettings },
      { route: 'maintenance', href: '/maintenance', label: 'Maintenance', icon: IconTool },
    ],
  },
];
