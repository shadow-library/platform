import { type ReactElement, type ReactNode, useState } from 'react';

import { Alert, Button, Checkbox, Dialog, Select, toast } from '@shadow-library/ui';

import { type BibleTidyItem, type EntityType, useApplyBibleTidyMutation, useBibleTidyPreviewQuery, useUndoBibleTidyMutation } from '@/lib/apis';
import { BIBLE_DOC_SECTION_LABEL } from '@/lib/bible-documents';
import { buildTidySelections, groupByDocument, groupCheckState, groupTidyItems, seedTidySelection, tidyApplyLabel, type TidyGroup } from '@/lib/bible-tidy';
import { ALL_TYPES, TYPE_SINGULAR } from '@/lib/story-bible';

import styles from './BibleTidyDialog.module.css';

const NOTHING_CHOSEN: ReadonlySet<string> = new Set();

export interface BibleTidyDialogProps {
  novelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BibleTidyDialog({ novelId, open, onOpenChange }: BibleTidyDialogProps): ReactElement {
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);
  const [types, setTypes] = useState<Record<string, EntityType>>({});
  const preview = useBibleTidyPreviewQuery(novelId, open);
  const apply = useApplyBibleTidyMutation(novelId);
  const undo = useUndoBibleTidyMutation(novelId);

  const items = preview.data?.items ?? [];
  const groups = groupTidyItems(items);
  const seeded = seedTidySelection(chosen, preview.data?.items);
  if (seeded !== chosen) setChosen(seeded);
  const included = seeded ?? NOTHING_CHOSEN;
  const selections = buildTidySelections(items, included, types);

  const setIncluded = (ids: readonly string[], include: boolean): void =>
    setChosen(prev => {
      const next = new Set(prev ?? NOTHING_CHOSEN);
      for (const id of ids) {
        if (include) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const reset = (): void => {
    setChosen(null);
    setTypes({});
  };

  const changeOpen = (next: boolean): void => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = (): void =>
    apply.mutate(
      { items: selections },
      {
        onSuccess: result => {
          changeOpen(false);
          toast.success(`Story Bible tidied — ${selections.length} change${selections.length === 1 ? '' : 's'}`, {
            body: 'Recorded in the change history.',
            action: { label: 'Undo', onClick: () => undo.mutate(result.proposal.id) },
          });
        },
        onError: err => {
          if (err.code === 'DOC_002') void preview.refetch();
          toast.danger(err.message);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Dialog.Content size="lg" className={styles.dialog}>
        <Dialog.Header title="Tidy up the Story Bible" description="Nothing changes until you apply, and everything applied can be undone from the change history." />
        <Dialog.Body className={styles.body}>
          {preview.isLoading ? (
            <p className={styles.placeholder}>Looking through the Story Bible…</p>
          ) : preview.error ? (
            <Alert intent="danger" title="Could not prepare the tidy-up.">
              {preview.error.message}
            </Alert>
          ) : groups.length === 0 ? (
            <p className={styles.placeholder}>Nothing to tidy — every page is titled, filled in and holds only story.</p>
          ) : (
            groups.map(group => (
              <TidyGroupSection key={group.kind} group={group} included={included} onInclude={setIncluded}>
                {group.kind === 'split'
                  ? groupByDocument(group.items).map(doc => (
                      <div key={doc.key} className={styles.document}>
                        <p className={styles.documentLabel}>From “{doc.docTitle}”</p>
                        {doc.items.map(entry => (
                          <SplitRow
                            key={entry.id}
                            item={entry}
                            included={included.has(entry.id)}
                            type={types[entry.id] ?? entry.entityType ?? 'concept'}
                            onInclude={include => setIncluded([entry.id], include)}
                            onType={type => setTypes(prev => ({ ...prev, [entry.id]: type }))}
                          />
                        ))}
                      </div>
                    ))
                  : group.items.map(entry => <TidyRow key={entry.id} item={entry} included={included.has(entry.id)} onInclude={include => setIncluded([entry.id], include)} />)}
              </TidyGroupSection>
            ))
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={apply.isPending} disabled={selections.length === 0 || preview.isFetching} onClick={submit}>
            {tidyApplyLabel(selections.length)}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface TidyGroupSectionProps {
  group: TidyGroup;
  included: ReadonlySet<string>;
  onInclude: (ids: readonly string[], include: boolean) => void;
  children: ReactNode;
}

function TidyGroupSection({ group, included, onInclude, children }: TidyGroupSectionProps): ReactElement {
  const state = groupCheckState(group.items, included);
  const ids = group.items.map(item => item.id);
  return (
    <section className={styles.group}>
      <Checkbox
        className={styles.groupHead}
        checked={state}
        onCheckedChange={() => onInclude(ids, state !== true)}
        label={<span className={styles.groupLabel}>{`${group.label} · ${group.items.length}`}</span>}
        description={group.description}
      />
      <div className={styles.items}>{children}</div>
    </section>
  );
}

interface TidyRowProps {
  item: BibleTidyItem;
  included: boolean;
  onInclude: (include: boolean) => void;
}

function rowContent(item: BibleTidyItem): { label: ReactNode; description: ReactNode } {
  const section = BIBLE_DOC_SECTION_LABEL[item.section];
  if (item.kind === 'retitle') return { label: `“${item.currentTitle ?? item.slug}” → “${item.proposedTitle ?? ''}”`, description: section };
  if (item.kind === 'move_ai_notes') {
    return { label: `From “${item.docTitle}” to ${BIBLE_DOC_SECTION_LABEL.ai}`, description: <span className={styles.quote}>{item.text}</span> };
  }
  return { label: item.docTitle, description: `${section} · empty` };
}

function TidyRow({ item, included, onInclude }: TidyRowProps): ReactElement {
  const { label, description } = rowContent(item);
  return <Checkbox className={styles.row} checked={included} onCheckedChange={next => onInclude(next === true)} label={label} description={description} />;
}

interface SplitRowProps {
  item: BibleTidyItem;
  included: boolean;
  type: EntityType;
  onInclude: (include: boolean) => void;
  onType: (type: EntityType) => void;
}

function SplitRow({ item, included, type, onInclude, onType }: SplitRowProps): ReactElement {
  return (
    <div className={styles.splitRow}>
      <Checkbox
        className={styles.row}
        checked={included}
        onCheckedChange={next => onInclude(next === true)}
        label={item.entityName}
        description={<span className={styles.quote}>{item.text}</span>}
      />
      <Select size="sm" value={type} onValueChange={next => onType(next as EntityType)} disabled={!included} aria-label={`Record type for ${item.entityName}`}>
        {ALL_TYPES.map(option => (
          <Select.Item key={option} value={option}>
            {TYPE_SINGULAR[option]}
          </Select.Item>
        ))}
      </Select>
    </div>
  );
}
