/**
 * Importing npm packages
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { copyText, downloadTextFile } from './browser';

/**
 * Declaring the constants
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('returns true when the clipboard write resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('token')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('token');
  });

  it('returns false when the clipboard write rejects', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    await expect(copyText('token')).resolves.toBe(false);
  });
});

describe('downloadTextFile', () => {
  it('builds an object URL, clicks a download anchor, and revokes the URL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadTextFile('recovery.txt', 'code-1\ncode-2');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
