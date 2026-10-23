import { ActionIcon, Group, Loader, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DownloadedStatus, RecordSummary } from '../api/types';
import { errorMessage, formatNumber, formatPercent, initials, avatarColors } from '../lib/format';
import { notifyError } from '../lib/notify';
import RecordDetail from '../pages/RecordDetail';
import { useCachedState } from '../state/pageState';
import { CoverageMeter } from './data';
import { EmptyState, ErrorBlock, LoadingBlock } from './feedback';
import { Page, PageHeader, Panel } from './layout';
import { Pager } from './Pager';
import { RecordTable } from './RecordTable';

export interface Entity {
  id: number;
  name: string;
  record_count: number;
  undownloaded_count: number;
}

interface EntityPage<T extends Entity> {
  items: T[];
  page: number;
  total: number;
  total_pages: number;
}

export interface EntityBrowserConfig<T extends Entity> {
  /** Page-state cache prefix; keeps selection and filters when navigating away and back. */
  cacheKey: string;
  title: string;
  description: string;
  noun: string;
  nounPlural: string;
  emptyIcon: ReactNode;
  fetchPage: (query: string, page: number, pageSize: number) => Promise<EntityPage<T>>;
  fetchOne: (id: number) => Promise<T>;
  fetchCounts: (ids: number[]) => Promise<Record<string, number>>;
  fetchRecords: (id: number, limit: number) => Promise<RecordSummary[]>;
  /** Record-table column made redundant by the selected entity. */
  hideColumn: 'actor' | 'source';
  renderActions?: (entity: T) => ReactNode;
}

type SearchMode = 'name' | 'id';
type RecordFilter = 'all' | 'pending' | 'complete';

const RECORD_FETCH_LIMIT = 500;

function Avatar({ entity, size }: { entity: Entity; size?: 'lg' }) {
  return (
    <span className="rt-avatar" data-size={size} style={avatarColors(entity.name || entity.id)}>
      {initials(entity.name)}
    </span>
  );
}

function PendingPill({ value }: { value: number }) {
  return (
    <span className="rt-pending-pill" data-zero={value === 0 || undefined} title={`${value} with undownloaded links`}>
      {value === 0 ? 'Done' : formatNumber(value)}
    </span>
  );
}

export function EntityBrowser<T extends Entity>({ config }: { config: EntityBrowserConfig<T> }) {
  const key = (name: string) => `${config.cacheKey}.${name}`;
  const [query, setQuery] = useCachedState(key('query'), '');
  const [mode, setMode] = useCachedState<SearchMode>(key('mode'), 'name');
  const [page, setPage] = useCachedState(key('page'), 1);
  const [perPage, setPerPage] = useCachedState(key('perPage'), 25);
  const [entities, setEntities] = useCachedState<T[]>(key('entities'), []);
  const [total, setTotal] = useCachedState(key('total'), 0);
  const [totalPages, setTotalPages] = useCachedState(key('totalPages'), 0);
  const [loadedSearch, setLoadedSearch] = useCachedState<string | null>(key('loadedSearch'), null);
  const [selected, setSelected] = useCachedState<T | null>(key('selected'), null);
  const [records, setRecords] = useCachedState<RecordSummary[]>(key('records'), []);
  const [recordFilter, setRecordFilter] = useCachedState<RecordFilter>(key('recordFilter'), 'all');
  const [recordQuery, setRecordQuery] = useCachedState(key('recordQuery'), '');
  const [recordPage, setRecordPage] = useCachedState(key('recordPage'), 1);
  const [recordsPerPage, setRecordsPerPage] = useCachedState(key('recordsPerPage'), 25);
  const [openRecordId, setOpenRecordId] = useCachedState<number | null>(key('openRecordId'), null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [debouncedQuery] = useDebouncedValue(query, 350);
  const listRequest = useRef(0);

  const searchKey = (nextMode: SearchMode, text: string) => `${nextMode}:${text.trim()}`;

  const loadList = async (nextPage: number, size = perPage, text = query, nextMode = mode) => {
    const id = ++listRequest.current;
    setLoadingList(true);
    setListError(null);
    try {
      const trimmed = text.trim();
      if (nextMode === 'id' && trimmed) {
        const numeric = Number(trimmed.replace(/^#/, ''));
        const items = Number.isInteger(numeric) && numeric > 0 ? [await config.fetchOne(numeric)] : [];
        if (id !== listRequest.current) return;
        setEntities(items);
        setTotal(items.length);
        setTotalPages(1);
        setPage(1);
      } else {
        const result = await config.fetchPage(nextMode === 'name' ? trimmed : '', nextPage, size);
        if (id !== listRequest.current) return;
        setEntities(result.items);
        setTotal(result.total);
        setTotalPages(result.total_pages);
        setPage(result.page);
      }
      setLoadedSearch(searchKey(nextMode, text));
    } catch (err) {
      if (id !== listRequest.current) return;
      const notFound = nextMode === 'id';
      setEntities([]);
      setTotal(0);
      setTotalPages(0);
      setLoadedSearch(searchKey(nextMode, text));
      if (!notFound) setListError(errorMessage(err, `${config.title} failed to load`));
    } finally {
      if (id === listRequest.current) setLoadingList(false);
    }
  };

  // Initial load and debounced search-as-you-type.
  useEffect(() => {
    if (loadedSearch !== searchKey(mode, debouncedQuery)) void loadList(1, perPage, debouncedQuery, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, mode]);

  // Undownloaded counts are computed separately so the directory renders fast.
  const idsKey = entities.map((entity) => entity.id).join(',');
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    config
      .fetchCounts(idsKey.split(',').map(Number))
      .then((counts) => {
        if (cancelled) return;
        const apply = (entity: T): T => ({
          ...entity,
          undownloaded_count: counts[String(entity.id)] ?? entity.undownloaded_count,
        });
        setEntities((current) => current.map(apply));
        setSelected((current) => (current && counts[String(current.id)] !== undefined ? apply(current) : current));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const selectEntity = async (entity: T) => {
    setSelected(entity);
    setOpenRecordId(null);
    setRecordPage(1);
    setRecordQuery('');
    setRecordFilter('all');
    setRecords([]);
    setLoadingRecords(true);
    setRecordError(null);
    try {
      setRecords(await config.fetchRecords(entity.id, RECORD_FETCH_LIMIT));
    } catch (err) {
      setRecordError(errorMessage(err, 'Records failed to load'));
      notifyError('Records unavailable', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  const reloadSelected = async () => {
    if (!selected) return;
    setLoadingRecords(true);
    try {
      const [fresh, nextRecords] = await Promise.all([
        config.fetchOne(selected.id),
        config.fetchRecords(selected.id, RECORD_FETCH_LIMIT),
      ]);
      setSelected(fresh);
      setRecords(nextRecords);
    } catch (err) {
      notifyError('Refresh failed', err);
    } finally {
      setLoadingRecords(false);
    }
  };

  const coverage = useMemo(() => {
    const counts: Record<DownloadedStatus, number> = { all: 0, partial: 0, none: 0, unknown: 0 };
    for (const record of records) counts[record.downloaded] = (counts[record.downloaded] ?? 0) + 1;
    return counts;
  }, [records]);

  const filteredRecords = useMemo(() => {
    const text = recordQuery.trim().toLowerCase();
    return records.filter((record) => {
      if (recordFilter === 'pending' && record.completed_links >= record.active_links) return false;
      if (recordFilter === 'complete' && record.downloaded !== 'all') return false;
      if (text && !record.title.toLowerCase().includes(text) && !String(record.id).includes(text)) return false;
      return true;
    });
  }, [records, recordFilter, recordQuery]);

  const recordPages = Math.max(1, Math.ceil(filteredRecords.length / recordsPerPage));
  const safeRecordPage = Math.min(recordPage, recordPages);
  const visibleRecords = filteredRecords.slice((safeRecordPage - 1) * recordsPerPage, safeRecordPage * recordsPerPage);

  const directory = (
    <section className="rt-panel rt-directory">
      <form
        className="rt-directory-search"
        onSubmit={(event) => {
          event.preventDefault();
          void loadList(1);
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <SegmentedControl
            size="xs"
            value={mode}
            data={[
              { value: 'name', label: 'Name' },
              { value: 'id', label: 'ID' },
            ]}
            onChange={(value) => setMode(value as SearchMode)}
          />
          <Tooltip label={`Reload ${config.nounPlural}`}>
            <ActionIcon variant="subtle" color="gray" loading={loadingList} onClick={() => void loadList(page)} aria-label="Reload">
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <TextInput
          aria-label={`Search ${config.nounPlural}`}
          placeholder={mode === 'id' ? `${config.noun} ID` : `Search ${config.nounPlural}…`}
          leftSection={<IconSearch size={16} />}
          rightSection={loadingList ? <Loader size={14} /> : null}
          inputMode={mode === 'id' ? 'numeric' : undefined}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </form>

      <div className="rt-directory-list">
        {listError ? (
          <ErrorBlock message={listError} onRetry={() => void loadList(page)} />
        ) : entities.length === 0 ? (
          loadingList || loadedSearch === null ? (
            <LoadingBlock />
          ) : (
            <EmptyState compact message={`No ${config.nounPlural} match this search.`} />
          )
        ) : (
          entities.map((entity) => (
            <button
              key={entity.id}
              type="button"
              className="rt-entity"
              data-selected={selected?.id === entity.id || undefined}
              aria-pressed={selected?.id === entity.id}
              onClick={() => void selectEntity(entity)}
            >
              <Avatar entity={entity} />
              <span style={{ minWidth: 0 }}>
                <span className="rt-entity-name rt-truncate" title={entity.name}>
                  {entity.name || '(unnamed)'}
                </span>
                <span className="rt-entity-meta">
                  #{entity.id} · {formatNumber(entity.record_count)} records
                </span>
              </span>
              <PendingPill value={entity.undownloaded_count} />
            </button>
          ))
        )}
      </div>

      {entities.length > 0 && mode === 'name' ? (
        <div className="rt-directory-footer">
          <Pager
            compact
            page={page}
            pageSize={perPage}
            total={total}
            totalPages={totalPages}
            noun=""
            disabled={loadingList}
            onPageChange={(next) => void loadList(next)}
            onPageSizeChange={(size) => {
              setPerPage(size);
              void loadList(1, size);
            }}
          />
        </div>
      ) : null}
    </section>
  );

  let workspace: ReactNode;
  if (!selected) {
    workspace = (
      <section className="rt-panel rt-workspace-empty">
        <div className="rt-dropzone-icon">{config.emptyIcon}</div>
        <Text fw={650}>Select {config.noun === 'Actor' ? 'an' : 'a'} {config.noun.toLowerCase()}</Text>
        <Text size="sm" c="dimmed" maw={360}>
          Choose one from the directory to review its records and download coverage.
        </Text>
      </section>
    );
  } else if (openRecordId) {
    workspace = (
      <RecordDetail
        key={openRecordId}
        idOrKey={String(openRecordId)}
        backLabel={`Back to ${selected.name}`}
        onBack={() => {
          setOpenRecordId(null);
          void reloadSelected();
        }}
      />
    );
  } else {
    workspace = (
      <div className="rt-grid">
        <section className="rt-panel">
          <div className="rt-entity-hero">
            <Avatar entity={selected} size="lg" />
            <div className="rt-entity-hero-main">
              <Text className="rt-page-title" fz={20}>
                {selected.name || '(unnamed)'}
              </Text>
              <Text size="xs" c="dimmed" className="rt-mono">
                {config.noun} #{selected.id}
              </Text>
            </div>
            <div className="rt-entity-hero-stats">
              <div>
                <div className="rt-mini-stat-label">Records</div>
                <div className="rt-mini-stat-value">{formatNumber(selected.record_count)}</div>
              </div>
              <div>
                <div className="rt-mini-stat-label">Undownloaded</div>
                <div className="rt-mini-stat-value">{formatNumber(selected.undownloaded_count)}</div>
              </div>
              <div>
                <div className="rt-mini-stat-label">Complete</div>
                <div className="rt-mini-stat-value">{formatPercent(coverage.all, records.length)}</div>
              </div>
            </div>
            {config.renderActions ? <Group gap="xs">{config.renderActions(selected)}</Group> : null}
          </div>
          {records.length > 0 ? (
            <div style={{ padding: '0 18px 16px' }}>
              <CoverageMeter counts={coverage} size="sm" />
            </div>
          ) : null}
        </section>

        <Panel
          title="Records"
          description={
            selected.record_count > records.length && records.length > 0
              ? `Showing the latest ${formatNumber(records.length)} of ${formatNumber(selected.record_count)} records`
              : 'Newest delivery first'
          }
          actions={
            <Group gap="xs" wrap="nowrap">
              <TextInput
                size="xs"
                aria-label="Filter records"
                placeholder="Filter titles…"
                leftSection={<IconSearch size={14} />}
                value={recordQuery}
                onChange={(event) => {
                  setRecordQuery(event.currentTarget.value);
                  setRecordPage(1);
                }}
                w={180}
              />
              <SegmentedControl
                size="xs"
                value={recordFilter}
                data={[
                  { value: 'all', label: 'All' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'complete', label: 'Complete' },
                ]}
                onChange={(value) => {
                  setRecordFilter(value as RecordFilter);
                  setRecordPage(1);
                }}
              />
            </Group>
          }
          flush
          footer={
            filteredRecords.length > 0 ? (
              <div style={{ width: '100%' }}>
                <Pager
                  page={safeRecordPage}
                  pageSize={recordsPerPage}
                  total={filteredRecords.length}
                  noun="records"
                  onPageChange={setRecordPage}
                  onPageSizeChange={(size) => {
                    setRecordsPerPage(size);
                    setRecordPage(1);
                  }}
                />
              </div>
            ) : null
          }
        >
          {recordError ? (
            <div style={{ padding: 16 }}>
              <ErrorBlock message={recordError} onRetry={() => void selectEntity(selected)} />
            </div>
          ) : loadingRecords && records.length === 0 ? (
            <LoadingBlock />
          ) : filteredRecords.length === 0 ? (
            <EmptyState
              compact
              message={records.length === 0 ? `No records for this ${config.noun.toLowerCase()}.` : 'No records match this filter.'}
            />
          ) : (
            <RecordTable records={visibleRecords} onOpen={setOpenRecordId} hide={[config.hideColumn]} />
          )}
        </Panel>
      </div>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title={config.title}
        description={
          <>
            {config.description}{' '}
            {total > 0 && mode === 'name' ? (
              <Text span c="dimmed">
                · {formatNumber(total)} {config.nounPlural}
              </Text>
            ) : null}
          </>
        }
      />
      <div className="rt-browser">
        {directory}
        <Stack gap={16} style={{ minWidth: 0 }}>
          {workspace}
        </Stack>
      </div>
    </Page>
  );
}
