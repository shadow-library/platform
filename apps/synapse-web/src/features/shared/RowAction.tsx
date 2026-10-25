import { type ReactElement, type ReactNode, type Ref } from 'react';
import { IconButton, Tooltip } from '@shadow-library/ui';

import controls from './controls.module.css';

export interface RowActionProps {
  icon: ReactNode;
  /** The accessible name, which also carries why the action is unavailable */
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  pressed?: boolean;
  danger?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export interface RowActionsProps {
  children: ReactNode;
}

/** Unavailable actions stay focusable through `aria-disabled` rather than `disabled`, so keyboard users reach the tooltip saying why and focus survives a loading state. */
export function RowAction({ icon, label, tooltip, onClick, disabled = false, loading = false, pressed, danger, ref }: RowActionProps): ReactElement {
  const unavailable = disabled || loading;
  return (
    <Tooltip content={tooltip}>
      <IconButton
        ref={ref}
        icon={icon}
        size="sm"
        variant={danger ? 'danger' : 'ghost'}
        aria-label={label}
        title=""
        disabled={false}
        aria-disabled={unavailable || undefined}
        loading={loading}
        pressed={pressed}
        onClick={() => {
          if (!unavailable) onClick();
        }}
      />
    </Tooltip>
  );
}

export function RowActions({ children }: RowActionsProps): ReactElement {
  return <div className={controls.rowActions}>{children}</div>;
}
