/**
 * Importing user defined packages
 */
import { CHANNEL_OPTIONS, type FormConfig, PROVIDER_OPTIONS } from '@/features/shared';
import { type SenderEndpointResponse, type SenderProfileResponse } from '@/lib';

export function senderFormConfig(row: SenderProfileResponse | null): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Edit sender profile' : 'New sender profile',
    meta: edit ? row.key : 'A named grouping of provider endpoints',
    submitLabel: edit ? 'Save changes' : 'Create profile',
    fields: [
      {
        key: 'key',
        label: 'Key',
        type: 'text',
        required: true,
        disabled: edit,
        placeholder: 'primary-transactional',
        helper: edit ? 'Immutable after creation' : 'Unique, immutable',
      },
      { key: 'displayName', label: 'Display name', type: 'text', optional: true, placeholder: 'Primary Transactional' },
      { key: 'isActive', label: 'Active', type: 'switch' },
    ],
    initialValues: {
      key: row?.key ?? '',
      displayName: row?.displayName ?? '',
      isActive: row ? row.isActive : true,
    },
  };
}

export function endpointFormConfig(row: SenderEndpointResponse | null): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Edit endpoint' : 'New endpoint',
    meta: edit ? `${row.channel} · ${row.provider}` : 'Provider credentials for a channel',
    submitLabel: edit ? 'Save changes' : 'Create endpoint',
    fields: [
      { key: 'channel', label: 'Channel', type: 'select', required: true, options: CHANNEL_OPTIONS, disabled: edit, placeholder: 'Select channel' },
      { key: 'provider', label: 'Provider', type: 'select', required: true, options: PROVIDER_OPTIONS, disabled: edit, placeholder: 'Select provider' },
      { key: 'identifier', label: 'Identifier', type: 'text', required: true, placeholder: 'API key reference / account id' },
      { key: 'weight', label: 'Weight', type: 'number', optional: true, placeholder: '100', helper: 'Weighted load balancing between endpoints' },
      { key: 'isActive', label: 'Active', type: 'switch' },
    ],
    initialValues: {
      channel: row?.channel ?? '',
      provider: row?.provider ?? '',
      identifier: row?.identifier ?? '',
      weight: row?.weight ?? '',
      isActive: row ? row.isActive : true,
    },
  };
}
