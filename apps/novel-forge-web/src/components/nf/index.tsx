/**
 * Shared Novel Forge UI primitives, built on the Shadow UI design system.
 *
 * These are the small, repeated pieces the screens lean on — a status chip, a
 * page header, a query gate, and a couple of tag flavours — kept here so every
 * screen speaks the same visual language.
 */
import { Alert, EmptyState, Spinner } from '@shadow-library/ui';
import { type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { type ApiError } from '@/lib/apis';
import { SparkIcon } from '../icons';
import styles from './nf.module.css';

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

/** A small, colour-coded status chip — the design's `.nf-chip` (intent surfaces live in styles.css). */
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

/** A tag marking an AI-generated / human-in-the-loop touchpoint. */
export function AiTag({ children = 'AI', icon = true }: AiTagProps): ReactElement {
  return (
    <StatusChip intent="ai">
      {icon && <SparkIcon size={12} />}
      {children}
    </StatusChip>
  );
}

/**
 * Shared layout primitives live as global classes in styles.css so navigating between pages never
 * shifts the content column or the split-pane rail: `.nf-page` (centered column), `.nf-splitpane`,
 * `.nf-rail`, and `.nf-detail`, all sized from the `--nf-*` dimension variables.
 */

interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/** The centered content column shared by the non-split-pane screens. */
export function PageContainer({ children, className }: PageContainerProps): ReactElement {
  return <div className={`nf-page ${styles.pageContainer}${className ? ` ${className}` : ''}`}>{children}</div>;
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  tags?: ReactNode;
}

/** The standard page header: title on the left, actions on the right, optional subtitle and tags. */
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

/** A titled surface card used to group content on the screens. */
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

/**
 * Loading / error / empty gate for a TanStack Query. Renders children only once
 * data has arrived, keeping the wired screens free of boilerplate.
 */
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

/** A neutral image/asset placeholder box with the diagonal-cross wireframe motif. */
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

/** A full-height centred spinner for suspense-style waits inside a pane. */
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

/** A retry-capable inline error, for panes that manage their own layout. */
export function PaneError({ error }: PaneErrorProps): ReactElement {
  return (
    <div className={styles.paneError}>
      <Alert intent="danger" title="Something went wrong" action={{ label: 'Retry', onClick: () => window.location.reload() }}>
        {error.message}
      </Alert>
    </div>
  );
}

/**
 * A quiet inline row action (archive, delete, …) for list cards. Pair with a `.nf-rowactions`
 * wrapper inside a `.nf-selrow` — the actions stay invisible until the row is hovered or focused.
 */
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
