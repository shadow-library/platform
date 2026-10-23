export type FileStatus = 'queued' | 'uploading' | 'complete' | 'error';

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: FileStatus;
  /** 0–100 while uploading. */
  progress?: number;
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
  accept?: string[];
  maxSize?: number;
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
