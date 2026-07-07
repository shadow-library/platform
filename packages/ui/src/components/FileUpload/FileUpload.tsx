/**
 * Importing npm packages
 */
import { type DragEvent, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { Button } from '../Button';
import { Progress } from '../Progress';
import styles from './FileUpload.module.css';
import { type FileItem, type FileUploadProps } from './FileUpload.types';

/**
 * Declaring the constants
 */
let counter = 0;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : 'FILE';
}

function accepts(file: File, accept: string[] | undefined): boolean {
  if (!accept || accept.length === 0) return true;
  const name = file.name.toLowerCase();
  return accept.some(rule => {
    const token = rule.trim().toLowerCase();
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return file.type.startsWith(token.slice(0, -1));
    return file.type === token;
  });
}

function RemoveIcon() {
  return (
    <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth={1.5} strokeLinecap='round' aria-hidden='true'>
      <path d='M4 4l8 8M12 4l-8 8' />
    </svg>
  );
}

/**
 * A dropzone that proxies a hidden file input (full keyboard + screen-reader path; drag is
 * enhancement). Constraints are printed up front and in the accessible name; files are validated at
 * selection and rejected in place with the rule named, never silently dropped. When an `upload`
 * transport is given, the component owns the queue (3 parallel), per-row Progress, cancel via
 * AbortSignal, and retry.
 */
export function FileUpload({
  onValueChange,
  accept,
  maxSize,
  maxFiles,
  upload,
  variant = 'zone',
  disabled = false,
  invalid = false,
  className,
  'aria-label': ariaLabel,
}: FileUploadProps) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<FileItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const active = useRef(0);
  const queue = useRef<string[]>([]);

  useEffect(() => {
    itemsRef.current = items;
    onValueChange?.(items);
  }, [items, onValueChange]);

  function patch(id: string, next: Partial<FileItem>): void {
    setItems(list => list.map(item => (item.id === id ? { ...item, ...next } : item)));
  }

  function pump(): void {
    while (active.current < 3 && queue.current.length > 0) {
      const id = queue.current.shift();
      if (id == null) break;
      active.current += 1;
      void startUpload(id);
    }
  }

  async function startUpload(id: string): Promise<void> {
    const item = itemsRef.current.find(entry => entry.id === id);
    if (!item || !upload) {
      active.current -= 1;
      return;
    }
    const controller = new AbortController();
    controllers.current.set(id, controller);
    patch(id, { status: 'uploading', progress: 0, error: undefined });
    try {
      await upload(item.file, { onProgress: percent => patch(id, { progress: Math.round(percent) }), signal: controller.signal });
      patch(id, { status: 'complete', progress: 100 });
    } catch {
      if (!controller.signal.aborted) patch(id, { status: 'error', error: 'Upload failed' });
    } finally {
      controllers.current.delete(id);
      active.current -= 1;
      pump();
    }
  }

  function addFiles(fileList: FileList | File[]): void {
    if (disabled) return;
    const incoming = Array.from(fileList);
    const room = maxFiles != null ? Math.max(0, maxFiles - itemsRef.current.length) : incoming.length;
    const next: FileItem[] = [];
    for (const file of incoming.slice(0, room)) {
      const id = `file-${++counter}`;
      let error: string | undefined;
      if (!accepts(file, accept)) error = 'File type not allowed';
      else if (maxSize != null && file.size > maxSize) error = `${formatBytes(file.size)} — exceeds ${formatBytes(maxSize)} limit`;
      next.push({ id, file, name: file.name, size: file.size, status: error ? 'error' : upload ? 'queued' : 'complete', error });
    }
    setItems(list => [...list, ...next]);
    if (upload) {
      for (const item of next) {
        if (item.status === 'queued') queue.current.push(item.id);
      }
      // Let state settle before reading itemsRef in the pump.
      queueMicrotask(pump);
    }
  }

  function remove(id: string): void {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems(list => list.filter(item => item.id !== id));
  }

  function retry(id: string): void {
    patch(id, { status: 'queued', error: undefined });
    queue.current.push(id);
    queueMicrotask(pump);
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  }

  const constraints = [accept ? accept.join(', ') : null, maxSize ? `up to ${formatBytes(maxSize)} each` : null].filter(Boolean).join(' · ');
  const zoneLabel = `${ariaLabel ?? 'Choose files'}${constraints ? `. ${constraints}` : ''}`;

  return (
    <div className={cn(styles.root, className)} data-disabled={disabled || undefined}>
      <input
        ref={inputRef}
        type='file'
        className={styles.hiddenInput}
        multiple
        accept={accept?.join(',')}
        disabled={disabled}
        onChange={event => event.target.files && addFiles(event.target.files)}
        tabIndex={-1}
        aria-hidden='true'
      />

      {variant === 'zone' ? (
        <button
          type='button'
          className={styles.zone}
          data-drag={dragging || undefined}
          data-invalid={invalid || undefined}
          disabled={disabled}
          aria-label={zoneLabel}
          onClick={() => inputRef.current?.click()}
          onDragOver={event => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className={styles.zoneTitle}>Drag files here or click to browse</span>
          {constraints ? <span className={styles.zoneMeta}>{constraints}</span> : null}
        </button>
      ) : (
        <Button variant='secondary' disabled={disabled} aria-label={zoneLabel} onClick={() => inputRef.current?.click()}>
          Choose files
        </Button>
      )}

      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map(item => (
            <li key={item.id} className={styles.row} data-status={item.status}>
              <span className={styles.tile} aria-hidden='true'>
                {extensionOf(item.name)}
              </span>
              <div className={styles.rowText}>
                <span className={styles.rowName}>{item.name}</span>
                {item.status === 'error' ? (
                  <span className={styles.rowError}>{item.error ?? 'Upload failed'}</span>
                ) : item.status === 'uploading' ? (
                  <Progress value={item.progress ?? 0} aria-label={`Uploading ${item.name}`} />
                ) : (
                  <span className={styles.rowMeta}>{formatBytes(item.size)}</span>
                )}
              </div>
              {item.status === 'error' && upload ? (
                <Button variant='text' size='sm' onClick={() => retry(item.id)}>
                  Retry
                </Button>
              ) : null}
              <button type='button' className={styles.remove} aria-label={`Remove ${item.name}`} onClick={() => remove(item.id)}>
                <RemoveIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
