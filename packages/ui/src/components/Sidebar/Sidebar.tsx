/**
 * Importing npm packages
 */
import { Slot, Slottable } from '@radix-ui/react-slot';
import { Children, forwardRef, type MouseEvent, type ReactNode, useContext, useEffect, useId, useRef } from 'react';

/**
 * Importing user defined packages
 */
import { useControllableState } from '@/hooks';
import { cn } from '@/lib';

import { Popover } from '../Popover';
import { ShellMobileNavAreaContext } from '../Shell/Shell.context';
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

/** The persisted rail choice, or null when there is none / storage is unavailable (private mode). */
function readStoredCollapsed(storageKey: string): boolean | null {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === 'true' ? true : stored === 'false' ? false : null;
  } catch {
    return null;
  }
}

function writeStoredCollapsed(storageKey: string, collapsed: boolean): void {
  try {
    localStorage.setItem(storageKey, String(collapsed));
  } catch {
    /* the choice still applies for this session even when storage rejects the write */
  }
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
  { workspace, footer, collapsed: collapsedProp, defaultCollapsed, storageKey, onCollapsedChange, className, children, 'aria-label': ariaLabel = 'Main', ...props },
  ref,
) {
  // Inside the shell's mobile nav drawer the sidebar is always expanded — rail mode and its toggle
  // are desktop furniture; the drawer's own dismissal replaces them.
  const mobileNav = useContext(ShellMobileNavAreaContext);
  const [collapsedState, setCollapsedState] = useControllableState({
    value: collapsedProp,
    defaultValue: defaultCollapsed ?? false,
    onChange: onCollapsedChange,
  });
  const restored = useRef(false);

  // The persisted choice is adopted in a mount effect, never resolved during render: the server has no
  // localStorage, so reading it inline would make the first client render disagree with the server
  // markup. Same contract as ThemeProvider. Guarded by a ref so a fresh onChange identity can't re-apply
  // the stored value over a toggle the user just made.
  useEffect(() => {
    if (restored.current || storageKey == null || collapsedProp !== undefined) return;
    restored.current = true;
    const stored = readStoredCollapsed(storageKey);
    if (stored != null) setCollapsedState(stored);
  }, [storageKey, collapsedProp, setCollapsedState]);

  const collapsed = mobileNav != null ? false : collapsedState;
  // Opting in means asking for collapse: a handler, a persisted key, or an explicit starting state. A
  // bare <Sidebar> stays toggle-free, and a controlled `collapsed` with no handler is a fixed rail by
  // construction — React's own semantics, not a special case.
  const collapsible = onCollapsedChange != null || storageKey != null || defaultCollapsed !== undefined;
  const showCollapseToggle = collapsible && mobileNav == null;

  function toggleCollapsed(): void {
    const next = !collapsed;
    setCollapsedState(next);
    if (storageKey != null) writeStoredCollapsed(storageKey, next);
  }

  return (
    <TooltipProvider>
      <SidebarContext.Provider value={{ collapsed }}>
        <nav ref={ref} className={cn(styles.root, className)} data-collapsed={collapsed || undefined} aria-label={ariaLabel} {...props}>
          {workspace != null || showCollapseToggle ? (
            <div className={styles.header}>
              {workspace != null ? <div className={styles.workspace}>{workspace}</div> : <span />}
              {showCollapseToggle ? (
                <button
                  type="button"
                  className={styles.collapseToggle}
                  data-direction={collapsed ? 'right' : 'left'}
                  aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
                  onClick={toggleCollapsed}
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
  { icon, badge, active = false, asChild = false, label, className, onClick, children, ...props },
  ref,
) {
  const { collapsed } = useContext(SidebarContext);
  const mobileNav = useContext(ShellMobileNavAreaContext);
  const Comp = asChild ? Slot : 'a';
  const name = label ?? (typeof children === 'string' ? children : undefined);

  // Choosing a destination inside the shell's mobile nav drawer dismisses the drawer.
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    onClick?.(event);
    if (!event.defaultPrevented) mobileNav?.close();
  }

  function renderLabel(content: ReactNode): ReactNode {
    return collapsed ? null : <span className={styles.label}>{content}</span>;
  }

  const item = (
    <Comp
      ref={ref}
      className={cn(styles.item, className)}
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? name : undefined}
      onClick={handleClick}
      {...props}
    >
      {icon != null ? <span className={styles.icon}>{icon}</span> : null}
      {/* asChild renders the caller's element (a router link) as the item; Slottable rewraps that element's
          own children in the label span, so both branches emit identical markup. */}
      {asChild ? <Slottable child={children}>{renderLabel}</Slottable> : renderLabel(children)}
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

/**
 * A collapsible group — a disclosure button over a nested list of items. In rail mode the same trigger
 * opens that list in a side flyout instead: collapsing the sidebar must not strand a destination, and a
 * disclosure whose panel can never render is a dead control.
 */
const SidebarGroup = forwardRef<HTMLDivElement, SidebarGroupProps>(function SidebarGroup(
  { label, icon, open: openProp, defaultOpen = false, onOpenChange, active = false, className, children, ...props },
  ref,
) {
  const { collapsed } = useContext(SidebarContext);
  // Controlled support matters because the shell mounts the sidebar twice while the mobile drawer is
  // open; uncontrolled state would drift between the two copies.
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const listId = useId();
  const name = typeof label === 'string' ? label : undefined;

  // Items are anchors, so they need the li wrapper to make the list valid — and to keep list semantics.
  const list = (
    <ul id={collapsed ? undefined : listId} className={styles.groupList} data-rail={collapsed || undefined}>
      {Children.map(children, child => (child != null ? <li>{child}</li> : null))}
    </ul>
  );

  if (collapsed) {
    return (
      <div ref={ref} className={cn(styles.group, className)} {...props}>
        <Popover>
          <Popover.Trigger asChild>
            <button type="button" className={styles.item} data-active={active || undefined} aria-label={name}>
              {icon != null ? <span className={styles.icon}>{icon}</span> : null}
            </button>
          </Popover.Trigger>
          <Popover.Content className={styles.railGroup} side="right" align="start" style={{ padding: 4, minWidth: 180 }} aria-label={name}>
            {/* The flyout has room for labels even though the rail behind it does not. */}
            <SidebarContext.Provider value={{ collapsed: false }}>{list}</SidebarContext.Provider>
          </Popover.Content>
        </Popover>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn(styles.group, className)} {...props}>
      <button type="button" className={styles.item} data-active={active && !open ? '' : undefined} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        {icon != null ? <span className={styles.icon}>{icon}</span> : null}
        <span className={styles.label}>{label}</span>
        <ChevronDown />
      </button>
      {open ? list : null}
    </div>
  );
});

export const Sidebar = Object.assign(SidebarRoot, {
  Section: SidebarSection,
  Item: SidebarItem,
  Group: SidebarGroup,
});
