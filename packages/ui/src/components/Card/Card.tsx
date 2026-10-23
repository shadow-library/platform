import { Slot } from '@radix-ui/react-slot';
import { createContext, forwardRef, useContext } from 'react';

import { cn } from '@/lib';

import styles from './Card.module.css';
import { type CardBodyProps, type CardFooterProps, type CardHeaderProps, type CardPadding, type CardProps } from './Card.types';

const PaddingContext = createContext<CardPadding>('md');

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

const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(function CardBody({ className, ...props }, ref) {
  const padding = useContext(PaddingContext);
  return <div ref={ref} className={cn(styles.body, className)} data-padding={padding} {...props} />;
});

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(function CardFooter({ className, ...props }, ref) {
  const padding = useContext(PaddingContext);
  return <div ref={ref} className={cn(styles.footer, className)} data-padding={padding} {...props} />;
});

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
