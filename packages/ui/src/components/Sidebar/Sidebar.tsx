/**
 * Importing npm packages
 */
import { Slot } from '@radix-ui/react-slot';
import { forwardRef, useContext, useId, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Tooltip, TooltipProvider } from '../Tooltip';
import { SidebarContext } from './Sidebar.context';
import styles from './Sidebar.module.css';
import { type SidebarGroupProps, type SidebarItemProps, type SidebarProps, type SidebarSectionProps } from './Sidebar.types';

/**
 * Declaring the constants
 */
/** Read the sidebar's collapsed state — lets a custom header/footer mark render icon-only in rail. */
export function useSidebar(): { collapsed: boolean } {
  return useContext(SidebarContext);
}

function ChevronDown() {
  return (
    <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5L8 10.5l4-4" />
    </svg>
  );
}

/** Chevron for the collapse toggle — points left to collapse, right to expand back out. */
function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {collapsed ? <path d="M6 4l4 4-4 4" /> : <path d="M10 4L6 8l4 4" />}
    </svg>
  );
}

/**
 * The navigation region's behavior: a single managed active state, collapsible groups, an expanded↔rail
 * transition that keeps every destination reachable, and the accessibility contract (a nav landmark of
 * links, aria-current on the active item, group buttons with aria-expanded). Items, badges, and tooltips
 * are the existing components — the Sidebar contributes the state machine. Chrome is surface-app.
 */
const SidebarRoot = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { workspace, footer, collapsed = false, onCollapsedChange, className, children, 'aria-label': ariaLabel = 'Main', ...props },
  ref,
) {
  return (
    <TooltipProvider>
      <SidebarContext.Provider value={{ collapsed }}>
        <nav ref={ref} className={cn(styles.root, className)} data-collapsed={collapsed || undefined} aria-label={ariaLabel} {...props}>
          {workspace != null || onCollapsedChange ? (
            <div className={styles.header}>
              {workspace != null ? <div className={styles.workspace}>{workspace}</div> : <span />}
              {onCollapsedChange ? (
                <button
                  type="button"
                  className={styles.collapseToggle}
                  data-direction={collapsed ? 'right' : 'left'}
                  aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                  onClick={() => onCollapsedChange(!collapsed)}
                >
                  <CollapseChevron collapsed={collapsed} />
                </button>
              ) : null}
            </div>
          ) : null}
          <div className={styles.scroll}>{children}</div>
          {footer != null ? <div className={styles.footer}>{footer}</div> : null}
        </nav>
      </SidebarContext.Provider>
    </TooltipProvider>
  );
});

/** A labelled group of items; the label hides in rail mode. */
const SidebarSection = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarSection({ label, className, children, ...props }, ref) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <div ref={ref} className={cn(styles.section, className)} {...props}>
      {label != null && !collapsed ? <div className={styles.sectionLabel}>{label}</div> : null}
      {children}
    </div>
  );
});

/** A navigation destination — a real link with active state, icon, and optional badge. */
const SidebarItem = forwardRef<HTMLAnchorElement, SidebarItemProps>(function SidebarItem(
  { icon, badge, active = false, asChild = false, label, className, children, ...props },
  ref,
) {
  const { collapsed } = useContext(SidebarContext);
  const Comp = asChild ? Slot : 'a';
  const name = label ?? (typeof children === 'string' ? children : undefined);
  const item = (
    <Comp
      ref={ref}
      className={cn(styles.item, className)}
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? name : undefined}
      {...props}
    >
      {icon != null ? <span className={styles.icon}>{icon}</span> : null}
      {!collapsed ? <span className={styles.label}>{children}</span> : null}
      {badge != null && !collapsed ? <span className={styles.badge}>{badge}</span> : null}
    </Comp>
  );
  return collapsed && name ? (
    <Tooltip content={name} side="right">
      {item}
    </Tooltip>
  ) : (
    item
  );
});

/** A collapsible group — a disclosure button over a nested list of items. */
const SidebarGroup = forwardRef<HTMLDivElement, SidebarGroupProps>(function SidebarGroup({ label, icon, defaultOpen = false, active = false, className, children, ...props }, ref) {
  const { collapsed } = useContext(SidebarContext);
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();

  return (
    <div ref={ref} className={cn(styles.group, className)} {...props}>
      <button
        type="button"
        className={styles.item}
        data-active={active && (collapsed || !open) ? '' : undefined}
        aria-expanded={collapsed ? undefined : open}
        aria-controls={collapsed ? undefined : listId}
        onClick={() => setOpen(value => !value)}
      >
        {icon != null ? <span className={styles.icon}>{icon}</span> : null}
        {!collapsed ? (
          <>
            <span className={styles.label}>{label}</span>
            <ChevronDown />
          </>
        ) : null}
      </button>
      {!collapsed && open ? (
        <ul id={listId} className={styles.groupList}>
          {children}
        </ul>
      ) : null}
    </div>
  );
});

export const Sidebar = Object.assign(SidebarRoot, {
  Section: SidebarSection,
  Item: SidebarItem,
  Group: SidebarGroup,
});
