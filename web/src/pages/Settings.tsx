import {
  ActionIcon,
  Alert,
  Button,
  Collapse,
  Group,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronDown,
  IconChevronRight,
  IconCloud,
  IconDeviceFloppy,
  IconFolder,
  IconLock,
  IconLogin,
  IconLogout,
  IconRefresh,
} from '@tabler/icons-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { MegaAccountStatus, SettingsPayload } from '../api/types';
import { KeyValueRows } from '../components/data';
import { ErrorBlock, LoadingBlock } from '../components/feedback';
import { Page, PageHeader, Panel } from '../components/layout';
import { CheckList, megaCommandRows } from '../components/MegaStatus';
import { StatusBadge } from '../components/StatusBadge';
import { errorMessage } from '../lib/format';
import { notifySuccess } from '../lib/notify';
import { useCachedState } from '../state/pageState';

const DEFAULT_TEMPLATE = '{actor_safe_name}/{record_group_id}';

const SAMPLE_VALUES: Record<string, string> = {
  actor_safe_name: 'API Actor',
  actor: 'API Actor',
  record_group_id: '123',
  source: 'niconico',
  source_key: 'sample-key',
  title_safe: 'Sample Title',
  title: 'Sample Title',
  delivery_date: '2026-01-02',
  entry_date: '2026-01-03',
};

function normalizeTemplate(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
}

interface DownloadForm {
  folderTemplate: string;
  minimumFreeSpaceGb: number | string;
  safetyMarginPercent: number | string;
  includePar2: boolean;
}

function formFromSettings(payload: SettingsPayload): DownloadForm {
  return {
    folderTemplate: payload.download.folder_template,
    minimumFreeSpaceGb: payload.download.minimum_free_space_mb / 1024,
    safetyMarginPercent: payload.download.safety_margin_percent,
    includePar2: payload.download.include_par2_by_default,
  };
}

function TemplatePreview({ root, template }: { root: string; template: string }) {
  const segments = normalizeTemplate(template || DEFAULT_TEMPLATE)
    .split('/')
    .filter(Boolean)
    .map((segment) => segment.replace(/\{(\w+)\}/g, (match, name: string) => SAMPLE_VALUES[name] ?? match));
  return (
    <div className="rt-path" aria-label="Example output folder">
      <span className="rt-path-root">{root || 'downloads'}</span>
      {segments.map((segment, index) => (
        <span key={index} style={{ display: 'contents' }}>
          <span className="rt-path-sep">/</span>
          <span className="rt-path-seg">{segment}</span>
        </span>
      ))}
    </div>
  );
}

function DownloadSettings() {
  const [settings, setSettings] = useCachedState<SettingsPayload | null>('settings.basic', null);
  const [form, setForm] = useState<DownloadForm | null>(() => (settings ? formFromSettings(settings) : null));
  const [loading, setLoading] = useState(settings === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (payload: SettingsPayload) => {
    setSettings(payload);
    setForm(formFromSettings(payload));
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      apply(await api.settings());
    } catch (err) {
      setError(errorMessage(err, 'Settings failed to load'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Always refresh on open; the cached copy renders immediately meanwhile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(() => {
    if (!settings || !form) return false;
    const saved = formFromSettings(settings);
    return (
      saved.folderTemplate !== form.folderTemplate ||
      Number(saved.minimumFreeSpaceGb) !== Number(form.minimumFreeSpaceGb) ||
      Number(saved.safetyMarginPercent) !== Number(form.safetyMarginPercent) ||
      saved.includePar2 !== form.includePar2
    );
  }, [settings, form]);

  if (!form) return error ? <ErrorBlock message={error} onRetry={() => void load()} /> : <LoadingBlock />;

  const update = <K extends keyof DownloadForm>(key: K, value: DownloadForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const insertVariable = (name: string) => {
    const token = `{${name}}`;
    update('folderTemplate', form.folderTemplate.trim() ? `${form.folderTemplate.replace(/\/?$/, '/')}${token}` : token);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      apply(
        await api.updateSettings({
          download: {
            folder_template: form.folderTemplate,
            safety_margin_percent: Number(form.safetyMarginPercent) || 0,
            minimum_free_space_mb: Math.round((Number(form.minimumFreeSpaceGb) || 0) * 1024),
            include_par2_by_default: form.includePar2,
          },
        }),
      );
      notifySuccess('Settings saved.');
    } catch (err) {
      setError(errorMessage(err, 'Settings save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        {error ? <ErrorBlock message={error} /> : null}

        <Panel
          title="Download folders"
          description="Where new downloads are written."
          actions={
            <Tooltip label="Reload from server">
              <ActionIcon variant="subtle" color="gray" loading={loading} onClick={() => void load()} aria-label="Reload settings">
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          }
        >
          <Stack gap="md">
            <Group gap={10} wrap="nowrap" align="flex-start">
              <IconLock size={16} style={{ marginTop: 3, color: 'var(--rt-ink-3)', flex: '0 0 auto' }} />
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600}>
                  Download root
                </Text>
                <Text size="sm" className="rt-mono rt-wrap">
                  {settings?.paths.downloads || 'downloads'}
                </Text>
                <Text size="xs" c="dimmed">
                  Fixed to the downloads mount so finished files stay synced to the host.
                </Text>
              </div>
            </Group>
            <TextInput
              label="Folder template"
              description="Relative to the download root. Leading and trailing slashes are trimmed on save."
              leftSection={<IconFolder size={16} />}
              value={form.folderTemplate}
              onChange={(event) => update('folderTemplate', event.currentTarget.value)}
              placeholder={DEFAULT_TEMPLATE}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
            />
            {settings ? (
              <div>
                <Text size="xs" c="dimmed" mb={6}>
                  Click a variable to append it
                </Text>
                <Group gap={6}>
                  {Object.entries(settings.variables).map(([name, help]) => (
                    <Tooltip key={name} label={help} multiline maw={260}>
                      <button type="button" className="rt-token" onClick={() => insertVariable(name)}>
                        {`{${name}}`}
                      </button>
                    </Tooltip>
                  ))}
                </Group>
              </div>
            ) : null}
            <div>
              <Text size="xs" c="dimmed" mb={6}>
                Example
              </Text>
              <TemplatePreview root={settings?.paths.downloads ?? ''} template={form.folderTemplate} />
            </div>
          </Stack>
        </Panel>

        <Panel title="Disk space" description="Checked before every download starts.">
          <div className="rt-grid rt-grid-2" style={{ gap: 14 }}>
            <NumberInput
              label="Minimum free space"
              description="Keep at least this much free after the selected files are added."
              suffix=" GB"
              min={0}
              decimalScale={2}
              value={form.minimumFreeSpaceGb}
              onChange={(value) => update('minimumFreeSpaceGb', value)}
            />
            <NumberInput
              label="Safety margin"
              description="Extra buffer on top of the selected size for estimates and MEGAcmd temp files."
              suffix="%"
              min={0}
              value={form.safetyMarginPercent}
              onChange={(value) => update('safetyMarginPercent', value)}
            />
          </div>
        </Panel>

        <Panel title="Defaults">
          <Switch
            label="Include .par2 files by default"
            description="Pre-selects .par2 recovery files in new download plans."
            checked={form.includePar2}
            onChange={(event) => update('includePar2', event.currentTarget.checked)}
          />
        </Panel>

        <section className="rt-panel" style={{ position: 'sticky', bottom: 16, zIndex: 5 }}>
          <Group justify="space-between" p="sm" px="md">
            <Text size="sm" c={dirty ? undefined : 'dimmed'} fw={dirty ? 600 : 400}>
              {dirty ? 'You have unsaved changes' : 'All changes saved'}
            </Text>
            <Group gap="xs">
              <Button
                variant="default"
                type="button"
                disabled={!dirty}
                onClick={() => settings && setForm(formFromSettings(settings))}
              >
                Discard
              </Button>
              <Button type="submit" leftSection={<IconDeviceFloppy size={16} />} loading={saving} disabled={!dirty}>
                Save
              </Button>
            </Group>
          </Group>
        </section>
      </Stack>
    </form>
  );
}

function MegaSettings() {
  const [status, setStatus] = useCachedState<MegaAccountStatus | null>('settings.status', null);
  const [lastCheckedAt, setLastCheckedAt] = useCachedState<string | null>('settings.lastCheckedAt', null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [advancedOpen, { toggle: toggleAdvanced }] = useDisclosure(false);

  const run = async (action: () => Promise<MegaAccountStatus>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
      setLastCheckedAt(new Date().toLocaleString());
      if (success) notifySuccess(success);
      return true;
    } catch (err) {
      setError(errorMessage(err, 'MEGAcmd operation failed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await run(
      () => api.megaLogin({ email, password, auth_code: authCode.trim() || null }),
      'MEGAcmd login completed.',
    );
    if (ok) {
      setPassword('');
      setAuthCode('');
    }
  };

  const loggedIn = status?.login.logged_in ?? false;

  return (
    <Stack gap="md">
      <Panel
        title="Account"
        description={
          <>
            The session is stored by MEGAcmd, not in the RecordTree database.
            {lastCheckedAt ? ` Last synced ${lastCheckedAt}.` : ''}
          </>
        }
        actions={
          <Group gap="xs">
            {status ? (
              <StatusBadge value={loggedIn ? 'pass' : 'fail'} label={loggedIn ? 'Logged in' : 'Not logged in'} />
            ) : (
              <StatusBadge value="unknown" label="Not synced" />
            )}
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              loading={busy}
              onClick={() => void run(api.megaStatus)}
            >
              Sync status
            </Button>
          </Group>
        }
      >
        <Stack gap="md">
          {error ? (
            <Alert color="red" variant="light" title="MEGAcmd operation failed">
              {error}
            </Alert>
          ) : null}

          {!status ? (
            <Group gap="sm" wrap="nowrap">
              <IconCloud size={20} style={{ color: 'var(--rt-ink-3)', flex: '0 0 auto' }} />
              <Text size="sm" c="dimmed">
                Status is checked only on request because it calls MEGAcmd. Use <b>Sync status</b> to query the local
                session.
              </Text>
            </Group>
          ) : loggedIn ? (
            <Stack gap="md">
              <KeyValueRows
                rows={[
                  ['Account', <span className="rt-wrap">{status.login.message}</span>],
                  ['Persistent data', <span className="rt-mono rt-wrap">{status.persistence_dir}</span>],
                ]}
              />
              <Group justify="flex-end">
                <Button
                  variant="light"
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={() => void run(api.megaLogout, 'MEGAcmd logout completed.')}
                  disabled={!status.mega_logout.available}
                  loading={busy}
                >
                  Log out
                </Button>
              </Group>
            </Stack>
          ) : null}

          {status && !loggedIn ? (
            <form onSubmit={submitLogin}>
              <Stack gap="sm" maw={420}>
                <TextInput
                  label="Email"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  autoComplete="username"
                  required
                />
                <PasswordInput
                  label="Password"
                  description="Sent only to MEGAcmd for this login attempt."
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  autoComplete="current-password"
                  required
                />
                <TextInput
                  label="Two-factor code"
                  placeholder="Optional"
                  value={authCode}
                  onChange={(event) => setAuthCode(event.currentTarget.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <Group>
                  <Button
                    type="submit"
                    leftSection={<IconLogin size={16} />}
                    disabled={!status.mega_login.available || busy}
                    loading={busy}
                  >
                    Log in
                  </Button>
                </Group>
              </Stack>
            </form>
          ) : null}
        </Stack>
      </Panel>

      <Panel
        title="Advanced"
        description="MEGAcmd executables and container persistence."
        flush
        actions={
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={advancedOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            onClick={toggleAdvanced}
            disabled={!status}
          >
            {advancedOpen ? 'Hide' : 'Show'}
          </Button>
        }
      >
        <Collapse in={advancedOpen && Boolean(status)}>
          {status ? (
            <>
              <div style={{ padding: '4px 18px 0' }}>
                <KeyValueRows
                  rows={[
                    ['Home', <span className="rt-mono rt-wrap">{status.home_dir}</span>],
                    ['Persistent data', <span className="rt-mono rt-wrap">{status.persistence_dir}</span>],
                  ]}
                />
              </div>
              <div style={{ borderTop: '1px solid var(--rt-border)' }}>
                <CheckList rows={megaCommandRows(status)} />
              </div>
            </>
          ) : null}
        </Collapse>
      </Panel>
    </Stack>
  );
}

export default function Settings({
  section,
  onSectionChange,
}: {
  section?: string;
  onSectionChange: (section: string) => void;
}) {
  const tab = section === 'mega' ? 'mega' : 'downloads';
  return (
    <Page className="rt-settings">
      <PageHeader eyebrow="System" title="Settings" description="Download defaults and the MEGAcmd connection." />
      <Tabs value={tab} onChange={(value) => onSectionChange(value ?? 'downloads')} variant="pills" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="downloads" leftSection={<IconFolder size={16} />}>
            Downloads
          </Tabs.Tab>
          <Tabs.Tab value="mega" leftSection={<IconCloud size={16} />}>
            MEGAcmd
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="downloads">
          <DownloadSettings />
        </Tabs.Panel>
        <Tabs.Panel value="mega">
          <MegaSettings />
        </Tabs.Panel>
      </Tabs>
    </Page>
  );
}
