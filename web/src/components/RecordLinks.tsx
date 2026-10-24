import { ActionIcon, CopyButton, Group, Table, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import type { LinkSummary } from '../api/types';
import { formatBytes, formatText, previewUrl } from '../lib/format';
import { TableWrap } from './data';
import { humanize, StatusBadge, statusTone, ToneIcon } from './StatusBadge';

function CopyUrl({ url }: { url: string }) {
  return (
    <CopyButton value={url} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Copied' : 'Copy URL'}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color={copied ? 'green' : 'gray'}
            onClick={copy}
            aria-label="Copy URL"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/**
 * Active links of a record. `compact` drops the file name and URL preview and shows status as
 * an icon, so the table fits a narrow detail drawer without horizontal scrolling; the file name
 * stays available as the type's tooltip.
 */
export function RecordLinks({ links, compact = false }: { links: LinkSummary[]; compact?: boolean }) {
  return (
    <TableWrap>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Size</Table.Th>
            <Table.Th>Status</Table.Th>
            {compact ? null : <Table.Th>File</Table.Th>}
            <Table.Th>{compact ? '' : 'URL'}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {links.map((link) => (
            <Table.Tr key={link.id}>
              <Table.Td className="rt-id">{link.link_order}</Table.Td>
              <Table.Td className="rt-nowrap" title={link.file_name ?? undefined}>
                {formatText(link.file_type)}
              </Table.Td>
              <Table.Td className="rt-num">{link.formatted_size || formatBytes(link.size_bytes)}</Table.Td>
              <Table.Td>
                {compact ? (
                  <span className="rt-link-status">
                    <ToneIcon tone={statusTone(link.status)} size={15} />
                    {link.status === 'none' ? 'Not downloaded' : humanize(link.status)}
                  </span>
                ) : (
                  <StatusBadge value={link.status} />
                )}
              </Table.Td>
              {compact ? null : (
                <Table.Td className="rt-cell-medium">
                  <Text size="xs" className="rt-truncate" title={link.file_name ?? undefined}>
                    {formatText(link.file_name)}
                  </Text>
                </Table.Td>
              )}
              <Table.Td style={compact ? { width: 1 } : undefined}>
                {compact ? (
                  <CopyUrl url={link.mega_url} />
                ) : (
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" className="rt-mono rt-nowrap" title={link.mega_url}>
                      {previewUrl(link.mega_url, 22)}
                    </Text>
                    <CopyUrl url={link.mega_url} />
                  </Group>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </TableWrap>
  );
}
