/**
 * Importing user defined packages
 */
import { type FormConfig } from '@/features/shared';
import { type LayoutResponse, type PartialResponse } from '@/lib';

/**
 * Declaring the constants
 */
export function layoutFormConfig(row: LayoutResponse | null): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Edit layout' : 'New layout',
    meta: edit ? row.layoutKey : 'A design-system shell wrapping template bodies',
    submitLabel: edit ? 'Save changes' : 'Create layout',
    fields: [
      {
        key: 'layoutKey',
        label: 'Layout key',
        type: 'text',
        required: true,
        disabled: edit,
        placeholder: 'transactional-shell',
        helper: edit ? 'Immutable after creation' : 'Unique, immutable',
      },
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Transactional shell' },
      { key: 'description', label: 'Description', type: 'text', optional: true, placeholder: 'Short description' },
      { key: 'isActive', label: 'Active', type: 'switch' },
    ],
    initialValues: {
      layoutKey: row?.layoutKey ?? '',
      name: row?.name ?? '',
      description: row?.description ?? '',
      isActive: row ? row.isActive : true,
    },
  };
}

export function partialFormConfig(row: PartialResponse | null): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Edit partial' : 'New partial',
    meta: edit ? row.partialKey : 'A reusable block included by layouts and templates',
    submitLabel: edit ? 'Save changes' : 'Create partial',
    fields: [
      {
        key: 'partialKey',
        label: 'Partial key',
        type: 'text',
        required: true,
        disabled: edit,
        placeholder: 'footer',
        helper: edit ? 'Immutable after creation' : 'Unique, immutable',
      },
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Footer' },
      { key: 'description', label: 'Description', type: 'text', optional: true, placeholder: 'Short description' },
      { key: 'isActive', label: 'Active', type: 'switch' },
    ],
    initialValues: {
      partialKey: row?.partialKey ?? '',
      name: row?.name ?? '',
      description: row?.description ?? '',
      isActive: row ? row.isActive : true,
    },
  };
}
