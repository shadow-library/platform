import { ChevronDownIcon, DropdownMenu } from '@shadow-library/ui';

import modelStyles from '@/components/nf/ChatModel.module.css';
import { type ReplyOptionOffer, type ReplyOptions, replyOptionsLabel } from '@/lib/chat-model';

import styles from './Chat.module.css';

export interface ReplyOptionsMenuProps {
  options: ReplyOptions;
  offer: ReplyOptionOffer;
  onChange: (options: ReplyOptions) => void;
  disabled?: boolean;
}

export function ReplyOptionsMenu({ options, offer, onChange, disabled }: ReplyOptionsMenuProps): React.JSX.Element | null {
  if (!offer.thinkDeeper && !offer.unrestricted) return null;
  const label = replyOptionsLabel(options, offer);
  const on = (offer.thinkDeeper && options.thinkDeeper) || (offer.unrestricted && options.unrestricted);
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={modelStyles.trigger} data-on={on || undefined} aria-label={`Reply options: ${on ? label : 'none'}`} disabled={disabled}>
          {label}
          <ChevronDownIcon size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" side="top">
        {offer.thinkDeeper && (
          <DropdownMenu.CheckboxItem checked={options.thinkDeeper} onCheckedChange={checked => onChange({ ...options, thinkDeeper: checked === true })}>
            <span>
              Think deeper
              <span className={styles.modeDescription}>Takes longer and uses more of your allowance.</span>
            </span>
          </DropdownMenu.CheckboxItem>
        )}
        {offer.unrestricted && (
          <DropdownMenu.CheckboxItem checked={options.unrestricted} onCheckedChange={checked => onChange({ ...options, unrestricted: checked === true })}>
            <span>
              Unrestricted
              <span className={styles.modeDescription}>For dark or explicit material in this reply.</span>
            </span>
          </DropdownMenu.CheckboxItem>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
