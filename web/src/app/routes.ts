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
  | 'actor'
  | 'platforms'
  | 'import'
  | 'downloads'
  | 'settings'
  | 'maintenance';

export interface Route {
  name: RouteName;
  recordId?: string;
  actorId?: number;
  section?: string;
  /** Raw query string after `?`, used for page state such as record filters. */
  query: string;
}

/** Parses `#/...?query` hashes. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const queryAt = raw.indexOf('?');
  const path = queryAt === -1 ? raw : raw.slice(0, queryAt);
  const query = queryAt === -1 ? '' : raw.slice(queryAt + 1);
  return { ...parsePath(path), query };
}

function parsePath(path: string): Omit<Route, 'query'> {
  const [head = '', second] = path.split('/').map(decodeURIComponent);
  switch (head) {
    case 'records':
      return second ? { name: 'record', recordId: second } : { name: 'records' };
    case 'actors': {
      const actorId = Number(second);
      return second && Number.isInteger(actorId) && actorId > 0 ? { name: 'actor', actorId } : { name: 'actors' };
    }
    case 'platforms':
      return { name: 'platforms' };
    case 'import':
      return { name: 'import' };
    case 'downloads':
      return { name: 'downloads' };
    case 'settings':
      return { name: 'settings', section: second };
    case 'maintenance':
      return { name: 'maintenance' };
    default:
      return { name: 'dashboard' };
  }
}

export const recordHref = (id: number | string) => `/records/${encodeURIComponent(String(id))}`;
export const actorHref = (id: number) => `/actors/${id}`;

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
      { route: 'actors', href: '/actors', label: 'Actors', icon: IconUsers, alsoActive: ['actor'] },
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
