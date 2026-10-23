import { Button, Group, Modal, NumberInput, Skeleton, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDownload } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { ActorSummary } from '../api/types';
import { useActiveJobs } from '../app/ActiveJobs';
import { FavoriteButton } from '../components/FavoriteButton';
import { ErrorBlock } from '../components/feedback';
import { Page, PageHeader } from '../components/layout';
import { RecordBrowser, type QueryChange } from '../components/RecordBrowser';
import { avatarColors, errorMessage, formatNumber, initials } from '../lib/format';
import { notifyError, notifySuccess } from '../lib/notify';
import { useCachedState } from '../state/pageState';

/** Queues a background job that downloads the actor's next N records with undownloaded links. */
function QueueActorDownloads({ actor }: { actor: ActorSummary }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [count, setCount] = useState<number | string>(3);
  const [includePar2, setIncludePar2] = useState(false);
  const [types, setTypes] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useActiveJobs();

  const submit = async () => {
    setBusy(true);
    try {
      const created = await api.createActorDownload({
        actor_id: actor.id,
        count: Math.max(1, Number(count) || 1),
        include_par2: includePar2,
        types: types.trim() || null,
      });
      notifySuccess('Downloads queued', `Job ${created.job_id.slice(0, 8)} for ${actor.name}`);
      close();
      void refresh();
    } catch (err) {
      notifyError('Could not queue downloads', err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button leftSection={<IconDownload size={16} />} disabled={actor.undownloaded_count === 0} onClick={open}>
        Queue downloads
      </Button>
      <Modal opened={opened} onClose={close} title={<Text fw={650}>Queue downloads for {actor.name}</Text>}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Starts one background job that downloads the newest records that still have undownloaded links, one
            after another, into each record's default folder.
          </Text>
          <NumberInput
            label="Records to download"
            description={`${actor.undownloaded_count} record${actor.undownloaded_count === 1 ? '' : 's'} pending`}
            min={1}
            max={Math.max(1, actor.undownloaded_count)}
            value={count}
            onChange={setCount}
          />
          <TextInput
            label="File types"
            placeholder="All types, or e.g. mp4,m4a"
            value={types}
            onChange={(event) => setTypes(event.currentTarget.value)}
          />
          <Switch
            label="Include .par2 files"
            checked={includePar2}
            onChange={(event) => setIncludePar2(event.currentTarget.checked)}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button leftSection={<IconDownload size={16} />} loading={busy} onClick={submit}>
              Queue
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/** One actor's profile with every record they appear in. */
export default function ActorDetail({
  actorId,
  query,
  onQueryChange,
  onBack,
  onActorFilter,
}: {
  actorId: number;
  query: string;
  onQueryChange: QueryChange;
  onBack: () => void;
  onActorFilter: (name: string) => void;
}) {
  const [actor, setActor] = useCachedState<ActorSummary | null>(`actor.${actorId}`, null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .actor(actorId)
      .then(setActor)
      .catch((err) => setError(errorMessage(err, 'Actor failed to load')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorId]);

  useEffect(load, [load]);

  if (error && !actor) {
    return (
      <Page>
        <PageHeader eyebrow="Actor" title={`#${actorId}`} onBack={onBack} backLabel="All actors" />
        <ErrorBlock message={error} onRetry={load} />
      </Page>
    );
  }

  const name = actor?.name || '(unnamed)';
  return (
    <Page className="rt-page-fill">
      <PageHeader
        onBack={onBack}
        backLabel="All actors"
        eyebrow={`Actor #${actorId}`}
        title={
          actor ? (
            <span className="rt-actor-title">
              <span className="rt-avatar" data-size="lg" style={avatarColors(actor.name || actor.id)}>
                {initials(actor.name)}
              </span>
              <span>{name}</span>
            </span>
          ) : (
            <Skeleton height={36} width={240} radius="md" />
          )
        }
        description={
          actor ? (
            <>
              {formatNumber(actor.record_count)} {actor.record_count === 1 ? 'record' : 'records'} ·{' '}
              {actor.undownloaded_count === 0
                ? 'everything downloaded'
                : `${formatNumber(actor.undownloaded_count)} with undownloaded links`}
            </>
          ) : null
        }
        actions={
          actor ? (
            <>
              <FavoriteButton actor={actor} onChange={(is_favorite) => setActor((current) => current && { ...current, is_favorite })} />
              <QueueActorDownloads actor={actor} />
            </>
          ) : null
        }
      />
      <RecordBrowser
        search={query}
        onQueryChange={onQueryChange}
        cacheKey={`actor.${actorId}.records`}
        actorId={actorId}
        onActorFilter={onActorFilter}
        onChanged={load}
      />
    </Page>
  );
}
