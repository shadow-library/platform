import { Spinner } from '@shadow-library/ui';

import { formatElapsed } from '@/lib/format';
import { type ChapterGeneration } from '@/lib/generation-activity';
import { useElapsed } from '@/lib/use-elapsed';

import styles from './GenerationStatus.module.css';

export interface GenerationStatusProps {
  generation: ChapterGeneration;
  label?: string;
}

export function GenerationStatus({ generation, label = 'Writing' }: GenerationStatusProps): React.JSX.Element {
  const elapsed = useElapsed(generation.phase === 'writing' ? generation.startedAt : undefined);

  if (generation.phase === 'queued') {
    return (
      <span className={styles.status} data-phase="queued">
        <span className={styles.queuedDot} />
        Queued
      </span>
    );
  }

  return (
    <span className={styles.status} data-phase="writing" role="status">
      <Spinner size="sm" />
      <span>{label}</span>
      <span className={styles.elapsed}>{formatElapsed(elapsed)}</span>
    </span>
  );
}
