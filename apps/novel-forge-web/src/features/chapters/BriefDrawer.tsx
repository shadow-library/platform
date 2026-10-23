import { Alert, Button, Drawer } from '@shadow-library/ui';

import { SparkIcon } from '@/components/icons';
import { GenerationStatus, PaneError, PaneLoader } from '@/components/nf';
import { BriefSections } from '@/features/briefs';
import { useBriefQuery } from '@/lib/apis';
import { type ChapterGeneration } from '@/lib/generation-activity';

import styles from './chapters.module.css';

interface BriefDrawerProps {
  novelId: string;
  chapter: number;
  generation?: ChapterGeneration;
  generateLabel?: string;
  onOpenChange: (open: boolean) => void;
  onGenerate?: () => void;
  generating: boolean;
}

export function BriefDrawer({ novelId, chapter, generation, generateLabel, onOpenChange, onGenerate, generating }: BriefDrawerProps): React.JSX.Element {
  const briefQuery = useBriefQuery(novelId, chapter);
  const brief = briefQuery.data;

  return (
    <Drawer open onOpenChange={onOpenChange} placement="right" size="md">
      <Drawer.Header title={brief?.title ?? `Chapter ${chapter}`} meta={`Chapter ${chapter} · Brief`} />
      <Drawer.Body>
        {generation && (
          <div className={styles.drawerStatus}>
            <GenerationStatus generation={generation} />
          </div>
        )}
        {briefQuery.isLoading ? (
          <PaneLoader />
        ) : briefQuery.error ? (
          <PaneError error={briefQuery.error} />
        ) : brief ? (
          <>
            {brief.staleReason && (
              <Alert intent="warning" title="This brief is stale" className={styles.notice}>
                {brief.staleReason} — refresh the outline before generating from it.
              </Alert>
            )}
            <BriefSections brief={brief} />
          </>
        ) : null}
      </Drawer.Body>
      {onGenerate && (
        <Drawer.Footer>
          <Button variant="primary" prefix={<SparkIcon />} loading={generating} onClick={onGenerate}>
            {generateLabel}
          </Button>
        </Drawer.Footer>
      )}
    </Drawer>
  );
}
