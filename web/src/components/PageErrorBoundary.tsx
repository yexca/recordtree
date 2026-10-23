import { Button, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconReload } from '@tabler/icons-react';
import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Keeps a crashed page from blanking the whole shell. Chunk-load failures (a stale tab after the
 * WebUI was rebuilt) get a reload prompt; other errors can be retried in place.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const staleBuild = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);
    return (
      <Stack align="center" gap="sm" py={80} ta="center">
        <IconAlertTriangle size={32} style={{ color: 'var(--rt-status-warn)' }} />
        <Text fw={650}>{staleBuild ? 'A newer version of the WebUI is available' : 'This page failed to render'}</Text>
        <Text size="sm" c="dimmed" maw={440}>
          {staleBuild ? 'Reload to fetch the latest files.' : error.message}
        </Text>
        <Button
          leftSection={<IconReload size={16} />}
          onClick={() => (staleBuild ? window.location.reload() : this.setState({ error: null }))}
        >
          {staleBuild ? 'Reload' : 'Try again'}
        </Button>
      </Stack>
    );
  }
}
