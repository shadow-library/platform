import { type ApiError } from '@/lib/apis';
import { type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { Alert, EmptyState, Spinner } from '@shadow-library/ui';
import { SparkIcon } from '../icons';
import styles from './nf.module.css';

export { ContentRatingPicker, RatingField, UNRATED } from './ContentRating';
export { Markdown } from './Markdown';
export { PageSkeleton } from './PageSkeleton';
export { RouteNotFound } from './NotFound';
export { DefaultCatchBoundary } from './DefaultCatchBoundary';

export type ChipIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'ai';

interface StatusChipProps {
  intent?: ChipIntent;
  dot?: boolean;
  children: ReactNode;
}

export function StatusChip({ intent = 'neutral', dot = false, children }: StatusChipProps): ReactElement {
  return (
    <span className="nf-chip" data-intent={intent}>
      {dot && <span className="nf-dot" />}
      {children}
    </span>
  );
}

interface AiTagProps {
  children?: ReactNode;
  icon?: boolean;
}

export function AiTag({ children = 'AI', icon = true }: AiTagProps): ReactElement {
  return (
    <StatusChip intent="ai">
      {icon && <SparkIcon size={12} />}
      {children}
    </StatusChip>
  );
}

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps): ReactElement {
  return <div className={`nf-page ${styles.pageContainer}${className ? ` ${className}` : ''}`}>{children}</div>;
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  tags?: ReactNode;
}

export function PageHeader({ title, subtitle, extra, tags }: PageHeaderProps): ReactElement {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderMain}>
        <div className={styles.pageHeaderTitleRow}>
          <h1 className={styles.pageTitle}>{title}</h1>
          {tags}
        </div>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {extra && <div className={styles.pageHeaderExtra}>{extra}</div>}
    </div>
  );
}

interface SectionCardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({ title, action, children, className }: SectionCardProps): ReactElement {
  return (
    <section className={`${styles.sectionCard}${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className={styles.sectionHead}>
          {title && <h3 className={styles.sectionTitle}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
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

export function QueryState({ isLoading, error, isEmpty, emptyTitle = 'Nothing here yet', emptyDescription, emptyAction, children }: QueryStateProps): ReactElement {
  if (isLoading)
    return (
      <div className={styles.queryLoading}>
        <Spinner size="lg" label="Loading" />
      </div>
    );
  if (error)
    return (
      <Alert intent="danger" title="Couldn’t reach the backend" action={{ label: 'Retry', onClick: () => window.location.reload() }}>
        {error.message}
      </Alert>
    );
  if (isEmpty) return <EmptyState size="inline" title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return children;
}

interface AssetBoxProps {
  height?: number;
  width?: number | string;
  radius?: number;
  color?: string;
}

export function AssetBox({ height = 80, width, radius = 8, color }: AssetBoxProps): ReactElement {
  return (
    <div
      className={styles.assetBox}
      data-solid={color ? 'true' : undefined}
      style={
        {
          '--nf-asset-h': `${height}px`,
          '--nf-asset-w': typeof width === 'number' ? `${width}px` : (width ?? '100%'),
          '--nf-asset-r': `${radius}px`,
          ...(color ? { '--nf-asset-bg': color } : {}),
        } as CSSProperties
      }
    />
  );
}

export function PaneLoader(): ReactElement {
  return (
    <div className={styles.paneLoader}>
      <Spinner size="lg" label="Loading" />
    </div>
  );
}

interface PaneErrorProps {
  error: ApiError;
}

export function PaneError({ error }: PaneErrorProps): ReactElement {
  return (
    <div className={styles.paneError}>
      <Alert intent="danger" title="Something went wrong" action={{ label: 'Retry', onClick: () => window.location.reload() }}>
        {error.message}
      </Alert>
    </div>
  );
}

interface RowActionProps {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function RowAction({ label, danger, onClick, children }: RowActionProps): ReactElement {
  return (
    <button
      type="button"
      className="nf-rowaction"
      aria-label={label}
      title={label}
      data-danger={danger || undefined}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
