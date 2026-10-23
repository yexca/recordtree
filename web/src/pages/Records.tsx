import { Button, Group, Input, Loader, SegmentedControl, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconFilterOff, IconSearch } from '@tabler/icons-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { DownloadedStatus, RecordPage } from '../api/types';
import { EmptyState } from '../components/feedback';
import { Page, PageHeader, Panel } from '../components/layout';
import { Pager } from '../components/Pager';
import { RecordTable } from '../components/RecordTable';
import { formatNumber } from '../lib/format';
import { notifyError } from '../lib/notify';
import { useCachedState } from '../state/pageState';

type DownloadFilter = DownloadedStatus | 'pending' | '';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Any status' },
  { value: 'pending', label: 'Pending links' },
  { value: 'all', label: 'Complete' },
  { value: 'partial', label: 'Partial' },
  { value: 'none', label: 'Not downloaded' },
  { value: 'unknown', label: 'No links' },
];

const emptyPage: RecordPage = { items: [], page: 1, page_size: 50, total: 0, total_pages: 0 };

interface Filters {
  recordId: string;
  title: string;
  actor: string;
  source: string;
  dateFrom: string | null;
  dateTo: string | null;
  status: DownloadFilter;
}

const emptyFilters: Filters = {
  recordId: '',
  title: '',
  actor: '',
  source: '',
  dateFrom: null,
  dateTo: null,
  status: '',
};

export default function Records({ onOpenRecord }: { onOpenRecord: (id: number) => void }) {
  const [filters, setFilters] = useCachedState<Filters>('records.filters', emptyFilters);
  const [pageSize, setPageSize] = useCachedState('records.pageSize', 50);
  const [page, setPage] = useCachedState('records.page', 1);
  const [result, setResult] = useCachedState<RecordPage>('records.result', emptyPage);
  const [searched, setSearched] = useCachedState('records.searched', false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const loadRecords = async (nextPage: number, current: Filters = filters, size: number = pageSize) => {
    const trimmedId = current.recordId.trim();
    const parsedId = Number(trimmedId);
    if (trimmedId && !Number.isInteger(parsedId)) {
      notifyError('Invalid record ID', new Error('Record ID must be a whole number.'));
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const payload = await api.records({
        record_id: trimmedId ? parsedId : undefined,
        title: current.title.trim(),
        actor: current.actor.trim(),
        source: current.source.trim(),
        date_from: current.dateFrom ?? '',
        date_to: current.dateTo ?? '',
        downloaded: current.status === 'pending' ? '' : current.status,
        only_undownloaded: current.status === 'pending',
        page: nextPage,
        page_size: size,
      });
      if (id !== requestId.current) return;
      setResult(payload);
      setPage(payload.page);
      setSearched(true);
    } catch (err) {
      if (id === requestId.current) notifyError('Records query failed', err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    void loadRecords(1);
  };

  const reset = () => {
    setFilters(emptyFilters);
    void loadRecords(1, emptyFilters);
  };

  useEffect(() => {
    if (!searched) void loadRecords(1);
    // Initial load only; later searches are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = [
    filters.recordId,
    filters.title,
    filters.actor,
    filters.source,
    filters.dateFrom,
    filters.dateTo,
    filters.status,
  ].filter((value) => value && String(value).trim()).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title="Records"
        description="Search record groups by title, actor, platform, delivery date, or download status."
      />

      <form onSubmit={submit}>
        <section className="rt-panel">
          <div className="rt-filterbar">
            <TextInput
              size="md"
              aria-label="Title"
              placeholder="Search titles…"
              leftSection={<IconSearch size={18} />}
              value={filters.title}
              onChange={(event) => update('title', event.currentTarget.value)}
            />
            <Group gap="xs" wrap="nowrap">
              <Button size="md" type="submit" loading={loading}>
                Search
              </Button>
              <Button
                size="md"
                variant="default"
                type="button"
                leftSection={<IconFilterOff size={16} />}
                onClick={reset}
                disabled={activeFilterCount === 0}
              >
                Clear
              </Button>
            </Group>
          </div>
          <div className="rt-filter-grid">
            <TextInput
              label="Record ID"
              placeholder="e.g. 123"
              inputMode="numeric"
              value={filters.recordId}
              onChange={(event) => update('recordId', event.currentTarget.value)}
            />
            <TextInput
              label="Actor"
              placeholder="Any actor"
              value={filters.actor}
              onChange={(event) => update('actor', event.currentTarget.value)}
            />
            <TextInput
              label="Platform"
              placeholder="Any platform"
              value={filters.source}
              onChange={(event) => update('source', event.currentTarget.value)}
            />
            <Input.Wrapper label="Delivery date">
              <div className="rt-date-range">
                <DateInput
                  aria-label="From delivery date"
                  placeholder="From"
                  value={filters.dateFrom}
                  onChange={(value) => update('dateFrom', value)}
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
                <Text span size="sm" c="dimmed">
                  –
                </Text>
                <DateInput
                  aria-label="To delivery date"
                  placeholder="To"
                  value={filters.dateTo}
                  onChange={(value) => update('dateTo', value)}
                  valueFormat="YYYY-MM-DD"
                  clearable
                />
              </div>
            </Input.Wrapper>
          </div>
          <div className="rt-filter-status">
            <div className="rt-scroll-x">
              <SegmentedControl
                size="xs"
                value={filters.status || 'any'}
                data={STATUS_OPTIONS}
                onChange={(value) => {
                  const next = { ...filters, status: (value === 'any' ? '' : value) as DownloadFilter };
                  setFilters(next);
                  void loadRecords(1, next);
                }}
              />
            </div>
            <Text size="xs" c="dimmed">
              {activeFilterCount ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active` : 'No filters'}
            </Text>
          </div>
        </section>
      </form>

      <Panel
        title={
          <Group gap={8}>
            <span>{searched ? `${formatNumber(result.total)} records` : 'Records'}</span>
            {loading ? <Loader size={14} /> : null}
          </Group>
        }
        description="Newest delivery first. Select a row to open its links and download planner."
        flush
        footer={
          result.total > 0 ? (
            <div style={{ width: '100%' }}>
              <Pager
                page={page}
                pageSize={pageSize}
                total={result.total}
                totalPages={result.total_pages}
                disabled={loading}
                noun="records"
                pageSizes={[25, 50, 100, 200]}
                onPageChange={(next) => void loadRecords(next)}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  void loadRecords(1, filters, size);
                }}
              />
            </div>
          ) : null
        }
      >
        {result.items.length === 0 ? (
          <EmptyState
            title={searched ? 'No matching records' : 'Loading records'}
            message={searched ? 'Try a broader title, clear a filter, or choose a different status.' : 'Fetching the first page…'}
            icon={<IconSearch size={20} />}
          />
        ) : (
          <RecordTable records={result.items} onOpen={onOpenRecord} />
        )}
      </Panel>
    </Page>
  );
}
