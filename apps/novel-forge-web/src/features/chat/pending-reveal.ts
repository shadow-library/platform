const FLASH_MS = 1_600;

const flashTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

export function findPending(root: HTMLElement | null, key: string): HTMLElement | null {
  return root?.querySelector<HTMLElement>(`[data-pending="${CSS.escape(key)}"]`) ?? null;
}

/** Scrolls a waiting card into view, moves focus to it and outlines it briefly, so the author sees which card the tray meant. */
export function revealPending(target: HTMLElement): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  target.focus({ preventScroll: true });
  clearTimeout(flashTimers.get(target));
  target.removeAttribute('data-flash');
  // Reading layout restarts the outline's animation when the same card is shown twice in a row.
  void target.offsetWidth;
  target.setAttribute('data-flash', '');
  flashTimers.set(
    target,
    setTimeout(() => target.removeAttribute('data-flash'), FLASH_MS),
  );
}
