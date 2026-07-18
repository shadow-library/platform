/**
 * Importing npm packages
 */
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from 'react';
import { Combobox, Drawer, FormField, Input, Select, Switch, Textarea } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import styles from './FormDrawer.module.css';
import { type Option } from './options';

/**
 * Defining types
 */
export type FormFieldType = 'text' | 'number' | 'textarea' | 'select' | 'combobox' | 'switch';
export type FormValue = string | number | boolean | undefined;
export type FormValues = Record<string, FormValue>;

export interface FormFieldConfig {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  optional?: boolean;
  helper?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  options?: Option[];
  rows?: number;
}

export interface FormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  meta?: ReactNode;
  submitLabel?: string;
  fields: FormFieldConfig[];
  initialValues: FormValues;
  loading?: boolean;
  onSubmit: (values: FormValues) => void;
}

/** The shape a feature builds per entity to drive a `FormDrawer` (create + edit). */
export interface FormConfig {
  title: string;
  meta: string;
  submitLabel: string;
  fields: FormFieldConfig[];
  initialValues: FormValues;
}

/**
 * A single config-driven create/edit drawer reused by every entity form.
 * Seeds its own state on each open edge, then hands the collected values back on submit.
 */
export function FormDrawer(props: FormDrawerProps): ReactElement {
  const { open, onOpenChange, title, meta, submitLabel = 'Save', fields, initialValues, loading, onSubmit } = props;
  const [values, setValues] = useState<FormValues>(initialValues);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) setValues(initialValues);
    wasOpen.current = open;
  }, [open, initialValues]);

  const setField = (key: string, value: FormValue): void => setValues(prev => ({ ...prev, [key]: value }));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="right" size="md">
      <Drawer.Header title={title} meta={meta} />
      <Drawer.Body>
        <div className={styles.fields}>
          {fields.map(field => (
            <FormField key={field.key} label={field.label} required={field.required} optional={field.optional} helper={field.helper}>
              {renderControl(field, values[field.key], value => setField(field.key, value))}
            </FormField>
          ))}
        </div>
      </Drawer.Body>
      <Drawer.Footer cancel="Cancel" action={submitLabel} onAction={() => onSubmit(values)} loading={loading} />
    </Drawer>
  );
}

function renderControl(field: FormFieldConfig, value: FormValue, onChange: (value: FormValue) => void): ReactElement {
  const text = value == null ? '' : String(value);
  const selectValue = text === '' ? undefined : text;

  switch (field.type) {
    case 'textarea':
      return <Textarea value={text} onValueChange={onChange} minRows={field.rows ?? 5} placeholder={field.placeholder} disabled={field.disabled} />;
    case 'number':
      return <Input type="number" value={text} onValueChange={onChange} placeholder={field.placeholder} disabled={field.disabled} />;
    case 'select':
      return (
        <Select value={selectValue} onValueChange={onChange} placeholder={field.placeholder} disabled={field.disabled}>
          {(field.options ?? []).map(option => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select>
      );
    case 'combobox':
      return (
        <Combobox
          options={field.options ?? []}
          value={selectValue ?? null}
          onValueChange={next => onChange(next ?? undefined)}
          placeholder={field.placeholder}
          disabled={field.disabled}
        />
      );
    case 'switch':
      return <Switch checked={Boolean(value)} onCheckedChange={onChange} />;
    default:
      return <Input value={text} onValueChange={onChange} placeholder={field.placeholder} disabled={field.disabled} />;
  }
}
