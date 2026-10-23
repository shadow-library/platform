import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { forwardRef } from 'react';

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

const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(function DropdownMenuContent({ className, sideOffset = 6, align = 'start', ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content ref={ref} className={cn(styles.content, className)} sideOffset={sideOffset} align={align} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
});

const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(function DropdownMenuItem({ icon, shortcut, destructive = false, className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item ref={ref} className={cn(styles.item, className)} data-destructive={destructive || undefined} {...props}>
      {icon != null ? <span className={styles.itemIcon}>{icon}</span> : null}
      <span className={styles.itemLabel}>{children}</span>
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuPrimitive.Item>
  );
});

const DropdownMenuCheckboxItem = forwardRef<HTMLDivElement, DropdownMenuCheckboxItemProps>(function DropdownMenuCheckboxItem(
  { icon, shortcut, className, children, onSelect, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(styles.item, className)}
      onSelect={event => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      <span className={styles.indicator}>
        <DropdownMenuPrimitive.ItemIndicator>{icon ?? <CompactCheckIcon />}</DropdownMenuPrimitive.ItemIndicator>
      </span>
      <span className={styles.itemLabel}>{children}</span>
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

const DropdownMenuRadioItem = forwardRef<HTMLDivElement, DropdownMenuRadioItemProps>(function DropdownMenuRadioItem({ shortcut, className, children, onSelect, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
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
      <span className={styles.itemLabel}>{children}</span>
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
