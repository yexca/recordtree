import { Table } from '@mantine/core';
import type { RecordSummary } from '../api/types';
import { formatBytes, formatText } from '../lib/format';
import { LinkProgress, TableWrap } from './data';
import { DownloadedBadge } from './StatusBadge';

export function RecordTable({
  records,
  onOpen,
  hide = [],
}: {
  records: RecordSummary[];
  onOpen: (recordId: number) => void;
  /** Context columns that are redundant on the current page, e.g. actor on an actor page. */
  hide?: ('actor' | 'source')[];
}) {
  const showActor = !hide.includes('actor');
  const showSource = !hide.includes('source');
  return (
    <TableWrap>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>ID</Table.Th>
            <Table.Th>Record</Table.Th>
            <Table.Th className="rt-col-optional">Delivered</Table.Th>
            <Table.Th>Links</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Size</Table.Th>
            <Table.Th>Status</Table.Th>
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
                  <LinkProgress completed={record.completed_links} total={record.active_links} />
                </Table.Td>
                <Table.Td className="rt-num">{formatBytes(record.size_bytes)}</Table.Td>
                <Table.Td>
                  <DownloadedBadge value={record.downloaded} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </TableWrap>
  );
}
