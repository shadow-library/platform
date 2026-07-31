/**
 * Importing npm packages
 */
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { type ComponentPropsWithoutRef, forwardRef, useContext } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { AccordionContext } from './Accordion.context';
import styles from './Accordion.module.css';
import { type AccordionItemProps, type AccordionProps } from './Accordion.types';

/**
 * Declaring the constants
 */
function ChevronDown() {
  return (
    <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5L8 10.5l4-4" />
    </svg>
  );
}

/**
 * The WAI-ARIA accordion pattern via Radix: `<h3><button aria-expanded aria-controls>` headers over
 * `role="region"` panels, ↑↓/Home/End convenience navigation, collapsed panels display:none-hidden.
 * Disclosure is not selection — open state is a weight/chevron shift, never the accent. `single` mode
 * scans one panel at a time; `multiple` keeps several open for working surfaces.
 */
function AccordionRoot({ variant = 'plain', headingLevel = 3, className, children, ...rest }: AccordionProps) {
  const rootProps = rest as ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>;
  return (
    <AccordionContext.Provider value={{ variant, headingLevel }}>
      <AccordionPrimitive.Root className={cn(styles.root, className)} data-variant={variant} {...rootProps}>
        {children}
      </AccordionPrimitive.Root>
    </AccordionContext.Provider>
  );
}

/** One disclosure item — a header (title + optional meta) over a content panel. */
const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(function AccordionItem({ value, title, meta, disabled, className, children }, ref) {
  const { headingLevel } = useContext(AccordionContext);
  const Heading = `h${headingLevel}` as 'h3';

  return (
    <AccordionPrimitive.Item ref={ref} value={value} disabled={disabled} className={cn(styles.item, className)}>
      <AccordionPrimitive.Header asChild>
        <Heading className={styles.header}>
          <AccordionPrimitive.Trigger className={styles.trigger}>
            <span className={styles.title}>{title}</span>
            {meta != null ? <span className={styles.meta}>{meta}</span> : null}
            <ChevronDown />
          </AccordionPrimitive.Trigger>
        </Heading>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className={styles.content}>
        <div className={styles.contentInner}>{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
});

export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
});
