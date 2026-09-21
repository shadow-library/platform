import { type ReactNode, useRef } from 'react';
import { Spinner } from '@shadow-library/ui';

import { ImageIcon, TrashIcon } from '@/components/icons';
import { ACCEPT_ATTR, readImageFile, type UploadMime } from './image-file';
import styles from './ImageUpload.module.css';

interface ImageUploadProps {
  src?: string;
  alt: string;
  uploading?: boolean;
  className?: string;
  placeholder?: ReactNode;
  /** 'tile' matches ImageGallery's tile size and, when empty, its dashed add-tile look instead of the panel placeholder. */
  variant?: 'panel' | 'tile';
  /** Text (and accessible name) for the empty-state upload affordance. */
  emptyLabel?: string;
  /** Accessible name applied to the filled-state container, e.g. "Portrait". */
  label?: string;
  onUpload: (body: { mime: UploadMime; image: string }) => void;
  onRemove?: () => void;
}

export function ImageUpload({
  src,
  alt,
  uploading,
  className,
  placeholder,
  variant = 'panel',
  emptyLabel = 'Upload',
  label,
  onUpload,
  onRemove,
}: ImageUploadProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (): void => inputRef.current?.click();

  const input = <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className={styles.input} onChange={e => readImageFile(e.target.files?.[0], onUpload)} />;

  if (!src && variant === 'tile') {
    return (
      <>
        <button type="button" className={`${styles.addTile} ${className ?? ''}`} onClick={pick} disabled={uploading}>
          {uploading ? (
            <Spinner size="sm" />
          ) : (
            <>
              <ImageIcon size={18} />
              <span className={styles.addLabel}>{emptyLabel}</span>
            </>
          )}
        </button>
        {input}
      </>
    );
  }

  return (
    <div className={`${styles.preview} ${variant === 'tile' ? styles.tile : ''} ${className ?? ''}`} data-empty={src ? undefined : 'true'} aria-label={src ? label : undefined}>
      {src ? (
        <img src={src} alt={alt} className={styles.img} />
      ) : (
        (placeholder ?? (
          <div className={styles.placeholder}>
            <ImageIcon size={22} />
          </div>
        ))
      )}

      {uploading && (
        <div className={styles.overlay}>
          <Spinner size="md" />
        </div>
      )}

      <div className={styles.bar}>
        <button type="button" className={styles.action} onClick={pick} disabled={uploading}>
          <ImageIcon size={14} />
          {src ? 'Replace' : emptyLabel}
        </button>
        {src && onRemove && (
          <button type="button" className={`${styles.action} ${styles.actionDanger}`} onClick={() => onRemove()} disabled={uploading} aria-label="Remove image">
            <TrashIcon size={14} />
          </button>
        )}
      </div>

      {input}
    </div>
  );
}
