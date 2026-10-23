import { ActionIcon, Collapse, Loader, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowsMaximize,
  IconBuildingBroadcastTower,
  IconCalendar,
  IconChevronDown,
  IconChevronRight,
  IconDatabase,
  IconUser,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { RecordDetail } from '../api/types';
import { recordHref } from '../app/routes';
import { errorMessage, formatBytes, formatNumber, formatText } from '../lib/format';
import { KeyValue, RecordProgress } from './data';
import { DownloadPlanner } from './DownloadPlanner';
import { EmptyState, ErrorBlock, LoadingBlock } from './feedback';
import { RecordLinks } from './RecordLinks';
import { DownloadedBadge } from './StatusBadge';

export type RecordFilterField = 'actor' | 'platform';

function MetaFilter({
  icon,
  value,
  label,
  onClick,
}: {
  icon: ReactNode;
  value: string | null;
  label: string;
  onClick: () => void;
}) {
  if (!value?.trim()) {
    return (
      <span className="rt-meta-chip">
        {icon}-
      </span>
    );
  }
  return (
    <Tooltip label={`Show all records ${label}`}>
      <UnstyledButton className="rt-meta-chip" data-link="true" onClick={onClick}>
        {icon}
        {value}
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * Record details beside the records list: summary, links, download planner, and secondary metadata.
 * Keeps showing the previous record while the next one loads so switching rows does not flash.
 */
export function RecordDrawer({
  recordId,
  onClose,
  onFilter,
  onChanged,
}: {
  recordId: number;
  onClose: () => void;
  onFilter: (field: RecordFilterField, value: string) => void;
  /** Called after a download finishes so the list can refresh its progress. */
  onChanged: () => void;
}) {
  const [record, setRecord] = useState<RecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, { toggle: toggleMore }] = useDisclosure(false);
  const requestId = useRef(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const next = await api.record(String(recordId));
      if (id === requestId.current) setRecord(next);
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    void load();
    bodyRef.current?.scrollTo({ top: 0 });
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Leave Escape to an open dialog or dropdown first.
      // Mantine keeps some closed dropdowns mounted but hidden, so check visibility.
      const overlayOpen = [...document.querySelectorAll('.mantine-Modal-content, .mantine-Popover-dropdown')].some(
        (element) => element.getClientRects().length > 0,
      );
      if (event.key === 'Escape' && !overlayOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);


  return (
    <aside className="rt-drawer" aria-label="Record details">
      <div className="rt-drawer-head">
        <div className="rt-drawer-eyebrow">
          <span>Record #{recordId}</span>
          {record && record.id === recordId ? <DownloadedBadge value={record.downloaded} /> : null}
          {loading && record ? <Loader size={12} /> : null}
        </div>
        <div className="rt-drawer-actions">
          <Tooltip label="Open full page">
            <ActionIcon
              component="a"
              href={`#${recordHref(recordId)}`}
              variant="subtle"
              color="gray"
              aria-label="Open full page"
            >
              <IconArrowsMaximize size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Close (Esc)">
            <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close details">
              <IconX size={18} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>

      <div className="rt-drawer-body" ref={bodyRef}>
        {error ? (
          <div className="rt-drawer-section">
            <ErrorBlock message={error} onRetry={() => void load()} />
          </div>
        ) : !record ? (
          <LoadingBlock label="Loading record…" />
        ) : (
          <div style={{ opacity: record.id === recordId ? 1 : 0.55, transition: 'opacity 120ms ease' }}>
            <div className="rt-drawer-section">
              <h2 className="rt-drawer-title">{record.title}</h2>
              <div className="rt-meta-chips">
                <MetaFilter
                  icon={<IconUser size={14} />}
                  value={record.actor}
                  label="by this actor"
                  onClick={() => onFilter('actor', record.actor)}
                />
                <MetaFilter
                  icon={<IconBuildingBroadcastTower size={14} />}
                  value={record.source}
                  label="on this platform"
                  onClick={() => onFilter('platform', record.source)}
                />
                <span className="rt-meta-chip">
                  <IconCalendar size={14} />
                  {formatText(record.delivery_date)}
                </span>
                <span className="rt-meta-chip">
                  <IconDatabase size={14} />
                  {record.size_raw || formatBytes(record.size_bytes)}
                </span>
              </div>
              <div className="rt-drawer-progress">
                <RecordProgress
                  completed={record.completed_links}
                  total={record.active_links}
                  status={record.downloaded}
                />
                <span>
                  {record.active_links
                    ? `${formatNumber(record.completed_links)} of ${formatNumber(record.active_links)} links downloaded`
                    : 'No active links'}
                  {record.inactive_link_count ? ` · ${record.inactive_link_count} inactive` : ''}
                </span>
              </div>
            </div>

            <div className="rt-drawer-section" data-flush="true">
              <div className="rt-drawer-section-title">
                Links <span className="rt-muted">{record.links.length}</span>
              </div>
              {record.links.length === 0 ? (
                <EmptyState compact message="This record has no active links." />
              ) : (
                <RecordLinks links={record.links} compact />
              )}
            </div>

            <div className="rt-drawer-section rt-drawer-planner">
              <DownloadPlanner
                key={record.id}
                idOrKey={String(record.id)}
                onFinished={() => {
                  void load();
                  onChanged();
                }}
              />
            </div>

            <div className="rt-drawer-section">
              <UnstyledButton className="rt-drawer-more" onClick={toggleMore} aria-expanded={moreOpen}>
                {moreOpen ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                More info
              </UnstyledButton>
              <Collapse in={moreOpen}>
                <div style={{ paddingTop: 12 }}>
                  <KeyValue
                    columns={1}
                    items={[
                      { label: 'Entry date', value: formatText(record.entry_date) },
                      { label: 'Upload title', value: formatText(record.upload_title) },
                      { label: 'Source key', value: record.source_key, mono: true },
                      { label: 'Note', value: formatText(record.note) },
                    ]}
                  />
                </div>
              </Collapse>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
