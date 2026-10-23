import { ActionIcon, SegmentedControl, Select, Switch, Tooltip } from '@mantine/core';
import { IconHeart, IconRefresh, IconUsers } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ActorPage, ActorSort, ActorSummary } from '../api/types';
import { actorHref } from '../app/routes';
import { FavoriteIcon } from '../components/FavoriteButton';
import { EmptyState, ErrorBlock } from '../components/feedback';
import { Page, PageHeader } from '../components/layout';
import { Pager } from '../components/Pager';
import { SearchBox, type QueryChange } from '../components/RecordBrowser';
import { avatarColors, errorMessage, formatNumber, initials } from '../lib/format';
import { useCachedState } from '../state/pageState';

/** Actors page state as stored in the URL hash query. */
interface ActorQuery {
  /** Name search, or `#123` for an actor ID. */
  q: string;
  favorites: boolean;
  /** Favorites listed ahead of everyone else. */
  pin: boolean;
  sort: ActorSort;
  page: number;
  size: number;
}

const DEFAULT_ACTOR_QUERY: ActorQuery = { q: '', favorites: false, pin: true, sort: 'name_asc', page: 1, size: 48 };
const ACTOR_PAGE_SIZES = [24, 48, 96, 192];
const SORT_OPTIONS: { value: ActorSort; label: string }[] = [
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'records_desc', label: 'Most records' },
  { value: 'records_asc', label: 'Fewest records' },
  { value: 'id_desc', label: 'Newest added' },
  { value: 'id_asc', label: 'Oldest added' },
];

const positiveInt = (value: string | null) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

function parseActorQuery(search: string): ActorQuery {
  const params = new URLSearchParams(search);
  const sort = params.get('sort') as ActorSort;
  const size = positiveInt(params.get('size'));
  return {
    q: params.get('q') ?? '',
    favorites: params.get('favorites') === '1',
    pin: params.get('pin') !== '0',
    sort: SORT_OPTIONS.some((option) => option.value === sort) ? sort : DEFAULT_ACTOR_QUERY.sort,
    page: positiveInt(params.get('page')) ?? 1,
    size: size && ACTOR_PAGE_SIZES.includes(size) ? size : DEFAULT_ACTOR_QUERY.size,
  };
}

/** Serializes the query, leaving out defaults so URLs stay short. */
function serializeActorQuery(query: ActorQuery): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_ACTOR_QUERY) as (keyof ActorQuery)[]) {
    const value = query[key];
    if (value === '' || value === DEFAULT_ACTOR_QUERY[key]) continue;
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return params.toString();
}

const actorIdFromSearch = (q: string) => {
  const match = /^#\s*(\d+)$/.exec(q.trim());
  return match ? positiveInt(match[1]) : null;
};

/** Last actors URL query, restored when the page is reopened from the sidebar. */
let lastActorQuery = '';

function ActorCard({
  actor,
  pending,
  onFavoriteChange,
}: {
  actor: ActorSummary;
  pending: number | undefined;
  onFavoriteChange: (favorite: boolean) => void;
}) {
  return (
    <div className="rt-actor-card" data-favorite={actor.is_favorite || undefined}>
      <a className="rt-actor-card-link" href={`#${actorHref(actor.id)}`}>
        <span className="rt-avatar" data-size="lg" style={avatarColors(actor.name || actor.id)}>
          {initials(actor.name)}
        </span>
        <span className="rt-actor-card-name rt-truncate" title={actor.name}>
          {actor.name || '(unnamed)'}
        </span>
        <span className="rt-actor-card-meta">#{actor.id}</span>
        <span className="rt-actor-card-stats">
          <span>
            <strong>{formatNumber(actor.record_count)}</strong> {actor.record_count === 1 ? 'record' : 'records'}
          </span>
          {pending === undefined ? (
            <span className="rt-pending-pill" data-loading="true">
              …
            </span>
          ) : actor.record_count === 0 ? null : (
            <span className="rt-pending-pill" data-zero={pending === 0 || undefined} title={`${pending} with undownloaded links`}>
              {pending === 0 ? 'Done' : `${formatNumber(pending)} pending`}
            </span>
          )}
        </span>
      </a>
      <FavoriteIcon className="rt-actor-card-fav" actor={actor} onChange={onFavoriteChange} />
    </div>
  );
}

export default function Actors({ query: search, onQueryChange }: { query: string; onQueryChange: QueryChange }) {
  const query = useMemo(() => parseActorQuery(search), [search]);
  const [result, setResult] = useCachedState<ActorPage | null>('actors.result', null);
  const [pending, setPending] = useCachedState<Record<string, number>>('actors.pending', {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const listRequest = useRef(0);

  // Reopening Actors from the sidebar returns to the last filters and page.
  useEffect(() => {
    if (!search && lastActorQuery) onQueryChange(lastActorQuery, { replace: true });
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    lastActorQuery = search;
  }, [search]);

  const update = useCallback(
    (patch: Partial<ActorQuery>) => {
      const current = parseActorQuery(window.location.hash.split('?')[1] ?? '');
      onQueryChange(serializeActorQuery({ ...current, ...patch }), { replace: true });
    },
    [onQueryChange],
  );

  const actorId = actorIdFromSearch(query.q);
  const listKey = JSON.stringify(query);

  useEffect(() => {
    const id = ++listRequest.current;
    setLoading(true);
    setError(null);
    const load = actorId
      ? api.actor(actorId).then(
          (actor): ActorPage => ({ items: [actor], page: 1, page_size: query.size, total: 1, total_pages: 1, favorite_total: 0 }),
          (): ActorPage => ({ items: [], page: 1, page_size: query.size, total: 0, total_pages: 0, favorite_total: 0 }),
        )
      : api.actorPage(query.q.trim(), query.page, query.size, {
          sort: query.sort,
          favorites_only: query.favorites || undefined,
          favorites_first: query.pin || undefined,
        });
    load
      .then((payload) => {
        if (id !== listRequest.current) return;
        // A stale page number (e.g. from an old link) falls back to the last page.
        if (payload.total > 0 && payload.items.length === 0 && payload.page > payload.total_pages) {
          update({ page: payload.total_pages });
          return;
        }
        setResult(payload);
      })
      .catch((err) => {
        if (id === listRequest.current) setError(errorMessage(err, 'Actors failed to load'));
      })
      .finally(() => {
        if (id === listRequest.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, reloadToken]);

  // Pending counts are computed separately so the cards render fast.
  const idsKey = (result?.items ?? []).map((actor) => actor.id).join(',');
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    api
      .actorUndownloadedCounts(idsKey.split(',').map(Number))
      .then((counts) => {
        if (!cancelled) setPending((current) => ({ ...current, ...counts }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, reloadToken]);

  // Cards keep their place when (un)liked; the new order applies on the next load.
  const setFavorite = (id: number, favorite: boolean) =>
    setResult((current) => {
      if (!current) return current;
      const before = current.items.find((actor) => actor.id === id)?.is_favorite;
      const delta = before === favorite ? 0 : favorite ? 1 : -1;
      return {
        ...current,
        favorite_total: Math.max(0, current.favorite_total + delta),
        items: current.items.map((actor) => (actor.id === id ? { ...actor, is_favorite: favorite } : actor)),
      };
    });

  const items = result?.items ?? [];
  const reload = () => setReloadToken((value) => value + 1);

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title="Actors"
        description={
          <>
            Browse performers and how much of their work is still to download.{' '}
            {result && !actorId
              ? `${formatNumber(result.total)} ${query.favorites ? 'favorite' : 'actor'}${result.total === 1 ? '' : 's'}`
              : null}
          </>
        }
      />

      <section className="rt-panel">
        <div className="rt-actors-toolbar">
          <SearchBox
            value={query.q}
            onChange={(q) => update({ q, page: 1 })}
            label="Search actors"
            placeholder="Search names, or #ID…"
          />
          <SegmentedControl
            value={query.favorites ? 'favorites' : 'all'}
            onChange={(value) => update({ favorites: value === 'favorites', page: 1 })}
            data={[
              { value: 'all', label: 'All' },
              {
                value: 'favorites',
                label: (
                  <span className="rt-segment-label">
                    <IconHeart size={14} />
                    Favorites
                    {result && !actorId ? <span className="rt-status-tab-count">{formatNumber(result.favorite_total)}</span> : null}
                  </span>
                ),
              },
            ]}
          />
          <Select
            aria-label="Sort actors"
            w={160}
            value={query.sort}
            data={SORT_OPTIONS}
            allowDeselect={false}
            onChange={(value) => update({ sort: (value as ActorSort) ?? DEFAULT_ACTOR_QUERY.sort, page: 1 })}
          />
          <Tooltip label={query.favorites ? 'Only favorites are shown' : 'List favorites ahead of everyone else'}>
            <Switch
              label="Favorites first"
              checked={query.pin}
              disabled={query.favorites}
              onChange={(event) => update({ pin: event.currentTarget.checked, page: 1 })}
            />
          </Tooltip>
          <Tooltip label="Reload">
            <ActionIcon variant="default" size={36} onClick={reload} aria-label="Reload actors" loading={loading}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </div>

        <div className="rt-actor-grid-wrap" aria-busy={loading}>
          {error ? (
            <ErrorBlock message={error} onRetry={reload} />
          ) : items.length === 0 ? (
            <EmptyState
              title={result ? (query.favorites && !query.q.trim() ? 'No favorites yet' : 'No matching actors') : 'Loading actors'}
              message={
                result
                  ? query.favorites && !query.q.trim()
                    ? 'Tap the heart on an actor card to keep them here.'
                    : 'Try a different name, or switch back to all actors.'
                  : 'Fetching the first page…'
              }
              icon={query.favorites ? <IconHeart size={20} /> : <IconUsers size={20} />}
            />
          ) : (
            <div className="rt-actor-grid">
              {items.map((actor) => (
                <ActorCard
                  key={actor.id}
                  actor={actor}
                  pending={pending[String(actor.id)]}
                  onFavoriteChange={(favorite) => setFavorite(actor.id, favorite)}
                />
              ))}
            </div>
          )}
        </div>

        {result && result.total > 0 && !actorId ? (
          <div className="rt-panel-footer">
            <div style={{ width: '100%' }}>
              <Pager
                page={query.page}
                pageSize={query.size}
                total={result.total}
                totalPages={result.total_pages}
                disabled={loading}
                noun={query.favorites ? 'favorites' : 'actors'}
                pageSizes={ACTOR_PAGE_SIZES}
                onPageChange={(page) => {
                  update({ page });
                  window.scrollTo({ top: 0 });
                }}
                onPageSizeChange={(size) => update({ size, page: 1 })}
              />
            </div>
          </div>
        ) : null}
      </section>
    </Page>
  );
}
