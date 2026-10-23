import { Group, Pagination, Select } from '@mantine/core';
import { formatNumber } from '../lib/format';

const DEFAULT_SIZES = [10, 25, 50, 100];

export function Pager({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_SIZES,
  disabled = false,
  compact = false,
  noun = 'items',
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizes?: number[];
  disabled?: boolean;
  compact?: boolean;
  noun?: string;
}) {
  const pages = Math.max(1, totalPages ?? Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  const sizes = pageSizes.includes(pageSize) ? pageSizes : [...pageSizes, pageSize].sort((a, b) => a - b);

  return (
    <div className="rt-pager">
      <span className="rt-pager-info">
        {total === 0 ? `No ${noun}` : `${formatNumber(start)}–${formatNumber(end)} of ${formatNumber(total)} ${noun}`}
      </span>
      <Group gap="xs" wrap="nowrap">
        {onPageSizeChange ? (
          <Select
            aria-label="Rows per page"
            className="rt-pager-size"
            size="xs"
            value={String(pageSize)}
            allowDeselect={false}
            data={sizes.map((size) => ({ value: String(size), label: `${size} / page` }))}
            onChange={(value) => onPageSizeChange(Number(value) || pageSize)}
            comboboxProps={{ withinPortal: true }}
          />
        ) : null}
        <Pagination
          value={safePage}
          total={pages}
          onChange={onPageChange}
          disabled={disabled || pages <= 1}
          size={compact ? 'xs' : 'sm'}
          siblings={compact ? 0 : 1}
          boundaries={1}
        />
      </Group>
    </div>
  );
}
