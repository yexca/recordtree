import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle, IconCheck, IconDownload, IconListCheck } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { DownloadPlan, Job, LinkSummary } from '../api/types';
import { isTerminal, jobOutput, useJobStream } from '../hooks/useJobStream';
import { formatBytes, formatText, previewUrl } from '../lib/format';
import { notifyError, notifySuccess } from '../lib/notify';
import { KeyValue } from './data';
import { Panel } from './layout';
import { LogViewer } from './LogViewer';
import { StatusBadge, toneVar } from './StatusBadge';

const fileCount = (count: number) => `${count} file${count === 1 ? '' : 's'}`;

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

/**
 * Plan preview, confirmation, and live job output for downloading the checked links of one record.
 * A plan belongs to the selection and output folder it was built for; changing either discards it.
 */
export function DownloadPlanner({
  idOrKey,
  selectedLinks,
  onFinished,
}: {
  idOrKey: string;
  selectedLinks: LinkSummary[];
  onFinished?: () => void;
}) {
  const [output, setOutput] = useState('');
  const [planned, setPlanned] = useState<{ key: string; plan: DownloadPlan } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const reportedJob = useRef<string | null>(null);

  useJobStream(job, setJob);

  useEffect(() => {
    if (job && isTerminal(job.status) && reportedJob.current !== job.id) {
      reportedJob.current = job.id;
      onFinished?.();
    }
  }, [job, onFinished]);

  const selectionKey = selectedLinks.map((link) => link.id).join(',');
  const plan = planned?.key === selectionKey ? planned.plan : null;
  const selectedBytes = selectedLinks.reduce((total, link) => total + link.size_bytes, 0);

  const buildPlan = async () => {
    const key = selectionKey;
    setPlanning(true);
    try {
      const next = await api.downloadPlan(idOrKey, {
        link_ids: selectedLinks.map((link) => link.id),
        output: output.trim() || null,
      });
      setPlanned({ key, plan: next });
    } catch (err) {
      notifyError('Plan unavailable', err);
    } finally {
      setPlanning(false);
    }
  };

  const startDownload = async () => {
    if (!plan) return;
    setStarting(true);
    try {
      const created = await api.createDownload({
        record_id_or_key: idOrKey,
        link_ids: plan.selected_links.map((link) => link.id),
        output: output.trim() || null,
      });
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
          output_tail: '',
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
      description="Check the links to download, preview the plan, then start a MEGAcmd job."
      actions={job ? <StatusBadge value={job.status} /> : null}
    >
      <Stack gap="md">
        <Text size="sm" c={selectedLinks.length ? undefined : 'dimmed'}>
          {selectedLinks.length
            ? `${fileCount(selectedLinks.length)} selected · ${formatBytes(selectedBytes)}`
            : 'No links selected.'}
        </Text>
        <TextInput
          label="Output folder"
          description="Leave empty to use the folder template."
          placeholder="Default from settings"
          value={output}
          onChange={(event) => {
            setOutput(event.currentTarget.value);
            setPlanned(null);
          }}
        />
        <Group grow gap="xs">
          <Button
            variant="default"
            leftSection={<IconListCheck size={16} />}
            loading={planning}
            disabled={selectedLinks.length === 0}
            onClick={buildPlan}
          >
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
                {
                  label: 'Types',
                  value: [...new Set(plan.selected_links.map((link) => formatText(link.file_type)))].join(', '),
                  full: true,
                },
                { label: 'Output', value: plan.output_dir, mono: true, full: true },
              ]}
            />
            <SpaceMeter plan={plan} />
            {insufficientSpace ? (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
                <Text size="xs">Not enough free space for this plan and its safety margin.</Text>
              </Alert>
            ) : null}
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
              Download {fileCount(plan.selected_links.length)} ({formatBytes(plan.selected_bytes)}) for{' '}
              <b>{plan.title}</b>.
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
