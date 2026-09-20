import { type ReactElement, type ReactNode, useId, useState } from 'react';

import { IconButton } from '@shadow-library/ui';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { resolveCollectionView } from '@/lib/collection-page';
import { type PanelState, panelToggleLabel, togglePanelState, toPanelState } from '@/lib/side-panel';

import styles from './SidePanel.module.css';

export interface SidePanelProps {
  /** Names the landmark and the collapse control. Context for the centre — relationships, ledgers, a seed — never navigation. */
  title: string;
  /**
   * A count or status chip beside the title. It also rides the 40px collapsed rail, which is when a
   * count matters most — so keep it to a number or a dot, never a phrase.
   */
  titleAccessory?: ReactNode;
  actions?: ReactNode;
  /** What the panel holds, in a few words — "2 waiting". Joined to the collapse control's name, so the count the rail shows sighted readers is announced too. */
  summary?: string;
  /** Size of what the panel holds, and the trigger for the `empty` slot. */
  total?: number;
  /** Rendered instead of the body when `total` is 0 — a sentence, not an `EmptyState`; 300px is too narrow for one. */
  empty?: ReactNode;
  /** Pinned below the body behind a divider, for the destructive or whole-history action the rows must not sit level with. */
  footer?: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}

export function SidePanel({
  title,
  titleAccessory,
  actions,
  summary,
  total,
  empty,
  footer,
  collapsible = true,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  children,
}: SidePanelProps): ReactElement {
  const bodyId = useId();
  const [ownState, setOwnState] = useState<PanelState>(() => toPanelState(defaultCollapsed));
  const state = collapsed === undefined ? ownState : toPanelState(collapsed);
  const view = resolveCollectionView(total, empty != null);

  const toggle = (): void => {
    const next = togglePanelState(state);
    if (collapsed === undefined) setOwnState(next);
    onCollapsedChange?.(next === 'collapsed');
  };

  const toggleLabel = panelToggleLabel(title, state, summary);

  return (
    <aside className={styles.root} data-state={state} aria-label={title}>
      {state === 'collapsed' ? (
        <button type="button" className={styles.reopen} aria-label={toggleLabel} aria-expanded={false} aria-controls={bodyId} onClick={toggle}>
          <ChevronLeftIcon size={14} />
          {titleAccessory != null && (
            <span className={styles.railAccessory} aria-hidden="true">
              {titleAccessory}
            </span>
          )}
          <span className={styles.reopenTitle} aria-hidden="true">
            {title}
          </span>
        </button>
      ) : (
        <div className={styles.head}>
          <h2 className={styles.title}>{title}</h2>
          {titleAccessory}
          <span className={styles.spacer} />
          {actions}
          {collapsible && (
            <IconButton size="sm" variant="ghost" icon={<ChevronRightIcon size={14} />} aria-label={toggleLabel} aria-expanded aria-controls={bodyId} onClick={toggle} />
          )}
        </div>
      )}
      <div className={styles.body} id={bodyId} hidden={state === 'collapsed'}>
        {view.kind === 'empty' ? <p className={styles.empty}>{empty}</p> : children}
        {footer != null && <div className={styles.footer}>{footer}</div>}
      </div>
    </aside>
  );
}
