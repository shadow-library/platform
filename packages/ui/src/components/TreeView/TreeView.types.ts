/**
 * Importing npm packages
 */
import { type ReactNode } from 'react';

/**
 * Defining types
 */
export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  children?: TreeNode[];
  disabled?: boolean;
}

export interface TreeViewProps {
  /** The hierarchy. */
  nodes: TreeNode[];
  /** Controlled expanded node ids. */
  expanded?: string[];
  /** Uncontrolled initial expanded ids. */
  defaultExpanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  /** Controlled selection / checked set. */
  selected?: string[];
  /** Uncontrolled initial selection. */
  defaultSelected?: string[];
  onSelectedChange?: (selected: string[]) => void;
  /** Allow multiple row selection (non-checkbox mode). @default false */
  multiple?: boolean;
  /** Tri-state checkbox mode — `selected` becomes the checked leaf set, parents aggregate. @default false */
  checkboxes?: boolean;
  className?: string;
  'aria-label'?: string;
}
