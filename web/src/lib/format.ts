const numberFormat = new Intl.NumberFormat();

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (value === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount.toFixed(amount >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return numberFormat.format(value);
}

export function formatText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const text = String(value);
  return text.trim() ? text : '-';
}

export function formatPercent(part: number, total: number): string {
  if (!total) return '0%';
  const value = (part / total) * 100;
  return `${value >= 10 || value === 0 ? Math.round(value) : value.toFixed(1)}%`;
}

function parseDate(value: string): Date | null {
  const normalized = /^\d{4}-\d{2}-\d{2} \d/.test(value) ? value.replace(' ', 'T') : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Compact local timestamp: `2026-01-02 13:45`. Falls back to the raw text. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = parseDate(value);
  if (!date) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** Human relative time such as `5 min ago`; falls back to the timestamp for older values. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return '-';
  const date = parseDate(value);
  if (!date) return value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return formatDateTime(value);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDateTime(value);
}

export function previewUrl(value: string, edge = 28): string {
  if (value.length <= edge * 2 + 3) {
    return value;
  }
  return `${value.slice(0, edge)}...${value.slice(-edge)}`;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^[\p{L}\p{N}]/u.test(words[1])) {
    return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
  }
  return Array.from(trimmed).slice(0, /^[\x00-\x7F]/.test(trimmed) ? 2 : 1).join('').toUpperCase();
}

const AVATAR_HUES = [340, 320, 296, 272, 12, 28, 352, 250];

/** Stable, name-derived avatar colors that read in both color schemes. */
export function avatarColors(seed: string | number): { background: string; color: string } {
  const text = String(seed);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length];
  return {
    background: `hsl(${hue} 72% 62% / 0.17)`,
    color: `hsl(${hue} 50% 52%)`,
  };
}

export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
