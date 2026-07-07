/**
 * Defining types
 */
export type FileStatus = 'queued' | 'uploading' | 'complete' | 'error';

export interface FileItem {
  /** Stable id. */
  id: string;
  /** The underlying File. */
  file: File;
  name: string;
  size: number;
  status: FileStatus;
  /** 0–100 while uploading. */
  progress?: number;
  /** Message when status is 'error'. */
  error?: string;
}

export interface UploadHandle {
  /** Report 0–100 progress. */
  onProgress: (percent: number) => void;
  /** Aborts when the row is cancelled/removed. */
  signal: AbortSignal;
}

export interface FileUploadProps {
  /** Fires whenever the file set or any status changes. */
  onValueChange?: (files: FileItem[]) => void;
  /** Accepted extensions or MIME types (e.g. `['.pdf', '.png']`). */
  accept?: string[];
  /** Max bytes per file. */
  maxSize?: number;
  /** Max number of files. */
  maxFiles?: number;
  /** Transport — the component owns queueing (3 parallel), progress, cancel, retry. Omit to just collect files. */
  upload?: (file: File, handle: UploadHandle) => Promise<void>;
  /** `zone` is the dashed dropzone; `button` is a compact trigger + list. @default 'zone' */
  variant?: 'zone' | 'button';
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-label'?: string;
}
