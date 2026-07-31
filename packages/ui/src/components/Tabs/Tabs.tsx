/**
 * Importing npm packages
 */
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import styles from './Tabs.module.css';
import { type TabsListProps, type TabsPanelProps, type TabsProps, type TabsTabProps } from './Tabs.types';

/**
 * Peer views of one subject, one visible at a time — the quiet underline, the only tab style in the
 * system. Wraps Radix Tabs for roving-tabindex keyboard nav, automatic/manual activation, and the
 * tablist/tab/tabpanel semantics. Panels persist their own state across switches (tabs hide, not
 * destroy).
 */
function TabsRoot({ activation = 'automatic', className, ...props }: TabsProps) {
  return <TabsPrimitive.Root className={cn(styles.root, className)} activationMode={activation} {...props} />;
}

/** The tab row — a flex list over a full-width baseline rule. */
const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} className={cn(styles.list, className)} {...props} />;
});

/** A single tab — label with an optional icon and count badge. */
const TabsTab = forwardRef<HTMLButtonElement, TabsTabProps>(function TabsTab({ icon, count, className, children, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger ref={ref} className={cn(styles.tab, className)} {...props}>
      {icon != null ? <span className={styles.icon}>{icon}</span> : null}
      <span className={styles.label}>{children}</span>
      {count != null ? <span className={styles.count}>{count}</span> : null}
    </TabsPrimitive.Trigger>
  );
});

/** The content region for a tab, labelled by it. */
const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(function TabsPanel({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn(styles.panel, className)} {...props} />;
});

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
});
