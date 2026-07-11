/**
 * Importing npm packages
 */
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { CheckIcon, ChevronRightIcon } from '@/icons';
import { cn } from '@/lib';

// The Context Menu shares Dropdown Menu (08)'s surface and item grammar entirely — reuse its module.
import styles from '../DropdownMenu/DropdownMenu.module.css';
import {
  type ContextMenuCheckboxItemProps,
  type ContextMenuContentProps,
  type ContextMenuItemProps,
  type ContextMenuLabelProps,
  type ContextMenuRadioItemProps,
  type ContextMenuSeparatorProps,
  type ContextMenuSubContentProps,
  type ContextMenuSubTriggerProps,
} from './ContextMenu.types';

/**
 * Declaring the constants
 */
function DotIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='currentColor' aria-hidden='true'>
      <circle cx='8' cy='8' r='3' />
    </svg>
  );
}

const ContextMenuContent = forwardRef<HTMLDivElement, ContextMenuContentProps>(function ContextMenuContent({ className, collisionPadding = 8, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content ref={ref} className={cn(styles.content, className)} collisionPadding={collisionPadding} {...props} />
    </ContextMenuPrimitive.Portal>
  );
});

const ContextMenuItem = forwardRef<HTMLDivElement, ContextMenuItemProps>(function ContextMenuItem({ icon, shortcut, destructive = false, className, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Item ref={ref} className={cn(styles.item, className)} data-destructive={destructive || undefined} {...props}>
      {icon != null ? <span className={styles.itemIcon}>{icon}</span> : null}
      <span className={styles.itemLabel}>{children}</span>
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden='true'>
          {shortcut}
        </span>
      ) : null}
    </ContextMenuPrimitive.Item>
  );
});

// Toggle items keep the menu open on select by preventing the default close.
const ContextMenuCheckboxItem = forwardRef<HTMLDivElement, ContextMenuCheckboxItemProps>(function ContextMenuCheckboxItem(
  { icon, shortcut, className, children, onSelect, ...props },
  ref,
) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(styles.item, className)}
      onSelect={event => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      <span className={styles.indicator}>
        <ContextMenuPrimitive.ItemIndicator>{icon ?? <CheckIcon />}</ContextMenuPrimitive.ItemIndicator>
      </span>
      <span className={styles.itemLabel}>{children}</span>
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden='true'>
          {shortcut}
        </span>
      ) : null}
    </ContextMenuPrimitive.CheckboxItem>
  );
});

const ContextMenuRadioItem = forwardRef<HTMLDivElement, ContextMenuRadioItemProps>(function ContextMenuRadioItem({ shortcut, className, children, onSelect, ...props }, ref) {
  return (
    <ContextMenuPrimitive.RadioItem
      ref={ref}
      className={cn(styles.item, className)}
      onSelect={event => {
        event.preventDefault();
        onSelect?.(event);
      }}
      {...props}
    >
      <span className={styles.indicator}>
        <ContextMenuPrimitive.ItemIndicator>
          <DotIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      <span className={styles.itemLabel}>{children}</span>
      {shortcut != null ? (
        <span className={styles.shortcut} aria-hidden='true'>
          {shortcut}
        </span>
      ) : null}
    </ContextMenuPrimitive.RadioItem>
  );
});

const ContextMenuLabel = forwardRef<HTMLDivElement, ContextMenuLabelProps>(function ContextMenuLabel({ className, ...props }, ref) {
  return <ContextMenuPrimitive.Label ref={ref} className={cn(styles.label, className)} {...props} />;
});

const ContextMenuSeparator = forwardRef<HTMLDivElement, ContextMenuSeparatorProps>(function ContextMenuSeparator({ className, ...props }, ref) {
  return <ContextMenuPrimitive.Separator ref={ref} className={cn(styles.separator, className)} {...props} />;
});

const ContextMenuSubTrigger = forwardRef<HTMLDivElement, ContextMenuSubTriggerProps>(function ContextMenuSubTrigger({ icon, className, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.SubTrigger ref={ref} className={cn(styles.item, className)} {...props}>
      {icon != null ? <span className={styles.itemIcon}>{icon}</span> : null}
      <span className={styles.itemLabel}>{children}</span>
      <span className={styles.subChevron}>
        <ChevronRightIcon />
      </span>
    </ContextMenuPrimitive.SubTrigger>
  );
});

const ContextMenuSubContent = forwardRef<HTMLDivElement, ContextMenuSubContentProps>(function ContextMenuSubContent(
  { className, sideOffset = 4, alignOffset = -5, ...props },
  ref,
) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent ref={ref} className={cn(styles.content, className)} sideOffset={sideOffset} alignOffset={alignOffset} {...props} />
    </ContextMenuPrimitive.Portal>
  );
});

/**
 * Actions on the thing under the pointer — the pointer-anchored sibling of Dropdown Menu (08). Same
 * surface, same item grammar, same ARIA menu pattern; what it adds is the interaction model (right-click
 * / long-press opening at the cursor, and nesting). Wraps Radix ContextMenu 1:1. Right-click is a power
 * path, never the only path — every action here must also exist in visible UI.
 */
export const ContextMenu = Object.assign(ContextMenuPrimitive.Root, {
  Trigger: ContextMenuPrimitive.Trigger,
  Group: ContextMenuPrimitive.Group,
  RadioGroup: ContextMenuPrimitive.RadioGroup,
  Sub: ContextMenuPrimitive.Sub,
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  CheckboxItem: ContextMenuCheckboxItem,
  RadioItem: ContextMenuRadioItem,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
});

export { ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSubContent, ContextMenuSubTrigger };
