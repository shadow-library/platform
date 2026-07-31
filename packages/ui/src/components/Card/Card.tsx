/**
 * Importing npm packages
 */
import { Slot } from '@radix-ui/react-slot';
import { createContext, forwardRef, useContext } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Card.module.css';
import { type CardBodyProps, type CardFooterProps, type CardHeaderProps, type CardPadding, type CardProps } from './Card.types';

/**
 * Declaring the constants
 */
const PaddingContext = createContext<CardPadding>('md');

/**
 * The bounded content surface. Flat, bordered, and quiet — a resting card never casts a shadow
 * (elevation e0); only an `interactive` card lifts on hover. Compose with `Card.Header`,
 * `Card.Body`, and `Card.Footer`, which share the root's `padding` scale through context.
 */
const CardRoot = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, selected = false, asChild = false, padding = 'md', className, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'div';
  return (
    <PaddingContext.Provider value={padding}>
      <Comp ref={ref} className={cn(styles.root, className)} data-interactive={interactive || undefined} data-selected={selected || undefined} {...props}>
        {children}
      </Comp>
    </PaddingContext.Provider>
  );
});

/** Header row — title + optional trailing action, with a hairline below. */
const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(function CardHeader({ title, action, className, children, ...props }, ref) {
  const padding = useContext(PaddingContext);
  return (
    <div ref={ref} className={cn(styles.header, className)} data-padding={padding} {...props}>
      {children ?? (
        <>
          {title != null ? <div className={styles.title}>{title}</div> : null}
          {action != null ? <div className={styles.action}>{action}</div> : null}
        </>
      )}
    </div>
  );
});

/** Body — the free-form content slot, padded on all sides by the shared scale. */
const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(function CardBody({ className, ...props }, ref) {
  const padding = useContext(PaddingContext);
  return <div ref={ref} className={cn(styles.body, className)} data-padding={padding} {...props} />;
});

/** Footer — a single link or meta row, with a hairline above. */
const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter({ className, ...props }, ref) {
  const padding = useContext(PaddingContext);
  return <div ref={ref} className={cn(styles.footer, className)} data-padding={padding} {...props} />;
});

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
