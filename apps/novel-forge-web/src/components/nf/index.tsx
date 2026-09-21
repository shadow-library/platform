import { type ApiError } from '@/lib/apis';
import { type ReactElement, type ReactNode } from 'react';

import { Alert, Button, Spinner, EmptyState as UiEmptyState } from '@shadow-library/ui';
import { SparkIcon, StopIcon } from '../icons';
import { StatusChip } from './StatusChip';
import styles from './nf.module.css';

export {
  CollectionPage,
  type CollectionFilter,
  type CollectionPageProps,
  type CollectionRowProps,
  type CollectionRowsProps,
  type CollectionSectionProps,
  type CollectionSegment,
  type CollectionSegments,
  type RowActionReveal,
} from './CollectionPage';
export { ContentRatingPicker, RatingField, UNRATED } from './ContentRating';
export { type DetailAsideWidth, type DetailIdentityProps, DetailPage, type DetailPageProps, type DetailProseProps } from './DetailPage';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { FieldCard, type FieldCardProps } from './FieldCard';
export { IdeaRename } from './IdeaRename';
export { ItemPager, type ItemPagerJump, type ItemPagerProps } from './ItemPager';
export { ReadingSheet, type ReadingSheetProps } from './ReadingSheet';
export { SidePanel, type SidePanelProps } from './SidePanel';
export { LookupTrace } from './LookupTrace';
export { Markdown } from './Markdown';
export { INHERIT_MODEL, type ModelKind, ModelPicker } from './ModelPicker';
export { PageSkeleton } from './PageSkeleton';
export { RouteNotFound } from './NotFound';
export { TurnStatus } from './TurnStatus';
export { DefaultCatchBoundary } from './DefaultCatchBoundary';
export { BibleHealth, type BibleHealthProps } from './BibleHealth';
export { BibleReadiness, type BibleReadinessProps } from './BibleReadiness';
export { type ChipIntent, StatusChip, type StatusChipProps } from './StatusChip';

interface StopButtonProps {
  onStop: () => void;
  stopping: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

/** The one Stop affordance every live run/job card reaches for, so a double-press always reads the same loading state. */
export function StopButton({ onStop, stopping, label = 'Stop', size = 'sm' }: StopButtonProps): ReactElement {
  return (
    <Button variant="danger" size={size} prefix={<StopIcon size={14} />} loading={stopping} disabled={stopping} onClick={onStop}>
      {label}
    </Button>
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
  if (isEmpty) return <UiEmptyState size="inline" title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  return children;
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
