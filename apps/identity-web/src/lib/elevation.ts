import { type MeResponse } from './apis';

/** `elevated` is a snapshot taken when `/me` was fetched, so a window that closed since then still reads true until `elevatedUntil` is checked against the clock. */
export function isElevationLive(me: Pick<MeResponse, 'elevated' | 'elevatedUntil'> | undefined, now: number = Date.now()): boolean {
  if (!me?.elevated) return false;
  if (!me.elevatedUntil) return true;
  return Date.parse(me.elevatedUntil) > now;
}
