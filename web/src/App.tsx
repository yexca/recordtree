import { ActionIcon, Loader, Tooltip, useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import { IconDeviceDesktop, IconHash, IconMenu2, IconMoon, IconSun, IconX } from '@tabler/icons-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActiveJobsProvider, useActiveJobs } from './app/ActiveJobs';
import { actorHref, NAV_GROUPS, parseHash, recordHref, type Route } from './app/routes';
import { Logo } from './components/Logo';
import { PageErrorBoundary } from './components/PageErrorBoundary';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Records = lazy(() => import('./pages/Records'));
const RecordDetail = lazy(() => import('./pages/RecordDetail'));
const Actors = lazy(() => import('./pages/Actors'));
const ActorDetail = lazy(() => import('./pages/ActorDetail'));
const Platforms = lazy(() => import('./pages/Platforms'));
const ImportPage = lazy(() => import('./pages/Import'));
const Downloads = lazy(() => import('./pages/Downloads'));
const Settings = lazy(() => import('./pages/Settings'));
const Maintenance = lazy(() => import('./pages/Maintenance'));

export type Navigate = (target: string, options?: { replace?: boolean }) => void;

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  const depth = useRef(0);

  useEffect(() => {
    const onChange = () => {
      depth.current += 1;
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  /** Pushes a history entry, or with `replace` rewrites the current one (e.g. while typing a filter). */
  const navigate = useCallback<Navigate>((target, options) => {
    const next = `#${target.startsWith('/') ? target : `/${target}`}`;
    if (window.location.hash === next) return;
    if (options?.replace) {
      window.history.replaceState(window.history.state, '', next);
      setHash(next);
    } else {
      window.location.hash = next;
    }
  }, []);

  /** Returns to the previous in-app view when there is one, otherwise to `fallback`. */
  const back = useCallback(
    (fallback: string) => {
      if (depth.current > 0) window.history.back();
      else navigate(fallback);
    },
    [navigate],
  );

  return { route: parseHash(hash), navigate, back };
}

function renderPage(route: Route, navigate: Navigate, back: (fallback: string) => void): ReactNode {
  const openRecord = (id: number | string) => navigate(recordHref(id));
  switch (route.name) {
    case 'records':
      return (
        <Records
          query={route.query}
          onQueryChange={(query, options) => navigate(query ? `/records?${query}` : '/records', options)}
        />
      );
    case 'record':
      return <RecordDetail key={route.recordId} idOrKey={route.recordId ?? ''} onBack={() => back('/records')} />;
    case 'actors':
      return (
        <Actors
          query={route.query}
          onQueryChange={(query, options) => navigate(query ? `/actors?${query}` : '/actors', options)}
        />
      );
    case 'actor': {
      const base = actorHref(route.actorId ?? 0);
      return (
        <ActorDetail
          key={route.actorId}
          actorId={route.actorId ?? 0}
          query={route.query}
          onQueryChange={(query, options) => navigate(query ? `${base}?${query}` : base, options)}
          onBack={() => back('/actors')}
          onActorFilter={(actor) => navigate(`/records?${new URLSearchParams({ actor })}`)}
        />
      );
    }
    case 'platforms':
      return <Platforms />;
    case 'import':
      return <ImportPage />;
    case 'downloads':
      return <Downloads onOpenRecord={openRecord} />;
    case 'settings':
      return <Settings section={route.section} onSectionChange={(section) => navigate(`/settings/${section}`)} />;
    case 'maintenance':
      return <Maintenance navigate={navigate} />;
    default:
      return <Dashboard navigate={navigate} onOpenRecord={openRecord} />;
  }
}

const SCHEMES: { value: MantineColorScheme; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Light', icon: <IconSun size={15} /> },
  { value: 'dark', label: 'Dark', icon: <IconMoon size={15} /> },
  { value: 'auto', label: 'System', icon: <IconDeviceDesktop size={15} /> },
];

function RecordJump({ navigate }: { navigate: Navigate }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      className="rt-jump"
      onSubmit={(event) => {
        event.preventDefault();
        const target = value.trim().replace(/^#/, '');
        if (!target) return;
        navigate(recordHref(target));
        setValue('');
        inputRef.current?.blur();
      }}
    >
      <IconHash size={14} />
      <input
        ref={inputRef}
        aria-label="Open record by ID or source key"
        placeholder="Open record ID / key"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <kbd>/</kbd>
    </form>
  );
}

function Sidebar({
  route,
  navigate,
  open,
  onClose,
}: {
  route: Route;
  navigate: Navigate;
  open: boolean;
  onClose: () => void;
}) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { downloads, imports } = useActiveJobs();
  const counts = { download: downloads.length, import: imports.length };

  return (
    <aside className="rt-sidebar" data-open={open || undefined} aria-label="Main navigation">
      <a className="rt-sidebar-brand" href="#/" onClick={onClose}>
        <Logo />
        <div>
          <div className="rt-sidebar-brand-name">RecordTree</div>
          <div className="rt-sidebar-brand-sub">Archive downloader</div>
        </div>
      </a>

      <nav className="rt-sidebar-scroll">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="rt-nav-group">
            <div className="rt-nav-label">{group.label}</div>
            {group.items.map((item) => {
              const active = route.name === item.route || Boolean(item.alsoActive?.includes(route.name));
              const count = item.jobs ? counts[item.jobs] : 0;
              const Icon = item.icon;
              return (
                <a
                  key={item.route}
                  className="rt-nav-item"
                  href={`#${item.href}`}
                  data-active={active || undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={onClose}
                >
                  <Icon size={18} stroke={1.7} />
                  <span className="rt-nav-item-label">{item.label}</span>
                  {count > 0 ? (
                    <Tooltip label={`${count} running`} position="right">
                      <span className="rt-nav-count" data-pulse="true">
                        {count}
                      </span>
                    </Tooltip>
                  ) : null}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="rt-sidebar-footer">
        <RecordJump
          navigate={(target) => {
            navigate(target);
            onClose();
          }}
        />
        <div className="rt-scheme" role="radiogroup" aria-label="Color scheme">
          {SCHEMES.map((scheme) => (
            <Tooltip key={scheme.value} label={scheme.label}>
              <button
                type="button"
                role="radio"
                aria-checked={colorScheme === scheme.value}
                aria-label={scheme.label}
                data-active={colorScheme === scheme.value || undefined}
                onClick={() => setColorScheme(scheme.value)}
              >
                {scheme.icon}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Shell() {
  const { route, navigate, back } = useHashRoute();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.name, route.recordId, route.actorId]);

  return (
    <div className="rt-shell">
      <Sidebar route={route} navigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen ? <div className="rt-backdrop" onClick={() => setMenuOpen(false)} /> : null}

      <div className="rt-main">
        <header className="rt-topbar">
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <IconX size={20} /> : <IconMenu2 size={20} />}
          </ActionIcon>
          <Logo size={24} />
          <strong className="rt-sidebar-brand-name" style={{ fontSize: 17 }}>
            RecordTree
          </strong>
        </header>
        <main className="rt-content">
          <PageErrorBoundary resetKey={`${route.name}/${route.recordId ?? route.actorId ?? ''}`}>
            <Suspense
              fallback={
                <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
                  <Loader size="sm" type="dots" />
                </div>
              }
            >
              {renderPage(route, navigate, back)}
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ActiveJobsProvider>
      <Shell />
    </ActiveJobsProvider>
  );
}
