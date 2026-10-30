import { Link } from '@tanstack/react-router';
import { Skeleton } from '@shadow-library/ui';

import { type OverviewTile } from './overview-model';

import styles from './org-overview.module.css';

interface OverviewTilesProps {
  orgId: string;
  tiles: OverviewTile[];
}

function TileValue({ tile }: { tile: OverviewTile }): React.JSX.Element {
  if (tile.state === 'loading') return <Skeleton className={styles.valueSkeleton} shape="rect" />;
  if (tile.state === 'error')
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className={styles.visuallyHidden}>unavailable</span>
      </>
    );
  return <>{tile.value}</>;
}

export function OverviewTiles({ orgId, tiles }: OverviewTilesProps): React.JSX.Element {
  return (
    <div className={styles.tiles}>
      {tiles.map(tile => (
        <Link key={tile.key} to={tile.to} params={{ orgId }} className={styles.tile} aria-busy={tile.state === 'loading' || undefined}>
          <span className={styles.tileLabel}>{tile.label}</span>
          <span className={styles.tileValue}>
            <TileValue tile={tile} />
          </span>
          <span className={styles.tileDetail}>{tile.state === 'loading' ? <Skeleton className={styles.detailSkeleton} shape="rect" /> : tile.detail}</span>
        </Link>
      ))}
    </div>
  );
}
