import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useId, useMemo, useState } from 'react';

import { Avatar, Button, IconButton, toast, Tooltip } from '@shadow-library/ui';

import { ChevronLeftIcon, LockIcon, PlusIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { Markdown, StatusChip } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { ImageGallery } from '@/components/nf/ImageGallery';
import { ImageUpload } from '@/components/nf/ImageUpload';
import {
  type BibleDocListItem,
  type EntityResponse,
  type FactResponse,
  useAddEntityImageMutation,
  useDeleteEntityImageByIdMutation,
  useDeleteEntityImageMutation,
  useEntityQuery,
  useUploadEntityImageMutation,
} from '@/lib/apis';
import { docAddress } from '@/lib/bible-documents';
import { guidesMentioning, leadSection } from '@/lib/bible-entries';
import { type BibleSearch } from '@/lib/bible-search';
import { knownFactsAbout, secretRevealLabel, secretsAbout, secretTitle } from '@/lib/bible-secrets';
import { type BibleTopic, TOPIC_LABEL } from '@/lib/bible-topics';
import { stripEntityHeading, TYPE_SINGULAR } from '@/lib/story-bible';

import { SecretCard } from './SecretCard';
import styles from './StoryBible.module.css';

export interface EntityPaneProps {
  novelId: string;
  entity: EntityResponse;
  topic: BibleTopic;
  facts: readonly FactResponse[];
  docs: readonly BibleDocListItem[];
  backSearch: BibleSearch;
  onEdit: (entity: EntityResponse) => void;
  onDelete: (entity: EntityResponse) => void;
  onAddSecret: (entityKey: string) => void;
  onAddFact: (entityKey: string) => void;
  onEditFact: (fact: FactResponse) => void;
}

export function EntityPane({ novelId, entity, topic, facts, docs, backSearch, onEdit, onDelete, onAddSecret, onAddFact, onEditFact }: EntityPaneProps): ReactElement {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const fullId = useId();
  const entityKey = entity.entityKey;
  const secrets = useMemo(() => secretsAbout(facts, entityKey), [facts, entityKey]);
  const known = useMemo(() => knownFactsAbout(facts, entityKey), [facts, entityKey]);
  const mentions = useMemo(() => guidesMentioning(entity.name, docs), [entity.name, docs]);
  const body = stripEntityHeading(entity.body ?? '', entity.name);
  const { lead, truncated } = leadSection(body);
  const hasMore = truncated || Boolean(entity.appearance?.trim()) || Boolean(entity.notes?.trim());

  return (
    <section className={styles.pane} aria-label={entity.name}>
      <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={backSearch} className={styles.paneBack}>
        <ChevronLeftIcon size={14} /> Back to the list
      </Link>

      <header className={styles.paneHeader}>
        <Avatar name={entity.name} src={entity.imageUrl ?? undefined} alt="" size="xl" shape="square" />
        <div className={styles.paneIdentity}>
          <h2 className={styles.paneTitle}>{entity.name}</h2>
          <div className={styles.paneChips}>
            <StatusChip intent="neutral">{TYPE_SINGULAR[entity.type]}</StatusChip>
            <StatusChip intent={entity.significance === 'major' ? 'accent' : 'neutral'}>{entity.significance === 'major' ? 'Major' : 'Minor'}</StatusChip>
            {entity.status && <StatusChip intent="neutral">{entity.status}</StatusChip>}
            <StatusChip intent="neutral">{TOPIC_LABEL[topic]}</StatusChip>
          </div>
        </div>
        <div className={styles.paneActions}>
          <Button variant="secondary" size="sm" onClick={() => onEdit(entity)}>
            Edit
          </Button>
          <Tooltip content="Generate portrait">
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={`Generate a portrait of ${entity.name}`}
              icon={<SparkIcon size={15} />}
              onClick={() => navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { subject: 'entity', key: entityKey, start: true } })}
            />
          </Tooltip>
          <Tooltip content={`Delete ${entity.name}`}>
            <IconButton variant="ghost" size="sm" aria-label={`Delete ${entity.name}`} icon={<TrashIcon size={15} />} onClick={() => onDelete(entity)} />
          </Tooltip>
        </div>
      </header>

      {entity.motivation?.trim() && (
        <div className={styles.wants}>
          <p className={styles.label}>Wants</p>
          <Markdown content={entity.motivation} className={styles.prose} />
        </div>
      )}

      {lead ? <Markdown content={expanded ? body : lead} className={styles.prose} /> : <p className={styles.muted}>No summary written yet.</p>}
      {expanded && (
        <div id={fullId} className={styles.col}>
          {entity.appearance?.trim() && (
            <>
              <p className={styles.label}>Appearance</p>
              <Markdown content={entity.appearance} className={styles.prose} />
            </>
          )}
          {entity.notes?.trim() && (
            <>
              <p className={styles.label}>Notes</p>
              <Markdown content={entity.notes} className={styles.prose} />
            </>
          )}
        </div>
      )}
      {hasMore && (
        <button type="button" className={styles.linkButton} aria-expanded={expanded} aria-controls={fullId} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Show less' : 'Read full entry'}
        </button>
      )}

      <section className={styles.secrets} aria-label={`Secrets about ${entity.name}`}>
        <div className={styles.secretsHead}>
          <LockIcon size={16} />
          <h3 className={styles.secretsTitle}>Secrets · {secrets.length}</h3>
          <span className={styles.secretsHint}>Hidden from the writer until their reveal chapter</span>
          <Button variant="secondary" size="sm" prefix={<PlusIcon size={14} />} onClick={() => onAddSecret(entityKey)}>
            Add secret
          </Button>
        </div>
        {secrets.length === 0 ? (
          <p className={styles.muted}>No secrets about {entity.name}. Add one for anything the reader should learn later.</p>
        ) : (
          secrets.map(fact => <SecretCard key={fact.factKey} fact={fact} onEdit={onEditFact} />)
        )}
      </section>

      <div className={styles.twoCol}>
        <section className={styles.col} aria-label="Known facts">
          <h3 className={styles.label}>Known facts</h3>
          {known.length === 0 ? (
            <p className={styles.muted}>None yet. Facts the cast already knows appear here.</p>
          ) : (
            <ul className={styles.factList}>
              {known.map(fact => (
                <li key={fact.factKey} className={styles.factItem}>
                  <p className={styles.secretText}>{fact.text}</p>
                  <span className={styles.factMeta}>
                    <StatusChip intent="success">{secretRevealLabel(fact)}</StatusChip>
                    <button type="button" className={styles.linkButton} aria-label={`Edit ${secretTitle(fact.factKey)}`} onClick={() => onEditFact(fact)}>
                      Edit
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={styles.linkButton} onClick={() => onAddFact(entityKey)}>
            + Add fact
          </button>
        </section>
        <section className={styles.col} aria-label="Mentioned in">
          <h3 className={styles.label}>Mentioned in</h3>
          {mentions.length === 0 ? (
            <p className={styles.muted}>No guide names {entity.name} in its title or opening lines.</p>
          ) : (
            <div className={styles.chipLinks}>
              {mentions.map(doc => (
                <Link key={docAddress(doc)} to="/novels/$novelId/story-bible" params={{ novelId }} search={{ guide: docAddress(doc) }} className={styles.chipLink}>
                  {doc.title}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <EntityImages novelId={novelId} entity={entity} />

      <ForgeBar
        novelId={novelId}
        scope={{ type: 'novel', title: entity.name }}
        placeholder={`Ask Forge to update ${entity.name} — add a detail, change a trait, note a new relationship…`}
      />
    </section>
  );
}

interface EntityImagesProps {
  novelId: string;
  entity: EntityResponse;
}

function EntityImages({ novelId, entity }: EntityImagesProps): ReactElement {
  const entityKey = entity.entityKey;
  const full = useEntityQuery(novelId, entityKey).data;
  const uploadImage = useUploadEntityImageMutation(novelId, entityKey);
  const removeImage = useDeleteEntityImageMutation(novelId, entityKey);
  const addGalleryImage = useAddEntityImageMutation(novelId, entityKey);
  const removeGalleryImage = useDeleteEntityImageByIdMutation(novelId, entityKey);
  const hasPortrait = Boolean(entity.imageUrl);

  return (
    <section className={styles.imagesSection} aria-label="Portrait and gallery">
      <h3 className={styles.label}>Portrait &amp; gallery</h3>
      <ImageGallery
        leading={
          <ImageUpload
            variant="tile"
            src={entity.imageUrl ?? undefined}
            alt={entity.name}
            label="Portrait"
            emptyLabel="Add portrait"
            uploading={uploadImage.isPending || removeImage.isPending}
            onUpload={image => uploadImage.mutate(image, { onSuccess: () => toast.success(`Updated ${entity.name}’s image`), onError: e => toast.danger(e.message) })}
            onRemove={() => removeImage.mutate(undefined, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
          />
        }
        images={(full?.images ?? []).map(img => ({ id: img.id, url: img.imageUrl, caption: img.caption }))}
        busy={addGalleryImage.isPending || removeGalleryImage.isPending || !full}
        showAdd={hasPortrait}
        addLabel="Add more"
        addAriaLabel="Add another image"
        onAdd={image => addGalleryImage.mutate(image, { onSuccess: () => toast.success('Image added'), onError: e => toast.danger(e.message) })}
        onRemove={id => removeGalleryImage.mutate(id, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
      />
    </section>
  );
}
