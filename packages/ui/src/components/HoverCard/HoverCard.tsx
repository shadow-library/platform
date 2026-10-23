import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { type CSSProperties, type ReactElement, useRef, useState } from 'react';

import styles from './HoverCard.module.css';
import { type HoverCardProps } from './HoverCard.types';

type LoadState<T> = { status: 'idle' } | { status: 'loading' } | { status: 'loaded'; data: T } | { status: 'error' };

/**
 * Supplementary by contract: everything inside must exist one click away at the trigger's destination, because touch and screen-reader users never see it.
 * The async loader fires once at hover-intent so the card opens at its final size.
 */
export function HoverCard<T = unknown>({
  children,
  card,
  content,
  render,
  fallback,
  errorFallback = "Couldn't load preview",
  openDelay = 500,
  closeDelay = 300,
  width = 300,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  'aria-label': ariaLabel = 'Preview',
}: HoverCardProps<T>): ReactElement {
  const [state, setState] = useState<LoadState<T>>({ status: 'idle' });
  const startedRef = useRef(false);

  function onOpenChange(open: boolean): void {
    if (!open || card != null || content == null || startedRef.current) return;
    startedRef.current = true;
    setState({ status: 'loading' });
    content().then(
      data => setState({ status: 'loaded', data }),
      () => setState({ status: 'error' }),
    );
  }

  function body(): HoverCardProps<T>['children'] {
    if (card != null) return card;
    if (state.status === 'loaded' && render) return render(state.data);
    if (state.status === 'error') return <span className={styles.fallback}>{errorFallback}</span>;
    return fallback ?? <span className={styles.fallback}>Loading…</span>;
  }

  return (
    <HoverCardPrimitive.Root openDelay={openDelay} closeDelay={closeDelay} onOpenChange={onOpenChange}>
      <HoverCardPrimitive.Trigger asChild>{children}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          className={styles.card}
          role="dialog"
          aria-label={ariaLabel}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={16}
          style={{ '--hovercard-width': `${width}px` } as CSSProperties}
        >
          {body()}
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}
