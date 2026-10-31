import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, useContext } from 'react';

import { useControllableState } from '@/hooks';
import { cn } from '@/lib';

import { TabsValueContext } from './Tabs.context';
import styles from './Tabs.module.css';
import { type TabsListProps, type TabsPanelProps, type TabsProps, type TabsTabProps } from './Tabs.types';

/** An inactive panel stays in the DOM as an empty, `hidden` shell and drops its content and state, unless it is a `keepMounted` panel. */
function TabsRoot({ activation = 'automatic', value: valueProp, defaultValue, onValueChange, className, ...props }: TabsProps) {
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue: defaultValue ?? '', onChange: onValueChange });
  return (
    <TabsValueContext.Provider value={value}>
      <TabsPrimitive.Root className={cn(styles.root, className)} activationMode={activation} value={value} onValueChange={setValue} {...props} />
    </TabsValueContext.Provider>
  );
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

const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(function TabsPanel({ keepMounted = false, className, ...props }, ref) {
  const selected = useContext(TabsValueContext);
  // Radix hides an inactive panel itself unless it is force-mounted, so only a kept panel is hidden here; an explicit `hidden` on any other panel would override Radix's.
  const kept = keepMounted ? { forceMount: true as const, hidden: props.value !== selected } : {};
  return <TabsPrimitive.Content ref={ref} className={cn(styles.panel, className)} {...props} {...kept} />;
});

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
});
