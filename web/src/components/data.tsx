import { Skeleton, Tooltip } from '@mantine/core';
import type { ReactNode } from 'react';
import type { DownloadedStatus } from '../api/types';
import { formatNumber, formatPercent } from '../lib/format';
import { downloadedLabels, downloadedTone, toneVar } from './StatusBadge';

export function StatCard({
  label,
  value,
  hint,
  icon,
  loading = false,
  compact = false,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="rt-stat" data-compact={compact || undefined}>
      <div className="rt-stat-head">
        <span>{label}</span>
        {icon ? <span className="rt-stat-icon">{icon}</span> : null}
      </div>
      {loading ? <Skeleton height={compact ? 20 : 26} width="60%" radius="sm" /> : <div className="rt-stat-value">{value}</div>}
      {hint ? <div className="rt-stat-hint">{hint}</div> : null}
    </div>
  );
}

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  full?: boolean;
}

/** Responsive definition grid for record metadata and plan summaries. */
export function KeyValue({ items, columns }: { items: KeyValueItem[]; columns?: 1 | 2 }) {
  return (
    <dl className="rt-kv" data-columns={columns}>
      {items.map((item, index) => (
        <div key={index} className="rt-kv-item" data-span={item.full ? 'full' : undefined}>
          <dt>{item.label}</dt>
          <dd data-mono={item.mono || undefined}>{item.value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/value rows for paths and diagnostics. */
export function KeyValueRows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="rt-kv-rows">
      {rows.map(([label, value], index) => (
        <div key={index} className="rt-kv-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkProgress({ completed, total }: { completed: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, completed / total) : 0;
  return (
    <div className="rt-links" title={`${completed} of ${total} active links downloaded`}>
      <div className="rt-links-bar">
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="rt-links-text">
        {completed}/{total}
      </span>
    </div>
  );
}

/** Link progress whose bar color carries the record's download status, replacing a separate status badge. */
export function RecordProgress({
  completed,
  total,
  status,
}: {
  completed: number;
  total: number;
  status: DownloadedStatus;
}) {
  const label = downloadedLabels[status] ?? status;
  if (total === 0) {
    return (
      <span className="rt-progress-empty" title="No active links">
        {label}
      </span>
    );
  }
  const ratio = Math.min(1, completed / total);
  return (
    <div className="rt-links" title={`${label} · ${completed} of ${total} active links downloaded`}>
      <div className="rt-links-bar">
        <span style={{ width: `${ratio * 100}%`, background: toneVar[downloadedTone[status]] }} />
      </div>
      <span className="rt-links-text" data-status={status}>
        {completed}/{total}
      </span>
    </div>
  );
}

const COVERAGE_ORDER: DownloadedStatus[] = ['all', 'partial', 'none', 'unknown'];

/** Stacked status meter for record download coverage, with a labelled legend. */
export function CoverageMeter({
  counts,
  size = 'md',
  showLegend = true,
}: {
  counts: Record<DownloadedStatus, number>;
  size?: 'sm' | 'md';
  showLegend?: boolean;
}) {
  const total = COVERAGE_ORDER.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const segments = COVERAGE_ORDER.filter((key) => (counts[key] ?? 0) > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="rt-meter" data-size={size} role="img" aria-label="Download coverage">
        {total === 0 ? (
          <span className="rt-meter-empty" />
        ) : (
          segments.map((key) => (
            <Tooltip
              key={key}
              label={`${downloadedLabels[key]}: ${formatNumber(counts[key])} (${formatPercent(counts[key], total)})`}
            >
              <span style={{ flexGrow: counts[key], background: toneVar[downloadedTone[key]] }} />
            </Tooltip>
          ))
        )}
      </div>
      {showLegend ? (
        <div className="rt-legend">
          {COVERAGE_ORDER.map((key) => (
            <div key={key} className="rt-legend-item">
              <span className="rt-legend-swatch" style={{ background: toneVar[downloadedTone[key]] }} />
              <span>{downloadedLabels[key]}</span>
              <span className="rt-legend-value">{formatNumber(counts[key] ?? 0)}</span>
              <span className="rt-muted">{formatPercent(counts[key] ?? 0, total)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="rt-table-wrap">{children}</div>;
}
