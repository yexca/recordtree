import { Button, Group, Skeleton, Stack, Text } from '@mantine/core';
import {
  IconArrowRight,
  IconBuildingBroadcastTower,
  IconDownload,
  IconFileImport,
  IconLink,
  IconListSearch,
  IconStack2,
  IconUsers,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DownloadPage, ImportPage, StatsResult } from '../api/types';
import type { Navigate } from '../App';
import { useActiveJobs } from '../app/ActiveJobs';
import { CoverageMeter, StatCard } from '../components/data';
import { EmptyState, ErrorBlock } from '../components/feedback';
import { Page, PageHeader, Panel } from '../components/layout';
import { StatusBadge } from '../components/StatusBadge';
import { errorMessage, formatBytes, formatNumber, formatPercent, formatRelative } from '../lib/format';

function ActivitySkeleton() {
  return (
    <Stack gap={14} p="md">
      {[0, 1, 2].map((index) => (
        <Group key={index} gap="sm" wrap="nowrap">
          <Skeleton height={32} width={32} radius="md" />
          <Stack gap={6} style={{ flex: 1 }}>
            <Skeleton height={10} width="55%" />
            <Skeleton height={8} width="30%" />
          </Stack>
        </Group>
      ))}
    </Stack>
  );
}

export default function Dashboard({
  navigate,
  onOpenRecord,
}: {
  navigate: Navigate;
  onOpenRecord: (id: number) => void;
}) {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [imports, setImports] = useState<ImportPage | null>(null);
  const [downloads, setDownloads] = useState<DownloadPage | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [importsError, setImportsError] = useState<string | null>(null);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);
  const { jobs, finishedTick } = useActiveJobs();

  const loadStats = () => {
    setStatsError(null);
    api
      .stats()
      .then(setStats)
      .catch((err) => setStatsError(errorMessage(err)));
  };

  useEffect(() => {
    loadStats();
    api
      .imports({ page: 1, page_size: 6 })
      .then(setImports)
      .catch((err) => setImportsError(errorMessage(err)));
    api
      .downloads({ page: 1, page_size: 6 })
      .then(setDownloads)
      .catch((err) => setDownloadsError(errorMessage(err)));
  }, [finishedTick]);

  const coverage = stats
    ? {
        all: stats.downloaded_all,
        partial: stats.downloaded_partial,
        none: stats.downloaded_none,
        unknown: stats.downloaded_unknown,
      }
    : null;
  const coverageTotal = coverage ? coverage.all + coverage.partial + coverage.none + coverage.unknown : 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Your local record library, download coverage, and recent activity."
        actions={
          <>
            <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={() => navigate('/import')}>
              Import file
            </Button>
            <Button leftSection={<IconListSearch size={16} />} onClick={() => navigate('/records')}>
              Browse records
            </Button>
          </>
        }
      />

      {jobs.length > 0 ? (
        <a className="rt-health" data-tone="warn" href="#/downloads" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="rt-live-dot" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={650} size="sm">
              {jobs.length} background job{jobs.length === 1 ? '' : 's'} running
            </Text>
            <Text size="xs" c="dimmed">
              {jobs.filter((job) => job.kind === 'download').length} download ·{' '}
              {jobs.filter((job) => job.kind === 'import').length} import
            </Text>
          </div>
          <IconArrowRight size={16} />
        </a>
      ) : null}

      {statsError ? <ErrorBlock message={statsError} onRetry={loadStats} /> : null}

      <div className="rt-grid rt-grid-stats">
        <StatCard
          label="Record groups"
          icon={<IconStack2 size={16} />}
          loading={!stats && !statsError}
          value={formatNumber(stats?.total_record_groups)}
        />
        <StatCard
          label="Active links"
          icon={<IconLink size={16} />}
          loading={!stats && !statsError}
          value={formatNumber(stats?.active_link_count)}
          hint={stats ? `${formatNumber(stats.inactive_link_count)} inactive` : undefined}
        />
        <StatCard
          label="Actors"
          icon={<IconUsers size={16} />}
          loading={!stats && !statsError}
          value={formatNumber(stats?.actor_count)}
        />
        <StatCard
          label="Platforms"
          icon={<IconBuildingBroadcastTower size={16} />}
          loading={!stats && !statsError}
          value={formatNumber(stats?.source_count)}
        />
      </div>

      <Panel
        title="Download coverage"
        description="Record groups by how many of their active links have been downloaded."
        actions={
          coverage ? (
            <Text size="sm" c="dimmed">
              <Text span fw={700} c="var(--rt-ink)" fz={20}>
                {formatPercent(coverage.all, coverageTotal)}
              </Text>{' '}
              fully downloaded
            </Text>
          ) : null
        }
      >
        {coverage ? <CoverageMeter counts={coverage} /> : <Skeleton height={12} radius="sm" />}
      </Panel>

      <div className="rt-grid rt-grid-2">
        <Panel
          title="Recent downloads"
          flush
          actions={
            <Button variant="subtle" size="compact-sm" rightSection={<IconArrowRight size={14} />} onClick={() => navigate('/downloads')}>
              All downloads
            </Button>
          }
        >
          {downloadsError ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={downloadsError} />
            </div>
          ) : !downloads ? (
            <ActivitySkeleton />
          ) : downloads.items.length === 0 ? (
            <EmptyState compact message="No downloads yet. Open a record to plan one." icon={<IconDownload size={20} />} />
          ) : (
            <div className="rt-activity">
              {downloads.items.map((item) => (
                <button key={item.id} type="button" className="rt-activity-item" onClick={() => onOpenRecord(item.record_group_id)}>
                  <span className="rt-activity-icon">
                    <IconDownload size={16} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="rt-activity-title rt-truncate" title={item.record_title}>
                      {item.record_title || `Record #${item.record_group_id}`}
                    </span>
                    <span className="rt-activity-meta rt-truncate">
                      {[item.actor, formatBytes(item.selected_bytes), formatRelative(item.requested_at)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <StatusBadge value={item.status} />
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Recent imports"
          flush
          actions={
            <Button variant="subtle" size="compact-sm" rightSection={<IconArrowRight size={14} />} onClick={() => navigate('/import')}>
              Import history
            </Button>
          }
        >
          {importsError ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={importsError} />
            </div>
          ) : !imports ? (
            <ActivitySkeleton />
          ) : imports.items.length === 0 ? (
            <EmptyState compact message="No imports yet. Upload an Excel, JSON, or SQLite file." icon={<IconFileImport size={20} />} />
          ) : (
            <div className="rt-activity">
              {imports.items.map((item) => (
                <div key={item.id} className="rt-activity-item">
                  <span className="rt-activity-icon">
                    <IconFileImport size={16} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="rt-activity-title rt-truncate" title={item.source_file_name}>
                      {item.source_file_name}
                    </span>
                    <span className="rt-activity-meta rt-truncate">
                      {formatNumber(item.total_rows)} rows · {formatNumber(item.inserted_groups)} new ·{' '}
                      {formatNumber(item.updated_groups)} updated
                      {item.error_count ? ` · ${formatNumber(item.error_count)} errors` : ''} · {formatRelative(item.started_at)}
                    </span>
                  </span>
                  <StatusBadge value={item.status} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </Page>
  );
}
