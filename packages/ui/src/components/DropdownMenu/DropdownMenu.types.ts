import type * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { type ComponentPropsWithoutRef, type ReactNode } from 'react';

export type DropdownMenuContentProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>;

export interface DropdownMenuItemProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  icon?: ReactNode;
  /** Right-aligned shortcut hint; visual only (`aria-hidden`), bindings live globally. */
  shortcut?: ReactNode;
  destructive?: boolean;
  /** Secondary line under the label; wraps, and becomes the item's accessible description. */
  description?: ReactNode;
}

export interface DropdownMenuCheckboxItemProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> {
  icon?: ReactNode;
  shortcut?: ReactNode;
  /** Secondary line under the label; wraps, and becomes the item's accessible description. */
  description?: ReactNode;
}

export interface DropdownMenuRadioItemProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> {
  shortcut?: ReactNode;
  /** Secondary line under the label; wraps, and becomes the item's accessible description. */
  description?: ReactNode;
}

export interface DropdownMenuSubTriggerProps extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> {
  icon?: ReactNode;
}

export type DropdownMenuSubContentProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>;
export type DropdownMenuLabelProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>;
export type DropdownMenuSeparatorProps = ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>;
