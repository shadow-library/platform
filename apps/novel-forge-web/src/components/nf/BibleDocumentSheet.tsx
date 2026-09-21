import { type ReactElement, useEffect, useRef, useState } from 'react';

import { Dialog, Switch } from '@shadow-library/ui';

import { formatWordCount } from '@/lib/field-card';
import { extractHeadings } from '@/lib/markdown-outline';

import { Markdown } from './Markdown';
import styles from './BibleDocumentSheet.module.css';

export interface BibleDocumentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  sectionLabel: string;
  wordCount: number | undefined;
  loading: boolean;
  body: string | null | undefined;
}

/**
 * The prose-with-structure viewer for a story bible document: an outline to jump the rendered
 * markdown by heading, and a Raw toggle for the one time an author wants the literal source.
 * Give it a `key` that identifies the open document (e.g. `section/slug`) so switching documents
 * remounts it and the Raw toggle resets, rather than carrying the previous document's toggle state.
 */
export function BibleDocumentSheet({ open, onOpenChange, title, sectionLabel, wordCount, loading, body }: BibleDocumentSheetProps): ReactElement {
  const [raw, setRaw] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const text = body ?? '';
  const headings = extractHeadings(text);

  useEffect(() => {
    if (raw || !containerRef.current) return;
    containerRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el, index) => {
      el.id = `bible-doc-heading-${index}`;
    });
  }, [raw, text]);

  const jumpTo = (index: number): void => {
    document.getElementById(`bible-doc-heading-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="lg" className={styles.sheet}>
        <Dialog.Header
          title={title}
          description={
            <span className={styles.meta}>
              {sectionLabel}
              {wordCount ? ` · ${formatWordCount(wordCount)}` : ''}
            </span>
          }
        />
        <Dialog.Body className={styles.body}>
          {loading ? (
            <p className={styles.placeholder}>Loading…</p>
          ) : text.trim() === '' ? (
            <p className={styles.placeholder}>This page has no content yet.</p>
          ) : (
            <>
              <div className={styles.toolbar}>
                {headings.length > 1 ? (
                  <nav className={styles.outline} aria-label="Section outline">
                    {headings.map((heading, index) => (
                      <button key={`${index}-${heading.text}`} type="button" className={styles.outlineItem} data-level={heading.level} onClick={() => jumpTo(index)}>
                        {heading.text}
                      </button>
                    ))}
                  </nav>
                ) : (
                  <span />
                )}
                <Switch label="Raw" checked={raw} onCheckedChange={setRaw} className={styles.rawToggle} />
              </div>
              {raw ? (
                <pre className={styles.raw}>{text}</pre>
              ) : (
                <div ref={containerRef}>
                  <Markdown content={text} className={styles.prose} />
                </div>
              )}
            </>
          )}
        </Dialog.Body>
      </Dialog.Content>
    </Dialog>
  );
}
