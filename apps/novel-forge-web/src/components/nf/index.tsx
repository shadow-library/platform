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

export type ChipIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'ai';

const CHIP_STYLES: Record<ChipIntent, CSSProperties> = {
  neutral: { background: 'var(--sh-bg-pressed)', color: 'var(--sh-text-secondary)' },
  info: { background: 'var(--sh-info-bg-subtle)', color: 'var(--sh-info-text-on-subtle)' },
  success: { background: 'var(--sh-success-bg-subtle)', color: 'var(--sh-success-text-on-subtle)' },
  warning: { background: 'var(--sh-warning-bg-subtle)', color: 'var(--sh-warning-text-on-subtle)' },
  danger: { background: 'var(--sh-danger-bg-subtle)', color: 'var(--sh-danger-text-on-subtle)' },
  accent: { background: 'var(--sh-accent-soft)', color: 'var(--sh-accent)' },
  ai: { background: 'var(--sh-accent-soft)', color: 'var(--sh-accent)' },
};

const DOT_COLORS: Record<ChipIntent, string> = {
  neutral: 'var(--sh-text-tertiary)',
  info: 'var(--sh-info-solid)',
  success: 'var(--sh-success-solid)',
  warning: 'var(--sh-warning-solid)',
  danger: 'var(--sh-danger-solid)',
  accent: 'var(--sh-accent)',
  ai: 'var(--sh-accent)',
};

interface StatusChipProps {
  intent?: ChipIntent;
  dot?: boolean;
  children: ReactNode;
}

/** A small, colour-coded status chip — the design's `.nf-chip`. */
export function StatusChip({ intent = 'neutral', dot = false, children }: StatusChipProps): ReactElement {
  return (
    <span className="nf-chip" style={CHIP_STYLES[intent]}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT_COLORS[intent] }} />}
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

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  tags?: ReactNode;
}

/** The standard page header: title on the left, actions on the right, optional subtitle and tags. */
export function PageHeader({ title, subtitle, extra, tags }: PageHeaderProps): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--sh-text-h1)', fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</h1>
          {tags}
        </div>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>{subtitle}</p>}
      </div>
      {extra && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{extra}</div>}
    </div>
  );
}

interface SectionCardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

/** A titled surface card used to group content on the screens. */
export function SectionCard({ title, action, children, style }: SectionCardProps): ReactElement {
  return (
    <section style={{ background: 'var(--sh-surface-card)', border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', padding: '20px 22px', ...style }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          {title && <h3 style={{ margin: 0, fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>{title}</h3>}
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 64 }}>
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
      style={{
        height,
        width: width ?? '100%',
        borderRadius: radius,
        flex: '0 0 auto',
        border: '1.5px solid var(--sh-border-subtle)',
        background: color ?? 'var(--sh-surface-well)',
        backgroundImage: color
          ? undefined
          : `linear-gradient(to top right, transparent calc(50% - 1px), var(--sh-border-default) calc(50% - 1px), var(--sh-border-default) calc(50% + 1px), transparent calc(50% + 1px)),
             linear-gradient(to top left, transparent calc(50% - 1px), var(--sh-border-default) calc(50% - 1px), var(--sh-border-default) calc(50% + 1px), transparent calc(50% + 1px))`,
      }}
    />
  );
}

/** A full-height centred spinner for suspense-style waits inside a pane. */
export function PaneLoader(): ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 48 }}>
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
    <div style={{ padding: 24 }}>
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
