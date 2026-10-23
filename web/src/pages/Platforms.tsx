import { IconBuildingBroadcastTower } from '@tabler/icons-react';
import { api } from '../api/client';
import type { PlatformSummary } from '../api/types';
import { EntityBrowser, type EntityBrowserConfig } from '../components/EntityBrowser';

const config: EntityBrowserConfig<PlatformSummary> = {
  cacheKey: 'platforms',
  title: 'Platforms',
  description: 'Browse delivery platforms and the records published on each.',
  noun: 'Platform',
  nounPlural: 'platforms',
  emptyIcon: <IconBuildingBroadcastTower size={22} />,
  fetchPage: api.platformPage,
  fetchOne: api.platform,
  fetchCounts: api.platformUndownloadedCounts,
  fetchRecords: api.platformRecords,
  hideColumn: 'source',
};

export default function Platforms() {
  return <EntityBrowser config={config} />;
}
