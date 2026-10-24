import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { LinkSummary } from '../api/types';

/** Quick filters that set which links are checked; checking a link by hand leaves them as they are. */
export interface LinkFilter {
  notDownloaded: boolean;
  /** File types left unchecked; `''` stands for links without a type. */
  excludedTypes: string[];
}

export interface LinkSelection {
  filter: LinkFilter;
  selected: ReadonlySet<number>;
  /** Checked links in link order. */
  selectedLinks: LinkSummary[];
  setNotDownloaded: (value: boolean) => void;
  toggleType: (type: string) => void;
  toggleLink: (id: number) => void;
  setAll: (checked: boolean) => void;
}

interface SelectionState {
  filter: LinkFilter;
  selected: Set<number>;
}

export const linkTypeKey = (link: LinkSummary) => link.file_type ?? '';

function applyFilter(links: LinkSummary[], filter: LinkFilter): SelectionState {
  const selected = links.filter(
    (link) =>
      (!filter.notDownloaded || link.status !== 'completed') && !filter.excludedTypes.includes(linkTypeKey(link)),
  );
  return { filter, selected: new Set(selected.map((link) => link.id)) };
}

function defaultState(links: LinkSummary[], includePar2: boolean): SelectionState {
  return applyFilter(links, { notDownloaded: true, excludedTypes: includePar2 ? [] : ['.par2'] });
}

/**
 * Checkbox state for a record's links. It starts from the not-downloaded links, leaving out `.par2`
 * unless Settings includes it by default, and starts over whenever `links` changes, such as after a
 * download finishes and the record reloads.
 */
export function useLinkSelection(links: LinkSummary[]): LinkSelection {
  const [includePar2, setIncludePar2] = useState(false);
  const [state, setState] = useState(() => defaultState(links, false));
  const touched = useRef(false);
  const seenLinks = useRef(links);

  useEffect(() => {
    let active = true;
    api
      .settings()
      .then((settings) => {
        if (active) setIncludePar2(settings.download.include_par2_by_default);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const linksChanged = seenLinks.current !== links;
    seenLinks.current = links;
    // The .par2 default can arrive after the user already changed the selection; keep theirs.
    if (!linksChanged && touched.current) return;
    touched.current = false;
    setState(defaultState(links, includePar2));
  }, [links, includePar2]);

  const update = (next: (current: SelectionState) => SelectionState) => {
    touched.current = true;
    setState(next);
  };

  const selectedLinks = useMemo(() => links.filter((link) => state.selected.has(link.id)), [links, state.selected]);

  return {
    filter: state.filter,
    selected: state.selected,
    selectedLinks,
    setNotDownloaded: (value) => update((current) => applyFilter(links, { ...current.filter, notDownloaded: value })),
    toggleType: (type) =>
      update((current) => {
        const excluded = current.filter.excludedTypes;
        const excludedTypes = excluded.includes(type) ? excluded.filter((item) => item !== type) : [...excluded, type];
        return applyFilter(links, { ...current.filter, excludedTypes });
      }),
    toggleLink: (id) =>
      update((current) => {
        const selected = new Set(current.selected);
        if (!selected.delete(id)) selected.add(id);
        return { ...current, selected };
      }),
    setAll: (checked) =>
      update((current) => ({ ...current, selected: new Set(checked ? links.map((link) => link.id) : []) })),
  };
}
