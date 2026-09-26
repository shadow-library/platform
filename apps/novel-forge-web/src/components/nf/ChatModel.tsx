import { Link } from '@tanstack/react-router';
import { type ReactNode, useId, useState } from 'react';
import { Button, DropdownMenu, Popover, SegmentedControl, toast } from '@shadow-library/ui';

import { ChevronDownIcon } from '@/components/icons';
import {
  type AiTierModel,
  type ChatMessageResponse,
  type ChatScope,
  type ChatSessionResponse,
  type ContentMode,
  type CostTier,
  type ProjectConfig,
  type ProjectModelOverrides,
  useAiModelsQuery,
  useProjectModelsQuery,
  useProjectQuery,
  useUpdateSessionModelMutation,
} from '@/lib/apis';
import { choiceLabel, choiceScope, defaultNote, modelTagParts, sameChoice, type TurnChoice, type TurnChoiceDefaults, turnChoiceDefaults } from '@/lib/chat-model';
import { decodeModelRef, encodeModelRef, messageTime } from '@/lib/format';
import { inheritedModel, type ModelGroup, modelLabel } from '@/lib/model-defaults';

import styles from './ChatModel.module.css';

/**
 * Chat-model UI + the model resolution ladder, mirrored from the backend (ChatService / resolveModel):
 *  1. the chat's own override (picked inline in the composer),
 *  2. the project setting for the scope's role,
 *  3. refinement chat with no explicit model follows the Planning selection,
 *  4. the platform's model for that group under the chat's own cost tier and model type, else the project's.
 * New chats always start on the resolved default; an override sticks to that chat alone.
 */

// The fine-grained role each chat scope maps to (config overrides are stored per role — the settings
// UI fans a group's choice across its roles, so reading the scope's role reflects the group value).
const SCOPE_CHAT_ROLE: Record<ChatScope, keyof ProjectModelOverrides> = {
  project: 'chat',
  novel: 'chat',
  volume: 'plan',
  brief: 'outline',
  bible_document: 'bible',
};

// The model group each scope inherits its default from ('planning' for every structural scope).
const SCOPE_GROUP: Record<ChatScope, ModelGroup> = {
  project: 'chat',
  novel: 'chat',
  volume: 'planning',
  brief: 'planning',
  bible_document: 'planning',
};

const GROUP_LABEL: Record<string, string> = {
  chat: 'refinement chat',
  planning: 'planning',
};

export interface ResolvedDefault {
  provider: string;
  model: string;
  group: string;
  source: 'project' | 'platform';
}

const TRIGGER_SOURCE: Record<ResolvedDefault['source'], string> = { project: 'project default', platform: 'platform default' };

export interface DefaultSources {
  config?: ProjectConfig;
  tiers: readonly AiTierModel[];
  /** The chat's own model type and cost tier, falling back to the project's — `turnChoiceDefaults(session, project).choice`. */
  choice: TurnChoice;
  allowlist: ReadonlySet<string>;
}

export function resolveDefault(scopeType: ChatScope, { config, tiers, choice, allowlist: unrestrictedAllowlist }: DefaultSources): ResolvedDefault | undefined {
  const allowlist = choice.contentMode === 'unrestricted' ? unrestrictedAllowlist : undefined;
  const scopeRole = SCOPE_CHAT_ROLE[scopeType];
  const group = SCOPE_GROUP[scopeType];
  const configured = config?.models ?? {};
  const honour = (ref?: { provider: string; model: string }): ref is { provider: string; model: string } => Boolean(ref && (!allowlist || allowlist.has(ref.model)));
  const scoped = configured[scopeRole];
  if (honour(scoped)) return { ...scoped, group, source: 'project' };
  const plan = configured.plan;
  if (group === 'chat' && honour(plan)) return { ...plan, group: 'planning', source: 'project' };
  const inherited = inheritedModel(group, tiers, choice.costTier, choice.contentMode);
  return inherited && { ...inherited, group, source: 'platform' };
}

interface PinnedModelMenuProps {
  novelId: string;
  session?: ChatSessionResponse;
  /** The scope whose role and model group the default is resolved from; the refinement chat is always the project hub. */
  scopeType?: ChatScope;
  disabled?: boolean;
}

export interface TurnModelControl {
  /** The author's pick for the next turn; undefined follows the chat, then the project. */
  choice?: TurnChoice;
  onChange: (choice: TurnChoice | undefined) => void;
}

export type ChatModelMenuProps = PinnedModelMenuProps & { turn?: TurnModelControl };

/** With `turn`, the model type and cost tier for the next turn; without it, the per-chat model pin the scoped Forge bar still uses. */
export function ChatModelMenu({ turn, ...props }: ChatModelMenuProps): React.JSX.Element {
  if (turn) return <TurnModelMenu novelId={props.novelId} session={props.session} disabled={props.disabled} control={turn} />;
  return <PinnedModelMenu {...props} />;
}

function PinnedModelMenu({ novelId, session, scopeType = 'project', disabled }: PinnedModelMenuProps): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const projectQuery = useProjectQuery(novelId);
  const updateModel = useUpdateSessionModelMutation(novelId);
  // The DS radio items call preventDefault on select, so Radix never auto-closes; drive the open state
  // ourselves and shut it on any pick.
  const [open, setOpen] = useState(false);

  const project = projectQuery.data;
  const { choice } = turnChoiceDefaults(session, { contentMode: project?.contentMode ?? 'standard', costTier: project?.costTier ?? 'balanced' });
  const unrestricted = choice.contentMode === 'unrestricted';
  const allowlist = new Set(modelsQuery.data?.unrestrictedAllowlist ?? []);
  const models = modelsQuery.data?.models ?? [];
  const llmModels = models.filter(m => m.kind === 'llm' && m.enabled && (!unrestricted || allowlist.has(m.id)));
  const resolvedDefault = resolveDefault(scopeType, { config: project?.config, tiers: modelsQuery.data?.tiers ?? [], choice, allowlist });

  const overridden = Boolean(session?.modelProvider && session?.modelId);
  const value = overridden ? encodeModelRef(session?.modelProvider ?? '', session?.modelId ?? '') : 'default';
  const triggerLabel =
    (overridden ? modelLabel(models, session?.modelId, session?.modelProvider) : modelLabel(models, resolvedDefault?.model, resolvedDefault?.provider)) ?? 'default';
  const defaultCaption =
    resolvedDefault &&
    `${modelLabel(models, resolvedDefault.model, resolvedDefault.provider)} · ${
      resolvedDefault.source === 'project' ? `from ${GROUP_LABEL[resolvedDefault.group] ?? resolvedDefault.group} settings` : TRIGGER_SOURCE[resolvedDefault.source]
    }`;

  const onChange = (next: string): void => {
    if (!session || next === value) return;
    const ref = next === 'default' ? null : decodeModelRef(next);
    updateModel.mutate(
      { sessionId: session.id, provider: ref?.provider ?? null, model: ref?.model ?? null },
      {
        onSuccess: () => toast.success(ref ? `This chat now uses ${modelLabel(models, ref.model, ref.provider)}` : 'This chat is back on the default model'),
        onError: e => toast.danger(e.message),
      },
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button type="button" disabled={disabled || !session} aria-label="Chat model" className={styles.trigger}>
          {triggerLabel}
          {!overridden && <span className={styles.triggerDefault}>· {resolvedDefault ? TRIGGER_SOURCE[resolvedDefault.source] : 'default'}</span>}
          <ChevronDownIcon size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start">
        <DropdownMenu.Label>Model for this chat</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
          <DropdownMenu.RadioItem value="default" onSelect={() => setOpen(false)}>
            <span>
              Default
              {defaultCaption && <span className={styles.caption}>{defaultCaption}</span>}
            </span>
          </DropdownMenu.RadioItem>
          <DropdownMenu.Separator />
          {llmModels.map(m => (
            <DropdownMenu.RadioItem key={encodeModelRef(m.provider, m.id)} value={encodeModelRef(m.provider, m.id)} onSelect={() => setOpen(false)}>
              {m.label}
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
  const { choice, defaults, resolved, resolving, pinnedModel, onChange, settingsLink } = props;
  const modeId = useId();
  const tierId = useId();
  const custom = !sameChoice(choice, defaults.choice);
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
        {custom ? 'Applies to your next message and anything it starts, then goes back to the default.' : defaultNote(defaults)} Default: {choiceLabel(defaults.choice)}
        {settingsLink && <> · {settingsLink}</>}
      </span>
      <div className={styles.actions}>
        <Button size="sm" variant="ghost" disabled={!custom} onClick={props.onReset}>
          Use the default
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
  const defaults = turnChoiceDefaults(session, { contentMode: project?.contentMode ?? 'standard', costTier: project?.costTier ?? 'balanced' });
  const choice = control.choice ?? defaults.choice;
  const routes = useProjectModelsQuery(novelId, choice, open);
  const chat = routes.data?.models.find(route => route.group === 'chat');
  const pinnedModel = session?.modelId ? modelLabel(modelsQuery.data?.models ?? [], session.modelId, session.modelProvider) : undefined;
  const scope = choiceScope(control.choice, defaults);

  const change = (next: TurnChoice): void => control.onChange(sameChoice(next, defaults.choice) ? undefined : next);
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
      <Popover.Content side="top" align="start" aria-label="Model and cost for this turn">
        <TurnModelPanel
          choice={choice}
          defaults={defaults}
          resolved={chat}
          resolving={routes.isLoading}
          pinnedModel={pinnedModel}
          onChange={change}
          onReset={() => control.onChange(undefined)}
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
}

export function MessageModelTag({ message }: MessageModelTagProps): React.JSX.Element | null {
  const modelsQuery = useAiModelsQuery();
  if (message.role !== 'assistant') return null;
  const model = modelLabel(modelsQuery.data?.models ?? [], message.modelId, message.modelProvider);
  const parts = modelTagParts({ model, contentMode: message.contentMode, costTier: message.costTier, costUsd: message.costUsd });
  return <MessageModelTagView parts={parts} createdAt={message.createdAt} />;
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
