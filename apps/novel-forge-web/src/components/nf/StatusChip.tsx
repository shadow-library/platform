import { type ReactElement, type ReactNode } from 'react';

export type ChipIntent = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'ai';

export interface StatusChipProps {
  intent?: ChipIntent;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}

export function StatusChip({ intent = 'neutral', dot = false, className, children }: StatusChipProps): ReactElement {
  return (
    <span className={className ? `nf-chip ${className}` : 'nf-chip'} data-intent={intent}>
      {dot && <span className="nf-dot" />}
      {children}
    </span>
  );
}
