import { useState } from 'react';
import { DropdownMenu, toast } from '@shadow-library/ui';

import { ChevronDownIcon } from '@/components/icons';
import {
  type AccountModelDefaults,
  type AiModelOption,
  type AiRoleDefault,
  type ChatMessageResponse,
  type ChatScope,
  type ChatSessionResponse,
  type ProjectConfig,
  type ProjectModelOverrides,
  useAccountSettingsQuery,
  useAiModelsQuery,
  useProjectQuery,
  useUpdateSessionModelMutation,
} from '@/lib/apis';
import { decodeModelRef, encodeModelRef, messageTime } from '@/lib/format';
import { type AccountModelGroup, inheritedModel, modelLabel } from '@/lib/model-defaults';

import styles from './ChatModel.module.css';

/**
 * Chat-model UI + the model resolution ladder, mirrored from the backend (ChatService / resolveModel):
 *  1. the chat's own override (picked inline in the composer),
 *  2. the project setting for the scope's role (an arc chat IS planning work, so it follows Planning),
 *  3. refinement chat with no explicit model follows the Planning selection,
 *  4. the project owner's default for the scope's model group, from Settings,
 *  5. the active profile's default for that group.
 * New chats always start on the resolved default; an override sticks to that chat alone.
 */

// The fine-grained role each chat scope maps to (config overrides are stored per role — the settings
// UI fans a group's choice across its roles, so reading the scope's role reflects the group value).
const SCOPE_CHAT_ROLE: Record<ChatScope, keyof ProjectModelOverrides> = {
  project: 'chat',
  novel: 'chat',
  volume_plan: 'plan',
  volume: 'plan',
  arc_plan: 'arc',
  arc: 'arc',
  brief: 'outline',
  bible_document: 'bible',
};

// The model group each scope inherits its default from ('planning' for every structural scope).
const SCOPE_GROUP: Record<ChatScope, AccountModelGroup> = {
  project: 'chat',
  novel: 'chat',
  volume_plan: 'planning',
  volume: 'planning',
  arc_plan: 'planning',
  arc: 'planning',
  brief: 'planning',
  bible_document: 'planning',
};

const GROUP_LABEL: Record<string, string> = {
  chat: 'refinement chat',
  planning: 'planning',
};

interface ResolvedDefault {
  provider: string;
  model: string;
  group: string;
  source: 'project' | 'account' | 'platform';
}

const SOURCE_CAPTION: Record<Exclude<ResolvedDefault['source'], 'project'>, string> = { account: 'your default', platform: 'platform default' };
const TRIGGER_SOURCE: Record<ResolvedDefault['source'], string> = { project: 'project default', ...SOURCE_CAPTION };

interface DefaultSources {
  config?: ProjectConfig;
  account?: AccountModelDefaults;
  platform: AiRoleDefault[];
  registry: AiModelOption[];
  allowlist?: Set<string>;
}

function resolveDefault(scopeType: ChatScope, { config, account, platform, registry, allowlist }: DefaultSources): ResolvedDefault | undefined {
  const scopeRole = SCOPE_CHAT_ROLE[scopeType];
  const group = SCOPE_GROUP[scopeType];
  const configured = config?.models ?? {};
  const honour = (ref?: { provider: string; model: string }): ref is { provider: string; model: string } => Boolean(ref && (!allowlist || allowlist.has(ref.model)));
  const scoped = configured[scopeRole];
  if (honour(scoped)) return { ...scoped, group, source: 'project' };
  const plan = configured.plan;
  if (group === 'chat' && honour(plan)) return { ...plan, group: 'planning', source: 'project' };
  const inherited = inheritedModel(group, account, platform, registry, allowlist);
  return inherited && { provider: inherited.provider, model: inherited.model, group, source: inherited.source };
}

interface ChatModelMenuProps {
  novelId: string;
  session?: ChatSessionResponse;
  /** The scope whose role and model group the default is resolved from; the refinement chat is always the project hub. */
  scopeType?: ChatScope;
  disabled?: boolean;
}

export function ChatModelMenu({ novelId, session, scopeType = 'project', disabled }: ChatModelMenuProps): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const accountQuery = useAccountSettingsQuery();
  const projectQuery = useProjectQuery(novelId);
  const updateModel = useUpdateSessionModelMutation(novelId);
  // The DS radio items call preventDefault on select, so Radix never auto-closes; drive the open state
  // ourselves and shut it on any pick.
  const [open, setOpen] = useState(false);

  const unrestricted = projectQuery.data?.contentMode === 'unrestricted';
  const allowlist = new Set(modelsQuery.data?.unrestrictedAllowlist ?? []);
  const models = modelsQuery.data?.models ?? [];
  const llmModels = models.filter(m => m.kind === 'llm' && m.enabled && (!unrestricted || allowlist.has(m.id)));
  const resolvedDefault = resolveDefault(scopeType, {
    config: projectQuery.data?.config,
    account: accountQuery.data?.models,
    platform: unrestricted ? (modelsQuery.data?.unrestrictedDefaults ?? []) : (modelsQuery.data?.defaults ?? []),
    registry: models,
    allowlist: unrestricted ? allowlist : undefined,
  });

  const overridden = Boolean(session?.modelProvider && session?.modelId);
  const value = overridden ? encodeModelRef(session?.modelProvider ?? '', session?.modelId ?? '') : 'default';
  const triggerLabel =
    (overridden ? modelLabel(models, session?.modelId, session?.modelProvider) : modelLabel(models, resolvedDefault?.model, resolvedDefault?.provider)) ?? 'default';
  const defaultCaption =
    resolvedDefault &&
    `${modelLabel(models, resolvedDefault.model, resolvedDefault.provider)} · ${
      resolvedDefault.source === 'project' ? `from ${GROUP_LABEL[resolvedDefault.group] ?? resolvedDefault.group} settings` : SOURCE_CAPTION[resolvedDefault.source]
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

interface MessageModelTagProps {
  message: ChatMessageResponse;
}

export function MessageModelTag({ message }: MessageModelTagProps): React.JSX.Element | null {
  const modelsQuery = useAiModelsQuery();
  if (message.role !== 'assistant') return null;
  const label = modelLabel(modelsQuery.data?.models ?? [], message.modelId, message.modelProvider);
  const time = messageTime(message.createdAt);
  if (!label && !time) return null;
  return (
    <div className={styles.messageTag}>
      {label}
      {label && time && ' · '}
      {time && (
        <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
          {time}
        </time>
      )}
    </div>
  );
}
