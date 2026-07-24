/**
 * Importing user defined packages
 */
import { type FormConfig, MESSAGE_TYPE_OPTIONS, PRIORITY_OPTIONS } from '@/features/shared';
import { type TemplateResponse } from '@/lib';

/**
 * Declaring the constants
 */
export function templateFormConfig(row: TemplateResponse | null): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Edit template' : 'New template',
    meta: edit ? row.templateKey : 'Templates are identified by a unique key',
    submitLabel: edit ? 'Save changes' : 'Create template',
    fields: [
      {
        key: 'templateKey',
        label: 'Template key',
        type: 'text',
        required: true,
        disabled: edit,
        placeholder: 'order-confirmation',
        helper: edit ? 'Immutable after creation' : 'Lowercase, unique, immutable',
      },
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Order confirmation' },
      { key: 'messageType', label: 'Message type', type: 'select', required: true, options: MESSAGE_TYPE_OPTIONS, placeholder: 'Select type' },
      { key: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITY_OPTIONS, placeholder: 'Select priority' },
      { key: 'category', label: 'Category', type: 'text', optional: true, placeholder: 'transactional' },
      { key: 'description', label: 'Description', type: 'text', optional: true, placeholder: 'Short description' },
      { key: 'isActive', label: 'Active', type: 'switch' },
    ],
    initialValues: {
      templateKey: row?.templateKey ?? '',
      name: row?.name ?? '',
      messageType: row?.messageType ?? '',
      priority: row?.priority ?? 'MEDIUM',
      category: row?.category ?? '',
      description: row?.description ?? '',
      isActive: row ? row.isActive : true,
    },
  };
}
