import { Button, Group, Modal, NumberInput, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDownload, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { ActorSummary } from '../api/types';
import { useActiveJobs } from '../app/ActiveJobs';
import { EntityBrowser, type EntityBrowserConfig } from '../components/EntityBrowser';
import { notifyError, notifySuccess } from '../lib/notify';

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
      <Button
        size="sm"
        leftSection={<IconDownload size={16} />}
        disabled={actor.undownloaded_count === 0}
        onClick={open}
      >
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

const config: EntityBrowserConfig<ActorSummary> = {
  cacheKey: 'actors',
  title: 'Actors',
  description: 'Browse performers, their records, and how much is still to download.',
  noun: 'Actor',
  nounPlural: 'actors',
  emptyIcon: <IconUsers size={22} />,
  fetchPage: api.actorPage,
  fetchOne: api.actor,
  fetchCounts: api.actorUndownloadedCounts,
  fetchRecords: api.actorRecords,
  hideColumn: 'actor',
  renderActions: (actor) => <QueueActorDownloads actor={actor} />,
};

export default function Actors() {
  return <EntityBrowser config={config} />;
}
