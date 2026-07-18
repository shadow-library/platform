/**
 * Importing npm packages
 */
import { type ReactNode, useRef } from 'react';
import { Spinner } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { ImageIcon, TrashIcon } from '@/components/icons';
import { ACCEPT_ATTR, readImageFile, type UploadMime } from './image-file';
import styles from './ImageUpload.module.css';

/**
 * A small, reusable image picker: shows the current image (or a placeholder) and reveals Upload /
 * Replace / Remove actions over it. The parent sizes and shapes the box via `className`, and receives
 * the chosen file as base64 bytes ready for the upload endpoints.
 */
interface ImageUploadProps {
  src?: string;
  alt: string;
  uploading?: boolean;
  className?: string;
  placeholder?: ReactNode;
  onUpload: (body: { mime: UploadMime; image: string }) => void;
  onRemove?: () => void;
}

export function ImageUpload({ src, alt, uploading, className, placeholder, onUpload, onRemove }: ImageUploadProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (): void => inputRef.current?.click();

  return (
    <div className={`${styles.preview} ${className ?? ''}`} data-empty={src ? undefined : 'true'}>
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
          {src ? 'Replace' : 'Upload'}
        </button>
        {src && onRemove && (
          <button type="button" className={`${styles.action} ${styles.actionDanger}`} onClick={() => onRemove()} disabled={uploading} aria-label="Remove image">
            <TrashIcon size={14} />
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} className={styles.input} onChange={e => readImageFile(e.target.files?.[0], onUpload)} />
    </div>
  );
}
