import { useState } from 'react';
import { DropdownMenu } from '@shadow-library/ui';

import { ChevronDownIcon } from '@/components/icons';
import modelStyles from '@/components/nf/ChatModel.module.css';

import { COMPOSER_MODES, type ComposerMode } from './chat-view';
import styles from './Chat.module.css';

export interface ComposerModeMenuProps {
  value: ComposerMode;
  onChange: (value: ComposerMode) => void;
  disabled?: boolean;
}

export function ComposerModeMenu({ value, onChange, disabled }: ComposerModeMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const current = COMPOSER_MODES.find(mode => mode.value === value);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={`${modelStyles.trigger} ${styles.modeTrigger}`} data-mode={value} aria-label={`Mode: ${current?.label}`} disabled={disabled}>
          {current?.label}
          <ChevronDownIcon size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" side="top">
        <DropdownMenu.RadioGroup value={value} onValueChange={next => onChange(COMPOSER_MODES.find(mode => mode.value === next)?.value ?? value)}>
          {COMPOSER_MODES.map(mode => (
            <DropdownMenu.RadioItem key={mode.value} value={mode.value} onSelect={() => setOpen(false)}>
              <span>
                {mode.label}
                <span className={styles.modeDescription}>{mode.description}</span>
              </span>
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
