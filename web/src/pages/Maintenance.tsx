import { Button, Group, Table, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconChartBar,
  IconCircleCheck,
  IconDatabase,
  IconDatabaseExport,
  IconDownload,
  IconLinkOff,
  IconPackages,
  IconRefresh,
  IconSettings,
  IconShieldCheck,
  IconStack2,
} from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type {
  BackupSummary,
  IntegrityResult,
  MaintenanceActionResult,
  MaintenanceSummary,
  MegaAccountStatus,
  OrphanReport,
} from '../api/types';
import type { Navigate } from '../App';
import { KeyValueRows, StatCard, TableWrap } from '../components/data';
import { EmptyState, ErrorBlock, LoadingBlock } from '../components/feedback';
import { Page, PageHeader, Panel } from '../components/layout';
import { CheckList, megaCommandRows, type CheckRow } from '../components/MegaStatus';
import { errorMessage, formatBytes, formatDateTime, formatNumber, formatRelative } from '../lib/format';
import { notifyError, notifySuccess } from '../lib/notify';
import { useCachedState } from '../state/pageState';

type ActionResult =
  | { kind: 'backup'; title: string; result: BackupSummary }
  | { kind: 'integrity'; title: string; result: IntegrityResult }
  | { kind: 'orphans'; title: string; result: OrphanReport }
  | { kind: 'analyze'; title: string; result: MaintenanceActionResult }
  | { kind: 'vacuum'; title: string; result: MaintenanceActionResult };

type ActionKind = ActionResult['kind'];

const orphanLabels: Record<keyof Omit<OrphanReport, 'ok'>, string> = {
  actors_without_records: 'Actors without records',
  sources_without_records: 'Platforms without records',
  record_actor_orphans: 'Broken record → actor mappings',
  record_source_orphans: 'Broken record → platform mappings',
  links_without_record: 'Links without records',
  downloads_without_record: 'Downloads without records',
  download_items_without_download: 'Download items without downloads',
  download_items_without_link: 'Download items without links',
};

const TOOLS: {
  kind: ActionKind;
  title: string;
  description: string;
  icon: ReactNode;
  run: () => Promise<ActionResult>;
}[] = [
  {
    kind: 'backup',
    title: 'Back up database',
    description: 'Write a consistent snapshot to the backup folder.',
    icon: <IconDatabaseExport size={18} />,
    run: async () => ({ kind: 'backup', title: 'Backup', result: await api.maintenanceBackup() }),
  },
  {
    kind: 'integrity',
    title: 'Check integrity',
    description: 'Run SQLite quick_check and foreign-key checks.',
    icon: <IconShieldCheck size={18} />,
    run: async () => ({ kind: 'integrity', title: 'Integrity check', result: await api.maintenanceIntegrity() }),
  },
  {
    kind: 'orphans',
    title: 'Find orphans',
    description: 'Count rows whose parent record, link, or download is missing.',
    icon: <IconLinkOff size={18} />,
    run: async () => ({ kind: 'orphans', title: 'Orphan check', result: await api.maintenanceOrphans() }),
  },
  {
    kind: 'analyze',
    title: 'Analyze',
    description: 'Refresh query planner statistics after large imports.',
    icon: <IconChartBar size={18} />,
    run: async () => ({ kind: 'analyze', title: 'Analyze', result: await api.maintenanceAnalyze() }),
  },
  {
    kind: 'vacuum',
    title: 'Vacuum',
    description: 'Rebuild the file to reclaim free pages. Can take a while.',
    icon: <IconPackages size={18} />,
    run: async () => ({ kind: 'vacuum', title: 'Vacuum', result: await api.maintenanceVacuum() }),
  },
];

function backupDownloadUrl(path: string) {
  const filename = path.replaceAll('\\', '/').split('/').pop() ?? '';
  return `/api/maintenance/backups/${encodeURIComponent(filename)}`;
}

function checkTone(status: string): CheckRow['tone'] {
  return status === 'pass' ? 'good' : status === 'warn' ? 'warn' : 'bad';
}

function ResultPanel({ action }: { action: ActionResult }) {
  let body: ReactNode;
  if (action.kind === 'backup') {
    body = (
      <div style={{ padding: '4px 18px 8px' }}>
        <KeyValueRows
          rows={[
            ['File', <span className="rt-mono rt-wrap">{action.result.path}</span>],
            ['Size', formatBytes(action.result.size_bytes)],
            ['Created', formatDateTime(action.result.created_at)],
            [
              'Download',
              <Button
                component="a"
                href={backupDownloadUrl(action.result.path)}
                download
                variant="light"
                size="compact-sm"
                leftSection={<IconDownload size={14} />}
              >
                Download backup
              </Button>,
            ],
          ]}
        />
      </div>
    );
  } else if (action.kind === 'integrity') {
    body = (
      <CheckList
        rows={action.result.checks.map((check) => ({
          name: check.name,
          tone: checkTone(check.status),
          message: check.message,
        }))}
      />
    );
  } else if (action.kind === 'orphans') {
    const report = action.result;
    body = (
      <CheckList
        rows={Object.entries(orphanLabels).map(([key, label]) => {
          const value = report[key as keyof typeof orphanLabels];
          return { name: formatNumber(value), tone: value === 0 ? 'good' : 'warn', message: label };
        })}
      />
    );
  } else {
    body = (
      <div style={{ padding: '4px 18px 8px' }}>
        <KeyValueRows
          rows={[
            ['Status', action.result.ok ? 'Completed' : 'Failed'],
            ['Message', action.result.message],
            ['Started', formatDateTime(action.result.started_at)],
            ['Finished', formatDateTime(action.result.finished_at)],
          ]}
        />
      </div>
    );
  }
  return (
    <Panel title={`Result · ${action.title}`} flush>
      {body}
    </Panel>
  );
}

export default function Maintenance({ navigate }: { navigate: Navigate }) {
  const [summary, setSummary] = useCachedState<MaintenanceSummary | null>('maintenance.summary', null);
  const [checkedAt, setCheckedAt] = useCachedState<string | null>('maintenance.lastCheckedAt', null);
  const [megaStatus, setMegaStatus] = useCachedState<MegaAccountStatus | null>('maintenance.megaStatus', null);
  const [megaCheckedAt, setMegaCheckedAt] = useCachedState<string | null>('maintenance.megaCheckedAt', null);
  const [lastResult, setLastResult] = useCachedState<ActionResult | null>('maintenance.lastResult', null);
  const [error, setError] = useState<string | null>(null);
  const [megaError, setMegaError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ActionKind | 'refresh' | 'mega' | null>(null);

  const loadSummary = async () => {
    setError(null);
    try {
      setSummary(await api.maintenanceSummary());
      setCheckedAt(new Date().toISOString());
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const refresh = async () => {
    setBusy('refresh');
    try {
      await loadSummary();
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!summary) void refresh();
    // Local summary only; MEGAcmd is checked on explicit request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkMega = async () => {
    setBusy('mega');
    setMegaError(null);
    try {
      setMegaStatus(await api.megaStatus());
      setMegaCheckedAt(new Date().toISOString());
    } catch (err) {
      setMegaError(errorMessage(err, 'MEGAcmd status check failed'));
    } finally {
      setBusy(null);
    }
  };

  const runTool = async (tool: (typeof TOOLS)[number]) => {
    setBusy(tool.kind);
    try {
      setLastResult(await tool.run());
      notifySuccess(tool.title, 'Completed.');
      await loadSummary();
    } catch (err) {
      notifyError(tool.title, err);
    } finally {
      setBusy(null);
    }
  };

  const failing = summary?.checks.filter((check) => check.status === 'fail') ?? [];
  const warnings = summary?.checks.filter((check) => check.status === 'warn') ?? [];
  const tone = !summary ? 'warn' : failing.length ? 'bad' : warnings.length ? 'warn' : 'good';

  return (
    <Page>
      <PageHeader
        eyebrow="System"
        title="Maintenance"
        description="Local paths, database health, and backups. MEGAcmd is only queried when you ask."
        actions={
          <>
            <Button variant="default" leftSection={<IconSettings size={16} />} onClick={() => navigate('/settings')}>
              Settings
            </Button>
            <Button leftSection={<IconRefresh size={16} />} loading={busy === 'refresh'} onClick={() => void refresh()}>
              Refresh
            </Button>
          </>
        }
      />

      {error ? <ErrorBlock message={`Diagnostics failed: ${error}`} onRetry={() => void refresh()} /> : null}

      {!summary ? (
        error ? null : <LoadingBlock label="Running local checks…" />
      ) : (
        <>
          <div className="rt-health" data-tone={tone}>
            <span className="rt-health-icon">
              {tone === 'good' ? <IconCircleCheck size={22} /> : <IconAlertTriangle size={22} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text fw={650}>
                {tone === 'good'
                  ? 'All local checks pass'
                  : `${failing.length} failing, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
              </Text>
              <Text size="xs" c="dimmed">
                {summary.checks.length} checks{checkedAt ? ` · refreshed ${formatRelative(checkedAt)}` : ''}
              </Text>
            </div>
          </div>

          <div className="rt-grid rt-grid-stats">
            <StatCard label="Database size" icon={<IconDatabase size={16} />} value={formatBytes(summary.database_size_bytes)} />
            <StatCard label="Record groups" icon={<IconStack2 size={16} />} value={formatNumber(summary.stats.total_record_groups)} />
            <StatCard
              label="Latest backup"
              icon={<IconDatabaseExport size={16} />}
              value={summary.latest_backup ? formatRelative(summary.latest_backup.created_at) : 'None'}
              hint={summary.latest_backup ? formatBytes(summary.latest_backup.size_bytes) : 'Create one before large imports'}
            />
            <StatCard label="Backups kept" icon={<IconPackages size={16} />} value={formatNumber(summary.backups.length)} />
          </div>

          <Panel title="Database tools" description="Safe operations on the local SQLite file.">
            <div className="rt-grid rt-grid-tools">
              {TOOLS.map((tool) => (
                <button
                  key={tool.kind}
                  type="button"
                  className="rt-tool"
                  disabled={busy !== null}
                  onClick={() => void runTool(tool)}
                >
                  <span className="rt-tool-icon">{tool.icon}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="rt-tool-title">{busy === tool.kind ? `${tool.title}…` : tool.title}</span>
                    <span className="rt-tool-description" style={{ display: 'block' }}>
                      {tool.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          {lastResult ? <ResultPanel action={lastResult} /> : null}

          <div className="rt-grid rt-grid-2" style={{ alignItems: 'start' }}>
            <Panel title="Local checks" flush>
              <CheckList
                rows={summary.checks.map((check) => ({
                  name: check.name,
                  tone: checkTone(check.status),
                  message: check.message,
                }))}
              />
            </Panel>

            <Panel
              title="MEGAcmd"
              description={megaCheckedAt ? `Checked ${formatRelative(megaCheckedAt)}` : 'Not checked yet'}
              flush
              actions={
                <Button variant="default" size="xs" leftSection={<IconRefresh size={14} />} loading={busy === 'mega'} onClick={() => void checkMega()}>
                  Check now
                </Button>
              }
            >
              {megaError ? (
                <div style={{ padding: 16 }}>
                  <ErrorBlock message={megaError} />
                </div>
              ) : megaStatus ? (
                <CheckList rows={megaCommandRows(megaStatus, true)} />
              ) : (
                <EmptyState compact message="Query command availability and the login session. This runs MEGAcmd." />
              )}
            </Panel>
          </div>

          <Panel title="Paths" flush>
            <div style={{ padding: '4px 18px 8px' }}>
              <KeyValueRows
                rows={[
                  ['Database', <span className="rt-mono rt-wrap">{summary.database_path}</span>],
                  ['Backup folder', <span className="rt-mono rt-wrap">{summary.backup_dir}</span>],
                ]}
              />
            </div>
          </Panel>

          <Panel
            title={
              <Group gap={8}>
                <span>Backups</span>
                <Text span size="sm" c="dimmed" fw={500}>
                  {summary.backups.length}
                </Text>
              </Group>
            }
            flush
          >
            {summary.backups.length === 0 ? (
              <EmptyState compact message="No database backups have been created yet." icon={<IconDatabaseExport size={20} />} />
            ) : (
              <TableWrap>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>File</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Size</Table.Th>
                      <Table.Th>Created</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {summary.backups.map((backup) => (
                      <Table.Tr key={backup.path}>
                        <Table.Td className="rt-mono rt-wrap">{backup.path.replaceAll('\\', '/').split('/').pop()}</Table.Td>
                        <Table.Td className="rt-num">{formatBytes(backup.size_bytes)}</Table.Td>
                        <Table.Td className="rt-nowrap" title={formatDateTime(backup.created_at)}>
                          {formatRelative(backup.created_at)}
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>
                          <Button
                            component="a"
                            href={backupDownloadUrl(backup.path)}
                            download
                            variant="subtle"
                            size="compact-sm"
                            leftSection={<IconDownload size={14} />}
                          >
                            Download
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </TableWrap>
            )}
          </Panel>
        </>
      )}
    </Page>
  );
}
