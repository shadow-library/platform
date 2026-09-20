import { Select } from '@shadow-library/ui';

import { type AiModelOption } from '@/lib/apis';
import { encodeModelRef } from '@/lib/format';

export type ModelKind = 'llm' | 'embedding' | 'image';

export const INHERIT_MODEL = 'inherit';

interface ModelPickerProps {
  value: string;
  onChange: (value: string) => void;
  kind: ModelKind;
  models: AiModelOption[];
  loading: boolean;
  inheritLabel: string;
  'aria-label': string;
}

export function ModelPicker({ value, onChange, kind, models, loading, inheritLabel, 'aria-label': ariaLabel }: ModelPickerProps): React.JSX.Element {
  return (
    <Select value={value} onValueChange={onChange} loading={loading} aria-label={ariaLabel}>
      <Select.Item value={INHERIT_MODEL}>{inheritLabel}</Select.Item>
      {models
        .filter(m => m.kind === kind)
        .map(m => (
          <Select.Item key={m.provider + m.id} value={encodeModelRef(m.provider, m.id)} disabled={!m.enabled} description={m.enabled ? undefined : 'unavailable right now'}>
            {m.label}
          </Select.Item>
        ))}
    </Select>
  );
}
