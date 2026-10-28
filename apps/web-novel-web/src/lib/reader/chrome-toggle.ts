const OWN_GESTURE_SELECTOR = 'a, .chapter-table, pre';

/** A tap on a link or a swipe across a scrolling table or code block belongs to that element, not to the reader chrome. */
export function togglesReaderChrome(target: EventTarget | null): boolean {
  return !(target instanceof Element && target.closest(OWN_GESTURE_SELECTOR));
}
