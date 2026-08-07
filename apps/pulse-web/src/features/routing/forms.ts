import { type FormConfig, MESSAGE_TYPE_OPTIONS, type Option } from '@/features/shared';
import { type SenderRoutingRuleResponse } from '@/lib';

// NOTE: the generated `SenderRoutingRuleResponse` omits `id`, yet update/delete address a rule by
// `routingRuleId`. The runtime payload is expected to carry it; typed optional here and read defensively.
export type RoutingRule = SenderRoutingRuleResponse & { id?: string };

const MESSAGE_TYPE_FORM_OPTIONS: Option[] = [{ value: 'NONE', label: 'Any' }, ...MESSAGE_TYPE_OPTIONS];

export function ruleFormConfig(row: RoutingRule | null, senderOptions: Option[]): FormConfig {
  const edit = !!row;
  return {
    title: edit ? 'Re-point routing rule' : 'New routing rule',
    meta: edit ? 'Only the sender profile can change' : 'Match by type, region and service',
    submitLabel: edit ? 'Save changes' : 'Create rule',
    fields: [
      { key: 'senderProfileId', label: 'Sender profile', type: 'combobox', required: true, options: senderOptions, placeholder: 'Search sender profiles…' },
      { key: 'messageType', label: 'Message type', type: 'select', optional: true, options: MESSAGE_TYPE_FORM_OPTIONS, disabled: edit, placeholder: 'Any' },
      { key: 'region', label: 'Region', type: 'text', optional: true, disabled: edit, placeholder: 'Any (e.g. US, EU, APAC)' },
      { key: 'service', label: 'Service', type: 'text', optional: true, disabled: edit, placeholder: 'Any (e.g. auth, billing)' },
    ],
    initialValues: {
      senderProfileId: row?.senderProfileId ?? '',
      messageType: row?.messageType ?? 'NONE',
      region: row?.region ?? '',
      service: row?.service ?? '',
    },
  };
}
