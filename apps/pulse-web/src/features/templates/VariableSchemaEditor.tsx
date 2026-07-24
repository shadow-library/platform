/**
 * Importing npm packages
 */
import { type ReactElement, useMemo, useState } from 'react';
import { Alert, Badge, Button, FormField, Input, Select, Switch, Table, type TableColumn } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { OutlineBadge, SectionHeader, TextOrDash, trimToUndefined, useConfirm, VARIABLE_TYPE_OPTIONS } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type TemplateVariableSchema, type TemplateVariableType, useUpdateTemplateMutation } from '@/lib';

import styles from './Templates.module.css';

interface VariableRow {
  name: string;
  type: TemplateVariableType;
  required: boolean;
  description?: string;
  example?: string;
}

const EMPTY_DRAFT = { name: '', type: 'string' as TemplateVariableType, required: false, example: '' };

export default function VariableSchemaEditor({ templateId, schema }: { templateId: string; schema: TemplateVariableSchema }): ReactElement {
  const confirm = useConfirm();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState('');
  const mutation = useUpdateTemplateMutation(templateId);

  const rows = useMemo<VariableRow[]>(() => Object.entries(schema.variables).map(([name, variable]) => ({ name, ...variable })), [schema.variables]);

  const persist = (variables: TemplateVariableSchema['variables'], onSuccess?: () => void): void => {
    setError('');
    mutation.mutate({ variableSchema: { variables } }, { onSuccess, onError: apiError => setError(apiError.message) });
  };

  const addVariable = (): void => {
    const name = draft.name.trim();
    if (!name) return setError('Variable name is required.');
    if (schema.variables[name]) return setError(`A variable named "${name}" already exists.`);
    const next = { ...schema.variables, [name]: { type: draft.type, required: draft.required, example: trimToUndefined(draft.example) } };
    persist(next, () => setDraft(EMPTY_DRAFT));
  };

  const removeVariable = async (name: string): Promise<void> => {
    if (!(await confirm({ title: 'Remove variable?', description: `"${name}" will no longer be declared on this template.` }))) return;
    const next = { ...schema.variables };
    delete next[name];
    persist(next);
  };

  const columns: TableColumn<VariableRow>[] = [
    { id: 'name', header: 'Name', cell: row => <span className={styles.mono}>{row.name}</span> },
    { id: 'type', header: 'Type', cell: row => <OutlineBadge>{row.type}</OutlineBadge> },
    {
      id: 'required',
      header: 'Required',
      cell: row => (
        <Badge intent={row.required ? 'info' : 'neutral'} variant="soft">
          {row.required ? 'Required' : 'Optional'}
        </Badge>
      ),
    },
    { id: 'example', header: 'Example', cell: row => <TextOrDash value={row.example} mono /> },
    {
      id: '_actions',
      header: '',
      align: 'end',
      cell: row => (
        <div className={controls.rowActions}>
          <Button variant="ghost" size="sm" className={controls.danger} onClick={() => void removeVariable(row.name)}>
            Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <SectionHeader title="Variables" subtitle="Declare the variables content may reference. Publishing fails if content uses an undeclared variable." />
      {error ? (
        <Alert intent="danger" title="Couldn't update variables" className={controls.detailCard}>
          {error}
        </Alert>
      ) : null}
      <div className={styles.variableForm}>
        <FormField label="Name" required>
          <Input value={draft.name} onValueChange={value => setDraft(prev => ({ ...prev, name: value }))} placeholder="firstName" />
        </FormField>
        <FormField label="Type" required>
          <Select value={draft.type} onValueChange={value => setDraft(prev => ({ ...prev, type: value as TemplateVariableType }))} aria-label="Variable type">
            {VARIABLE_TYPE_OPTIONS.map(option => (
              <Select.Item key={option.value} value={option.value}>
                {option.label}
              </Select.Item>
            ))}
          </Select>
        </FormField>
        <FormField label="Example" optional>
          <Input value={draft.example} onValueChange={value => setDraft(prev => ({ ...prev, example: value }))} placeholder="Ada" />
        </FormField>
        <FormField label="Required">
          <Switch checked={draft.required} onCheckedChange={next => setDraft(prev => ({ ...prev, required: next }))} />
        </FormField>
        <Button variant="secondary" onClick={addVariable} loading={mutation.isPending}>
          Add variable
        </Button>
      </div>
      <Table data={rows} columns={columns} rowKey="name" aria-label="Declared variables" emptyState="No variables declared yet." />
    </>
  );
}
