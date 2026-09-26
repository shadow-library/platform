import { useBlocker } from '@tanstack/react-router';
import { useState } from 'react';

import { type JobEnqueueResponse, useBriefQuery, useListBibleDocsQuery, useListBriefsQuery, useListEntitiesQuery, useListMilestonesQuery, useProjectQuery } from '@/lib/apis';
import { findPlanOp, isWriterExcludedDoc, keptBackStructure, type PlanPage } from '@/lib/plan-card';

import { PlanCard } from './PlanCard';
import { usePlanCard } from './use-plan-card';

export interface ChatPlanCardProps {
  projectId: string;
  proposalId: string;
  /** Sets the canvas's 40px indent under the assistant's avatar. */
  indent?: boolean;
  onAskForChanges?: () => void;
  onPlanAgain?: () => void;
  onWriting?: (job: JobEnqueueResponse) => void;
}

const ENTITY_LIMIT = 500;

export function ChatPlanCard({ projectId, proposalId, indent, onAskForChanges, onPlanAgain, onWriting }: ChatPlanCardProps): React.JSX.Element {
  const card = usePlanCard(projectId, proposalId, onWriting);
  const [dirty, setDirty] = useState(false);
  const entities = useListEntitiesQuery(projectId, { limit: ENTITY_LIMIT });
  const docs = useListBibleDocsQuery(projectId);
  const milestones = useListMilestonesQuery(projectId);
  const project = useProjectQuery(projectId);
  const briefs = useListBriefsQuery(projectId);
  const op = card.proposal ? findPlanOp(card.proposal)?.op : undefined;
  const replanning = op !== undefined && (briefs.data?.items ?? []).some(brief => brief.chapter === op.chapter);
  const brief = useBriefQuery(projectId, op?.chapter, replanning);

  useBlocker({ shouldBlockFn: () => false, enableBeforeUnload: () => dirty || card.saving || card.saveError !== null });

  const items = entities.data?.items ?? [];
  const characters = items.filter(entity => entity.type === 'character').map(({ entityKey, name }) => ({ entityKey, name }));
  const pages: PlanPage[] = [
    ...items.map(entity => ({ ref: `entity:${entity.entityKey}`, label: entity.name })),
    ...(docs.data?.docs ?? [])
      .filter(doc => !doc.isEmpty)
      .map(doc => ({ ref: `bible_doc:${doc.section}/${doc.slug}`, label: doc.title, writerExcluded: isWriterExcludedDoc(doc.section, doc.slug) })),
  ];

  return (
    <PlanCard
      {...card}
      indent={indent}
      loading={card.loading || entities.isLoading || project.isLoading || (replanning && brief.isLoading)}
      characters={characters}
      milestones={milestones.data?.milestones ?? []}
      pages={pages}
      kept={keptBackStructure(op?.isEnding === true || brief.data?.isEnding === true)}
      projectContentMode={project.data?.contentMode ?? 'standard'}
      chapterContentMode={brief.data?.contentMode ?? null}
      onDirtyChange={setDirty}
      onAskForChanges={onAskForChanges && (() => void card.settled().then(saved => saved && onAskForChanges()))}
      onPlanAgain={onPlanAgain}
    />
  );
}
