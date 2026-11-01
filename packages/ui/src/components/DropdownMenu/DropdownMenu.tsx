import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { forwardRef, type ReactNode, useId } from 'react';

import { CompactCheckIcon, CompactChevronRightIcon } from '@/icons';
import { cn } from '@/lib';

import styles from './DropdownMenu.module.css';
import {
  type DropdownMenuCheckboxItemProps,
  type DropdownMenuContentProps,
  type DropdownMenuItemProps,
  type DropdownMenuLabelProps,
  type DropdownMenuRadioItemProps,
  type DropdownMenuSeparatorProps,
  type DropdownMenuSubContentProps,
  type DropdownMenuSubTriggerProps,
} from './DropdownMenu.types';

function DotIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
    </svg>
  );
}

interface ItemText {
  body: ReactNode;
  aria: { 'aria-labelledby'?: string; 'aria-describedby'?: string };
}

function useItemText(children: ReactNode, description: ReactNode): ItemText {
  const id = useId();
  if (description == null) return { body: <span className={styles.itemLabel}>{children}</span>, aria: {} };
  return {
    body: (
      <span className={styles.itemBody}>
        <span id={`${id}-label`} className={styles.itemLabel}>
          {children}
        </span>
        <span id={`${id}-description`} className={styles.itemDescription}>
          {description}
        </span>
      </span>
    ),
    aria: { 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-description` },
  };
}

const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(function DropdownMenuContent({ className, sideOffset = 6, align = 'start', ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content ref={ref} className={cn(styles.content, className)} sideOffset={sideOffset} align={align} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
});

const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(function DropdownMenuItem(
  { icon, shortcut, destructive = false, className, children, description, ...props },
  ref,
) {
  const text = useItemText(children, description);
  return (
    <DropdownMenuPrimitive.Item ref={ref} {...text.aria} className={cn(styles.item, className)} data-destructive={destructive || undefined} {...props}>
      {icon != null ? <span className={styles.itemIcon}>{icon}</span> : null}
      {text.body}
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuPrimitive.Item>
  );
});

const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, DropdownMenuCheckboxItemProps>(function DropdownMenuCheckboxItem(
  { icon, shortcut, className, children, description, onSelect, ...props },
  ref,
) {
  const text = useItemText(children, description);
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      {...text.aria}
      className={cn(styles.item, className)}
      onSelect={event => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      <span className={cn(styles.indicator, styles.checkbox)}>
        <DropdownMenuPrimitive.ItemIndicator>{icon ?? <CompactCheckIcon />}</DropdownMenuPrimitive.ItemIndicator>
      </span>
      {text.body}
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

const DropdownMenuRadioItem = forwardRef<HTMLDivElement, DropdownMenuRadioItemProps>(function DropdownMenuRadioItem(
  { shortcut, className, children, description, onSelect, ...props },
  ref,
) {
  const text = useItemText(children, description);
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      {...text.aria}
      className={cn(styles.item, className)}
      onSelect={event => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      <span className={styles.indicator}>
        <DropdownMenuPrimitive.ItemIndicator>
          <DotIcon />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {text.body}
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuPrimitive.RadioItem>
  );
});

const DropdownMenuLabel = forwardRef<HTMLDivElement, DropdownMenuLabelProps>(function DropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Label ref={ref} className={cn(styles.label, className)} {...props} />;
});

const DropdownMenuSeparator = forwardRef<HTMLDivElement, DropdownMenuSeparatorProps>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Separator ref={ref} className={cn(styles.separator, className)} {...props} />;
});

const DropdownMenuSubTrigger = forwardRef<HTMLDivElement, DropdownMenuSubTriggerProps>(function DropdownMenuSubTrigger({ icon, className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger ref={ref} className={cn(styles.item, className)} {...props}>
      {icon != null ? <span className={styles.itemIcon}>{icon}</span> : null}
      <span className={styles.itemLabel}>{children}</span>
      <span className={styles.subChevron}>
        <CompactChevronRightIcon />
      </span>
    </DropdownMenuPrimitive.SubTrigger>
  );
});

const DropdownMenuSubContent = forwardRef<HTMLDivElement, DropdownMenuSubContentProps>(function DropdownMenuSubContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent ref={ref} className={cn(styles.content, className)} sideOffset={sideOffset} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenu = Object.assign(DropdownMenuPrimitive.Root, {
  Trigger: DropdownMenuPrimitive.Trigger,
  Group: DropdownMenuPrimitive.Group,
  RadioGroup: DropdownMenuPrimitive.RadioGroup,
  Sub: DropdownMenuPrimitive.Sub,
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  RadioItem: DropdownMenuRadioItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
});

export {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
};
