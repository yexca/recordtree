import { ActionIcon, Autocomplete, Badge, Button, Group, Popover, Stack, TextInput, Tooltip } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { IconAdjustmentsHorizontal, IconRefresh, IconSearch, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { RecordPage, RecordStatusCounts } from '../api/types';
import { EmptyState, ErrorBlock } from '../components/feedback';
import { Page, PageHeader } from '../components/layout';
import { Pager } from '../components/Pager';
import { RecordDrawer, type RecordFilterField } from '../components/RecordDrawer';
import { RecordTable } from '../components/RecordTable';
import { errorMessage, formatNumber } from '../lib/format';
import {
  advancedFilterCount,
  DEFAULT_RECORD_QUERY,
  parseRecordQuery,
  RECORD_PAGE_SIZES,
  recordFilterParams,
  recordListParams,
  serializeRecordQuery,
  type RecordQuery,
  type RecordStatusFilter,
} from '../lib/recordQuery';
import { useCachedState } from '../state/pageState';

type QueryChange = (query: string, options?: { replace?: boolean }) => void;

const STATUS_TABS: { value: RecordStatusFilter; label: string; count: keyof RecordStatusCounts }[] = [
  { value: '', label: 'All', count: 'total' },
  { value: 'pending', label: 'Pending', count: 'pending' },
  { value: 'all', label: 'Complete', count: 'all' },
  { value: 'partial', label: 'Partial', count: 'partial' },
  { value: 'none', label: 'Not downloaded', count: 'none' },
  { value: 'unknown', label: 'No links', count: 'unknown' },
];

/** Last records URL query, restored when the page is reopened from the sidebar. */
let lastRecordQuery = '';

/** Live search box: debounces typing into the URL, Enter applies immediately, Esc clears. */
function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [debounced] = useDebouncedValue(text, 300);
  const latestDebounced = useRef(debounced);
  latestDebounced.current = debounced;

  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // Only typing should push a new value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Follow outside changes (back/forward, clear all) without clobbering text typed since.
  useEffect(() => {
    if (value !== latestDebounced.current) setText(value);
  }, [value]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (text !== value) onChange(text);
      }}
    >
      <TextInput
        aria-label="Search records"
        placeholder="Search titles, or #ID…"
        leftSection={<IconSearch size={16} />}
        rightSection={
          text ? (
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Clear search" onClick={() => setText('')}>
              <IconX size={14} />
            </ActionIcon>
          ) : null
        }
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && text) {
            event.stopPropagation();
            setText('');
          }
        }}
      />
    </form>
  );
}

/** Name suggestions for an autocomplete field, fetched as the user types. */
function useSuggestions(fetcher: (query: string, limit: number) => Promise<{ name: string }[]>, text: string, enabled: boolean) {
  const [names, setNames] = useState<string[]>([]);
  const [debounced] = useDebouncedValue(text, 200);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetcher(debounced.trim(), 8)
      .then((items) => {
        if (!cancelled) setNames([...new Set(items.map((item) => item.name).filter(Boolean))]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetcher, debounced, enabled]);
  return names;
}

interface FilterDraft {
  actor: string;
  platform: string;
  type: string;
  range: [string | null, string | null];
}

const draftFrom = (query: RecordQuery): FilterDraft => ({
  actor: query.actor,
  platform: query.platform,
  type: query.type,
  range: [query.from || null, query.to || null],
});

function FiltersButton({ query, onApply }: { query: RecordQuery; onApply: (patch: Partial<RecordQuery>) => void }) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<FilterDraft>(() => draftFrom(query));
  const actorNames = useSuggestions(api.actors, draft.actor, opened);
  const platformNames = useSuggestions(api.platforms, draft.platform, opened);
  const count = advancedFilterCount(query);

  const apply = (next: FilterDraft) => {
    onApply({
      actor: next.actor.trim(),
      platform: next.platform.trim(),
      type: next.type.trim().replace(/^\./, ''),
      from: next.range[0] ?? '',
      to: next.range[1] ?? '',
      page: 1,
    });
    setOpened(false);
  };

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={340}
      shadow="lg"
      radius="md"
      trapFocus
    >
      <Popover.Target>
        <Button
          variant={count ? 'light' : 'default'}
          leftSection={<IconAdjustmentsHorizontal size={16} />}
          rightSection={
            count ? (
              <Badge size="xs" circle variant="filled">
                {count}
              </Badge>
            ) : null
          }
          onClick={() => {
            if (!opened) setDraft(draftFrom(query));
            setOpened((value) => !value);
          }}
        >
          Filters
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            apply(draft);
          }}
        >
          <Stack gap="sm">
            <Autocomplete
              label="Actor"
              placeholder="Any actor"
              data={actorNames}
              value={draft.actor}
              onChange={(actor) => setDraft((current) => ({ ...current, actor }))}
              comboboxProps={{ withinPortal: false }}
              data-autofocus
            />
            <Autocomplete
              label="Platform"
              placeholder="Any platform"
              data={platformNames}
              value={draft.platform}
              onChange={(platform) => setDraft((current) => ({ ...current, platform }))}
              comboboxProps={{ withinPortal: false }}
            />
            <DatePickerInput
              type="range"
              label="Delivered"
              placeholder="Any date"
              valueFormat="YYYY-MM-DD"
              clearable
              allowSingleDateInRange
              value={draft.range}
              onChange={(range) => setDraft((current) => ({ ...current, range: range as [string | null, string | null] }))}
              popoverProps={{ withinPortal: false }}
            />
            <TextInput
              label="File type"
              placeholder="Any type, e.g. mp4"
              value={draft.type}
              onChange={(event) => {
                const type = event.currentTarget.value;
                setDraft((current) => ({ ...current, type }));
              }}
            />
            <Group justify="space-between" mt={4}>
              <Button
                variant="subtle"
                color="gray"
                onClick={() => apply({ actor: '', platform: '', type: '', range: [null, null] })}
                disabled={count === 0}
              >
                Reset
              </Button>
              <Button type="submit">Apply</Button>
            </Group>
          </Stack>
        </form>
      </Popover.Dropdown>
    </Popover>
  );
}

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="rt-chip">
      <span className="rt-chip-label">{label}</span>
      <span className="rt-truncate" title={value}>
        {value}
      </span>
      <button type="button" aria-label={`Remove ${label} filter`} onClick={onRemove}>
        <IconX size={12} />
      </button>
    </span>
  );
}

export default function Records({ query: search, onQueryChange }: { query: string; onQueryChange: QueryChange }) {
  const query = useMemo(() => parseRecordQuery(search), [search]);
  const [result, setResult] = useCachedState<RecordPage | null>('records.result', null);
  const [counts, setCounts] = useCachedState<RecordStatusCounts | null>('records.counts', null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const listRequest = useRef(0);
  const countRequest = useRef(0);

  // Reopening Records from the sidebar returns to the last filters and open record.
  useEffect(() => {
    if (!search && lastRecordQuery) onQueryChange(lastRecordQuery, { replace: true });
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    lastRecordQuery = search;
  }, [search]);

  const update = useCallback(
    (patch: Partial<RecordQuery>, options?: { push?: boolean }) => {
      const next = serializeRecordQuery({ ...parseRecordQuery(window.location.hash.split('?')[1] ?? ''), ...patch });
      onQueryChange(next, { replace: !options?.push });
    },
    [onQueryChange],
  );

  const listKey = JSON.stringify(recordListParams(query));
  const countKey = JSON.stringify(recordFilterParams(query));

  useEffect(() => {
    const id = ++listRequest.current;
    setLoading(true);
    setError(null);
    api
      .records(JSON.parse(listKey))
      .then((payload: RecordPage) => {
        if (id !== listRequest.current) return;
        // A stale page number (e.g. from an old link) falls back to the last page.
        if (payload.total > 0 && payload.items.length === 0 && payload.page > payload.total_pages) {
          update({ page: payload.total_pages });
          return;
        }
        setResult(payload);
      })
      .catch((err) => {
        if (id === listRequest.current) setError(errorMessage(err, 'Records query failed'));
      })
      .finally(() => {
        if (id === listRequest.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, reloadToken]);

  useEffect(() => {
    const id = ++countRequest.current;
    api
      .recordStatusCounts(JSON.parse(countKey))
      .then((payload) => {
        if (id === countRequest.current) setCounts(payload);
      })
      .catch(() => {
        if (id === countRequest.current) setCounts(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countKey, reloadToken]);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  const openRecord = (id: number) => {
    if (id === query.open) return;
    // Opening from a closed state adds a history entry so Back closes the drawer.
    update({ open: id }, { push: query.open === null });
  };
  const closeRecord = useCallback(() => update({ open: null }), [update]);

  const filterBy = (field: RecordFilterField, value: string) =>
    update({ [field]: value, page: 1, status: '' } as Partial<RecordQuery>, { push: true });

  const chips: { key: string; label: string; value: string; clear: Partial<RecordQuery> }[] = [];
  if (query.actor) chips.push({ key: 'actor', label: 'Actor', value: query.actor, clear: { actor: '' } });
  if (query.platform) chips.push({ key: 'platform', label: 'Platform', value: query.platform, clear: { platform: '' } });
  if (query.from || query.to)
    chips.push({
      key: 'date',
      label: 'Delivered',
      value: query.from && query.to ? `${query.from} → ${query.to}` : query.from ? `from ${query.from}` : `until ${query.to}`,
      clear: { from: '', to: '' },
    });
  if (query.type) chips.push({ key: 'type', label: 'Type', value: query.type, clear: { type: '' } });

  const items = result?.items ?? [];
  const hasFilters = Boolean(query.q.trim() || chips.length || query.status);

  return (
    <Page className="rt-page-fill">
      <PageHeader eyebrow="Library" title="Records" />

      <div className="rt-records" data-open={query.open !== null || undefined}>
        <section className="rt-panel rt-records-list">
          <div className="rt-records-toolbar">
            <SearchBox value={query.q} onChange={(q) => update({ q, page: 1 })} />
            <FiltersButton query={query} onApply={(patch) => update(patch)} />
            <Tooltip label="Reload">
              <ActionIcon variant="default" size={36} onClick={reload} aria-label="Reload records" loading={loading}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </div>

          {chips.length ? (
            <div className="rt-chips">
              {chips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  label={chip.label}
                  value={chip.value}
                  onRemove={() => update({ ...chip.clear, page: 1 })}
                />
              ))}
              <Button
                variant="subtle"
                color="gray"
                size="compact-xs"
                onClick={() =>
                  update({ ...DEFAULT_RECORD_QUERY, sort: query.sort, size: query.size, open: query.open })
                }
              >
                Clear all
              </Button>
            </div>
          ) : null}

          <div className="rt-status-tabs" role="tablist" aria-label="Download status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || 'any'}
                type="button"
                role="tab"
                className="rt-status-tab"
                aria-selected={query.status === tab.value}
                data-active={query.status === tab.value || undefined}
                onClick={() => update({ status: tab.value, page: 1 })}
              >
                {tab.label}
                <span className="rt-status-tab-count">{counts ? formatNumber(counts[tab.count]) : '–'}</span>
              </button>
            ))}
          </div>

          <div className="rt-records-table" aria-busy={loading}>
            {error ? (
              <div style={{ padding: 16 }}>
                <ErrorBlock message={error} onRetry={reload} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title={result ? 'No matching records' : 'Loading records'}
                message={
                  result
                    ? hasFilters
                      ? 'Try a broader search, remove a filter, or choose a different status.'
                      : 'Import a spreadsheet or JSON file to fill the library.'
                    : 'Fetching the first page…'
                }
                icon={<IconSearch size={20} />}
              />
            ) : (
              <RecordTable
                records={items}
                onOpen={openRecord}
                selectedId={query.open}
                sort={query.sort}
                onSortChange={(sort) => update({ sort, page: 1 })}
              />
            )}
          </div>

          {result && result.total > 0 ? (
            <div className="rt-panel-footer">
              <div style={{ width: '100%' }}>
                <Pager
                  page={query.page}
                  pageSize={query.size}
                  total={result.total}
                  totalPages={result.total_pages}
                  disabled={loading}
                  noun="records"
                  pageSizes={RECORD_PAGE_SIZES}
                  onPageChange={(page) => update({ page })}
                  onPageSizeChange={(size) => update({ size, page: 1 })}
                />
              </div>
            </div>
          ) : null}
        </section>

        {query.open !== null ? (
          <>
            <div className="rt-drawer-scrim" onClick={closeRecord} />
            <RecordDrawer recordId={query.open} onClose={closeRecord} onFilter={filterBy} onChanged={reload} />
          </>
        ) : null}
      </div>
    </Page>
  );
}
