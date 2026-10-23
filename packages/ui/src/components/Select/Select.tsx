import * as SelectPrimitive from '@radix-ui/react-select';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';

import { CompactCheckIcon, CompactChevronDownIcon } from '@/icons';
import { cn } from '@/lib';

import styles from './Select.module.css';
import { type SelectGroupProps, type SelectItemProps, type SelectProps } from './Select.types';

/** The trigger inherits Input's field surface; the listbox defines the overlay surface reused by every menu and picker. */
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
    <div className={cn(styles.root, className)}>
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
          className={styles.trigger}
          data-size={size}
          data-invalid={invalid || undefined}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
        >
          <span className={styles.value}>
            <SelectPrimitive.Value placeholder={placeholder} />
          </span>
          <SelectPrimitive.Icon className={styles.chevron}>{loading ? <span className={styles.spinner} aria-hidden="true" /> : <CompactChevronDownIcon />}</SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content className={cn(styles.content, contentClassName)} position="popper" sideOffset={6}>
            <SelectPrimitive.ScrollUpButton className={styles.scrollButton}>
              <span className={styles.scrollChevronUp}>
                <CompactChevronDownIcon />
              </span>
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className={styles.viewport}>{children}</SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className={styles.scrollButton}>
              <CompactChevronDownIcon />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
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
        <CompactCheckIcon strokeWidth={1.5} />
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

export const Select = Object.assign(SelectRoot, {
  Item: SelectItem,
  Group: SelectGroup,
  Separator: SelectSeparator,
});
