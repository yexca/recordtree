import { Badge } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconCircleDashed, IconCircleX, IconLoader2 } from '@tabler/icons-react';
import type { CheckStatus, DownloadedStatus } from '../api/types';

export type Tone = 'good' | 'warn' | 'bad' | 'active' | 'neutral';

const toneColor: Record<Tone, string> = {
  good: 'green',
  warn: 'yellow',
  bad: 'red',
  active: 'brand',
  neutral: 'gray',
};

export const toneVar: Record<Tone, string> = {
  good: 'var(--rt-status-good)',
  warn: 'var(--rt-status-warn)',
  bad: 'var(--rt-status-bad)',
  active: 'var(--rt-accent)',
  neutral: 'var(--rt-status-none)',
};

export function statusTone(value: string): Tone {
  const text = value.toLowerCase();
  if (text.includes('fail') || text.includes('error')) return 'bad';
  if (text === 'running' || text === 'queued' || text.includes('progress') || text === 'downloading') return 'active';
  if (text.includes('partial') || text.includes('block') || text.includes('cancel') || text.includes('interrupt'))
    return 'warn';
  if (text === 'warn' || text.includes('skip')) return 'warn';
  if (text.includes('complete') || text === 'pass' || text === 'all' || text === 'ok' || text === 'success')
    return 'good';
  return 'neutral';
}

export function humanize(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '-';
}

export function ToneIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  const style = { color: toneVar[tone], flex: '0 0 auto' };
  if (tone === 'good') return <IconCircleCheck size={size} style={style} />;
  if (tone === 'warn') return <IconAlertTriangle size={size} style={style} />;
  if (tone === 'bad') return <IconCircleX size={size} style={style} />;
  if (tone === 'active') return <IconLoader2 size={size} style={style} />;
  return <IconCircleDashed size={size} style={style} />;
}

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const tone = statusTone(value);
  return (
    <Badge
      color={toneColor[tone]}
      size="sm"
      leftSection={<span className="rt-dot" style={{ background: toneVar[tone] }} />}
      styles={{ label: { textTransform: 'none', fontWeight: 600 } }}
    >
      {label ?? humanize(value)}
    </Badge>
  );
}

export const downloadedLabels: Record<DownloadedStatus, string> = {
  all: 'Complete',
  partial: 'Partial',
  none: 'Not downloaded',
  unknown: 'No links',
};

export const downloadedTone: Record<DownloadedStatus, Tone> = {
  all: 'good',
  partial: 'warn',
  none: 'neutral',
  unknown: 'bad',
};

export function DownloadedBadge({ value }: { value: DownloadedStatus }) {
  const tone = downloadedTone[value] ?? 'neutral';
  return (
    <Badge
      color={toneColor[tone]}
      size="sm"
      leftSection={<span className="rt-dot" style={{ background: toneVar[tone] }} />}
      styles={{ label: { textTransform: 'none', fontWeight: 600 } }}
    >
      {downloadedLabels[value] ?? value}
    </Badge>
  );
}

export function CheckBadge({ value }: { value: CheckStatus }) {
  return <StatusBadge value={value} label={value === 'pass' ? 'Pass' : value === 'warn' ? 'Warning' : 'Fail'} />;
}
