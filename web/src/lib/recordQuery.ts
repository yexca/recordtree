import type { DownloadedStatus, RecordSort } from '../api/types';

export type RecordStatusFilter = DownloadedStatus | 'pending' | '';

/** Records page state as stored in the URL hash query. */
export interface RecordQuery {
  /** Title search, or `#123` for a record ID. */
  q: string;
  actor: string;
  platform: string;
  type: string;
  from: string;
  to: string;
  status: RecordStatusFilter;
  sort: RecordSort;
  page: number;
  size: number;
  /** Record shown in the detail drawer. */
  open: number | null;
}

export const DEFAULT_RECORD_QUERY: RecordQuery = {
  q: '',
  actor: '',
  platform: '',
  type: '',
  from: '',
  to: '',
  status: '',
  sort: 'delivered_desc',
  page: 1,
  size: 50,
  open: null,
};

export const RECORD_PAGE_SIZES = [25, 50, 100, 200];

const STATUSES: RecordStatusFilter[] = ['', 'pending', 'all', 'partial', 'none', 'unknown'];
const SORTS: RecordSort[] = [
  'delivered_desc',
  'delivered_asc',
  'size_desc',
  'size_asc',
  'id_desc',
  'id_asc',
  'title_asc',
  'title_desc',
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const positiveInt = (value: string | null) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export function parseRecordQuery(search: string): RecordQuery {
  const params = new URLSearchParams(search);
  const text = (key: string) => params.get(key)?.trim() ?? '';
  const date = (key: string) => (DATE.test(text(key)) ? text(key) : '');
  const status = text('status') as RecordStatusFilter;
  const sort = text('sort') as RecordSort;
  const size = positiveInt(params.get('size'));
  return {
    q: params.get('q') ?? '',
    actor: text('actor'),
    platform: text('platform'),
    type: text('type'),
    from: date('from'),
    to: date('to'),
    status: STATUSES.includes(status) ? status : '',
    sort: SORTS.includes(sort) ? sort : DEFAULT_RECORD_QUERY.sort,
    page: positiveInt(params.get('page')) ?? 1,
    size: size && RECORD_PAGE_SIZES.includes(size) ? size : DEFAULT_RECORD_QUERY.size,
    open: positiveInt(params.get('open')),
  };
}

/** Serializes the query, leaving out defaults so URLs stay short. */
export function serializeRecordQuery(query: RecordQuery): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_RECORD_QUERY) as (keyof RecordQuery)[]) {
    const value = query[key];
    if (value === null || value === '' || value === DEFAULT_RECORD_QUERY[key]) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** Parses `#123` (or a bare `#` prefixed number) in the search box as a record ID. */
export function recordIdFromSearch(q: string): number | null {
  const match = /^#\s*(\d+)$/.exec(q.trim());
  return match ? positiveInt(match[1]) : null;
}

/** Filter parameters shared by the list and status-count endpoints. */
export function recordFilterParams(query: RecordQuery) {
  const recordId = recordIdFromSearch(query.q);
  return {
    record_id: recordId ?? undefined,
    title: recordId ? '' : query.q.trim(),
    actor: query.actor,
    source: query.platform,
    file_type: query.type,
    date_from: query.from,
    date_to: query.to,
  };
}

export function recordListParams(query: RecordQuery) {
  return {
    ...recordFilterParams(query),
    downloaded: query.status === 'pending' ? '' : query.status,
    only_undownloaded: query.status === 'pending' || undefined,
    sort: query.sort,
    page: query.page,
    page_size: query.size,
  };
}

/** Number of filters set in the Filters popover (search and status are shown separately). */
export function advancedFilterCount(query: RecordQuery): number {
  return [query.actor, query.platform, query.type, query.from || query.to].filter(Boolean).length;
}
