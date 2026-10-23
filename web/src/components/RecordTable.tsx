import { Table, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { RecordSort, RecordSummary } from '../api/types';
import { formatBytes, formatText } from '../lib/format';
import { RecordProgress, TableWrap } from './data';

type SortField = 'id' | 'title' | 'delivered' | 'size';

/** First click on a column sorts in its natural direction: newest, largest, highest ID, A–Z. */
const FIRST_DIRECTION: Record<SortField, 'asc' | 'desc'> = {
  id: 'desc',
  title: 'asc',
  delivered: 'desc',
  size: 'desc',
};

function SortHeader({
  field,
  sort,
  onSortChange,
  align,
  className,
  children,
}: {
  field: SortField;
  sort?: RecordSort;
  onSortChange?: (sort: RecordSort) => void;
  align?: 'right';
  className?: string;
  children: ReactNode;
}) {
  if (!onSortChange) {
    return (
      <Table.Th className={className} style={align ? { textAlign: align } : undefined}>
        {children}
      </Table.Th>
    );
  }
  const [activeField, direction] = (sort ?? 'delivered_desc').split('_') as [SortField, 'asc' | 'desc'];
  const active = activeField === field;
  const next = active ? (direction === 'asc' ? 'desc' : 'asc') : FIRST_DIRECTION[field];
  const Icon = !active ? IconArrowsSort : direction === 'asc' ? IconArrowUp : IconArrowDown;
  return (
    <Table.Th
      className={className}
      style={align ? { textAlign: align } : undefined}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <UnstyledButton
        className="rt-sort"
        data-active={active || undefined}
        data-align={align}
        onClick={() => onSortChange(`${field}_${next}` as RecordSort)}
      >
        {children}
        <Icon size={13} stroke={1.8} />
      </UnstyledButton>
    </Table.Th>
  );
}

export function RecordTable({
  records,
  onOpen,
  hide = [],
  selectedId,
  sort,
  onSortChange,
}: {
  records: RecordSummary[];
  onOpen: (recordId: number) => void;
  /** Context columns that are redundant on the current page, e.g. actor on an actor page. */
  hide?: ('actor' | 'source')[];
  /** Row highlighted as open in a detail view. */
  selectedId?: number | null;
  /** Server-side sort; column headers become sort toggles when `onSortChange` is given. */
  sort?: RecordSort;
  onSortChange?: (sort: RecordSort) => void;
}) {
  const showActor = !hide.includes('actor');
  const showSource = !hide.includes('source');
  const sortProps = { sort, onSortChange };
  return (
    <TableWrap>
      <Table stickyHeader>
        <Table.Thead>
          <Table.Tr>
            <SortHeader field="id" {...sortProps}>
              ID
            </SortHeader>
            <SortHeader field="title" {...sortProps}>
              Record
            </SortHeader>
            <SortHeader field="delivered" className="rt-col-optional" {...sortProps}>
              Delivered
            </SortHeader>
            <Table.Th>Progress</Table.Th>
            <SortHeader field="size" align="right" className="rt-col-wide" {...sortProps}>
              Size
            </SortHeader>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {records.map((record) => {
            const context = [showActor ? record.actor : null, showSource ? record.source : null]
              .filter((value): value is string => Boolean(value && value.trim()))
              .join(' · ');
            return (
              <Table.Tr
                key={record.id}
                data-clickable="true"
                data-selected={selectedId === record.id || undefined}
                aria-selected={selectedId === record.id}
                tabIndex={0}
                onClick={() => onOpen(record.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpen(record.id);
                }}
              >
                <Table.Td className="rt-id">{record.id}</Table.Td>
                <Table.Td className="rt-cell-title">
                  <span className="rt-record-title rt-truncate" title={record.title}>
                    {record.title}
                  </span>
                  {context ? (
                    <span className="rt-record-sub rt-truncate" title={context}>
                      {context}
                    </span>
                  ) : null}
                </Table.Td>
                <Table.Td className="rt-nowrap rt-col-optional">{formatText(record.delivery_date)}</Table.Td>
                <Table.Td>
                  <RecordProgress
                    completed={record.completed_links}
                    total={record.active_links}
                    status={record.downloaded}
                  />
                </Table.Td>
                <Table.Td className="rt-num rt-col-wide">{formatBytes(record.size_bytes)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </TableWrap>
  );
}
