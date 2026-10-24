import { type ReactElement } from 'react';
import { Combobox, type ComboboxOption, Tag } from '@shadow-library/ui';

import { type ModelEntry } from '@/features/catalog/catalog-spec.types';

import { modelCapabilityNames, modelDisplayName, modelEligibility, type ModelNeeds, modelPriceText } from './model-options';
import styles from './ModelPicker.module.css';

export interface ModelPickerProps extends ModelNeeds {
  models: readonly ModelEntry[];
  /** A model key; one the catalog lacks is still shown, so a broken reference is visible rather than silently replaced. */
  value: string | null;
  onValueChange: (modelKey: string) => void;
  disableIneligible?: boolean;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

function optionOf(model: ModelEntry, needs: ModelNeeds, disableIneligible: boolean): ComboboxOption {
  const eligibility = modelEligibility(model, needs);
  const capabilities = modelCapabilityNames(model);
  return {
    value: model.key,
    label: modelDisplayName(model),
    disabled: disableIneligible && !eligibility.eligible,
    description: (
      <span className={styles.details}>
        <span className={styles.price}>{modelPriceText(model.pricePerMTok)}</span>
        {capabilities.length > 0 ? (
          <span className={styles.tags}>
            {capabilities.map(capability => (
              <Tag key={capability} size="sm">
                {capability}
              </Tag>
            ))}
          </span>
        ) : null}
        {eligibility.eligible ? null : <span className={styles.reason}>{eligibility.reasons.join('; ')}</span>}
      </span>
    ),
  };
}

export function ModelPicker(props: ModelPickerProps): ReactElement {
  const { models, value, onValueChange, disableIneligible = true, placeholder = 'Choose a model', invalid, disabled, id, className } = props;
  const needs: ModelNeeds = { requires: props.requires, kind: props.kind, dataPolicy: props.dataPolicy, providers: props.providers };
  const options = [...models].sort((left, right) => modelDisplayName(left).localeCompare(modelDisplayName(right))).map(model => optionOf(model, needs, disableIneligible));
  if (value && !options.some(option => option.value === value)) options.unshift({ value, label: `${value} (not in the catalog)` });
  return (
    <Combobox
      options={options}
      value={value || null}
      onValueChange={next => {
        if (next) onValueChange(next);
      }}
      clearable={false}
      placeholder={placeholder}
      emptyMessage="No model matches"
      invalid={invalid}
      disabled={disabled}
      id={id}
      className={className}
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
    />
  );
}
