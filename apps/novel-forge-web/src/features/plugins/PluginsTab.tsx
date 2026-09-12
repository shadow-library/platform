import { useState } from 'react';
import { Alert, Button, Checkbox, FormField, Input, NumberStepper, Select, Switch, Textarea, toast } from '@shadow-library/ui';

import { PaneLoader, SectionCard, StatusChip } from '@/components/nf';
import { type PluginManifest, type ProjectPlugin, useAugmentCanonMutation, useDisablePluginMutation, useEnablePluginMutation, useProjectPluginsQuery } from '@/lib/apis';

import { parsePluginForm, type PluginForm, pluginFormConfig, pluginFormErrors, type PluginFormField, type PluginFormValues, pluginFormValues } from './plugin-form';
import styles from './PluginsTab.module.css';

interface PluginsTabProps {
  novelId: string;
  manifests: PluginManifest[];
}

type PluginAction = 'save' | 'disable' | 'suggest';

const FAILURE_TITLES: Record<PluginAction, string> = {
  save: 'Couldn’t save this plugin',
  disable: 'Couldn’t disable this plugin',
  suggest: 'Couldn’t suggest canon additions',
};

interface PluginCardProps {
  novelId: string;
  manifest: PluginManifest;
  row?: ProjectPlugin;
}

interface FieldControlProps {
  field: PluginFormField;
  value: string | boolean | undefined;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}

function FieldControl({ field, value, disabled, onChange }: FieldControlProps): React.JSX.Element {
  if (field.widget === 'checkbox') return <Checkbox checked={value === true} disabled={disabled} onCheckedChange={next => onChange(next === true)} aria-label={field.title} />;
  if (field.widget === 'select')
    return (
      <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange} disabled={disabled} placeholder="Choose…" aria-label={field.title}>
        {(field.options ?? []).map(option => (
          <Select.Item key={option} value={option}>
            {option}
          </Select.Item>
        ))}
      </Select>
    );
  if (field.widget === 'textarea') return <Textarea value={typeof value === 'string' ? value : ''} disabled={disabled} onValueChange={onChange} minRows={3} autoGrow />;
  return <Input value={typeof value === 'string' ? value : ''} disabled={disabled} type={field.type === 'number' ? 'number' : 'text'} onValueChange={onChange} />;
}

interface SettingsFormProps {
  form: PluginForm;
  values: PluginFormValues;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (name: string, value: string | boolean) => void;
}

function SettingsForm({ form, values, errors, disabled, onChange }: SettingsFormProps): React.JSX.Element {
  const required = new Set(form.required);
  return (
    <div className={styles.form}>
      {form.fields.map(field => (
        <FormField key={field.name} label={field.title} helper={field.description} error={errors[field.name]} required={required.has(field.name)} disabled={disabled}>
          <FieldControl field={field} value={values[field.name]} disabled={disabled} onChange={next => onChange(field.name, next)} />
        </FormField>
      ))}
    </div>
  );
}

function PluginCard({ novelId, manifest, row }: PluginCardProps): React.JSX.Element {
  const form = parsePluginForm(manifest.forms, 'settings');
  const enablePlugin = useEnablePluginMutation(novelId);
  const disablePlugin = useDisablePluginMutation(novelId);
  const augmentCanon = useAugmentCanonMutation(novelId);

  const [values, setValues] = useState<PluginFormValues>(() => (form ? pluginFormValues(form, row?.config ?? {}) : {}));
  const [ordinal, setOrdinal] = useState<number | null>(row?.ordinal ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ action: PluginAction; message: string }>();

  // Boxed so the first render of a plugin this novel has *not* enabled still counts as synced — an
  // absent row is the steady state there, not a value still to arrive.
  const [syncedTo, setSyncedTo] = useState<{ row?: ProjectPlugin }>({ row });
  if (syncedTo.row !== row) {
    setSyncedTo({ row });
    setValues(form ? pluginFormValues(form, row?.config ?? {}) : {});
    setOrdinal(row?.ordinal ?? 0);
    setErrors({});
    setFailure(undefined);
  }

  const enabled = Boolean(row);
  const needsReview = row?.needsReview === true;

  const save = (): void => {
    const found = form ? pluginFormErrors(form, values) : {};
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFailure(undefined);
    enablePlugin.mutate(
      { pluginId: manifest.id, config: form ? pluginFormConfig(form, values) : {}, ordinal: ordinal ?? 0 },
      { onSuccess: () => toast.success('Plugin settings saved'), onError: err => setFailure({ action: 'save', message: err.message }) },
    );
  };

  const disable = (): void => {
    setFailure(undefined);
    disablePlugin.mutate(manifest.id, { onSuccess: () => toast.success('Plugin disabled'), onError: err => setFailure({ action: 'disable', message: err.message }) });
  };

  const suggest = (): void => {
    setFailure(undefined);
    augmentCanon.mutate(manifest.id, {
      onSuccess: result => (result ? toast.success('Staged as a proposal — review it in the Proposals Center') : toast.info('This plugin had nothing to add')),
      onError: err => setFailure({ action: 'suggest', message: err.message }),
    });
  };

  const exclusive = new Set(manifest.exclusive ?? []);
  return (
    <SectionCard
      className={styles.card}
      title={manifest.title}
      action={
        <Switch
          checked={enabled}
          pending={enablePlugin.isPending || disablePlugin.isPending}
          onCheckedChange={next => (next ? save() : disable())}
          aria-label={`Enable ${manifest.title}`}
        />
      }
    >
      <p className={styles.description}>{manifest.description}</p>
      <div className={styles.chips}>
        <StatusChip intent="neutral">{`v${manifest.version}`}</StatusChip>
        {manifest.decisionPoints.map(point => (
          <StatusChip key={point} intent={exclusive.has(point) ? 'info' : 'neutral'}>
            {point}
          </StatusChip>
        ))}
      </div>

      {needsReview && (
        <Alert intent="warning" title="Saved settings no longer validate">
          The plugin on disk is now version {manifest.version}; the settings stored for this novel were last validated against version {row.pluginVersion}. It contributes nothing
          until you review the fields below and save them again.
        </Alert>
      )}
      {failure && (
        <Alert intent="danger" title={FAILURE_TITLES[failure.action]}>
          {failure.message}
        </Alert>
      )}

      {form ? (
        <SettingsForm form={form} values={values} errors={errors} disabled={enablePlugin.isPending} onChange={(name, value) => setValues(prev => ({ ...prev, [name]: value }))} />
      ) : (
        <p className={styles.note}>This plugin declares no settings.</p>
      )}

      <FormField label="Order" helper="Lower runs first when more than one plugin contributes to the same decision point.">
        <div className={styles.ordinal}>
          <NumberStepper value={ordinal} min={0} onValueChange={setOrdinal} disabled={enablePlugin.isPending} itemLabel="order" />
        </div>
      </FormField>

      {enabled && (
        <div className={styles.actions}>
          <Button variant="primary" loading={enablePlugin.isPending} onClick={save}>
            Save settings
          </Button>
          {manifest.decisionPoints.includes('canon.augment') && (
            <Button variant="secondary" loading={augmentCanon.isPending} disabled={needsReview} onClick={suggest}>
              Suggest canon additions
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function UnavailablePluginCard({ novelId, row }: { novelId: string; row: ProjectPlugin }): React.JSX.Element {
  const disablePlugin = useDisablePluginMutation(novelId);
  return (
    <SectionCard className={styles.card} title={row.pluginId}>
      <Alert intent="warning" title="Not installed on this deployment">
        This novel has {row.pluginId} enabled at version {row.pluginVersion}, but its code is no longer on disk. The enablement is kept and contributes nothing until the plugin is
        reinstalled.
      </Alert>
      <div className={styles.actions}>
        <Button variant="ghost" loading={disablePlugin.isPending} onClick={() => disablePlugin.mutate(row.pluginId, { onError: err => toast.danger(err.message) })}>
          Remove from this novel
        </Button>
      </div>
    </SectionCard>
  );
}

export function PluginsTab({ novelId, manifests }: PluginsTabProps): React.JSX.Element {
  const pluginsQuery = useProjectPluginsQuery(novelId);
  const rows = pluginsQuery.data ?? [];

  if (pluginsQuery.isLoading) return <PaneLoader />;
  return (
    <>
      {pluginsQuery.error && (
        <Alert intent="danger" title="Couldn’t load this novel’s plugins">
          {pluginsQuery.error.message}
        </Alert>
      )}
      {manifests.map(manifest => (
        <PluginCard key={manifest.id} novelId={novelId} manifest={manifest} row={rows.find(candidate => candidate.pluginId === manifest.id)} />
      ))}
      {rows
        .filter(row => !row.installed)
        .map(row => (
          <UnavailablePluginCard key={row.pluginId} novelId={novelId} row={row} />
        ))}
    </>
  );
}
