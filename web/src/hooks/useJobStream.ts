import { Dispatch, SetStateAction, useEffect } from 'react';
import { api } from '../api/client';
import type { Job, JobEvent, JobStatus } from '../api/types';
import { errorMessage } from '../lib/format';

const STREAM_EVENT_TYPES = ['queued', 'running', 'progress', 'output', 'completed', 'failed'];
const POLL_INTERVAL_MS = 1500;

export function isTerminal(status: JobStatus | string | undefined): boolean {
  return status === 'completed' || status === 'failed';
}

export function jobOutput(job: Job | null | undefined): string {
  if (!job) return '';
  return job.events
    .filter((event) => event.type === 'output')
    .map((event) => String(event.data.chunk ?? ''))
    .join('');
}

export function mergeJobEvent<T extends Job>(job: T, event: JobEvent): T {
  if (job.events.some((item) => item.index === event.index)) return job;
  const data = event.data ?? {};
  return {
    ...job,
    events: [...job.events, event].sort((a, b) => a.index - b.index),
    progress: event.type === 'progress' ? (data as unknown as Job['progress']) : job.progress,
    status:
      event.type === 'completed'
        ? 'completed'
        : event.type === 'failed'
          ? 'failed'
          : event.type === 'running' && job.status === 'queued'
            ? 'running'
            : job.status,
    result: event.type === 'completed' || event.type === 'failed' ? ((data.result as T['result']) ?? job.result) : job.result,
    error: event.type === 'failed' ? String(data.error ?? 'Job failed') : job.error,
  };
}

/**
 * Keeps a job up to date while it runs: server-sent events deliver output immediately and a slow poll
 * reconciles the full job state (and covers proxies that buffer or drop the event stream).
 */
export function useJobStream<T extends Job>(job: T | null, setJob: Dispatch<SetStateAction<T | null>>) {
  const jobId = job?.id ?? null;
  const active = job ? !isTerminal(job.status) : false;

  useEffect(() => {
    if (!jobId || !active) return;
    let cancelled = false;
    let timer: number | undefined;
    const update = (apply: (current: T) => T) =>
      setJob((current) => (current && current.id === jobId ? apply(current) : current));

    const after = job?.events.at(-1)?.index ?? 0;
    const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events?after=${after}`);
    const handleEvent = (message: MessageEvent) => {
      try {
        const payload = JSON.parse(message.data) as JobEvent;
        if (!cancelled) update((current) => mergeJobEvent(current, payload));
      } catch {
        // Unparseable frames are ignored; polling reconciles state.
      }
    };
    source.onmessage = handleEvent;
    for (const type of STREAM_EVENT_TYPES) source.addEventListener(type, handleEvent);
    source.onerror = () => source.close();

    const poll = async () => {
      try {
        const next = (await api.job(jobId)) as T;
        if (cancelled) return;
        update(() => next);
        if (isTerminal(next.status)) {
          source.close();
          return;
        }
      } catch (error) {
        if (cancelled) return;
        update((current) => ({ ...current, status: 'failed', error: errorMessage(error, 'Job is no longer available') }));
        source.close();
        return;
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(poll, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      source.close();
    };
    // The stream is keyed by job identity and liveness; event merges must not reconnect it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, active]);
}
