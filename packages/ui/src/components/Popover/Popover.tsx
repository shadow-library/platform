import * as PopoverPrimitive from '@radix-ui/react-popover';
import { createContext, forwardRef, useContext, useId } from 'react';

import { cn } from '@/lib';

import styles from './Popover.module.css';
import { type PopoverContentProps, type PopoverHeaderProps, type PopoverProps } from './Popover.types';

const TitleContext = createContext<string | undefined>(undefined);

function PopoverRoot(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

/** Labelled by its `Popover.Header` title; pass `aria-label` for a headerless popover. */
const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent(
  { className, side = 'bottom', align = 'center', sideOffset = 8, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby, children, ...props },
  ref,
) {
  const titleId = useId();
  const labelledBy = ariaLabelledby ?? (ariaLabel ? undefined : titleId);
  return (
    <TitleContext.Provider value={titleId}>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          className={cn(styles.content, className)}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={16}
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          {...props}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </TitleContext.Provider>
  );
});

function PopoverHeader({ title, description, className, ...props }: PopoverHeaderProps) {
  const titleId = useContext(TitleContext);
  return (
    <div className={cn(styles.header, className)} {...props}>
      {title != null ? (
        <div id={titleId} className={styles.title}>
          {title}
        </div>
      ) : null}
      {description != null ? <div className={styles.description}>{description}</div> : null}
    </div>
  );
}

/** Non-modal: the page stays interactive and it closes on outside click or Esc. Radix moves focus to the first focusable and back to the trigger, never trapping it. */
export const Popover = Object.assign(PopoverRoot, {
  Trigger: PopoverPrimitive.Trigger,
  Anchor: PopoverPrimitive.Anchor,
  Content: PopoverContent,
  Header: PopoverHeader,
  Close: PopoverPrimitive.Close,
});
