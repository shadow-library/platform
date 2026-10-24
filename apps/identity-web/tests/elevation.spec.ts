import { describe, expect, it } from 'bun:test';

import { isElevationLive } from '../src/lib/elevation';

const NOW = Date.parse('2026-10-24T12:00:00Z');

describe('isElevationLive', () => {
  it('should return false before /me has loaded', () => {
    expect(isElevationLive(undefined, NOW)).toBe(false);
  });

  it('should return false for a session that was never elevated', () => {
    expect(isElevationLive({ elevated: false }, NOW)).toBe(false);
  });

  it('should return true while the elevation window is open', () => {
    expect(isElevationLive({ elevated: true, elevatedUntil: '2026-10-24T12:05:00Z' }, NOW)).toBe(true);
  });

  it('should return false once the window has closed even though the snapshot still says elevated', () => {
    expect(isElevationLive({ elevated: true, elevatedUntil: '2026-10-24T11:59:59Z' }, NOW)).toBe(false);
  });

  it('should trust the flag when the server sends no window end', () => {
    expect(isElevationLive({ elevated: true }, NOW)).toBe(true);
  });
});
