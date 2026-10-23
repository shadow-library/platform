import { createContext, type ReactElement, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/Dialog';
import { type ConfirmFn, type ConfirmOptions, type ConfirmProviderProps } from './ConfirmProvider.types';

interface ConfirmRequest extends ConfirmOptions {
  id: number;
  open: boolean;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider');
  return confirm;
}

/** Keeps ConfirmDialog's defaults (`primary`, "Confirm"): a destructive question passes `intent: 'danger'` and its verb. */
export function ConfirmProvider({ children }: ConfirmProviderProps): ReactElement {
  const [request, setRequest] = useState<ConfirmRequest>({ id: 0, open: false, title: '' });
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean): void => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setRequest(current => ({ ...current, open: false }));
  }, []);

  const confirm = useCallback<ConfirmFn>(options => {
    resolver.current?.(false);
    setRequest(current => ({ ...options, id: current.id + 1, open: true }));
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => () => resolver.current?.(false), []);

  const { id, open, ...options } = request;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog key={id} {...options} open={open} onOpenChange={next => !next && settle(false)} onConfirm={() => settle(true)} />
    </ConfirmContext.Provider>
  );
}
