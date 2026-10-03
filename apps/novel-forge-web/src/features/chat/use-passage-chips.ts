import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { addChip, chipSessionKey, chipStorageKey, markStale, parseStoredChips, type PassageChip, removeChip } from '@/lib/passage-comments';

const NO_CHIPS: readonly PassageChip[] = [];

export interface PassageChipStore {
  chips: readonly PassageChip[];
  /** The chips as they stand this instant, for a send scheduled before the last render. */
  latest: () => readonly PassageChip[];
  /** False when the message already carries as many comments as it can. */
  add: (chip: PassageChip) => boolean;
  remove: (id: string) => void;
  markStale: (ids: ReadonlySet<string>) => void;
  /** Drops the chips a turn took, keeping any added since it was sent. */
  drop: (ids: ReadonlySet<string>) => void;
  /** Puts chips back, as far as the limit allows. */
  restore: (chips: readonly PassageChip[]) => void;
}

const live = new Map<string, readonly PassageChip[]>();
const listeners = new Map<string, Set<() => void>>();

function storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

function currentChips(key: string): readonly PassageChip[] {
  const known = live.get(key);
  if (known) return known;
  let loaded: readonly PassageChip[] = NO_CHIPS;
  try {
    loaded = parseStoredChips(storage()?.getItem(chipStorageKey(key)));
  } catch {
    // Storage blocked: the chat starts with none.
  }
  live.set(key, loaded);
  return loaded;
}

function updateChips(key: string, change: (chips: readonly PassageChip[]) => readonly PassageChip[]): void {
  const next = change(currentChips(key));
  live.set(key, next);
  try {
    if (next.length === 0) storage()?.removeItem(chipStorageKey(key));
    else storage()?.setItem(chipStorageKey(key), JSON.stringify(next));
  } catch {
    // Storage full or blocked: the chips hold in memory until the tab reloads.
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

function restored(chips: readonly PassageChip[], back: readonly PassageChip[]): readonly PassageChip[] {
  return back.reduce((all, chip) => {
    const next = addChip(all, chip);
    return next.kind === 'added' ? next.chips : all;
  }, chips);
}

/**
 * The passage comments waiting in a chat's composer, kept per chat in session storage so they survive the panel closing and a reload, and read
 * after hydration so the server's HTML and the first client render agree. A new chat's comments go with it into the chat it becomes.
 */
export function usePassageChips(novelId: string, sessionId: string | undefined): PassageChipStore {
  const key = chipSessionKey(novelId, sessionId);
  const newChat = chipSessionKey(novelId, undefined);
  const subscribe = useCallback(
    (listener: () => void) => {
      const own = listeners.get(key) ?? new Set();
      own.add(listener);
      listeners.set(key, own);
      return () => own.delete(listener);
    },
    [key],
  );
  const chips = useSyncExternalStore(
    subscribe,
    () => currentChips(key),
    () => NO_CHIPS,
  );

  const previousKey = useRef(key);
  useEffect(() => {
    const from = previousKey.current;
    previousKey.current = key;
    if (from !== newChat || key === newChat || currentChips(key).length > 0) return;
    const carried = currentChips(newChat);
    updateChips(key, () => carried);
    updateChips(newChat, () => NO_CHIPS);
  }, [key, newChat]);

  return {
    chips,
    latest: () => currentChips(key),
    add: chip => {
      const next = addChip(currentChips(key), chip);
      if (next.kind === 'full') return false;
      updateChips(key, () => next.chips);
      return true;
    },
    remove: id => updateChips(key, current => removeChip(current, id)),
    markStale: ids => updateChips(key, current => markStale(current, ids)),
    drop: ids => updateChips(key, current => current.filter(chip => !ids.has(chip.id))),
    restore: back => updateChips(key, current => restored(current, back)),
  };
}
