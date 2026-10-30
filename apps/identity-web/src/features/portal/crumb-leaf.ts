import { useLocation } from '@tanstack/react-router';
import { createContext, useContext, useEffect } from 'react';

import { type CrumbLeaf } from './portal-crumbs';

type SetCrumbLeaf = (leaf: CrumbLeaf | undefined) => void;

export const CrumbLeafContext = createContext<SetCrumbLeaf>(() => undefined);

export function useCrumbLeaf(label: string | undefined): void {
  const setLeaf = useContext(CrumbLeafContext);
  const pathname = useLocation({ select: location => location.pathname });
  useEffect(() => {
    setLeaf(label == null ? undefined : { pathname, label });
    return () => setLeaf(undefined);
  }, [label, pathname, setLeaf]);
}
