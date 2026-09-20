import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { EmptyState } from '@shadow-library/ui';

import { type DataQuery, type DataSource, type SyncFailureReason, useDataReadiness } from '@/lib/sync';

interface DataStateBaseProps {
  /** Shown until the first sync (or the query) lands; shape it like the content it stands in for. */
  skeleton: ReactNode;
  /** Shown instead of `children` when `isEmpty` holds; omit to render `children` for an empty result too. */
  empty?: ReactNode;
  source?: DataSource;
  size?: 'page' | 'inline';
}

export interface QueryDataStateProps<T> extends DataStateBaseProps {
  query: DataQuery<T>;
  isEmpty?: (data: T) => boolean;
  /** The function form receives the query's resolved data. */
  children: ReactNode | ((data: T) => ReactNode);
}

export interface SyncDataStateProps extends DataStateBaseProps {
  query?: undefined;
  isEmpty?: undefined;
  children: ReactNode;
}

export type DataStateProps<T> = QueryDataStateProps<T> | SyncDataStateProps;

interface FailureCopy {
  title: string;
  description: string;
  retryable: boolean;
}

const FAILURE_COPY: Record<Exclude<SyncFailureReason, 'deletion-pending'>, FailureCopy> = {
  server: {
    title: "Couldn't load this right now",
    description: "Memoir didn't respond. Anything you log on this device is kept and syncs once it's reachable.",
    retryable: true,
  },
  offline: {
    title: "You're offline",
    description: "This hasn't loaded on this device yet. It will as soon as you're back online.",
    retryable: true,
  },
  'signed-out': {
    title: "You're signed out",
    description: 'Sign in again to load this. Anything you logged on this device is kept.',
    retryable: false,
  },
};

export function DataState<T>(props: QueryDataStateProps<T>): ReactElement;
export function DataState(props: SyncDataStateProps): ReactElement;
export function DataState<T>({ skeleton, empty, size = 'page', children, ...options }: DataStateProps<T>): ReactElement {
  const { readiness, retry, retrying } = useDataReadiness<T>(options);

  if (readiness.kind === 'loading')
    return (
      <div role="status" aria-busy="true" aria-label="Loading">
        {skeleton}
      </div>
    );

  if (readiness.kind === 'empty' && empty !== undefined) return <>{empty}</>;
  if (readiness.kind === 'ready' || readiness.kind === 'empty') return <>{renderChildren(children, options.query?.data)}</>;
  if (readiness.reason === 'deletion-pending') return <DeletionNotice size={size} />;

  const { title, description, retryable } = FAILURE_COPY[readiness.reason];
  return (
    <div role="status" aria-busy={retrying || undefined}>
      <EmptyState size={size} title={title} description={description} action={retryable ? { label: retrying ? 'Trying again…' : 'Try again', onClick: retry } : undefined} />
    </div>
  );
}

function renderChildren<T>(children: ReactNode | ((data: T) => ReactNode), data: T | undefined): ReactNode {
  if (typeof children !== 'function') return children;
  return data === undefined ? null : children(data);
}

function DeletionNotice({ size }: { size: 'page' | 'inline' }): ReactElement {
  const navigate = useNavigate();
  return (
    <div role="status">
      <EmptyState
        size={size}
        title="This account is being deleted"
        description="Memoir is erasing this account, so there is nothing left to show here."
        action={{ label: 'See deletion status', onClick: () => void navigate({ to: '/settings/delete' }) }}
      />
    </div>
  );
}
