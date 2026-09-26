import { Fragment } from 'react';

import { Markdown } from '@/components/nf/Markdown';
import { StatusChip } from '@/components/nf/StatusChip';
import { type ProposalResponse, useListPluginsQuery } from '@/lib/apis';
import { type ChangeOp } from '@/lib/proposals';

import styles from './ChangeOpBody.module.css';

// Fields whose values are prose/Markdown — shown as a rendered block instead of an inline value.
const OP_PROSE_FIELDS = new Set([
  'body',
  'premise',
  'brief',
  'objective',
  'escalation',
  'payoff',
  'hook',
  'conflict',
  'motivation',
  'notes',
  'summary',
  'chapterSummary',
  'instructions',
  'note',
]);

function formatOpValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A readable view of one change-set op: the identifying/scalar fields as a compact key/value grid,
 * and the prose fields (a rewritten body, a new objective, a revision note) rendered as Markdown —
 * so a change reads as what it does, not as a raw JSON blob. Also reused for a continuity proposal's
 * findings, whose blob has no `op` field of its own.
 */
export function ChangeOpBody({ op }: { op: ChangeOp }): React.JSX.Element {
  const rationale = typeof op.rationale === 'string' ? op.rationale.trim() : '';
  const entries = Object.entries(op).filter(([k]) => k !== 'op' && k !== 'rationale' && op[k] !== undefined);
  const prose = entries.filter(([k, v]) => OP_PROSE_FIELDS.has(k) && typeof v === 'string' && v.trim() !== '');
  const inline = entries.filter(([k, v]) => !prose.some(([pk]) => pk === k) && v !== undefined);

  return (
    <div className={styles.opBody}>
      {rationale !== '' && <div className={styles.opRationale}>{rationale}</div>}
      {inline.length > 0 && (
        <div className={styles.opFields}>
          {inline.map(([k, v]) => (
            <Fragment key={k}>
              <span className={styles.opFieldKey}>{k}</span>
              <span className={styles.opFieldVal}>{formatOpValue(v)}</span>
            </Fragment>
          ))}
        </div>
      )}
      {prose.map(([k, v]) => (
        <div key={k}>
          <div className={styles.opProseLabel}>{k}</div>
          <Markdown content={v as string} className={styles.opProse} />
        </div>
      ))}
    </div>
  );
}

/** A plugin proposal's `scopeRef` is the id of the plugin that staged it. */
export function PluginSourceChip({ proposal }: { proposal: ProposalResponse }): React.JSX.Element | null {
  const isPlugin = proposal.kind === 'plugin' && Boolean(proposal.scopeRef);
  const pluginsQuery = useListPluginsQuery(isPlugin);
  if (!isPlugin) return null;
  return <StatusChip intent="accent">{pluginsQuery.data?.find(manifest => manifest.id === proposal.scopeRef)?.title ?? proposal.scopeRef}</StatusChip>;
}
