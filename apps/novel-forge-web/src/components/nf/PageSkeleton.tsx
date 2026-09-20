import { useRouterState } from '@tanstack/react-router';
import { Skeleton } from '@shadow-library/ui';

import { resolveSkeletonVariant, type SkeletonVariant } from '@/lib/page-skeleton';

import styles from './PageSkeleton.module.css';

function HeaderSkeleton(): React.JSX.Element {
  return (
    <div className={styles.header}>
      <Skeleton shape="rect" height={28} width="min(280px, 50%)" radius="var(--sh-radius-sm)" />
      <Skeleton shape="line" width="min(420px, 70%)" />
    </div>
  );
}

function ListSkeleton(): React.JSX.Element {
  return (
    <>
      <HeaderSkeleton />
      <div className={styles.cardGrid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.card}>
            <Skeleton shape="rect" height={140} radius="var(--sh-radius-md)" />
            <Skeleton shape="line" width="70%" />
            <Skeleton shape="line" width="45%" />
          </div>
        ))}
      </div>
    </>
  );
}

function OverviewSkeleton(): React.JSX.Element {
  return (
    <>
      <div className={styles.overviewHead}>
        <Skeleton shape="rect" width={72} height={72} radius="var(--sh-radius-lg)" />
        <div className={styles.overviewHeadMain}>
          <Skeleton shape="rect" height={28} width="min(320px, 60%)" radius="var(--sh-radius-sm)" />
          <Skeleton shape="line" width="min(480px, 80%)" />
        </div>
      </div>
      <div className={styles.statRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.statCard}>
            <Skeleton shape="line" width="60%" />
            <Skeleton shape="rect" height={22} width="40%" radius="var(--sh-radius-sm)" />
          </div>
        ))}
      </div>
      <div className={styles.overviewBody}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={styles.sectionCard}>
            <Skeleton shape="line" width="35%" />
            {Array.from({ length: 3 }).map((__, row) => (
              <Skeleton key={row} shape="rect" height={40} radius="var(--sh-radius-sm)" />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function RowsSkeleton(): React.JSX.Element {
  return (
    <>
      <HeaderSkeleton />
      <div className={styles.filterRow}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shape="rect" height={28} width={72} radius="var(--sh-radius-full)" />
        ))}
      </div>
      <ul className={styles.rowList}>
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i} className={styles.row}>
            <Skeleton shape="line" width={24} />
            <Skeleton shape="line" width="45%" />
            <Skeleton shape="line" width="15%" className={styles.rowMetaCol} />
            <Skeleton shape="line" width="10%" className={styles.rowMetaCol} />
          </li>
        ))}
      </ul>
    </>
  );
}

function RailSkeleton(): React.JSX.Element {
  return (
    <div className={styles.rail}>
      <div className={styles.railHead}>
        <Skeleton shape="line" width="60%" />
      </div>
      <div className={styles.railList}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={styles.railRow}>
            <Skeleton shape="line" width="80%" />
            <Skeleton shape="line" width="45%" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitSkeleton(): React.JSX.Element {
  return (
    <div className={styles.splitPane}>
      <RailSkeleton />
      <div className={styles.detail}>
        <Skeleton shape="rect" height={24} width="min(280px, 50%)" radius="var(--sh-radius-sm)" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} shape="line" width={i % 2 === 0 ? '90%' : '65%'} />
        ))}
      </div>
    </div>
  );
}

function ChatSkeleton(): React.JSX.Element {
  return (
    <div className={styles.chatPane}>
      <div className={styles.chatDetail}>
        <div className={styles.chatThread}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.chatBubble} data-align={i % 2 === 0 ? 'start' : 'end'}>
              <Skeleton shape="rect" height={i % 3 === 0 ? 64 : 36} width="min(420px, 70%)" radius="var(--sh-radius-lg)" />
            </div>
          ))}
        </div>
        <Skeleton shape="rect" height={56} radius="var(--sh-radius-md)" className={styles.composer} />
      </div>
      <div className={styles.chatPanel}>
        <Skeleton shape="line" width="60%" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} shape="rect" height={56} radius="var(--sh-radius-md)" />
        ))}
      </div>
    </div>
  );
}

function FormSkeleton(): React.JSX.Element {
  return (
    <>
      <HeaderSkeleton />
      <div className={styles.formBody}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={styles.sectionCard}>
            <Skeleton shape="line" width="30%" />
            {Array.from({ length: 3 }).map((__, row) => (
              <div key={row} className={styles.field}>
                <Skeleton shape="line" width="20%" />
                <Skeleton shape="rect" height={36} radius="var(--sh-radius-sm)" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

const VARIANT_CONTENT: Record<SkeletonVariant, () => React.JSX.Element> = {
  list: ListSkeleton,
  overview: OverviewSkeleton,
  rows: RowsSkeleton,
  split: SplitSkeleton,
  chat: ChatSkeleton,
  form: FormSkeleton,
  default: ListSkeleton,
};

export function PageSkeleton(): React.JSX.Element {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const variant = resolveSkeletonVariant(pathname);
  const Content = VARIANT_CONTENT[variant];
  const bare = variant === 'split' || variant === 'chat';

  return (
    <div className={styles.wrap} aria-busy="true">
      <span className={styles.srOnly} role="status">
        Loading
      </span>
      <div className={bare ? styles.bareWrap : styles.pageWrap} aria-hidden="true">
        <Content />
      </div>
    </div>
  );
}
