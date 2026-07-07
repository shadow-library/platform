/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Button } from '../Button';
import styles from './EmptyState.module.css';
import { type EmptyStateProps } from './EmptyState.types';

/**
 * The message shown when a region has resolved to nothing: fact (title), way forward (description),
 * and one verb (action). It is itself a state — it has none of its own, appearing only after loading
 * resolves and leaving the moment content exists. Illustrations are decorative (page/first-use only);
 * the title carries the meaning. Pure text tokens — no surface.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { title, description, illustration, action, secondaryAction, size = 'page', className, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.root, className)} data-size={size} {...props}>
      {size === 'page' && illustration != null ? (
        <div className={styles.illustration} aria-hidden='true'>
          {illustration}
        </div>
      ) : null}
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        {description != null ? <p className={styles.description}>{description}</p> : null}
      </div>
      {action != null || secondaryAction != null ? (
        <div className={styles.actions}>
          {action != null ? (
            <Button size={size === 'inline' ? 'sm' : 'md'} loading={action.loading} onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
          {secondaryAction != null ? (
            <Button variant='text' size={size === 'inline' ? 'sm' : 'md'} loading={secondaryAction.loading} onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
