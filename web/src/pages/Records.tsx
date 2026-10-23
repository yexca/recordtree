import { useEffect } from 'react';
import { Page, PageHeader } from '../components/layout';
import { RecordBrowser, type QueryChange } from '../components/RecordBrowser';

/** Last records URL query, restored when the page is reopened from the sidebar. */
let lastRecordQuery = '';

export default function Records({ query: search, onQueryChange }: { query: string; onQueryChange: QueryChange }) {
  // Reopening Records from the sidebar returns to the last filters and open record.
  useEffect(() => {
    if (!search && lastRecordQuery) onQueryChange(lastRecordQuery, { replace: true });
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    lastRecordQuery = search;
  }, [search]);

  return (
    <Page className="rt-page-fill">
      <PageHeader eyebrow="Library" title="Records" />
      <RecordBrowser search={search} onQueryChange={onQueryChange} cacheKey="records" />
    </Page>
  );
}
