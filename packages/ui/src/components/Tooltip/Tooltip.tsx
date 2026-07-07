/**
 * Importing npm packages
 */
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { type ReactElement } from 'react';

/**
 * Importing user defined packages
 */
import styles from './Tooltip.module.css';
import { type TooltipProps, type TooltipProviderProps } from './Tooltip.types';

/**
 * Declaring the constants
 */

/**
 * One provider per app gives every tooltip a shared hover-intent delay and the "open instantly once a
 * sibling is open" group behavior. Wraps Radix's provider with the Shadow UI defaults.
 */
export function TooltipProvider({ delayDuration = 400, skipDelayDuration = 300, children }: TooltipProviderProps): ReactElement {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * A short label that appears on hover or focus and vanishes without a trace — the only inverted
 * surface in Shadow UI. Strictly non-interactive: names icon-only controls and defines truncated or
 * technical terms. Radix owns positioning (flip/shift, no arrow), the aria-describedby wiring, and
 * Esc-to-dismiss. Passing no `content` renders the trigger alone, so tooltips can be conditional.
 */
export function Tooltip({
  content,
  shortcut,
  side = 'top',
  align = 'center',
  sideOffset = 8,
  open,
  defaultOpen,
  onOpenChange,
  delayDuration = 400,
  children,
}: TooltipProps): ReactElement {
  if (content == null) return <>{children}</>;
  return (
    <TooltipPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className={styles.content} side={side} align={align} sideOffset={sideOffset}>
          {content}
          {shortcut != null ? <span className={styles.shortcut}>{shortcut}</span> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
