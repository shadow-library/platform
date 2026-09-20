import { type ReactElement, type ReactNode, useId, useState } from 'react';

import { IconButton } from '@shadow-library/ui';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { type PanelState, panelToggleLabel, togglePanelState, toPanelState } from '@/lib/side-panel';

import styles from './SidePanel.module.css';

export interface SidePanelProps {
  /** Names the landmark and the collapse control. Context for the centre — relationships, ledgers, a seed — never navigation. */
  title: string;
  /** A count or status chip beside the title. */
  titleAccessory?: ReactNode;
  actions?: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
}

export function SidePanel({ title, titleAccessory, actions, collapsible = true, collapsed, defaultCollapsed = false, onCollapsedChange, children }: SidePanelProps): ReactElement {
  const bodyId = useId();
  const [ownState, setOwnState] = useState<PanelState>(() => toPanelState(defaultCollapsed));
  const state = collapsed === undefined ? ownState : toPanelState(collapsed);

  const toggle = (): void => {
    const next = togglePanelState(state);
    if (collapsed === undefined) setOwnState(next);
    onCollapsedChange?.(next === 'collapsed');
  };

  const toggleLabel = panelToggleLabel(title, state);

  return (
    <aside className={styles.root} data-state={state} aria-label={title}>
      {state === 'collapsed' ? (
        <button type="button" className={styles.reopen} aria-label={toggleLabel} aria-expanded={false} aria-controls={bodyId} onClick={toggle}>
          <ChevronLeftIcon size={14} />
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
        {children}
      </div>
    </aside>
  );
}
