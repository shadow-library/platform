import { type ReactElement } from 'react';

import { Button, IconButton } from '@shadow-library/ui';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { formatPagerPosition, resolvePagerPosition } from '@/lib/item-pager';

import styles from './ItemPager.module.css';

export interface ItemPagerJump {
  label?: string;
  onJump: () => void;
}

export interface ItemPagerProps {
  /** The directory's filtered, ordered ids; `undefined` while the collection query has not resolved. */
  ids: readonly string[] | undefined;
  currentId: string;
  onSelect: (id: string) => void;
  /** Singular noun for the controls' accessible names — "entity", "canon fact". */
  itemNoun: string;
  jump?: ItemPagerJump;
}

export function ItemPager({ ids, currentId, onSelect, itemNoun, jump }: ItemPagerProps): ReactElement | null {
  const position = resolvePagerPosition(currentId, ids);
  if (position.kind === 'unpositioned' && !jump) return null;

  const step = (id: string | null) => () => {
    if (id) onSelect(id);
  };

  return (
    <div className={styles.root}>
      {jump && (
        <Button variant="ghost" size="sm" onClick={jump.onJump}>
          {jump.label ?? 'Jump to…'}
        </Button>
      )}
      {position.kind === 'positioned' && (
        <div className={styles.pager} role="group" aria-label={`${itemNoun} navigation`}>
          {/* aria-disabled rather than disabled: paging to the last item would otherwise blur the button the author is still pressing. */}
          <IconButton
            size="sm"
            icon={<ChevronLeftIcon size={14} />}
            aria-label={`Previous ${itemNoun}`}
            aria-disabled={position.previousId === null}
            onClick={step(position.previousId)}
          />
          <span className={styles.position}>{formatPagerPosition(position.index, position.total)}</span>
          <IconButton size="sm" icon={<ChevronRightIcon size={14} />} aria-label={`Next ${itemNoun}`} aria-disabled={position.nextId === null} onClick={step(position.nextId)} />
        </div>
      )}
    </div>
  );
}
