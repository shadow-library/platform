/**
 * Importing npm packages
 */
import { DropdownMenu, toast } from '@shadow-library/ui';
import { useState } from 'react';

/**
 * Importing user defined modules
 */
import { ChevronDownIcon } from '@/components/icons';
import {
  type AiModelOption,
  type AiRoleDefault,
  type ChatMessageResponse,
  type ChatScope,
  type ChatSessionResponse,
  type ProjectConfig,
  type ProjectModelOverrides,
  useAiModelsQuery,
  useProjectQuery,
  useUpdateSessionModelMutation,
} from '@/lib/apis';
import { decodeModelRef, encodeModelRef } from '@/lib/format';

import styles from './ChatModel.module.css';

/**
 * Chat-model UI + the model resolution ladder, mirrored from the backend (ChatService / resolveModel):
 *  1. the chat's own override (picked inline in the composer),
 *  2. the project setting for the scope's role (an arc chat IS planning work, so it follows Planning),
 *  3. refinement chat with no explicit model follows the Planning selection,
 *  4. the active profile's default for the scope's model group.
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

// The model group each scope inherits its profile default from ('planning' for every structural scope).
const SCOPE_GROUP: Record<ChatScope, string> = {
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
}

/** Human-friendly name for a provider/model pair, preferring the registry label. */
export function modelLabel(models: AiModelOption[], provider?: string | null, modelId?: string | null): string {
  if (!provider || !modelId) return 'default';
  const match = models.find(m => m.provider === provider && m.id === modelId);
  return match?.label ?? modelId;
}

function resolveDefault(scopeType: ChatScope, config: ProjectConfig | undefined, defaults: AiRoleDefault[]): ResolvedDefault | undefined {
  const scopeRole = SCOPE_CHAT_ROLE[scopeType];
  const group = SCOPE_GROUP[scopeType];
  const configured = config?.models ?? {};
  // Explicit project override for this scope's role.
  if (configured[scopeRole]) return { ...configured[scopeRole], group };
  // Refinement chat with no explicit chat model follows the Planning selection.
  if (group === 'chat' && configured.plan) return { ...configured.plan, group: 'planning' };
  // Otherwise the profile default for the group (the /ai/models `defaults` are keyed by group).
  const fromProfile = defaults.find(d => d.role === group);
  return fromProfile ? { provider: fromProfile.provider, model: fromProfile.model, group } : undefined;
}

/**
 * The compact inline model menu for chat composers: a quiet text trigger, a radio menu behind it.
 * Shows the resolved default (and which settings role it came from); a pick stores a per-session
 * override, "Default" clears it.
 */
interface ChatModelMenuProps {
  novelId: string;
  session?: ChatSessionResponse;
  scopeType: ChatScope;
  disabled?: boolean;
}

export function ChatModelMenu({ novelId, session, scopeType, disabled }: ChatModelMenuProps): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const projectQuery = useProjectQuery(novelId);
  const updateModel = useUpdateSessionModelMutation(novelId);
  // The DS radio items call preventDefault on select, so Radix never auto-closes; drive the open state
  // ourselves and shut it on any pick.
  const [open, setOpen] = useState(false);

  const models = modelsQuery.data?.models ?? [];
  const llmModels = models.filter(m => m.kind === 'llm' && m.enabled);
  const resolvedDefault = resolveDefault(scopeType, projectQuery.data?.config, modelsQuery.data?.defaults ?? []);

  const overridden = Boolean(session?.modelProvider && session?.modelId);
  const value = overridden ? encodeModelRef(session?.modelProvider ?? '', session?.modelId ?? '') : 'default';
  const triggerLabel = overridden ? modelLabel(models, session?.modelProvider, session?.modelId) : modelLabel(models, resolvedDefault?.provider, resolvedDefault?.model);
  const defaultCaption = resolvedDefault
    ? `${modelLabel(models, resolvedDefault.provider, resolvedDefault.model)} · from ${GROUP_LABEL[resolvedDefault.group] ?? resolvedDefault.group} settings`
    : undefined;

  const onChange = (next: string): void => {
    if (!session || next === value) return;
    const ref = next === 'default' ? null : decodeModelRef(next);
    updateModel.mutate(
      { sessionId: session.id, provider: ref?.provider ?? null, model: ref?.model ?? null },
      { onSuccess: () => toast.success(ref ? `This chat now uses ${ref.model}` : 'This chat is back on the default model'), onError: e => toast.danger(e.message) },
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button type="button" disabled={disabled || !session} aria-label="Chat model" className={styles.trigger}>
          {triggerLabel}
          {!overridden && <span className={styles.triggerDefault}>· default</span>}
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

/** Which model produced an assistant reply — rendered as a quiet caption under the bubble. */
export function MessageModelTag({ message }: MessageModelTagProps): React.JSX.Element | null {
  const modelsQuery = useAiModelsQuery();
  if (message.role !== 'assistant' || !message.modelId) return null;
  const label = modelLabel(modelsQuery.data?.models ?? [], message.modelProvider, message.modelId);
  return <div className={styles.messageTag}>{label}</div>;
}
