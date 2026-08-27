import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Dialog, toast } from '@shadow-library/ui';

import { PlusIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { PageHeader, QueryState, RowAction, StatusChip } from '@/components/nf';
import { NewNovelModal } from '@/features/projects/NewNovelModal';
import { listSeedsQueryOptions, type SeedSummaryResponse, useDeleteSeedMutation, useListSeedsQuery } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './ideas.module.css';

const SEED_LIMIT = 50;

// The shelf's only data is the seed list, so the loader prefetches it and the grid paints on the server.
// The params object is the query key, so the prefetch has to name the same first page the component asks for.
export const Route = createFileRoute('/_app/ideas')({
  head: () => ({ meta: [{ title: 'Ideas · Novel Forge' }] }),
  loader: ({ context }) => context.queryClient.prefetchQuery(listSeedsQueryOptions({ limit: SEED_LIMIT, offset: 0 })),
  component: IdeasShelf,
});

function seedLabel(seed: SeedSummaryResponse): string {
  return seed.workingTitle?.trim() || seed.sparkExcerpt?.trim() || 'Untitled idea';
}

function IdeasShelf(): React.JSX.Element {
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const seedsQuery = useListSeedsQuery({ limit: SEED_LIMIT, offset });
  const deleteSeed = useDeleteSeedMutation();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SeedSummaryResponse | undefined>();

  const seeds = seedsQuery.data?.items ?? [];
  const total = seedsQuery.data?.total ?? 0;
  const openStudio = (seedId: string): void => void navigate({ to: '/ideas/$seedId', params: { seedId } });

  const doDelete = (): void => {
    if (!deleteTarget) return;
    deleteSeed.mutate(deleteTarget.projectId, {
      onSuccess: () => {
        toast.success(`Deleted “${seedLabel(deleteTarget)}”`);
        setDeleteTarget(undefined);
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Ideas"
        subtitle={`${total} idea${total === 1 ? '' : 's'} in the studio · nothing here is a novel until you start it`}
        extra={
          <Button variant="primary" prefix={<PlusIcon />} onClick={() => setCreateOpen(true)}>
            New idea
          </Button>
        }
      />

      <QueryState
        isLoading={seedsQuery.isLoading}
        error={seedsQuery.error}
        isEmpty={seeds.length === 0}
        emptyTitle="No ideas yet"
        emptyDescription="Bring a sentence, a paragraph, or nothing at all — the studio asks the questions that turn it into a story."
        emptyAction={{ label: 'New idea', onClick: () => setCreateOpen(true) }}
      >
        <div className={styles.grid}>
          {seeds.map(seed => (
            <div
              key={seed.id}
              className={`nf-cardhover ${styles.card}`}
              role="button"
              tabIndex={0}
              onClick={() => openStudio(seed.projectId)}
              onKeyDown={e => {
                if (e.target !== e.currentTarget) return;
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                openStudio(seed.projectId);
              }}
            >
              <div className={styles.cardTop}>
                <StatusChip intent="accent">
                  <SparkIcon size={12} /> idea
                </StatusChip>
                <div className={styles.spacer} />
                <span className={styles.cardTime}>{relativeTime(seed.updatedAt)}</span>
                <div className="nf-rowactions">
                  <RowAction label="Delete idea" danger onClick={() => setDeleteTarget(seed)}>
                    <TrashIcon size={13} />
                  </RowAction>
                </div>
              </div>
              <h3 className={styles.cardTitle}>{seedLabel(seed)}</h3>
              {seed.workingTitle && seed.sparkExcerpt && <p className={styles.cardSpark}>{seed.sparkExcerpt}</p>}
            </div>
          ))}
          <button onClick={() => setCreateOpen(true)} className={styles.newCard}>
            <span className={styles.newIcon}>
              <PlusIcon size={20} />
            </span>
            <span className={styles.newLabel}>New idea</span>
            <span className={styles.newHint}>Start from a spark</span>
          </button>
        </div>
      </QueryState>

      {total > SEED_LIMIT && (
        <div className={styles.pager}>
          <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - SEED_LIMIT))}>
            Newer
          </Button>
          <span className={styles.pagerLabel}>
            {offset + 1}–{Math.min(offset + SEED_LIMIT, total)} of {total}
          </span>
          <Button variant="ghost" size="sm" disabled={offset + SEED_LIMIT >= total} onClick={() => setOffset(offset + SEED_LIMIT)}>
            Older
          </Button>
        </div>
      )}

      <NewNovelModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDoor="idea"
        onSeedCreated={seed => openStudio(seed.projectId)}
        onCreated={project => navigate({ to: '/novels/$novelId/overview', params: { novelId: project.id } })}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={o => !o && setDeleteTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title={`Delete “${deleteTarget ? seedLabel(deleteTarget) : 'this idea'}”?`}
            description="The sheet, the studio conversation, and everything the studio decided go with it. This cannot be undone."
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteSeed.isPending} onClick={doDelete}>
              Delete idea
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
}
