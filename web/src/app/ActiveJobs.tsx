import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Job } from '../api/types';

const BUSY_INTERVAL_MS = 2000;
const IDLE_INTERVAL_MS = 8000;

interface ActiveJobsValue {
  jobs: Job[];
  downloads: Job[];
  imports: Job[];
  /** Increments whenever a previously active job leaves the active list. */
  finishedTick: number;
  refresh: () => Promise<void>;
}

const ActiveJobsContext = createContext<ActiveJobsValue | null>(null);

/** Single app-wide poller for running jobs, shared by the sidebar badges and the Downloads page. */
export function ActiveJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [finishedTick, setFinishedTick] = useState(0);
  const previousIds = useRef<Set<string>>(new Set());
  const timer = useRef<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const next = await api.jobs({ active: true });
      const nextIds = new Set(next.map((job) => job.id));
      if ([...previousIds.current].some((id) => !nextIds.has(id))) setFinishedTick((tick) => tick + 1);
      previousIds.current = nextIds;
      setJobs(next);
    } catch {
      // Background polling stays quiet; pages surface their own request errors.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      if (!document.hidden) await refresh();
      if (cancelled) return;
      timer.current = window.setTimeout(loop, previousIds.current.size > 0 ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS);
    };
    void loop();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const value = useMemo<ActiveJobsValue>(
    () => ({
      jobs,
      downloads: jobs.filter((job) => job.kind === 'download'),
      imports: jobs.filter((job) => job.kind === 'import'),
      finishedTick,
      refresh,
    }),
    [jobs, finishedTick, refresh],
  );

  return <ActiveJobsContext.Provider value={value}>{children}</ActiveJobsContext.Provider>;
}

export function useActiveJobs(): ActiveJobsValue {
  const value = useContext(ActiveJobsContext);
  if (!value) throw new Error('useActiveJobs must be used inside ActiveJobsProvider');
  return value;
}
