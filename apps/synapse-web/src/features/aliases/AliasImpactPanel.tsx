import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, FormField, Select, Statistic, Table, type TableColumn } from '@shadow-library/ui';

import { type AliasEntry, type CatalogDocument, draftExpectation, type ModelEntry, withAliasModel } from '@/features/catalog';
import { formatNumber, formatSignedUsd, Mono, SectionHeader, signedUsdFormat, usdFormat } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { aliasImpactQueryOptions, type AliasImpactRowResponse, type Capabilities, draftQueryOptions, isApiError, isCatalogConflict, useSaveDraftMutation } from '@/lib';

import { relativeChange } from './alias-impact';
import styles from './Aliases.module.css';

interface AliasImpactPanelProps {
  alias: AliasEntry;
  models: ModelEntry[];
  candidate?: string;
  activeDocument: CatalogDocument;
  capabilities: Capabilities;
}

type RetargetState = { status: 'idle' } | { status: 'saved'; model: string; issues: number } | { status: 'failed'; title: string; message: string };

const RETARGET_FAILED = "Couldn't retarget the alias in the draft";

function deltaClass(delta: number): string | undefined {
  if (delta < 0) return styles.cheaper;
  if (delta > 0) return styles.dearer;
  return undefined;
}

export function AliasImpactPanel({ alias, models, candidate, activeDocument, capabilities }: AliasImpactPanelProps): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const impact = useQuery(aliasImpactQueryOptions(alias.key, candidate));
  const save = useSaveDraftMutation();
  const [retarget, setRetarget] = useState<RetargetState>({ status: 'idle' });
  const [preparing, setPreparing] = useState(false);
  const candidates = models.filter(model => model.key !== alias.model);

  const chooseCandidate = (model?: string): void => {
    setRetarget({ status: 'idle' });
    void navigate({ to: '/aliases', search: { alias: alias.key, ...(model && { model }) } });
  };

  /** Applied to the draft as it stands right now, so the save keeps every other edit already in it. */
  const handleRetarget = async (model: string): Promise<void> => {
    setRetarget({ status: 'idle' });
    setPreparing(true);
    const draft = await queryClient.fetchQuery({ ...draftQueryOptions(), staleTime: 0 }).catch((error: unknown) => {
      setRetarget({ status: 'failed', title: RETARGET_FAILED, message: isApiError(error) ? error.message : "Couldn't read the current draft" });
      return undefined;
    });
    setPreparing(false);
    if (draft === undefined) return;
    const next = withAliasModel(draft?.draft.document ?? activeDocument, alias.key, model);
    if (!next.ok) return setRetarget({ status: 'failed', title: RETARGET_FAILED, message: next.reason });
    const note = draft?.draft.note ?? `Retarget alias ${alias.key} to ${model}`;
    save.mutate(
      { document: next.document, note, ...draftExpectation(draft?.fingerprint ?? null) },
      {
        onSuccess: outcome =>
          setRetarget(
            outcome.kind === 'done'
              ? { status: 'saved', model, issues: outcome.value.issues.length }
              : { status: 'failed', title: RETARGET_FAILED, message: outcome.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ') },
          ),
        onError: error =>
          setRetarget(
            isCatalogConflict(error)
              ? { status: 'failed', title: 'The draft changed while this was being saved', message: 'Nothing was saved. Try again to apply the retarget to the current draft.' }
              : { status: 'failed', title: RETARGET_FAILED, message: error.message },
          ),
      },
    );
  };

  const data = impact.data;
  const columns: TableColumn<AliasImpactRowResponse>[] = [
    { id: 'app', header: 'App', cell: row => <Mono>{row.app}</Mono> },
    { id: 'task', header: 'Task', cell: row => <Mono>{row.task}</Mono> },
    { id: 'calls', header: 'Calls', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.calls)}</span> },
    { id: 'inputTokens', header: 'Input tokens', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.inputTokens)}</span> },
    { id: 'cachedInputTokens', header: 'Cached input', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.cachedInputTokens)}</span> },
    { id: 'outputTokens', header: 'Output tokens', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.outputTokens)}</span> },
    ...(data?.retarget
      ? [
          {
            id: 'deltaUsd',
            header: 'List-price delta',
            align: 'end' as const,
            cell: (row: AliasImpactRowResponse) => (row.deltaUsd == null ? '—' : <span className={deltaClass(row.deltaUsd)}>{formatSignedUsd(row.deltaUsd)}</span>),
          },
        ]
      : []),
  ];

  return (
    <section className={styles.panel} aria-label={`Impact of retargeting ${alias.label}`}>
      <SectionHeader
        title={`Impact: ${alias.label}`}
        subtitle={data ? `Calls made through this alias in the last ${data.windowDays} days, priced at the active catalog's list prices.` : undefined}
        action={
          <Button variant="ghost" size="sm" onClick={() => void navigate({ to: '/aliases', search: {} })}>
            Close
          </Button>
        }
      />
      <div className={styles.controls}>
        <FormField label="Candidate target model" className={styles.candidate}>
          <Select value={candidate ?? ''} onValueChange={value => chooseCandidate(value)} placeholder="Choose a model to compare">
            {candidates.map(model => (
              <Select.Item key={model.key} value={model.key} description={model.key}>
                {model.label}
              </Select.Item>
            ))}
          </Select>
        </FormField>
        {candidate ? (
          <Button variant="ghost" onClick={() => chooseCandidate(undefined)}>
            Clear
          </Button>
        ) : null}
        {candidate && capabilities.writeDraft ? (
          <Button variant="secondary" onClick={() => void handleRetarget(candidate)} loading={preparing || save.isPending}>
            Set as the alias target in the draft
          </Button>
        ) : null}
      </div>
      {candidates.length === 0 ? <p className={controls.hint}>The catalog has no other model to retarget this alias to.</p> : null}

      {retarget.status === 'saved' ? (
        <Alert intent={retarget.issues === 0 ? 'success' : 'warning'} title={`The draft now targets ${retarget.model}`} className={styles.result}>
          {retarget.issues === 0 ? 'The draft passes validation.' : `The draft has ${retarget.issues} issue(s) to fix before it can be published.`} Nothing changes for apps until
          it is published:{' '}
          <Link to="/catalog" search={{ tab: 'publish' }}>
            review the diff and publish
          </Link>
          .
        </Alert>
      ) : null}
      {retarget.status === 'failed' ? (
        <Alert intent="danger" title={retarget.title} className={styles.result}>
          {retarget.message}
        </Alert>
      ) : null}

      {impact.error ? (
        <Alert intent="danger" title="Couldn't load the impact">
          {impact.error.message}
        </Alert>
      ) : (
        <Card padding="md" className={styles.result}>
          <Card.Body>
            <div className={styles.summary}>
              <Statistic label="Calls" value={data?.totalCalls ?? 0} loading={impact.isLoading} />
              {data?.retarget ? (
                <>
                  <Statistic label={`At ${data.retarget.fromModel}`} value={data.retarget.currentUsd} format={usdFormat(data.retarget.currentUsd)} />
                  <Statistic label={`At ${data.retarget.toModel}`} value={data.retarget.proposedUsd} format={usdFormat(data.retarget.proposedUsd)} />
                  <Statistic
                    label="List-price delta"
                    value={data.retarget.deltaUsd}
                    format={signedUsdFormat(data.retarget.deltaUsd)}
                    delta={relativeChange(data.retarget.deltaUsd, data.retarget.currentUsd)}
                    positiveIs="down"
                    comparison={`vs ${data.retarget.fromModel}`}
                  />
                </>
              ) : null}
            </div>
            {data && !data.retarget ? (
              <p className={controls.hint}>Choose a candidate model to see what the same traffic would cost at its list prices. Current target: {data.model}.</p>
            ) : null}
            <Table
              data={data?.rows ?? []}
              columns={columns}
              rowKey={row => `${row.app}/${row.task}`}
              loading={impact.isLoading}
              aria-label={`Calls through ${alias.label} by app and task`}
              emptyState="No calls went through this alias in the window."
            />
            {data?.retarget ? <p className={controls.hint}>Image output is not priced.</p> : null}
          </Card.Body>
        </Card>
      )}
    </section>
  );
}
