import { ActionIcon, Checkbox, Chip, CopyButton, Group, Table, Text, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import type { LinkSummary } from '../api/types';
import { linkTypeKey, type LinkSelection } from '../hooks/useLinkSelection';
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
            onClick={(event) => {
              // The row toggles its checkbox on click; copying should not.
              event.stopPropagation();
              copy();
            }}
            aria-label="Copy URL"
          >
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

/** Quick filters that check matching links: not downloaded ones, and each file type in the record. */
function LinkQuickFilters({ links, selection }: { links: LinkSummary[]; selection: LinkSelection }) {
  const types = new Map<string, number>();
  for (const link of links) types.set(linkTypeKey(link), (types.get(linkTypeKey(link)) ?? 0) + 1);
  const notDownloaded = links.filter((link) => link.status !== 'completed').length;
  return (
    <div className="rt-link-filters" role="group" aria-label="Quick filters">
      <Chip
        size="xs"
        variant="light"
        checked={selection.filter.notDownloaded}
        onChange={selection.setNotDownloaded}
      >
        Not downloaded <span className="rt-link-filter-count">{notDownloaded}</span>
      </Chip>
      <span className="rt-link-filters-divider" aria-hidden="true" />
      {[...types].map(([type, count]) => (
        <Chip
          key={type}
          size="xs"
          variant="light"
          checked={!selection.filter.excludedTypes.includes(type)}
          onChange={() => selection.toggleType(type)}
        >
          {formatText(type)} <span className="rt-link-filter-count">{count}</span>
        </Chip>
      ))}
    </div>
  );
}

/**
 * Active links of a record with a checkbox each; the quick filters above the table set which are
 * checked. `compact` drops the file name and URL preview and shows status as an icon, so the table
 * fits a narrow detail drawer without horizontal scrolling; the file name stays available as the
 * type's tooltip.
 */
export function RecordLinks({
  links,
  selection,
  compact = false,
}: {
  links: LinkSummary[];
  selection: LinkSelection;
  compact?: boolean;
}) {
  const selectedCount = links.filter((link) => selection.selected.has(link.id)).length;
  return (
    <>
      <LinkQuickFilters links={links} selection={selection} />
      <TableWrap>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 1 }}>
                <Checkbox
                  size="xs"
                  aria-label="Select all links"
                  checked={links.length > 0 && selectedCount === links.length}
                  indeterminate={selectedCount > 0 && selectedCount < links.length}
                  onChange={(event) => selection.setAll(event.currentTarget.checked)}
                />
              </Table.Th>
              <Table.Th>#</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>Size</Table.Th>
              <Table.Th>Status</Table.Th>
              {compact ? null : <Table.Th>File</Table.Th>}
              <Table.Th>{compact ? '' : 'URL'}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {links.map((link) => {
              const checked = selection.selected.has(link.id);
              return (
                <Table.Tr
                  key={link.id}
                  data-clickable="true"
                  data-selected={checked || undefined}
                  onClick={() => selection.toggleLink(link.id)}
                >
                  <Table.Td>
                    <Checkbox
                      size="xs"
                      aria-label={`Select link ${link.link_order}`}
                      checked={checked}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => selection.toggleLink(link.id)}
                    />
                  </Table.Td>
                  <Table.Td className="rt-id">{link.link_order}</Table.Td>
                  <Table.Td className="rt-nowrap" title={link.file_name ?? undefined}>
                    {formatText(link.file_type)}
                  </Table.Td>
                  <Table.Td className="rt-num">{link.formatted_size || formatBytes(link.size_bytes)}</Table.Td>
                  <Table.Td className="rt-cell-status">
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
              );
            })}
          </Table.Tbody>
        </Table>
      </TableWrap>
    </>
  );
}
