/**
 * Importing npm packages
 */
import { type KeyboardEvent, type MouseEvent, type ReactElement, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './TreeView.module.css';
import { type TreeNode, type TreeViewProps } from './TreeView.types';

/**
 * Declaring the constants
 */
interface FlatNode {
  node: TreeNode;
  level: number;
  parentId: string | null;
  hasChildren: boolean;
}

function leafIds(node: TreeNode): string[] {
  if (!node.children || node.children.length === 0) return [node.id];
  return node.children.flatMap(leafIds);
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}

/**
 * The WAI-ARIA tree pattern for genuine hierarchies (files, org units, categories): role tree/treeitem/
 * group with aria-level/setsize/posinset/expanded, one tab stop with a roving cursor (arrows navigate,
 * →/← expand/collapse, Enter selects). Checkbox mode adds tri-state parents (aria-checked="mixed") that
 * never disagree with their descendants. Guides and icons are decorative; hierarchy is in the ARIA.
 */
export function TreeView({
  nodes,
  expanded,
  defaultExpanded = [],
  onExpandedChange,
  selected,
  defaultSelected = [],
  onSelectedChange,
  multiple = false,
  checkboxes = false,
  className,
  'aria-label': ariaLabel,
}: TreeViewProps): ReactElement {
  const expandedControlled = expanded !== undefined;
  const [internalExpanded, setInternalExpanded] = useState<string[]>(defaultExpanded);
  const expandedSet = useMemo(() => new Set(expandedControlled ? expanded : internalExpanded), [expandedControlled, expanded, internalExpanded]);

  const selectedControlled = selected !== undefined;
  const [internalSelected, setInternalSelected] = useState<string[]>(defaultSelected);
  const selectedSet = useMemo(() => new Set(selectedControlled ? selected : internalSelected), [selectedControlled, selected, internalSelected]);

  const flat = useMemo(() => {
    const rows: FlatNode[] = [];
    const walk = (list: TreeNode[], level: number, parentId: string | null): void => {
      for (const node of list) {
        const hasChildren = Boolean(node.children && node.children.length > 0);
        rows.push({ node, level, parentId, hasChildren });
        if (hasChildren && expandedSet.has(node.id)) walk(node.children ?? [], level + 1, node.id);
      }
    };
    walk(nodes, 1, null);
    return rows;
  }, [nodes, expandedSet]);

  const [focusedId, setFocusedId] = useState<string | undefined>(() => nodes[0]?.id);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (focusedId) rowRefs.current.get(focusedId)?.focus();
  }, [focusedId]);

  function commitExpanded(next: Set<string>): void {
    const array = [...next];
    if (!expandedControlled) setInternalExpanded(array);
    onExpandedChange?.(array);
  }
  function commitSelected(next: Set<string>): void {
    const array = [...next];
    if (!selectedControlled) setInternalSelected(array);
    onSelectedChange?.(array);
  }

  function toggleExpand(id: string): void {
    const next = new Set(expandedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commitExpanded(next);
  }

  function checkboxState(node: TreeNode): boolean | 'mixed' {
    const leaves = leafIds(node);
    const checked = leaves.filter(id => selectedSet.has(id)).length;
    if (checked === 0) return false;
    if (checked === leaves.length) return true;
    return 'mixed';
  }

  function toggleCheckbox(node: TreeNode): void {
    if (node.disabled) return;
    const leaves = leafIds(node);
    const next = new Set(selectedSet);
    const allChecked = leaves.every(id => next.has(id));
    for (const id of leaves) {
      if (allChecked) next.delete(id);
      else next.add(id);
    }
    commitSelected(next);
  }

  function selectRow(node: TreeNode): void {
    if (node.disabled || checkboxes) return;
    if (multiple) {
      const next = new Set(selectedSet);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      commitSelected(next);
    } else {
      commitSelected(new Set([node.id]));
    }
  }

  function activate(node: TreeNode): void {
    if (checkboxes) toggleCheckbox(node);
    else selectRow(node);
  }

  function focusIndex(index: number): void {
    const target = flat[Math.max(0, Math.min(flat.length - 1, index))];
    if (target) setFocusedId(target.node.id);
  }

  function handleRowClick(event: MouseEvent, node: TreeNode, hasChildren: boolean): void {
    const target = event.target as HTMLElement;
    if (hasChildren && target.closest('[data-tree-toggle]')) {
      toggleExpand(node.id);
      return;
    }
    setFocusedId(node.id);
    if (checkboxes) {
      if (target.closest('[data-tree-check]')) toggleCheckbox(node);
    } else {
      selectRow(node);
    }
  }

  function handleKeyDown(event: KeyboardEvent, entry: FlatNode): void {
    const index = flat.findIndex(row => row.node.id === entry.node.id);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusIndex(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusIndex(index - 1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (entry.hasChildren && !expandedSet.has(entry.node.id)) toggleExpand(entry.node.id);
        else if (entry.hasChildren) focusIndex(index + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (entry.hasChildren && expandedSet.has(entry.node.id)) toggleExpand(entry.node.id);
        else if (entry.parentId) setFocusedId(entry.parentId);
        break;
      case 'Home':
        event.preventDefault();
        focusIndex(0);
        break;
      case 'End':
        event.preventDefault();
        focusIndex(flat.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        activate(entry.node);
        break;
      default:
        break;
    }
  }

  const renderNodes = (list: TreeNode[], level: number, parentId: string | null): ReactElement => (
    // aria-multiselectable is only set on the level-1 role="tree" (undefined on nested role="group"); the role is dynamic so it can't be verified statically
    <ul
      className={styles.group}
      role={level === 1 ? 'tree' : 'group'}
      aria-label={level === 1 ? ariaLabel : undefined}
      aria-multiselectable={level === 1 && (multiple || checkboxes) ? true : undefined}
    >
      {list.map((node, index) => {
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const isExpanded = expandedSet.has(node.id);
        const checkState = checkboxes ? checkboxState(node) : false;
        const isSelected = !checkboxes && selectedSet.has(node.id);
        return (
          <li
            key={node.id}
            ref={row => {
              if (row) rowRefs.current.set(node.id, row);
              else rowRefs.current.delete(node.id);
            }}
            role="treeitem"
            aria-level={level}
            aria-setsize={list.length}
            aria-posinset={index + 1}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={isSelected || undefined}
            aria-checked={checkboxes ? (checkState === 'mixed' ? 'mixed' : checkState) : undefined}
            aria-disabled={node.disabled || undefined}
            tabIndex={focusedId === node.id ? 0 : -1}
            className={styles.item}
            data-focused={focusedId === node.id || undefined}
            data-selected={isSelected || undefined}
            data-disabled={node.disabled || undefined}
            onFocus={event => {
              if (event.target === event.currentTarget) setFocusedId(node.id);
            }}
            onKeyDown={event => handleKeyDown(event, { node, level, parentId, hasChildren })}
          >
            {/* keyboard is handled on the treeitem (li); this row only forwards pointer intent */}
            {/* the row is a presentational surface inside the treeitem, not an independent control */}
            <div className={styles.row} style={{ paddingLeft: 8 + (level - 1) * 16 }} onClick={event => handleRowClick(event, node, hasChildren)}>
              {hasChildren ? (
                <span className={styles.chevron} data-tree-toggle="" data-expanded={isExpanded || undefined} aria-hidden="true">
                  <ChevronRight />
                </span>
              ) : (
                <span className={styles.chevronSpacer} aria-hidden="true" />
              )}
              {checkboxes ? (
                <span
                  className={styles.checkbox}
                  data-tree-check=""
                  data-checked={checkState === true || undefined}
                  data-indeterminate={checkState === 'mixed' || undefined}
                  aria-hidden="true"
                >
                  {checkState === true ? <CheckMark /> : checkState === 'mixed' ? <span className={styles.dash} /> : null}
                </span>
              ) : null}
              {node.icon != null ? (
                <span className={styles.icon} aria-hidden="true">
                  {node.icon}
                </span>
              ) : null}
              <span className={styles.label}>{node.label}</span>
            </div>
            {hasChildren && isExpanded ? renderNodes(node.children ?? [], level + 1, node.id) : null}
          </li>
        );
      })}
    </ul>
  );

  return <div className={cn(styles.root, className)}>{renderNodes(nodes, 1, null)}</div>;
}
