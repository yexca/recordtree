import { useEffect, useRef } from 'react';

/** Terminal-style output pane that follows new output while scrolled to the bottom. */
export function LogViewer({
  text,
  placeholder = 'Waiting for output...',
  maxHeight = 320,
  minHeight = 96,
}: {
  text: string | null | undefined;
  placeholder?: string;
  maxHeight?: number;
  minHeight?: number;
}) {
  const ref = useRef<HTMLPreElement | null>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={ref}
      className="rt-log"
      data-empty={!text || undefined}
      style={{ maxHeight, minHeight }}
      onScroll={(event) => {
        const element = event.currentTarget;
        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
      }}
    >
      {text || placeholder}
    </pre>
  );
}
