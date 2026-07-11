/**
 * Importing npm packages
 */
import * as SelectPrimitive from '@radix-ui/react-select';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { CheckIcon, ChevronDownIcon } from '@/icons';
import { cn } from '@/lib';

import styles from './Select.module.css';
import { type SelectGroupProps, type SelectItemProps, type SelectProps } from './Select.types';

/**
 * Declaring the constants
 */
/**
 * Single choice from an enumerable list, built on Radix Select. The trigger inherits the Input
 * field surface; the listbox defines the overlay surface (radius 8, e2 shadow, 4px inset, 32px
 * items) reused by every menu and picker. Compose with `Select.Group`, `Select.Item`,
 * `Select.Separator`.
 */
function SelectRoot({
  placeholder,
  size = 'md',
  invalid = false,
  loading = false,
  className,
  contentClassName,
  triggerId,
  children,
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  disabled,
  required,
  name,
  dir,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      disabled={disabled}
      required={required}
      name={name}
      dir={dir}
    >
      <SelectPrimitive.Trigger
        id={triggerId}
        className={cn(styles.trigger, className)}
        data-size={size}
        data-invalid={invalid || undefined}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
      >
        <SelectPrimitive.Value className={styles.value} placeholder={placeholder} />
        <SelectPrimitive.Icon className={styles.chevron}>{loading ? <span className={styles.spinner} aria-hidden='true' /> : <ChevronDownIcon />}</SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={cn(styles.content, contentClassName)} position='popper' sideOffset={6}>
          <SelectPrimitive.ScrollUpButton className={styles.scrollButton}>
            <span className={styles.scrollChevronUp}>
              <ChevronDownIcon />
            </span>
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className={styles.viewport}>{children}</SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className={styles.scrollButton}>
            <ChevronDownIcon />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(function SelectItem({ icon, description, className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item ref={ref} className={cn(styles.item, className)} {...props}>
      {icon != null ? <span className={styles.itemIcon}>{icon}</span> : null}
      <span className={styles.itemBody}>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description != null ? <span className={styles.itemDescription}>{description}</span> : null}
      </span>
      <SelectPrimitive.ItemIndicator className={styles.itemIndicator}>
        <CheckIcon strokeWidth={1.5} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});

export const SelectGroup = forwardRef<HTMLDivElement, SelectGroupProps>(function SelectGroup({ label, className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Group ref={ref} className={cn(styles.group, className)} {...props}>
      {label != null ? <SelectPrimitive.Label className={styles.groupLabel}>{label}</SelectPrimitive.Label> : null}
      {children}
    </SelectPrimitive.Group>
  );
});

export const SelectSeparator = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>>(function SelectSeparator({ className, ...props }, ref) {
  return <SelectPrimitive.Separator ref={ref} className={cn(styles.separator, className)} {...props} />;
});

/** Compound Select: the root plus `.Item`, `.Group`, and `.Separator` parts. */
export const Select = Object.assign(SelectRoot, {
  Item: SelectItem,
  Group: SelectGroup,
  Separator: SelectSeparator,
});
