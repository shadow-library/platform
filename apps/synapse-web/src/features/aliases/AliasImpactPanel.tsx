import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, FormField, Statistic, Table, type TableColumn } from '@shadow-library/ui';

import { type CatalogDocument, type ModelEntry, readAliases, readModels, readTasks, useDraftEdit } from '@/features/catalog';
import {
  type DraftNotice,
  DraftNoticeAlert,
  formatNumber,
  formatSignedUsd,
  modelDisplayName,
  modelEligibility,
  ModelPicker,
  Mono,
  SectionHeader,
  signedUsdFormat,
  usdFormat,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { aliasImpactQueryOptions, type AliasImpactRowResponse, type Capabilities } from '@/lib';

import { needsImageCaveat, relativeChange } from './alias-impact';
import { retargetAliasEdit } from './alias-form';
import { aliasModelNeeds, aliasOutcomeNotice, type AliasRow, defaultAliasNote, featureNames } from './alias-view';
import styles from './Aliases.module.css';

interface AliasImpactPanelProps {
  /** The name as the working document has it: the draft's when there is one */
  alias: AliasRow;
  /** The document a save applies to: the draft when there is one, else the active version */
  workingDocument: CatalogDocument;
  activeDocument: CatalogDocument | null;
  candidate?: string;
  capabilities: Capabilities;
  onClose: () => void;
}

function deltaClass(delta: number): string | undefined {
  if (delta < 0) return styles.cheaper;
  if (delta > 0) return styles.dearer;
  return undefined;
}

export function AliasImpactPanel({ alias, workingDocument, activeDocument, candidate, capabilities, onClose }: AliasImpactPanelProps): ReactElement {
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const draftEdit = useDraftEdit();
  const [notice, setNotice] = useState<DraftNotice | null>(null);
  const published = activeDocument ? readAliases(activeDocument).find(entry => entry.key === alias.key) : undefined;
  const impact = useQuery({ ...aliasImpactQueryOptions(alias.key, candidate), enabled: published !== undefined });

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sectionRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const close = (
    <Button variant="ghost" size="sm" onClick={onClose}>
      Close
    </Button>
  );

  if (!activeDocument || !published)
    return (
      <section ref={sectionRef} className={styles.panel} aria-label={`Impact of changing ${alias.name}`}>
        <SectionHeader title={`Impact: ${alias.name}`} action={close} headingRef={headingRef} />
        <Alert intent="info" title={`${alias.name} isn't published yet`}>
          No calls have used it, so there is nothing to compare. Point it at a model with Edit.
        </Alert>
      </section>
    );

  const models = readModels(activeDocument);
  const modelByKey = new Map(models.map(model => [model.key, model]));
  const tasks = new Map(readTasks(activeDocument).map(task => [task.key, task]));
  const nameOf = (key: string): string => {
    const model = modelByKey.get(key);
    return model ? modelDisplayName(model) : key;
  };
  const needs = aliasModelNeeds(workingDocument, alias.key);
  const workingModels = readModels(workingDocument);
  const candidateModel = candidate ? (workingModels.find(model => model.key === candidate) ?? modelByKey.get(candidate)) : undefined;
  const eligibility = candidateModel ? modelEligibility(candidateModel, needs) : undefined;
  const draftMoved = alias.target.key !== published.model;

  const chooseCandidate = (model?: string): void => {
    setNotice(null);
    void navigate({ to: '/aliases', search: { alias: alias.key, ...(model && { model }) } });
  };

  const retarget = async (model: string): Promise<void> => {
    setNotice(null);
    const target = nameOf(model);
    const outcome = await draftEdit.apply(retargetAliasEdit(alias.key, alias.target.key, model), defaultAliasNote(alias.name, 'retargeted', target));
    setNotice(
      outcome.kind === 'unchanged'
        ? { intent: 'info', title: 'Nothing to save', body: `The draft already points ${alias.name} to ${target}.` }
        : aliasOutcomeNotice(outcome, alias.name, 'retargeted'),
    );
  };

  const data = impact.data;
  const comparedModel = (key: string): ModelEntry | undefined => modelByKey.get(key) ?? workingModels.find(model => model.key === key);
  const columns: TableColumn<AliasImpactRowResponse>[] = [
    {
      id: 'feature',
      header: 'Feature',
      cell: row => {
        const names = featureNames(row.app, row.task, tasks);
        return (
          <span className={styles.stack}>
            <span>
              {names.app} · {names.feature}
            </span>
            <Mono>{row.task}</Mono>
          </span>
        );
      },
    },
    { id: 'calls', header: 'Calls', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.calls)}</span> },
    { id: 'inputTokens', header: 'Input tokens', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.inputTokens)}</span> },
    { id: 'cachedInputTokens', header: 'Cached input', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.cachedInputTokens)}</span> },
    { id: 'outputTokens', header: 'Output tokens', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.outputTokens)}</span> },
    ...(data?.retarget
      ? [
          {
            id: 'deltaUsd',
            header: 'API-price change',
            align: 'end' as const,
            cell: (row: AliasImpactRowResponse) => (row.deltaUsd == null ? '—' : <span className={deltaClass(row.deltaUsd)}>{formatSignedUsd(row.deltaUsd)}</span>),
          },
        ]
      : []),
  ];

  return (
    <section ref={sectionRef} className={styles.panel} aria-label={`Impact of changing ${alias.name}`}>
      <SectionHeader
        title={`Impact: ${alias.name}`}
        subtitle={data ? `Calls made with this name in the last ${data.windowDays} days, priced at the published catalog's list prices.` : undefined}
        action={close}
        headingRef={headingRef}
      />
      {draftMoved ? (
        <p className={controls.hint}>
          The draft already points {alias.name} to {alias.target.name ?? alias.target.key}; this comparison starts from the published model, {nameOf(published.model)}.
        </p>
      ) : null}
      <div className={styles.controls}>
        <FormField label="Compare with" className={styles.candidate}>
          <ModelPicker
            {...needs}
            models={models}
            value={candidate ?? null}
            onValueChange={model => chooseCandidate(model)}
            disableIneligible={false}
            placeholder="Choose a model to compare"
            aria-label="Model to compare with"
          />
        </FormField>
        {candidate ? (
          <Button variant="ghost" onClick={() => chooseCandidate(undefined)}>
            Clear
          </Button>
        ) : null}
        {candidate && capabilities.writeDraft ? (
          <Button variant="secondary" onClick={() => void retarget(candidate)} loading={draftEdit.pending} disabled={candidate === alias.target.key}>
            Point {alias.name} to this model in the draft
          </Button>
        ) : null}
      </div>
      {models.length < 2 ? <p className={controls.hint}>The published catalog has no other model to compare with.</p> : null}
      {candidate && candidate === alias.target.key ? <p className={controls.hint}>The draft already points {alias.name} to this model.</p> : null}
      {eligibility && !eligibility.eligible ? (
        <p className={controls.hint}>
          Features offering {alias.name} may not be able to use it: {eligibility.reasons.join('; ')}. Publishing checks this.
        </p>
      ) : null}
      {candidate && !capabilities.writeDraft ? <p className={controls.hint}>Changing the target needs permission to change the catalog.</p> : null}
      {notice ? <DraftNoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.result} /> : null}

      {impact.error ? (
        <Alert intent="danger" title="Couldn't load the impact" className={styles.result}>
          {impact.error.message}
        </Alert>
      ) : (
        <Card padding="md" className={styles.result}>
          <Card.Body>
            <div className={styles.summary}>
              <Statistic label="Calls" value={data?.totalCalls ?? 0} loading={impact.isLoading} />
              {data?.retarget ? (
                <>
                  <Statistic label={`At ${nameOf(data.retarget.fromModel)}`} value={data.retarget.currentUsd} format={usdFormat(data.retarget.currentUsd)} />
                  <Statistic label={`At ${nameOf(data.retarget.toModel)}`} value={data.retarget.proposedUsd} format={usdFormat(data.retarget.proposedUsd)} />
                  <Statistic
                    label="API-price change"
                    value={data.retarget.deltaUsd}
                    format={signedUsdFormat(data.retarget.deltaUsd)}
                    delta={relativeChange(data.retarget.deltaUsd, data.retarget.currentUsd)}
                    positiveIs="down"
                    comparison={`vs ${nameOf(data.retarget.fromModel)}`}
                  />
                </>
              ) : null}
            </div>
            {data && !data.retarget ? (
              <p className={controls.hint}>Choose a model to see what the same traffic would cost at its list prices. It now goes to {nameOf(data.model)}.</p>
            ) : null}
            <Table
              data={data?.rows ?? []}
              columns={columns}
              rowKey={row => `${row.app}/${row.task}`}
              loading={impact.isLoading}
              aria-label={`Calls made with ${alias.name} by feature`}
              emptyState="No calls used this name in the window."
            />
            {data?.retarget && needsImageCaveat([comparedModel(data.retarget.fromModel), comparedModel(data.retarget.toModel)]) ? (
              <p className={controls.hint}>Image output is not priced.</p>
            ) : null}
          </Card.Body>
        </Card>
      )}
    </section>
  );
}
