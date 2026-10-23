import { Slot, Slottable } from '@radix-ui/react-slot';
import { Children, forwardRef, type MouseEvent, type ReactNode, useContext, useEffect, useId, useRef, useState } from 'react';

import { useControllableState } from '@/hooks';
import { cn } from '@/lib';

import { Popover } from '../Popover';
import { ShellMobileNavAreaContext } from '../Shell/Shell.context';
import { Tooltip, TooltipProvider } from '../Tooltip';
import { SidebarContext } from './Sidebar.context';
import styles from './Sidebar.module.css';
import { type SidebarGroupProps, type SidebarItemProps, type SidebarProps, type SidebarSectionProps, type SidebarSwitcherOption, type SidebarSwitcherProps } from './Sidebar.types';

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

function ChevronsUpDown() {
  return (
    <svg className={styles.switcherChevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 6.5 8 3.5l3 3M11 9.5 8 12.5l-3-3" />
    </svg>
  );
}

function CheckMark() {
  return (
    <svg className={styles.switcherCheck} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5l6-7" />
    </svg>
  );
}

function SwitcherMark({ option }: { option?: SidebarSwitcherOption }) {
  if (option?.imageUrl != null) return <img className={styles.switcherThumb} src={option.imageUrl} alt="" />;
  return <span className={styles.switcherDot} style={option?.color != null ? { background: option.color } : undefined} aria-hidden="true" />;
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {collapsed ? <path d="M6 4l4 4-4 4" /> : <path d="M10 4L6 8l4 4" />}
    </svg>
  );
}

/** A nav landmark of links with `aria-current` on the active item and `aria-expanded` group buttons; the rail transition keeps every destination reachable. */
const SidebarRoot = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { workspace, footer, collapsed: collapsedProp, defaultCollapsed, storageKey, onCollapsedChange, className, children, 'aria-label': ariaLabel = 'Main', ...props },
  ref,
) {
  // Inside the shell's mobile nav drawer the sidebar is always expanded: rail mode and its toggle are desktop furniture.
  const mobileNav = useContext(ShellMobileNavAreaContext);
  const [collapsedState, setCollapsedState] = useControllableState({
    value: collapsedProp,
    defaultValue: defaultCollapsed ?? false,
    onChange: onCollapsedChange,
  });
  const restored = useRef(false);

  // The persisted choice is adopted in a mount effect, never during render (no localStorage on the server), as in ThemeProvider. The ref stops a fresh onChange identity re-
  // applying it over a user toggle.
  useEffect(() => {
    if (restored.current || storageKey == null || collapsedProp !== undefined) return;
    restored.current = true;
    const stored = readStoredCollapsed(storageKey);
    if (stored != null) setCollapsedState(stored);
  }, [storageKey, collapsedProp, setCollapsedState]);

  const collapsed = mobileNav != null ? false : collapsedState;
  // Opting in means a handler, a persisted key or an explicit starting state; a controlled `collapsed` with no handler is a fixed rail.
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

const SidebarSection = forwardRef<HTMLDivElement, SidebarSectionProps>(function SidebarSection({ label, className, children, ...props }, ref) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <div ref={ref} className={cn(styles.section, className)} {...props}>
      {label != null && !collapsed ? <div className={styles.sectionLabel}>{label}</div> : null}
      {children}
    </div>
  );
});

const SidebarItem = forwardRef<HTMLAnchorElement, SidebarItemProps>(function SidebarItem(
  { icon, badge, active = false, asChild = false, label, indent = false, clamp = false, className, onClick, children, ...props },
  ref,
) {
  const { collapsed } = useContext(SidebarContext);
  const mobileNav = useContext(ShellMobileNavAreaContext);
  const Comp = asChild ? Slot : 'a';
  const name = label ?? (typeof children === 'string' ? children : undefined);

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
      data-indent={indent || undefined}
      data-clamp={clamp || undefined}
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

/** In rail mode the trigger opens the nested list in a side flyout, so collapsing the sidebar never strands a destination. */
const SidebarGroup = forwardRef<HTMLDivElement, SidebarGroupProps>(function SidebarGroup(
  { label, icon, link, action, open: openProp, defaultOpen = false, onOpenChange, active = false, className, children, ...props },
  ref,
) {
  const { collapsed } = useContext(SidebarContext);
  // Controlled support matters because the shell mounts the sidebar twice while the mobile drawer is
  // open; uncontrolled state would drift between the two copies.
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const listId = useId();
  const name = typeof label === 'string' ? label : undefined;

  const list = (
    <ul id={collapsed ? undefined : listId} className={styles.groupList} data-rail={collapsed || undefined}>
      {Children.map(children, child => (child != null ? <li>{child}</li> : null))}
    </ul>
  );

  const destination =
    link != null ? (
      <SidebarItem asChild icon={icon} label={name}>
        {link}
      </SidebarItem>
    ) : null;

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
            <SidebarContext.Provider value={{ collapsed: false }}>
              {destination}
              {list}
              {action != null ? <div className={styles.railAction}>{action}</div> : null}
            </SidebarContext.Provider>
          </Popover.Content>
        </Popover>
      </div>
    );
  }

  const toggle = (
    <button
      type="button"
      className={link != null ? styles.groupToggle : styles.item}
      data-active={link == null && active && !open ? '' : undefined}
      aria-expanded={open}
      aria-controls={listId}
      aria-label={link != null ? `${open ? 'Collapse' : 'Expand'} ${name ?? 'group'}` : undefined}
      onClick={() => setOpen(!open)}
    >
      {link == null && icon != null ? <span className={styles.icon}>{icon}</span> : null}
      {link == null ? <span className={styles.label}>{label}</span> : null}
      <ChevronDown />
    </button>
  );

  return (
    <div ref={ref} className={cn(styles.group, className)} {...props}>
      {link != null || action != null ? (
        <div className={styles.groupHeader}>
          {destination ?? toggle}
          {action}
          {link != null ? toggle : null}
        </div>
      ) : (
        toggle
      )}
      {open ? list : null}
    </div>
  );
});

/** Not a nav item: it names the scope every destination below it resolves against. In rail mode it shrinks to its avatar and the flyout still carries the full list. */
const SidebarSwitcher = forwardRef<HTMLDivElement, SidebarSwitcherProps>(function SidebarSwitcher(
  { current, options, emptyLabel = 'All projects', menuLabel = 'Switch project', onSelect, footerAction, loading = false, className, ...props },
  ref,
) {
  const { collapsed } = useContext(SidebarContext);
  // Owned rather than left to the Popover, so choosing an option can close the menu before navigating —
  // otherwise the overlay outlives the route change and lands on top of the new screen.
  const [open, setOpen] = useState(false);
  const label = current?.label ?? emptyLabel;

  function choose(run: () => void): void {
    setOpen(false);
    run();
  }

  return (
    <div ref={ref} className={cn(styles.switcher, className)} {...props}>
      <Popover open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className={styles.switcherTrigger} aria-label={`${label} — switch`}>
            <SwitcherMark option={current} />
            {collapsed ? null : (
              <>
                <span className={styles.switcherMeta}>
                  <span className={styles.switcherName}>{label}</span>
                  {current?.caption != null ? <span className={styles.switcherCaption}>{current.caption}</span> : null}
                </span>
                <ChevronsUpDown />
              </>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Content className={styles.switcherMenu} side={collapsed ? 'right' : 'bottom'} align="start" sideOffset={6} aria-label={menuLabel}>
          <div className={styles.sectionLabel}>{menuLabel}</div>
          {loading ? <div className={styles.switcherEmpty}>Loading…</div> : null}
          {!loading && options.length === 0 ? <div className={styles.switcherEmpty}>Nothing to switch to.</div> : null}
          {options.map(option => (
            <button
              key={option.id}
              type="button"
              className={styles.switcherRow}
              aria-current={option.id === current?.id ? 'true' : undefined}
              onClick={() => choose(() => onSelect(option.id))}
            >
              <SwitcherMark option={option} />
              <span className={styles.switcherMeta}>
                <span className={styles.switcherName}>{option.label}</span>
                {option.caption != null ? <span className={styles.switcherCaption}>{option.caption}</span> : null}
              </span>
              {option.id === current?.id ? <CheckMark /> : null}
            </button>
          ))}
          {footerAction != null ? (
            <>
              <div className={styles.switcherDivider} />
              <button type="button" className={styles.switcherRow} onClick={() => choose(footerAction.onSelect)}>
                {footerAction.icon != null ? <span className={styles.icon}>{footerAction.icon}</span> : null}
                <span className={styles.switcherName}>{footerAction.label}</span>
              </button>
            </>
          ) : null}
        </Popover.Content>
      </Popover>
    </div>
  );
});

export const Sidebar = Object.assign(SidebarRoot, {
  Section: SidebarSection,
  Item: SidebarItem,
  Group: SidebarGroup,
  Switcher: SidebarSwitcher,
});
