import { Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `rt-page ${className}` : 'rt-page'}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  onBack,
  backLabel = 'Back',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <header className="rt-page-header">
      <div className="rt-page-header-main">
        {onBack ? (
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<IconArrowLeft size={14} />}
            onClick={onBack}
            mb={6}
            ml={-8}
          >
            {backLabel}
          </Button>
        ) : null}
        {eyebrow ? <div className="rt-eyebrow">{eyebrow}</div> : null}
        <h1 className="rt-page-title">{title}</h1>
        {description ? <div className="rt-page-description">{description}</div> : null}
      </div>
      {actions ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  footer,
  children,
  flush = false,
  plainHeader = false,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Remove body padding, e.g. for edge-to-edge tables. */
  flush?: boolean;
  /** Header without a divider line. */
  plainHeader?: boolean;
  className?: string;
}) {
  const hasHeader = title || description || actions;
  return (
    <section className={className ? `rt-panel ${className}` : 'rt-panel'}>
      {hasHeader ? (
        <div className="rt-panel-header" data-plain={plainHeader || undefined}>
          <div style={{ minWidth: 0 }}>
            {title ? <h2 className="rt-panel-title">{title}</h2> : null}
            {description ? <div className="rt-panel-description">{description}</div> : null}
          </div>
          {actions ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children !== undefined && children !== null ? (
        <div className="rt-panel-body" data-flush={flush || undefined}>
          {children}
        </div>
      ) : null}
      {footer ? <div className="rt-panel-footer">{footer}</div> : null}
    </section>
  );
}
