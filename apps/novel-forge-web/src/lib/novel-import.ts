import { type FileItem } from '@shadow-library/ui';

export interface LatestOnly {
  /** Starts a read and returns a check that stays true only until a later read begins or the reads are cancelled. */
  begin: () => () => boolean;
  cancel: () => void;
}

/** The bundle to read from the upload's value: its latest file, unless FileUpload rejected it. */
export function bundleFileOf(files: FileItem[]): File | undefined {
  const latest = files.at(-1);
  return latest?.status === 'error' ? undefined : latest?.file;
}

export function latestOnly(): LatestOnly {
  let current = 0;
  return {
    begin: () => {
      const read = ++current;
      return () => read === current;
    },
    cancel: () => {
      current += 1;
    },
  };
}
