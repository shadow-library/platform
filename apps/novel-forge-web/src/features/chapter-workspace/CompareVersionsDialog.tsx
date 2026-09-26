import { Dialog, Select } from '@shadow-library/ui';

import { PaneError, PaneLoader } from '@/components/nf';
import { type DraftVersionResponse, useCompareVersionsQuery } from '@/lib/apis';
import { type DiffPiece, diffView, orderedPair } from '@/lib/draft-versions';

import styles from './ChapterDetails.module.css';

export interface CompareVersionsDialogProps {
  novelId: string;
  chapter: number;
  versions: readonly DraftVersionResponse[];
  pair: { a: number; b: number };
  onPairChange: (pair: { a: number; b: number }) => void;
  onOpenChange: (open: boolean) => void;
}

function Piece({ piece }: { piece: DiffPiece }): React.JSX.Element {
  if (piece.op === 'insert') {
    return (
      <ins>
        <span className="sr-only">added: </span>
        {piece.text}
      </ins>
    );
  }
  if (piece.op === 'delete') {
    return (
      <del>
        <span className="sr-only">removed: </span>
        {piece.text}
      </del>
    );
  }
  return <>{piece.text}</>;
}

function versionName(version: DraftVersionResponse): string {
  return version.current ? `Version ${version.revision} (current)` : `Version ${version.revision}`;
}

export function CompareVersionsDialog({ novelId, chapter, versions, pair, onPairChange, onOpenChange }: CompareVersionsDialogProps): React.JSX.Element {
  const ordered = orderedPair(pair.a, pair.b);
  const compareQuery = useCompareVersionsQuery(novelId, chapter, ordered);
  const view = compareQuery.data ? diffView(compareQuery.data) : undefined;

  const picker = (label: string, value: number, onChange: (revision: number) => void): React.JSX.Element => (
    <Select size="sm" aria-label={label} value={String(value)} onValueChange={next => onChange(Number(next))}>
      {versions.map(version => (
        <Select.Item key={version.revision} value={String(version.revision)}>
          {versionName(version)}
        </Select.Item>
      ))}
    </Select>
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="lg">
        <Dialog.Header title={`Compare versions of chapter ${chapter}`} description="Removed text is struck through; added text is highlighted. The older version reads first." />
        <Dialog.Body>
          <div className={styles.compare}>
            <div className={styles.compareBar}>
              {picker('Compare from', pair.a, a => onPairChange({ ...pair, a }))}
              <span className={styles.muted}>with</span>
              {picker('Compare with', pair.b, b => onPairChange({ ...pair, b }))}
            </div>
            {ordered.from === ordered.to ? (
              <span className={styles.muted}>Pick two different versions to compare.</span>
            ) : compareQuery.error ? (
              <PaneError error={compareQuery.error} />
            ) : !view ? (
              <PaneLoader />
            ) : (
              <>
                <span className={styles.meta} role="status">
                  {view.summary}
                </span>
                {!view.identical && (
                  <div className={styles.diff} aria-busy={compareQuery.isPlaceholderData || undefined}>
                    {view.rows.map((row, index) =>
                      row.kind === 'unchanged' ? (
                        <span key={index} className={styles.fold}>
                          {row.count === 1 ? '1 unchanged paragraph' : `${row.count} unchanged paragraphs`}
                        </span>
                      ) : (
                        <p key={index} className={styles.paragraph}>
                          {row.paragraph.pieces.map((piece, pieceIndex) => (
                            <Piece key={pieceIndex} piece={piece} />
                          ))}
                        </p>
                      ),
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog>
  );
}
