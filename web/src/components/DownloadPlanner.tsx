import { Alert, Button, Collapse, Group, Modal, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconListCheck,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { DownloadPlan, Job } from '../api/types';
import { isTerminal, jobOutput, useJobStream } from '../hooks/useJobStream';
import { formatBytes, formatText, previewUrl } from '../lib/format';
import { notifyError, notifySuccess } from '../lib/notify';
import { KeyValue, TableWrap } from './data';
import { Panel } from './layout';
import { LogViewer } from './LogViewer';
import { StatusBadge, toneVar } from './StatusBadge';

interface PlanOptions {
  includePar2: boolean;
  onlyUndownloaded: boolean;
  types: string;
  output: string;
}

function requestBody(options: PlanOptions) {
  return {
    include_par2: options.includePar2,
    only_undownloaded: options.onlyUndownloaded,
    types: options.types.trim() || null,
    output: options.output.trim() || null,
  };
}

function SpaceMeter({ plan }: { plan: DownloadPlan }) {
  if (plan.free_bytes_before == null) {
    return (
      <Text size="xs" c="dimmed">
        Free space could not be measured for this output folder.
      </Text>
    );
  }
  const ratio = plan.free_bytes_before > 0 ? Math.min(1, plan.required_bytes / plan.free_bytes_before) : 1;
  const tone = ratio >= 1 ? 'bad' : ratio > 0.8 ? 'warn' : 'good';
  return (
    <div className="rt-space">
      <Group justify="space-between" gap={4}>
        <Text size="xs" c="dimmed">
          Needs {formatBytes(plan.required_bytes)} (incl. {formatBytes(plan.margin_bytes)} margin)
        </Text>
        <Text size="xs" c="dimmed">
          {formatBytes(plan.free_bytes_before)} free
        </Text>
      </Group>
      <div className="rt-space-bar" role="img" aria-label={`Uses ${Math.round(ratio * 100)}% of free space`}>
        <span style={{ width: `${Math.max(ratio * 100, 1)}%`, background: toneVar[tone] }} />
      </div>
    </div>
  );
}

/** Option form, plan preview, confirmation, and live job output for a single record download. */
export function DownloadPlanner({ idOrKey, onFinished }: { idOrKey: string; onFinished?: () => void }) {
  const [options, setOptions] = useState<PlanOptions>({
    includePar2: false,
    onlyUndownloaded: true,
    types: '',
    output: '',
  });
  const [plan, setPlan] = useState<DownloadPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [filesOpen, { toggle: toggleFiles }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const reportedJob = useRef<string | null>(null);

  useJobStream(job, setJob);

  useEffect(() => {
    api
      .settings()
      .then((settings) =>
        setOptions((current) => ({ ...current, includePar2: settings.download.include_par2_by_default })),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (job && isTerminal(job.status) && reportedJob.current !== job.id) {
      reportedJob.current = job.id;
      onFinished?.();
    }
  }, [job, onFinished]);

  const change = <K extends keyof PlanOptions>(key: K, value: PlanOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
    setPlan(null);
  };

  const buildPlan = async () => {
    setPlanning(true);
    try {
      setPlan(await api.downloadPlan(idOrKey, requestBody(options)));
    } catch (err) {
      notifyError('Plan unavailable', err);
    } finally {
      setPlanning(false);
    }
  };

  const startDownload = async () => {
    setStarting(true);
    try {
      const created = await api.createDownload({ record_id_or_key: idOrKey, ...requestBody(options) });
      closeConfirm();
      notifySuccess('Download started', `Job ${created.job_id.slice(0, 8)}`);
      try {
        setJob(await api.job(created.job_id));
      } catch {
        setJob({
          id: created.job_id,
          kind: 'download',
          status: created.status,
          created_at: '',
          started_at: null,
          finished_at: null,
          progress: null,
          target: null,
          options: {},
          events: [],
          result: null,
          error: null,
        });
      }
    } catch (err) {
      notifyError('Download failed to start', err);
    } finally {
      setStarting(false);
    }
  };

  const jobRunning = Boolean(job && !isTerminal(job.status));
  const insufficientSpace =
    plan && plan.free_bytes_before != null ? plan.required_bytes > plan.free_bytes_before : false;

  return (
    <Panel
      title="Download"
      description="Preview the plan, then start a MEGAcmd job."
      actions={job ? <StatusBadge value={job.status} /> : null}
    >
      <Stack gap="md">
        <Stack gap={10}>
          <Switch
            label="Only undownloaded links"
            checked={options.onlyUndownloaded}
            onChange={(event) => change('onlyUndownloaded', event.currentTarget.checked)}
          />
          <Switch
            label="Include .par2 files"
            checked={options.includePar2}
            onChange={(event) => change('includePar2', event.currentTarget.checked)}
          />
        </Stack>
        <TextInput
          label="File types"
          description="Comma separated; leave empty for all types."
          placeholder="mp4,m4a"
          value={options.types}
          onChange={(event) => change('types', event.currentTarget.value)}
        />
        <TextInput
          label="Output folder"
          description="Leave empty to use the folder template."
          placeholder="Default from settings"
          value={options.output}
          onChange={(event) => change('output', event.currentTarget.value)}
        />
        <Group grow gap="xs">
          <Button variant="default" leftSection={<IconListCheck size={16} />} loading={planning} onClick={buildPlan}>
            Preview plan
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            disabled={!plan || plan.selected_links.length === 0 || jobRunning}
            onClick={openConfirm}
          >
            Download
          </Button>
        </Group>

        {plan ? (
          <Stack gap="sm" pt={4} style={{ borderTop: '1px solid var(--rt-border)' }}>
            <KeyValue
              columns={2}
              items={[
                { label: 'Files', value: plan.selected_links.length },
                { label: 'Selected size', value: formatBytes(plan.selected_bytes) },
                { label: 'Types', value: plan.type_filter?.join(', ') || 'All' },
                { label: '.par2', value: plan.include_par2 ? 'Included' : 'Excluded' },
                { label: 'Output', value: plan.output_dir, mono: true, full: true },
              ]}
            />
            <SpaceMeter plan={plan} />
            {insufficientSpace ? (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
                <Text size="xs">Not enough free space for this plan and its safety margin.</Text>
              </Alert>
            ) : null}
            {plan.selected_links.length === 0 ? (
              <Text size="sm" c="dimmed">
                No links match these options.
              </Text>
            ) : (
              <>
                <Button
                  variant="subtle"
                  color="gray"
                  size="compact-sm"
                  leftSection={filesOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  onClick={toggleFiles}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {filesOpen ? 'Hide' : 'Show'} {plan.selected_links.length} selected file
                  {plan.selected_links.length === 1 ? '' : 's'}
                </Button>
                <Collapse expanded={filesOpen}>
                  <TableWrap>
                    <Table fz="xs" verticalSpacing={6}>
                      <Table.Tbody>
                        {plan.selected_links.map((link) => (
                          <Table.Tr key={link.id}>
                            <Table.Td className="rt-id">{link.link_order}</Table.Td>
                            <Table.Td>{formatText(link.file_type)}</Table.Td>
                            <Table.Td className="rt-num">{link.formatted_size || formatBytes(link.size_bytes)}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </TableWrap>
                </Collapse>
              </>
            )}
          </Stack>
        ) : null}

        {job ? (
          <Stack gap={8} pt={4} style={{ borderTop: '1px solid var(--rt-border)' }}>
            <Group justify="space-between" gap="xs">
              <Group gap={8}>
                {jobRunning ? <span className="rt-live-dot" /> : null}
                <Text size="sm" fw={650}>
                  MEGAcmd output
                </Text>
              </Group>
              <Text size="xs" c="dimmed" className="rt-mono">
                {job.id.slice(0, 8)}
              </Text>
            </Group>
            {job.error ? (
              <Text size="sm" c="red">
                {job.error}
              </Text>
            ) : null}
            <LogViewer text={jobOutput(job)} placeholder="Waiting for MEGAcmd output…" maxHeight={260} />
          </Stack>
        ) : null}
      </Stack>

      <Modal opened={confirmOpened} onClose={closeConfirm} title={<Text fw={650}>Start download?</Text>}>
        {plan ? (
          <Stack gap="md">
            <Text size="sm">
              Download {plan.selected_links.length} file{plan.selected_links.length === 1 ? '' : 's'} (
              {formatBytes(plan.selected_bytes)}) for <b>{plan.title}</b>.
            </Text>
            <KeyValue
              columns={2}
              items={[
                { label: 'Required', value: formatBytes(plan.required_bytes) },
                { label: 'Free', value: formatBytes(plan.free_bytes_before) },
                { label: 'Output', value: plan.output_dir, mono: true, full: true },
              ]}
            />
            {plan.selected_links.length > 0 ? (
              <Text size="xs" c="dimmed" className="rt-wrap">
                First link: {previewUrl(plan.selected_links[0].mega_url, 22)}
              </Text>
            ) : null}
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={closeConfirm}>
                Cancel
              </Button>
              <Button leftSection={<IconCheck size={16} />} loading={starting} onClick={startDownload}>
                Start download
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>
    </Panel>
  );
}
