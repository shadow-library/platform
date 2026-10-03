import { useEffect } from 'react';

/** ⌘S / Ctrl+S saves while `active`, instead of the browser's own save-page dialog. */
export function useSaveShortcut(active: boolean, save: () => Promise<boolean>): void {
  useEffect(() => {
    if (!active) return;
    const saveOnShortcut = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      void save();
    };
    window.addEventListener('keydown', saveOnShortcut);
    return () => window.removeEventListener('keydown', saveOnShortcut);
  }, [active, save]);
}
