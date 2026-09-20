import { createContext, type PropsWithChildren, type ReactElement, useContext, useEffect, useMemo, useRef } from 'react';

import { type ItemPagerJump } from '@/components/nf';
import { canJump, type JumpScope } from '@/lib/command-scope';

type ScopeSource = () => JumpScope | null;

interface CommandScopeValue {
  register: (source: ScopeSource) => () => void;
  openJump: () => void;
}

const CommandScopeContext = createContext<CommandScopeValue | null>(null);

export interface CommandScopeProviderProps {
  onOpenScope: (scope: JumpScope) => void;
  onScopeGone: () => void;
}

export function CommandScopeProvider({ onOpenScope, onScopeGone, children }: PropsWithChildren<CommandScopeProviderProps>): ReactElement {
  const sourceRef = useRef<ScopeSource | null>(null);
  const value = useMemo<CommandScopeValue>(
    () => ({
      register: source => {
        sourceRef.current = source;
        return () => {
          if (sourceRef.current !== source) return;
          sourceRef.current = null;
          onScopeGone();
        };
      },
      openJump: () => {
        const scope = sourceRef.current?.() ?? null;
        if (scope && canJump(scope)) onOpenScope(scope);
      },
    }),
    [onOpenScope, onScopeGone],
  );

  return <CommandScopeContext.Provider value={value}>{children}</CommandScopeContext.Provider>;
}

/**
 * Registers a getter rather than the scope itself, so a route need not memoise what it passes: re-rendering
 * with a fresh object never re-runs the effect, and the palette reads the live list at the moment it opens.
 */
export function useCollectionJump(scope: JumpScope | null): ItemPagerJump | undefined {
  const context = useContext(CommandScopeContext);
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  });
  useEffect(() => context?.register(() => scopeRef.current), [context]);

  if (!context || !scope || !canJump(scope)) return undefined;
  return { onJump: context.openJump };
}
