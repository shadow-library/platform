import { createContext, type PropsWithChildren, type ReactElement, useCallback, useContext, useMemo, useState } from 'react';
import { useMediaQuery } from '@shadow-library/ui';

import { isSidebarCollapsed, SIDEBAR_RAIL_QUERY, type SidebarRail, sidebarRailAt, type ViewportBand } from '@/lib/sidebar-rail';

export interface SidebarRailValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarRailContext = createContext<SidebarRailValue | null>(null);

/** Mounted above the routes: the projects home and a project each mount their own shell, and the author's toggle has to outlive the switch. */
export function SidebarRailProvider({ children }: PropsWithChildren): ReactElement {
  const band: ViewportBand = useMediaQuery(SIDEBAR_RAIL_QUERY) ? 'narrow' : 'wide';
  const [stored, setStored] = useState<SidebarRail>({ band });
  const rail = sidebarRailAt(stored, band);
  if (rail !== stored) setStored(rail);

  const collapsed = isSidebarCollapsed(rail);
  const setCollapsed = useCallback((choice: boolean) => setStored({ band, choice }), [band]);
  const value = useMemo<SidebarRailValue>(() => ({ collapsed, setCollapsed }), [collapsed, setCollapsed]);

  return <SidebarRailContext.Provider value={value}>{children}</SidebarRailContext.Provider>;
}

export function useSidebarRail(): SidebarRailValue | null {
  return useContext(SidebarRailContext);
}
