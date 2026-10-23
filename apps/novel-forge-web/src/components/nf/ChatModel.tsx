import { Link } from '@tanstack/react-router';
import { type ReactNode, useId, useState } from 'react';
import { Button, ChevronDownIcon, DropdownMenu, Popover, SegmentedControl, toast } from '@shadow-library/ui';

import {
  type AiTierModel,
  type ChatMessageResponse,
  type ChatSessionResponse,
  type ContentMode,
  type CostTier,
  useAiModelsQuery,
  useProjectModelsQuery,
  useProjectQuery,
  useUpdateSessionModelMutation,
} from '@/lib/apis';
import { choiceLabel, choiceScope, defaultNote, modelTagParts, sameChoice, type TurnChoice, type TurnChoiceDefaults, turnChoiceDefaults } from '@/lib/chat-model';
import { messageTime } from '@/lib/format';
import { DEFAULT_PIN, type InheritedModel, inheritedModel, modelLabel, pinMenu, pinUpdate } from '@/lib/model-defaults';

import styles from './ChatModel.module.css';

/**
 * Chat-model UI + the model resolution ladder, mirrored from the backend (ChatService / routeModel):
 *  1. the chat's own pin (picked inline in the composer),
 *  2. the platform's chat model under the chat's own cost tier and model type, else the project's — every scope's turn routes as a chat.
 * New chats always start on the resolved default; a pin sticks to that chat alone.
 */

export interface DefaultSources {
  tiers: readonly AiTierModel[];
  /** The chat's own model type and cost tier, falling back to the project's — `turnChoiceDefaults(session, project).choice`. */
  choice: TurnChoice;
}

export function resolveDefault({ tiers, choice }: DefaultSources): InheritedModel | undefined {
  return inheritedModel('chat', tiers, choice.costTier, choice.contentMode);
}

interface PinnedModelMenuProps {
  novelId: string;
  session?: ChatSessionResponse;
  disabled?: boolean;
}

export interface TurnModelControl {
  /** A pick not yet on the chat — before the chat exists, or while it saves; undefined shows the chat's, then the project's. */
  choice?: TurnChoice;
  /** The chat's new setting; the project's own choice when the author goes back to the default. */
  onChange: (choice: TurnChoice) => void;
}

export type ChatModelMenuProps = PinnedModelMenuProps & { turn?: TurnModelControl };

/** With `turn`, the model type and cost tier for the next turn; without it, the per-chat model pin the scoped Forge bar still uses. */
export function ChatModelMenu({ turn, ...props }: ChatModelMenuProps): React.JSX.Element {
  if (turn) return <TurnModelMenu novelId={props.novelId} session={props.session} disabled={props.disabled} control={turn} />;
  return <PinnedModelMenu {...props} />;
}

function PinnedModelMenu({ novelId, session, disabled }: PinnedModelMenuProps): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const projectQuery = useProjectQuery(novelId);
  const updateModel = useUpdateSessionModelMutation(novelId);
  // The DS radio items call preventDefault on select, so Radix never auto-closes; drive the open state
  // ourselves and shut it on any pick.
  const [open, setOpen] = useState(false);

  const project = projectQuery.data;
  const { choice } = turnChoiceDefaults(session, { contentMode: project?.contentMode ?? 'standard', costTier: project?.costTier ?? 'balanced' });
  const offer = useProjectModelsQuery(novelId, choice);
  const resolvedDefault = resolveDefault({ tiers: modelsQuery.data?.tiers ?? [], choice });
  const menu = pinMenu(modelsQuery.data, session, offer.data?.chatAliases, resolvedDefault);

  const onChange = (next: string): void => {
    if (!session || next === menu.value) return;
    const pin = pinUpdate(next);
    const picked = menu.choices.find(entry => entry.value === next)?.label;
    updateModel.mutate(
      { sessionId: session.id, ...pin },
      {
        onSuccess: () => toast.success(picked ? `This chat now uses ${picked}` : 'This chat is back on the default model'),
        onError: e => toast.danger(e.message),
      },
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button type="button" disabled={disabled || !session} aria-label="Chat model" className={styles.trigger}>
          {menu.triggerLabel}
          <ChevronDownIcon size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start">
        <DropdownMenu.Label>Model for this chat</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={menu.value} onValueChange={onChange}>
          <DropdownMenu.RadioItem value={DEFAULT_PIN} onSelect={() => setOpen(false)}>
            {menu.defaultLabel}
          </DropdownMenu.RadioItem>
          <DropdownMenu.Separator />
          {menu.choices.map(entry => (
            <DropdownMenu.RadioItem key={entry.value} value={entry.value} onSelect={() => setOpen(false)}>
              {entry.label}
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}

const CONTENT_MODES: readonly { value: ContentMode; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'unrestricted', label: 'Unrestricted' },
];

const COST_TIERS: readonly { value: CostTier; label: string }[] = [
  { value: 'economy', label: 'Economy' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'performant', label: 'Performant' },
];

export interface ResolvedTurnModel {
  label: string;
  inputPricePerMToken?: number;
  outputPricePerMToken?: number;
}

export interface TurnModelPanelProps {
  choice: TurnChoice;
  defaults: TurnChoiceDefaults;
  project: TurnChoice;
  resolved?: ResolvedTurnModel;
  resolving: boolean;
  /** A model this chat was pinned to before tiers existed; it outranks the tier until cleared. */
  pinnedModel?: string;
  onChange: (choice: TurnChoice) => void;
  onReset: () => void;
  onDone: () => void;
  onClearPin: () => void;
  settingsLink?: ReactNode;
}

function priceLabel({ inputPricePerMToken, outputPricePerMToken }: ResolvedTurnModel): string | undefined {
  if (inputPricePerMToken === undefined || outputPricePerMToken === undefined) return undefined;
  return `$${inputPricePerMToken} in · $${outputPricePerMToken} out per million tokens`;
}

export function TurnModelPanel(props: TurnModelPanelProps): React.JSX.Element {
  const { choice, defaults, project, resolved, resolving, pinnedModel, onChange, settingsLink } = props;
  const modeId = useId();
  const tierId = useId();
  const custom = !sameChoice(choice, defaults.choice);
  const ownSetting = !sameChoice(choice, project);
  const price = resolved && priceLabel(resolved);
  return (
    <div className={styles.panel}>
      <div className={styles.group}>
        <span className={styles.eyebrow} id={modeId}>
          Model
        </span>
        <SegmentedControl
          size="sm"
          fullWidth
          aria-labelledby={modeId}
          value={choice.contentMode}
          onValueChange={value => onChange({ ...choice, contentMode: value as ContentMode })}
        >
          {CONTENT_MODES.map(mode => (
            <SegmentedControl.Item key={mode.value} value={mode.value}>
              {mode.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>
      <div className={styles.group}>
        <span className={styles.eyebrow} id={tierId}>
          Cost
        </span>
        <SegmentedControl size="sm" fullWidth aria-labelledby={tierId} value={choice.costTier} onValueChange={value => onChange({ ...choice, costTier: value as CostTier })}>
          {COST_TIERS.map(tier => (
            <SegmentedControl.Item key={tier.value} value={tier.value}>
              {tier.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>
      <div className={styles.resolved} role="status">
        <span className={styles.resolvedModel}>{pinnedModel ?? resolved?.label ?? (resolving ? 'Checking the model…' : 'Model unavailable')}</span>
        {!pinnedModel && price && <span className={styles.resolvedPrice}>{price}</span>}
      </div>
      {pinnedModel && (
        <span className={styles.note}>
          This chat is pinned to {pinnedModel}, so replies use it whatever the tier.{' '}
          <button type="button" className={styles.linkButton} onClick={props.onClearPin}>
            Clear the pin
          </button>
        </span>
      )}
      <span className={styles.note}>
        {defaultNote(defaults, custom)} Project default: {choiceLabel(project)}
        {settingsLink && <> · {settingsLink}</>}
      </span>
      <div className={styles.actions}>
        <Button size="sm" variant="ghost" disabled={!ownSetting} onClick={props.onReset}>
          Use the project default
        </Button>
        <Button size="sm" variant="primary" className={styles.done} onClick={props.onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

interface TurnModelMenuProps {
  novelId: string;
  session?: ChatSessionResponse;
  disabled?: boolean;
  control: TurnModelControl;
}

function TurnModelMenu({ novelId, session, disabled, control }: TurnModelMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const projectQuery = useProjectQuery(novelId);
  const modelsQuery = useAiModelsQuery();
  const updateModel = useUpdateSessionModelMutation(novelId);
  const project = projectQuery.data;
  const projectChoice: TurnChoice = { contentMode: project?.contentMode ?? 'standard', costTier: project?.costTier ?? 'balanced' };
  const defaults = turnChoiceDefaults(session, projectChoice);
  const choice = control.choice ?? defaults.choice;
  const routes = useProjectModelsQuery(novelId, choice, open);
  const chat = routes.data?.models.find(route => route.group === 'chat');
  const pinnedModel = session?.modelId ? modelLabel(modelsQuery.data, session.modelId, session.modelProvider) : undefined;
  const scope = choiceScope(control.choice, defaults);

  const clearPin = (): void => {
    if (!session) return;
    updateModel.mutate({ sessionId: session.id, provider: null, model: null }, { onError: e => toast.danger(e.message) });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" disabled={disabled || !project} aria-label={`Model and cost: ${choiceLabel(choice)}, ${scope}`} className={styles.trigger}>
          {choiceLabel(choice)}
          <span className={styles.triggerDefault}>· {scope}</span>
          <ChevronDownIcon size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Content side="top" align="start" aria-label="Model and cost for this chat">
        <TurnModelPanel
          choice={choice}
          defaults={defaults}
          project={projectChoice}
          resolved={chat}
          resolving={routes.isLoading}
          pinnedModel={pinnedModel}
          onChange={control.onChange}
          onReset={() => control.onChange(projectChoice)}
          onDone={() => setOpen(false)}
          onClearPin={clearPin}
          settingsLink={
            <Link to="/novels/$novelId/settings" params={{ novelId }} search={{ tab: 'models' }} onClick={() => setOpen(false)}>
              change in Settings
            </Link>
          }
        />
      </Popover.Content>
    </Popover>
  );
}

interface MessageModelTagProps {
  message: ChatMessageResponse;
  /** How long the turn worked and what it read; unknown for a reply older than the turn trace. */
  worked?: string | null;
}

export function MessageModelTag({ message, worked }: MessageModelTagProps): React.JSX.Element | null {
  const modelsQuery = useAiModelsQuery();
  if (message.role !== 'assistant') return null;
  const model = modelLabel(modelsQuery.data, message.modelId, message.modelProvider);
  const parts = modelTagParts({ model, contentMode: message.contentMode, costTier: message.costTier, costUsd: message.costUsd });
  const tail = worked ? [worked.charAt(0).toLowerCase() + worked.slice(1)] : [];
  return <MessageModelTagView parts={[...parts, ...tail]} createdAt={message.createdAt} />;
}

export interface MessageModelTagViewProps {
  parts: string[];
  createdAt: string;
}

export function MessageModelTagView({ parts, createdAt }: MessageModelTagViewProps): React.JSX.Element | null {
  const time = messageTime(createdAt);
  if (parts.length === 0 && !time) return null;
  return (
    <div className={styles.messageTag}>
      {parts.join(' · ')}
      {parts.length > 0 && time && ' · '}
      {time && (
        <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()}>
          {time}
        </time>
      )}
    </div>
  );
}
