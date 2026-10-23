import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef } from 'react';

import { cn } from '@/lib';

import styles from './Tabs.module.css';
import { type TabsListProps, type TabsPanelProps, type TabsProps, type TabsTabProps } from './Tabs.types';

/** Panels persist their own state across switches: tabs hide rather than destroy. */
function TabsRoot({ activation = 'automatic', className, ...props }: TabsProps) {
  return <TabsPrimitive.Root className={cn(styles.root, className)} activationMode={activation} {...props} />;
}

const TabsList = forwardRef<HTMLDivElement, TabsListProps>(function TabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} className={cn(styles.list, className)} {...props} />;
});

const TabsTab = forwardRef<HTMLButtonElement, TabsTabProps>(function TabsTab({ icon, count, className, children, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger ref={ref} className={cn(styles.tab, className)} {...props}>
      {icon != null ? <span className={styles.icon}>{icon}</span> : null}
      <span className={styles.label}>{children}</span>
      {count != null ? <span className={styles.count}>{count}</span> : null}
    </TabsPrimitive.Trigger>
  );
});

const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(function TabsPanel({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn(styles.panel, className)} {...props} />;
});

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
});
