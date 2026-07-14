/**
 * Shared Shadow Identity UI primitives, built on the Shadow UI design system.
 *
 * The small, repeated pieces every screen leans on — a status chip, a page header, a titled section
 * card, and a query gate — so each screen speaks the same visual language. Interactive components
 * (Dialog, Badge, DescriptionList, …) come straight from `@shadow-library/ui`; these only compose them.
 */
import { Alert, Badge, type BadgeIntent, EmptyState, IconButton, Spinner, copyText, toast } from '@shadow-library/ui';
import { type ReactElement, type ReactNode } from 'react';

import { type ApiError } from '@/lib/apis';

import { CopyIcon } from '../icons';
import styles from './si.module.css';

export type ChipIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

// The DS accent is indigo, and its `info` intent is also indigo — so an "accent" chip is an info Badge.
const CHIP_INTENT: Record<ChipIntent, BadgeIntent> = { neutral: 'neutral', info: 'info', success: 'success', warning: 'warning', danger: 'danger', accent: 'info' };

interface StatusChipProps {
  intent?: ChipIntent;
  dot?: boolean;
  children: ReactNode;
}

/** A small, colour-coded status marker — a thin alias over the DS `Badge` with the app's intent set. */
export function StatusChip({ intent = 'neutral', dot = false, children }: StatusChipProps): ReactElement {
  return (
    <Badge intent={CHIP_INTENT[intent]} variant="soft" dot={dot}>
      {children}
    </Badge>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tags?: ReactNode;
}

/** The standard page header: title on the left, actions on the right, optional subtitle and tags. */
export function PageHeader({ title, subtitle, actions, tags }: PageHeaderProps): ReactElement {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderMain}>
        <div className={styles.pageHeaderTitleRow}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {tags}
        </div>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.pageHeaderActions}>{actions}</div>}
    </div>
  );
}

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** A titled surface card used to group content on the screens. */
export function SectionCard({ title, description, action, children, className, bodyClassName }: SectionCardProps): ReactElement {
  return (
    <section className={`${styles.section}${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className={styles.sectionHead}>
          <div className={styles.sectionHeadMain}>
            {title && <h3 className={styles.sectionTitle}>{title}</h3>}
            {description && <p className={styles.sectionDesc}>{description}</p>}
          </div>
          {action && <div className={styles.sectionAction}>{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

interface EmptyAction {
  label: string;
  onClick: () => void;
}

interface QueryStateProps {
  isLoading: boolean;
  error: ApiError | null;
  isEmpty?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: EmptyAction;
  children: ReactElement;
}

/** Loading / error / empty gate for a TanStack Query — renders children only once data has arrived. */
export function QueryState({ isLoading, error, isEmpty, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, children }: QueryStateProps): ReactElement {
  if (isLoading)
    return (
      <div className={styles.queryLoading}>
        <Spinner size="lg" label="Loading" />
      </div>
    );
  if (error)
    return (
      <Alert intent="danger" title="Couldn’t reach the server" action={{ label: 'Retry', onClick: () => window.location.reload() }}>
        {error.message}
      </Alert>
    );
  if (isEmpty) return <EmptyState size="inline" title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return children;
}

/** A full-height centred spinner for suspense-style waits inside a pane. */
export function PaneLoader(): ReactElement {
  return (
    <div className={styles.paneLoader}>
      <Spinner size="lg" label="Loading" />
    </div>
  );
}

/** A value rendered in the monospace face — IDs, tokens, keys. */
export function Mono({ children }: { children: ReactNode }): ReactElement {
  return <span className={styles.mono}>{children}</span>;
}

interface CopyButtonProps {
  value: string;
  label?: string;
}

/** A ghost icon button that copies a value to the clipboard and confirms with a toast. */
export function CopyButton({ value, label = 'Copy' }: CopyButtonProps): ReactElement {
  return (
    <IconButton
      variant="ghost"
      size="sm"
      aria-label={label}
      icon={<CopyIcon size={15} />}
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) toast.success('Copied to clipboard');
        else toast.danger('Couldn’t copy');
      }}
    />
  );
}
