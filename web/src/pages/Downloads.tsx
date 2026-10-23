import { Badge, Button, Drawer, Group, Loader, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { IconDownload, IconExternalLink, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { DownloadDetail, DownloadItemDetail, DownloadPage, Job } from '../api/types';
import { useActiveJobs } from '../app/ActiveJobs';
import { KeyValue, LinkProgress, TableWrap } from '../components/data';
import { EmptyState, ErrorBlock, LoadingBlock } from '../components/feedback';
import { Page, PageHeader, Panel } from '../components/layout';
import { LogViewer } from '../components/LogViewer';
import { Pager } from '../components/Pager';
import { StatusBadge } from '../components/StatusBadge';
import { jobOutput } from '../hooks/useJobStream';
import { errorMessage, formatBytes, formatDateTime, formatNumber, formatRelative, formatText, previewUrl } from '../lib/format';
import { notifyError, notifySuccess } from '../lib/notify';
import { useCachedState } from '../state/pageState';

const RESUMABLE_STATUSES = new Set(['interrupted', 'failed', 'cancelled', 'blocked']);
const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: 'any', label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'interrupted', label: 'Interrupted' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'cancelled', label: 'Cancelled' },
];

function jobTitle(job: Job) {
  if (job.target?.record_id_or_key) return `Record ${String(job.target.record_id_or_key)}`;
  if (job.target?.actor_id) return `Actor #${String(job.target.actor_id)} batch`;
  return 'Download job';
}

function ActiveJobCard({ job, onOpenRecord }: { job: Job; onOpenRecord: (id: string) => void }) {
  const recordKey = job.target?.record_id_or_key ? String(job.target.record_id_or_key) : null;
  const optionChips = [
    job.options.types ? `types: ${String(job.options.types)}` : 'all types',
    job.options.include_par2 ? '+ .par2' : null,
    job.options.count ? `${String(job.options.count)} records` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="rt-job">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
          <span className="rt-live-dot" />
          <div style={{ minWidth: 0 }}>
            <Text fw={650} size="sm" className="rt-truncate">
              {jobTitle(job)}
            </Text>
            <Text size="xs" c="dimmed">
              Started {formatRelative(job.started_at ?? job.created_at)} · <span className="rt-mono">{job.id.slice(0, 8)}</span>
            </Text>
          </div>
        </Group>
        <Group gap={6} wrap="nowrap">
          <StatusBadge value={job.status} />
          {recordKey ? (
            <Button size="compact-xs" variant="subtle" onClick={() => onOpenRecord(recordKey)}>
              Open
            </Button>
          ) : null}
        </Group>
      </Group>
      <Group gap={6}>
        {optionChips.map((chip) => (
          <Badge key={chip} color="gray" variant="light" size="sm" styles={{ label: { textTransform: 'none' } }}>
            {chip}
          </Badge>
        ))}
        {job.options.output ? (
          <Text size="xs" c="dimmed" className="rt-mono rt-truncate" title={String(job.options.output)}>
            → {String(job.options.output)}
          </Text>
        ) : null}
      </Group>
      <LogViewer text={jobOutput(job)} placeholder="Waiting for MEGAcmd output…" maxHeight={220} />
    </div>
  );
}

function DownloadDrawerBody({
  download,
  onOpenRecord,
  onResumed,
}: {
  download: DownloadDetail;
  onOpenRecord: (id: number) => void;
  onResumed: () => void;
}) {
  const [items, setItems] = useState<DownloadItemDetail[] | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setLog(null);
    setError(null);
    api
      .downloadItems(download.id)
      .then((next) => !cancelled && setItems(next))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    if (download.log_path) {
      api
        .downloadLog(download.id)
        .then((next) => !cancelled && setLog(next.text))
        .catch((err) => !cancelled && setLog(`Log unavailable: ${errorMessage(err)}`));
    }
    return () => {
      cancelled = true;
    };
  }, [download.id, download.log_path]);

  const resume = async () => {
    setResuming(true);
    try {
      const created = await api.resumeDownload(download.id);
      notifySuccess('Resume queued', `Job ${created.job_id.slice(0, 8)}`);
      onResumed();
    } catch (err) {
      notifyError('Resume unavailable', err);
    } finally {
      setResuming(false);
    }
  };

  const resumable = RESUMABLE_STATUSES.has(download.status) && Boolean(download.request_json);

  return (
    <Stack gap="lg">
      <Group gap="xs">
        <Button
          variant="default"
          leftSection={<IconExternalLink size={16} />}
          onClick={() => onOpenRecord(download.record_group_id)}
        >
          Open record
        </Button>
        <Button leftSection={<IconPlayerPlay size={16} />} disabled={!resumable} loading={resuming} onClick={resume}>
          Resume
        </Button>
      </Group>

      {download.message ? (
        <Text size="sm" c={download.status === 'failed' ? 'red' : undefined}>
          {download.message}
        </Text>
      ) : null}

      <KeyValue
        items={[
          { label: 'Record', value: `#${download.record_group_id} ${download.record_title}`, full: true },
          { label: 'Actor', value: formatText(download.actor) },
          { label: 'Platform', value: formatText(download.source) },
          { label: 'Requested', value: formatDateTime(download.requested_at) },
          { label: 'Files', value: <LinkProgress completed={download.completed_count} total={download.item_count} /> },
          { label: 'Selected size', value: formatBytes(download.selected_bytes) },
          { label: 'Free before', value: formatBytes(download.free_bytes_before) },
          { label: 'Failures', value: download.failed_count },
          { label: 'Exit code', value: formatText(download.mega_exit_code) },
          { label: 'Output', value: formatText(download.output_dir), mono: true, full: true },
        ]}
      />

      <Stack gap={8}>
        <Text fw={650} size="sm">
          Files
        </Text>
        {error ? (
          <ErrorBlock message={error} />
        ) : !items ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <Text size="sm" c="dimmed">
            No file items were recorded for this download.
          </Text>
        ) : (
          <div className="rt-panel">
            <TableWrap>
              <Table fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Size</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Exit</Table.Th>
                    <Table.Th>URL / message</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {items.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td className="rt-id">{item.link_order}</Table.Td>
                      <Table.Td>{formatText(item.file_type)}</Table.Td>
                      <Table.Td className="rt-num">{item.formatted_size || formatBytes(item.size_bytes)}</Table.Td>
                      <Table.Td>
                        <StatusBadge value={item.status} />
                      </Table.Td>
                      <Table.Td className="rt-mono">{formatText(item.mega_exit_code)}</Table.Td>
                      <Table.Td>
                        <div className="rt-mono rt-nowrap" title={item.mega_url}>
                          {previewUrl(item.mega_url, 20)}
                        </div>
                        {item.message ? (
                          <Text size="xs" c="dimmed" className="rt-wrap">
                            {item.message}
                          </Text>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </TableWrap>
          </div>
        )}
      </Stack>

      {download.log_path ? (
        <Stack gap={8}>
          <Text fw={650} size="sm">
            MEGAcmd output
          </Text>
          <LogViewer text={log} placeholder="Loading log…" maxHeight={360} />
        </Stack>
      ) : null}

      {download.request_json ? (
        <Stack gap={8}>
          <Text fw={650} size="sm">
            Request
          </Text>
          <LogViewer text={download.request_json} maxHeight={160} minHeight={40} />
        </Stack>
      ) : null}
    </Stack>
  );
}

export default function Downloads({ onOpenRecord }: { onOpenRecord: (id: number | string) => void }) {
  const { downloads: activeJobs, finishedTick, refresh: refreshJobs } = useActiveJobs();
  const [history, setHistory] = useCachedState<DownloadPage | null>('downloads.history', null);
  const [page, setPage] = useCachedState('downloads.page', 1);
  const [statusFilter, setStatusFilter] = useCachedState('downloads.status', 'any');
  const [selectedId, setSelectedId] = useCachedState<number | null>('downloads.selectedId', null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async (nextPage = page, status = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      setHistory(
        await api.downloads({ page: nextPage, page_size: PAGE_SIZE, status: status === 'any' ? undefined : status }),
      );
    } catch (err) {
      setError(errorMessage(err, 'Download history failed to load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory(page);
    // Reload on page change and whenever a background job finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, finishedTick]);

  const selected = history?.items.find((item) => item.id === selectedId) ?? null;

  return (
    <Page>
      <PageHeader
        eyebrow="Transfers"
        title="Downloads"
        description="Live MEGAcmd jobs and the recorded download history."
        actions={
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            loading={loading}
            onClick={() => {
              void refreshJobs();
              void loadHistory();
            }}
          >
            Refresh
          </Button>
        }
      />

      <Panel
        title={
          <Group gap={8}>
            <span>Active jobs</span>
            <Badge color={activeJobs.length ? 'brand' : 'gray'} size="sm">
              {activeJobs.length}
            </Badge>
          </Group>
        }
        description="Output streams in while jobs run; finished jobs move to the history below."
      >
        {activeJobs.length === 0 ? (
          <EmptyState
            compact
            icon={<IconDownload size={20} />}
            message="Nothing is downloading. Open a record to plan a download, or queue a batch from an actor."
          />
        ) : (
          <div className="rt-grid rt-grid-2">
            {activeJobs.map((job) => (
              <ActiveJobCard key={job.id} job={job} onOpenRecord={onOpenRecord} />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title={
          <Group gap={8}>
            <span>History</span>
            {history ? (
              <Text span size="sm" c="dimmed" fw={500}>
                {formatNumber(history.total)}
              </Text>
            ) : null}
            {loading ? <Loader size={14} /> : null}
          </Group>
        }
        actions={
          <div className="rt-scroll-x">
            <SegmentedControl
              size="xs"
              value={statusFilter}
              data={STATUS_FILTERS}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
                void loadHistory(1, value);
              }}
            />
          </div>
        }
        flush
        footer={
          history && history.total > 0 ? (
            <div style={{ width: '100%' }}>
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={history.total}
                totalPages={history.total_pages}
                noun="downloads"
                onPageChange={setPage}
              />
            </div>
          ) : null
        }
      >
        {error ? (
          <div style={{ padding: 16 }}>
            <ErrorBlock message={error} onRetry={() => void loadHistory()} />
          </div>
        ) : !history ? (
          <LoadingBlock />
        ) : history.items.length === 0 ? (
          <EmptyState compact message={statusFilter === 'any' ? 'No downloads recorded yet.' : 'No downloads with this status.'} />
        ) : (
          <TableWrap>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Record</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Files</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Size</Table.Th>
                  <Table.Th>Requested</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.items.map((item) => (
                  <Table.Tr
                    key={item.id}
                    data-clickable="true"
                    data-selected={selectedId === item.id || undefined}
                    tabIndex={0}
                    onClick={() => setSelectedId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setSelectedId(item.id);
                    }}
                  >
                    <Table.Td className="rt-id">{item.id}</Table.Td>
                    <Table.Td className="rt-cell-title">
                      <span className="rt-record-title rt-truncate" title={item.record_title}>
                        {item.record_title || `Record #${item.record_group_id}`}
                      </span>
                      <span className="rt-record-sub rt-truncate">
                        #{item.record_group_id}
                        {item.actor ? ` · ${item.actor}` : ''}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge value={item.status} />
                    </Table.Td>
                    <Table.Td>
                      <LinkProgress completed={item.completed_count} total={item.item_count} />
                    </Table.Td>
                    <Table.Td className="rt-num">{formatBytes(item.selected_bytes)}</Table.Td>
                    <Table.Td className="rt-nowrap" title={formatDateTime(item.requested_at)}>
                      {formatRelative(item.requested_at)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <Drawer
        opened={selected !== null}
        onClose={() => setSelectedId(null)}
        size="xl"
        title={
          selected ? (
            <Group gap="sm">
              <Text fw={650}>Download #{selected.id}</Text>
              <StatusBadge value={selected.status} />
            </Group>
          ) : null
        }
      >
        {selected ? (
          <DownloadDrawerBody
            download={selected}
            onOpenRecord={(id) => {
              setSelectedId(null);
              onOpenRecord(id);
            }}
            onResumed={() => {
              void refreshJobs();
              void loadHistory();
            }}
          />
        ) : null}
      </Drawer>
    </Page>
  );
}
