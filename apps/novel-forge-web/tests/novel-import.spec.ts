import { describe, expect, it } from 'bun:test';
import { type FileItem } from '@shadow-library/ui';

import { bundleFileOf, latestOnly } from '@/lib/novel-import';

const item = (name: string, status: FileItem['status']): FileItem => {
  const file = new File(['{}'], name, { type: 'application/json' });
  return { id: name, file, name, size: file.size, status };
};

describe('bundleFileOf', () => {
  it('should pick the latest accepted file', () => {
    const accepted = item('bundle.json', 'complete');
    expect(bundleFileOf([item('old.json', 'complete'), accepted])).toBe(accepted.file);
  });

  it('should read nothing from a file the upload rejected', () => {
    expect(bundleFileOf([item('bundle.txt', 'error')])).toBeUndefined();
  });

  it('should read nothing once the file is removed', () => {
    expect(bundleFileOf([])).toBeUndefined();
  });
});

describe('latestOnly', () => {
  it('should keep only the latest read current', () => {
    const reads = latestOnly();
    const first = reads.begin();
    const second = reads.begin();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('should retire an in-flight read when cancelled', () => {
    const reads = latestOnly();
    const read = reads.begin();
    reads.cancel();

    expect(read()).toBe(false);
  });
});
