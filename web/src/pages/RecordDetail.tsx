import { Group } from '@mantine/core';
import { IconBuildingBroadcastTower, IconCalendar, IconDatabase, IconUser } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { RecordDetail as RecordDetailType } from '../api/types';
import { KeyValue, LinkProgress } from '../components/data';
import { DownloadPlanner } from '../components/DownloadPlanner';
import { EmptyState, ErrorBlock, LoadingBlock } from '../components/feedback';
import { Page, PageHeader, Panel } from '../components/layout';
import { RecordLinks } from '../components/RecordLinks';
import { DownloadedBadge } from '../components/StatusBadge';
import { errorMessage, formatBytes, formatText } from '../lib/format';

export default function RecordDetail({
  idOrKey,
  onBack,
  backLabel = 'Back',
}: {
  idOrKey: string;
  onBack: () => void;
  backLabel?: string;
}) {
  const [record, setRecord] = useState<RecordDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError(null);
      try {
        setRecord(await api.record(idOrKey));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [idOrKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refreshQuietly = useCallback(() => void load(true), [load]);

  if (loading) return <LoadingBlock label="Loading record…" />;
  if (error || !record) {
    return (
      <Page>
        <PageHeader onBack={onBack} backLabel={backLabel} title="Record unavailable" />
        <ErrorBlock message={error ?? 'Record not found.'} onRetry={() => void load()} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        onBack={onBack}
        backLabel={backLabel}
        eyebrow={
          <Group gap={8} component="span">
            <span>Record #{record.id}</span>
            <DownloadedBadge value={record.downloaded} />
          </Group>
        }
        title={record.title}
        description={
          <div className="rt-meta-chips">
            <span className="rt-meta-chip">
              <IconUser size={14} />
              {formatText(record.actor)}
            </span>
            <span className="rt-meta-chip">
              <IconBuildingBroadcastTower size={14} />
              {formatText(record.source)}
            </span>
            <span className="rt-meta-chip">
              <IconCalendar size={14} />
              {formatText(record.delivery_date)}
            </span>
            <span className="rt-meta-chip">
              <IconDatabase size={14} />
              {record.size_raw || formatBytes(record.size_bytes)}
            </span>
          </div>
        }
      />

      <div className="rt-grid rt-grid-main-side">
        <div className="rt-grid">
          <Panel title="Details">
            <KeyValue
              items={[
                { label: 'Actor', value: formatText(record.actor) },
                { label: 'Platform', value: formatText(record.source) },
                { label: 'Delivery date', value: formatText(record.delivery_date) },
                { label: 'Entry date', value: formatText(record.entry_date) },
                { label: 'Size', value: record.size_raw || formatBytes(record.size_bytes) },
                {
                  label: 'Downloaded links',
                  value: <LinkProgress completed={record.completed_links} total={record.active_links} />,
                },
                { label: 'Inactive links', value: record.inactive_link_count },
                { label: 'Upload title', value: formatText(record.upload_title), full: true },
                { label: 'Source key', value: record.source_key, mono: true, full: true },
                { label: 'Note', value: formatText(record.note), full: true },
              ]}
            />
          </Panel>

          <Panel
            title="Active links"
            description={`${record.links.length} link${record.links.length === 1 ? '' : 's'}${
              record.inactive_link_count ? `, ${record.inactive_link_count} inactive not shown` : ''
            }`}
            flush
          >
            {record.links.length === 0 ? (
              <EmptyState compact message="This record has no active links." />
            ) : (
              <RecordLinks links={record.links} />
            )}
          </Panel>
        </div>

        <div className="rt-sticky">
          <DownloadPlanner idOrKey={String(record.id)} onFinished={refreshQuietly} />
        </div>
      </div>
    </Page>
  );
}
