import { ActionIcon, Alert, Button, Drawer, Group, Loader, Progress, Stack, Table, Text } from '@mantine/core';
import {
  IconAlertCircle,
  IconFileImport,
  IconFileSpreadsheet,
  IconRefresh,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { DragEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ImportDetail, ImportErrorPage, ImportJob, ImportPage as ImportPageType } from '../api/types';
import { useActiveJobs } from '../app/ActiveJobs';
import { KeyValue, StatCard, TableWrap } from '../components/data';
import { EmptyState, ErrorBlock, LoadingBlock } from '../components/feedback';
import { Page, PageHeader, Panel } from '../components/layout';
import { Pager } from '../components/Pager';
import { StatusBadge, humanize } from '../components/StatusBadge';
import { isTerminal, useJobStream } from '../hooks/useJobStream';
import { errorMessage, formatBytes, formatDateTime, formatNumber, formatRelative, formatText } from '../lib/format';
import { notifySuccess } from '../lib/notify';
import { useCachedState } from '../state/pageState';

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.json', '.db', '.sqlite', '.sqlite3'];
const HISTORY_PAGE_SIZE = 10;
const ERROR_PAGE_SIZE = 25;

function extensionOf(file: File) {
  return file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
}

function UploadPanel({ onStarted }: { onStarted: (job: ImportJob) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const supported = file ? ACCEPTED_EXTENSIONS.includes(extensionOf(file)) : false;

  const pick = (files: FileList | null) => {
    setError(null);
    setFile(files?.[0] ?? null);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files);
  };

  const start = async () => {
    if (!file || !supported) return;
    setUploading(true);
    setError(null);
    try {
      const created = await api.createImport(file);
      onStarted((await api.job(created.job_id)) as ImportJob);
      notifySuccess('Import queued', file.name);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(errorMessage(err, 'Import failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Panel title="Upload" description="Excel sheets, legacy JSON exports, or legacy SQLite databases.">
      <Stack gap="md">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          hidden
          onChange={(event) => pick(event.currentTarget.files)}
        />
        <button
          type="button"
          className="rt-dropzone"
          data-dragging={dragging || undefined}
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="rt-dropzone-icon">
            <IconUpload size={22} />
          </span>
          <Text fw={650} size="sm" c="var(--rt-ink)">
            Drop a file here or click to browse
          </Text>
          <Text size="xs" c="dimmed">
            {ACCEPTED_EXTENSIONS.join('  ')}
          </Text>
        </button>

        {file ? (
          <div className="rt-file-chip">
            <IconFileSpreadsheet size={20} style={{ color: 'var(--rt-accent)', flex: '0 0 auto' }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={600} className="rt-truncate" title={file.name}>
                {file.name}
              </Text>
              <Text size="xs" c={supported ? 'dimmed' : 'red'}>
                {supported ? formatBytes(file.size) : 'Unsupported file type'}
              </Text>
            </div>
            <ActionIcon variant="subtle" color="gray" aria-label="Remove file" onClick={() => setFile(null)} disabled={uploading}>
              <IconX size={16} />
            </ActionIcon>
          </div>
        ) : null}

        {error ? (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
            {error}
          </Alert>
        ) : null}

        <Button
          leftSection={<IconFileImport size={16} />}
          onClick={start}
          disabled={!file || !supported}
          loading={uploading}
        >
          Start import
        </Button>
      </Stack>
    </Panel>
  );
}

function JobPanel({ job, onDismiss }: { job: ImportJob | null; onDismiss: () => void }) {
  if (!job) {
    return (
      <Panel title="Current import">
        <EmptyState
          compact
          icon={<IconFileImport size={20} />}
          message="Imports run in the background. Progress appears here once a file is uploaded."
        />
      </Panel>
    );
  }
  const progress = job.progress;
  const percent =
    progress?.total_rows && progress.total_rows > 0
      ? Math.min(100, Math.round((progress.completed_rows / progress.total_rows) * 100))
      : job.status === 'completed'
        ? 100
        : 0;
  const result = job.result;
  const running = !isTerminal(job.status);
  const fileName = String(job.target?.source_path ?? progress?.source_path ?? result?.source_path ?? '').split(/[\\/]/).pop();

  return (
    <Panel
      title="Current import"
      description={fileName || `Job ${job.id.slice(0, 8)}`}
      actions={
        <Group gap={6}>
          <StatusBadge value={result?.status ?? job.status} />
          {!running ? (
            <ActionIcon variant="subtle" color="gray" aria-label="Dismiss" onClick={onDismiss}>
              <IconX size={16} />
            </ActionIcon>
          ) : null}
        </Group>
      }
    >
      <Stack gap="md">
        <Stack gap={6}>
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              {running ? humanize(progress?.phase ?? job.status) : job.status === 'failed' ? 'Failed' : 'Finished'}
            </Text>
            <Text size="xs" c="dimmed">
              {formatNumber(progress?.completed_rows ?? 0)} / {progress?.total_rows ? formatNumber(progress.total_rows) : '?'} rows
            </Text>
          </Group>
          <Progress value={percent} animated={running} striped={running} size="md" radius="xl" />
        </Stack>

        {job.error ? (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
            {job.error}
          </Alert>
        ) : null}

        {result ? (
          <>
            <div className="rt-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
              <StatCard compact label="New groups" value={formatNumber(result.stats.inserted_groups)} />
              <StatCard compact label="Updated" value={formatNumber(result.stats.updated_groups)} />
              <StatCard compact label="New links" value={formatNumber(result.stats.inserted_links)} />
              <StatCard compact label="Errors" value={formatNumber(result.stats.error_count)} />
            </div>
            <KeyValue
              columns={2}
              items={[
                { label: 'Import ID', value: `#${result.import_id}` },
                { label: 'Source type', value: result.source_type },
                { label: 'Total rows', value: formatNumber(result.stats.total_rows) },
                { label: 'Skipped groups', value: formatNumber(result.stats.skipped_groups) },
                { label: 'Link sets changed', value: formatNumber(result.stats.link_sets_changed) },
                { label: 'Skipped links', value: formatNumber(result.stats.skipped_links) },
                ...(result.error_csv_path ? [{ label: 'Error CSV', value: result.error_csv_path, mono: true, full: true }] : []),
                ...(result.extra_columns.length
                  ? [{ label: 'Extra columns', value: result.extra_columns.join(', '), full: true }]
                  : []),
                ...(result.notes ? [{ label: 'Notes', value: result.notes, full: true }] : []),
              ]}
            />
          </>
        ) : (
          <Stack gap={4}>
            {job.events.slice(-4).map((event) => (
              <Group key={event.index} gap={8} wrap="nowrap">
                <span className="rt-dot" style={{ background: 'var(--rt-border-strong)' }} />
                <Text size="xs" c="dimmed" className="rt-mono">
                  {formatDateTime(event.created_at).slice(11)}
                </Text>
                <Text size="xs">{humanize(event.type)}</Text>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}

function ImportDrawerBody({ item }: { item: ImportDetail }) {
  const [errors, setErrors] = useState<ImportErrorPage | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .importErrors(item.id, page, ERROR_PAGE_SIZE)
      .then((next) => !cancelled && setErrors(next))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [item.id, page]);

  return (
    <Stack gap="lg">
      <KeyValue
        items={[
          { label: 'File', value: item.source_file_name, full: true },
          { label: 'Source type', value: item.source_type },
          { label: 'File size', value: formatBytes(item.source_file_size) },
          { label: 'Started', value: formatDateTime(item.started_at) },
          { label: 'Finished', value: formatDateTime(item.finished_at) },
          { label: 'Total rows', value: formatNumber(item.total_rows) },
          { label: 'New groups', value: formatNumber(item.inserted_groups) },
          { label: 'Updated groups', value: formatNumber(item.updated_groups) },
          { label: 'Skipped groups', value: formatNumber(item.skipped_groups) },
          { label: 'Link sets changed', value: formatNumber(item.link_sets_changed) },
          { label: 'New links', value: formatNumber(item.inserted_links) },
          { label: 'Skipped links', value: formatNumber(item.skipped_links) },
          { label: 'Errors', value: formatNumber(item.error_count) },
          { label: 'Source path', value: item.source_path, mono: true, full: true },
          ...(item.notes ? [{ label: 'Notes', value: item.notes, full: true }] : []),
        ]}
      />
      <Stack gap={8}>
        <Text fw={650} size="sm">
          Row errors
        </Text>
        {error ? (
          <ErrorBlock message={error} />
        ) : !errors ? (
          <LoadingBlock />
        ) : errors.items.length === 0 ? (
          <Text size="sm" c="dimmed">
            No row errors were recorded for this import.
          </Text>
        ) : (
          <>
            <div className="rt-panel">
              <TableWrap>
                <Table fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Message</Table.Th>
                      <Table.Th>Raw value</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {errors.items.map((row) => (
                      <Table.Tr key={row.id}>
                        <Table.Td className="rt-id">{formatText(row.row_number)}</Table.Td>
                        <Table.Td className="rt-nowrap">{row.error_type}</Table.Td>
                        <Table.Td className="rt-wrap">{row.message}</Table.Td>
                        <Table.Td className="rt-wrap rt-mono">{formatText(row.raw_value)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </TableWrap>
            </div>
            <Pager
              compact
              page={page}
              pageSize={ERROR_PAGE_SIZE}
              total={errors.total}
              totalPages={errors.total_pages}
              noun="errors"
              onPageChange={setPage}
            />
          </>
        )}
      </Stack>
    </Stack>
  );
}

export default function ImportPage() {
  const [job, setJob] = useCachedState<ImportJob | null>('import.job', null);
  const [history, setHistory] = useCachedState<ImportPageType | null>('import.history', null);
  const [historyPage, setHistoryPage] = useCachedState('import.historyPage', 1);
  const [selectedId, setSelectedId] = useCachedState<number | null>('import.selectedId', null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { refresh: refreshJobs } = useActiveJobs();

  useJobStream(job, setJob);

  const loadHistory = async (page = historyPage) => {
    setLoading(true);
    setHistoryError(null);
    try {
      setHistory(await api.imports({ page, page_size: HISTORY_PAGE_SIZE }));
    } catch (err) {
      setHistoryError(errorMessage(err, 'Import history failed to load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory(historyPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPage]);

  useEffect(() => {
    if (job && isTerminal(job.status)) void loadHistory(historyPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  const selected = history?.items.find((item) => item.id === selectedId) ?? null;

  return (
    <Page>
      <PageHeader
        eyebrow="Transfers"
        title="Import"
        description="Load record sources into the local SQLite database. Existing groups are updated in place."
      />

      <div className="rt-grid rt-grid-2" style={{ alignItems: 'start' }}>
        <UploadPanel
          onStarted={(next) => {
            setJob(next);
            void refreshJobs();
            void loadHistory(1);
            setHistoryPage(1);
          }}
        />
        <JobPanel job={job} onDismiss={() => setJob(null)} />
      </div>

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
        description="Select an import to see its counters and row errors."
        actions={
          <Button variant="default" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => void loadHistory()}>
            Refresh
          </Button>
        }
        flush
        footer={
          history && history.total > 0 ? (
            <div style={{ width: '100%' }}>
              <Pager
                page={historyPage}
                pageSize={HISTORY_PAGE_SIZE}
                total={history.total}
                totalPages={history.total_pages}
                noun="imports"
                onPageChange={setHistoryPage}
              />
            </div>
          ) : null
        }
      >
        {historyError ? (
          <div style={{ padding: 16 }}>
            <ErrorBlock message={historyError} onRetry={() => void loadHistory()} />
          </div>
        ) : !history ? (
          <LoadingBlock />
        ) : history.items.length === 0 ? (
          <EmptyState compact message="No imports recorded yet." />
        ) : (
          <TableWrap>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>File</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Rows</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>New</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Updated</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Errors</Table.Th>
                  <Table.Th>Started</Table.Th>
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
                      <span className="rt-record-title rt-truncate" title={item.source_path}>
                        {item.source_file_name}
                      </span>
                      <span className="rt-record-sub">
                        {item.source_type} · {formatBytes(item.source_file_size)}
                      </span>
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge value={item.status} />
                    </Table.Td>
                    <Table.Td className="rt-num">{formatNumber(item.total_rows)}</Table.Td>
                    <Table.Td className="rt-num">{formatNumber(item.inserted_groups)}</Table.Td>
                    <Table.Td className="rt-num">{formatNumber(item.updated_groups)}</Table.Td>
                    <Table.Td className="rt-num" style={item.error_count ? { color: 'var(--rt-status-bad)', fontWeight: 650 } : undefined}>
                      {formatNumber(item.error_count)}
                    </Table.Td>
                    <Table.Td className="rt-nowrap" title={formatDateTime(item.started_at)}>
                      {formatRelative(item.started_at)}
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
        size="lg"
        title={
          selected ? (
            <Group gap="sm">
              <Text fw={650}>Import #{selected.id}</Text>
              <StatusBadge value={selected.status} />
            </Group>
          ) : null
        }
      >
        {selected ? <ImportDrawerBody key={selected.id} item={selected} /> : null}
      </Drawer>
    </Page>
  );
}
