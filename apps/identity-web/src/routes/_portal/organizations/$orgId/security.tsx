/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Badge, Button, Input, Select, Spinner, Switch, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { SectionCard } from '@/components/si';
import { useStepUpGate } from '@/features/portal';
import { organisationPoliciesQueryOptions, type PolicyItem, useClearPolicyMutation, usePoliciesQuery, useSetPolicyMutation } from '@/lib/apis';

import styles from './security.module.css';

/**
 * Defining types
 */
type RequireGate = (action: () => void) => void;

/**
 * Declaring the constants
 *
 * Largest-unit-first so a duration renders in the coarsest unit that divides it evenly (600s → 10 minutes).
 */
const DURATION_UNITS: { label: string; seconds: number }[] = [
  { label: 'days', seconds: 86400 },
  { label: 'hours', seconds: 3600 },
  { label: 'minutes', seconds: 60 },
  { label: 'seconds', seconds: 1 },
];

export const Route = createFileRoute('/_portal/organizations/$orgId/security')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(organisationPoliciesQueryOptions(params.orgId)),
  component: SecurityPage,
});

function pickUnit(seconds: number): number {
  for (const unit of DURATION_UNITS) if (seconds >= unit.seconds && seconds % unit.seconds === 0) return unit.seconds;
  return 1;
}

function humanize(seconds: number): string {
  const unit = pickUnit(seconds);
  const label = DURATION_UNITS.find(item => item.seconds === unit)?.label ?? 'seconds';
  const amount = seconds / unit;
  return `${amount} ${amount === 1 ? label.replace(/s$/, '') : label}`;
}

function SecurityPage(): React.JSX.Element {
  const { orgId } = Route.useParams();
  const policies = usePoliciesQuery(orgId);
  const { require, dialog } = useStepUpGate();

  const list = policies.data?.policies ?? [];

  return (
    <div className={styles.page}>
      <SectionCard
        title="Security policies"
        description="Tighten how long tokens and sessions live for this organisation’s members, and which second factors they may use. The strictest setting across a member’s organisations always wins — you can make a policy stricter than the platform default, never looser."
      >
        {policies.isLoading ? (
          <div className={styles.center}>
            <Spinner size="md" label="Loading policies" />
          </div>
        ) : list.length === 0 ? (
          <div className={styles.empty}>No configurable policies.</div>
        ) : (
          <div className={styles.list}>
            {list.map(policy => (
              <PolicyRow key={policy.key} orgId={orgId} policy={policy} require={require} />
            ))}
          </div>
        )}
      </SectionCard>
      {dialog}
    </div>
  );
}

/**
 * One policy, rendered from its registry metadata alone: a boolean key is a switch, an integer key a
 * duration editor. A new key of either kind renders here with no extra code. The fold-strategy hint
 * spells out how the setting combines across a member's organisations.
 */
function PolicyRow({ orgId, policy, require }: { orgId: string; policy: PolicyItem; require: RequireGate }): React.JSX.Element {
  const set = useSetPolicyMutation();
  const clear = useClearPolicyMutation();

  const isBoolean = policy.type === 'boolean';
  const configured = isBoolean ? policy.configuredEnabled !== undefined : policy.configuredValue !== undefined;
  const hint = isBoolean ? 'Any organisation turning this off turns it off for its members everywhere.' : 'The shortest limit set by any of a member’s organisations applies.';

  const applyValue = (body: { value?: number; enabled?: boolean }): void =>
    require(() => set.mutate({ orgId, policyKey: policy.key, body }, { onSuccess: () => toast.success('Policy updated'), onError: error => toast.danger(error.message) }));

  const reset = (): void =>
    require(() => clear.mutate({ orgId, policyKey: policy.key }, { onSuccess: () => toast.success('Reset to platform default'), onError: error => toast.danger(error.message) }));

  return (
    <div className={styles.row}>
      <div className={styles.rowMain}>
        <div className={styles.rowLabelRow}>
          <span className={styles.rowLabel}>{policy.description}</span>
          <Badge intent={configured ? 'info' : 'neutral'}>{configured ? 'Configured' : 'Inherited'}</Badge>
        </div>
        <div className={styles.rowHint}>{hint}</div>
      </div>
      <div className={styles.rowControl}>
        {isBoolean ? (
          <Switch checked={policy.effectiveEnabled ?? false} onCheckedChange={next => applyValue({ enabled: next === true })} />
        ) : (
          <DurationField
            key={policy.effectiveValue}
            seconds={policy.effectiveValue ?? policy.defaultValue ?? 0}
            min={policy.min}
            max={policy.max}
            busy={set.isPending}
            onSave={value => applyValue({ value })}
          />
        )}
        {configured && (
          <Button variant="ghost" size="sm" loading={clear.isPending} onClick={reset}>
            Reset to default
          </Button>
        )}
      </div>
    </div>
  );
}

function DurationField({ seconds, min, max, busy, onSave }: { seconds: number; min?: number; max?: number; busy: boolean; onSave: (seconds: number) => void }): React.JSX.Element {
  const unit = pickUnit(seconds);
  const [unitSeconds, setUnitSeconds] = useState(unit);
  const [amount, setAmount] = useState(String(seconds / unit));

  const parsed = Number(amount);
  const next = Math.round(parsed * unitSeconds);
  const valid = amount.trim() !== '' && Number.isFinite(parsed) && parsed > 0 && (min === undefined || next >= min) && (max === undefined || next <= max);
  const dirty = next !== seconds;
  const bounds = [min !== undefined ? `min ${humanize(min)}` : null, max !== undefined ? `max ${humanize(max)}` : null].filter(Boolean).join(' · ');

  return (
    <div className={styles.duration}>
      <div className={styles.durationInputs}>
        <Input size="sm" value={amount} onValueChange={setAmount} invalid={amount.trim() !== '' && !valid} />
        <Select value={String(unitSeconds)} onValueChange={value => setUnitSeconds(Number(value))}>
          {DURATION_UNITS.map(item => (
            <Select.Item key={item.seconds} value={String(item.seconds)}>
              {item.label}
            </Select.Item>
          ))}
        </Select>
        <Button variant="secondary" size="sm" loading={busy} disabled={!valid || !dirty} onClick={() => onSave(next)}>
          Save
        </Button>
      </div>
      {bounds && <span className={styles.durationBounds}>{bounds}</span>}
    </div>
  );
}
