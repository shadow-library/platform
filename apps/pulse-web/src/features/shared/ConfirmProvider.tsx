import { createContext, type PropsWithChildren, type ReactElement, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from '@shadow-library/ui';

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  intent?: 'primary' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: PropsWithChildren): ReactElement {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '' });
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(options => {
    setState({ ...options, open: true });
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (result: boolean): void => {
    resolver.current?.(result);
    resolver.current = null;
    setState(prev => ({ ...prev, open: false }));
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={state.open}
        onOpenChange={open => !open && settle(false)}
        intent={state.intent ?? 'danger'}
        title={state.title}
        description={state.description}
        confirmLabel={state.confirmLabel ?? 'Delete'}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  );
}
