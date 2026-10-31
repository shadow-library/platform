import { useState } from 'react';

export interface ConfirmTarget<T> {
  target: T | null;
  open: boolean;
  ask: (target: T) => void;
  onOpenChange: (open: boolean) => void;
}

export function useConfirmTarget<T>(): ConfirmTarget<T> {
  const [target, setTarget] = useState<T | null>(null);
  const [open, setOpen] = useState(false);

  const ask = (next: T): void => {
    setTarget(next);
    setOpen(true);
  };

  return { target, open, ask, onOpenChange: setOpen };
}
