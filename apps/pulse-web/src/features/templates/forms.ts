/**
 * Importing user defined packages
 */
import { CHANNEL_OPTIONS, type FormConfig, MESSAGE_TYPE_OPTIONS, type Option, PRIORITY_OPTIONS } from '@/features/shared';
import { type TemplateGroupResponse, type TemplateVariantResponse } from '@/lib';

/**
 * Declaring constants
 */
const PRIORITY_FORM_OPTIONS: Option[] = [{ value: 'NONE', label: 'None' }, ...PRIORITY_OPTIONS];

export function groupFormConfig(row: TemplateGroupResponse | null): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Edit template group' : 'New template group',
    meta: edit ? row.templateKey : 'Templates are identified by a unique key',
    submitLabel: edit ? 'Save changes' : 'Create group',
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
      { key: 'messageType', label: 'Message type', type: 'select', required: true, options: MESSAGE_TYPE_OPTIONS, placeholder: 'Select type' },
      { key: 'description', label: 'Description', type: 'text', optional: true, placeholder: 'Short description' },
      { key: 'priority', label: 'Priority', type: 'select', optional: true, options: PRIORITY_FORM_OPTIONS, placeholder: 'None' },
      { key: 'isActive', label: 'Active', type: 'switch' },
    ],
    initialValues: {
      templateKey: row?.templateKey ?? '',
      messageType: row?.messageType ?? '',
      description: row?.description ?? '',
      priority: row?.priority ?? 'NONE',
      isActive: row ? !!row.isActive : true,
    },
  };
}

export function variantFormConfig(row: TemplateVariantResponse | null): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Edit variant' : 'New variant',
    meta: edit ? `${row.channel} · ${row.locale}` : 'Channel + locale content',
    submitLabel: edit ? 'Save changes' : 'Create variant',
    fields: [
      { key: 'channel', label: 'Channel', type: 'select', required: true, options: CHANNEL_OPTIONS, disabled: edit, placeholder: 'Select channel' },
      { key: 'locale', label: 'Locale', type: 'text', required: true, disabled: edit, placeholder: 'en-US' },
      { key: 'subject', label: 'Subject', type: 'text', optional: true, placeholder: 'Used for EMAIL' },
      { key: 'body', label: 'Body', type: 'textarea', required: true, rows: 8, placeholder: 'Mustache template…' },
      { key: 'isActive', label: 'Active', type: 'switch' },
    ],
    initialValues: {
      channel: row?.channel ?? '',
      locale: row?.locale ?? '',
      subject: row?.subject ?? '',
      body: row?.body ?? '',
      isActive: row ? row.isActive : true,
    },
  };
}
