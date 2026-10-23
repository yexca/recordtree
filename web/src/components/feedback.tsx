import { Alert, Button, Loader, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  icon,
  action,
  compact = false,
}: {
  title?: string;
  message: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Stack align="center" gap={6} py={compact ? 'md' : 36} px="md" ta="center">
      <div className="rt-activity-icon" style={{ width: 40, height: 40, borderRadius: 10 }}>
        {icon ?? <IconInbox size={20} />}
      </div>
      {title ? (
        <Text fw={650} size="sm">
          {title}
        </Text>
      ) : null}
      <Text size="sm" c="dimmed" maw={420}>
        {message}
      </Text>
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </Stack>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <Stack align="center" gap={8} py={36}>
      <Loader size="sm" type="dots" />
      {label ? (
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      ) : null}
    </Stack>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} radius="md">
      <Stack gap={8} align="flex-start">
        <Text size="sm">{message}</Text>
        {onRetry ? (
          <Button size="compact-xs" variant="white" color="red" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </Stack>
    </Alert>
  );
}
