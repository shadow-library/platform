import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { type ReactElement } from 'react';

import styles from './Tooltip.module.css';
import { type TooltipProps, type TooltipProviderProps } from './Tooltip.types';

/** One provider per app shares the hover-intent delay and the "open instantly once a sibling is open" behaviour. */
export function TooltipProvider({ delayDuration = 400, skipDelayDuration = 300, children }: TooltipProviderProps): ReactElement {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/** Strictly non-interactive. Passing no `content` renders the trigger alone, so tooltips can be conditional. */
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
