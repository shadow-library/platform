/**
 * Importing npm packages
 */
import { DropdownMenu, toast } from '@shadow-library/ui';

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

/**
 * Chat-model UI + the model resolution ladder, mirrored from the backend (ChatService):
 *  1. the chat's own override (picked inline in the composer),
 *  2. the project setting for the scope's planning role (an arc chat IS arc-planning work),
 *  3. the project setting for the generic chat role,
 *  4. the AI profile default for the scope's role, then for chat.
 * New chats always start on the resolved default; an override sticks to that chat alone.
 */

const SCOPE_CHAT_ROLE: Record<ChatScope, keyof ProjectModelOverrides> = {
  novel: 'chat',
  volume_plan: 'plan',
  volume: 'plan',
  arc_plan: 'arc',
  arc: 'arc',
  brief: 'outline',
  bible_document: 'bible',
};

const ROLE_LABEL: Record<string, string> = {
  chat: 'chat',
  plan: 'story planning',
  arc: 'arc planning',
  outline: 'chapter outline',
  bible: 'bible synthesis',
};

interface ResolvedDefault {
  provider: string;
  model: string;
  role: string;
}

/** Human-friendly name for a provider/model pair, preferring the registry label. */
export function modelLabel(models: AiModelOption[], provider?: string | null, modelId?: string | null): string {
  if (!provider || !modelId) return 'default';
  const match = models.find(m => m.provider === provider && m.id === modelId);
  return match?.label ?? modelId;
}

function resolveDefault(scopeType: ChatScope, config: ProjectConfig | undefined, defaults: AiRoleDefault[]): ResolvedDefault | undefined {
  const scopeRole = SCOPE_CHAT_ROLE[scopeType];
  const configured = config?.models ?? {};
  const fromConfig = configured[scopeRole] ?? configured.chat;
  if (fromConfig) return { ...fromConfig, role: configured[scopeRole] ? scopeRole : 'chat' };
  const fromProfile = defaults.find(d => d.role === scopeRole) ?? defaults.find(d => d.role === 'chat');
  return fromProfile ? { provider: fromProfile.provider, model: fromProfile.model, role: fromProfile.role } : undefined;
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

  const models = modelsQuery.data?.models ?? [];
  const llmModels = models.filter(m => m.kind === 'llm' && m.enabled);
  const resolvedDefault = resolveDefault(scopeType, projectQuery.data?.config, modelsQuery.data?.defaults ?? []);

  const overridden = Boolean(session?.modelProvider && session?.modelId);
  const value = overridden ? encodeModelRef(session?.modelProvider ?? '', session?.modelId ?? '') : 'default';
  const triggerLabel = overridden ? modelLabel(models, session?.modelProvider, session?.modelId) : modelLabel(models, resolvedDefault?.provider, resolvedDefault?.model);
  const defaultCaption = resolvedDefault
    ? `${modelLabel(models, resolvedDefault.provider, resolvedDefault.model)} · from ${ROLE_LABEL[resolvedDefault.role] ?? resolvedDefault.role} settings`
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
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled || !session}
          aria-label="Chat model"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            height: 24,
            padding: '0 8px',
            border: 'none',
            borderRadius: 999,
            background: 'var(--sh-bg-pressed)',
            color: 'var(--sh-text-secondary)',
            fontSize: 11,
            fontWeight: 600,
            cursor: disabled || !session ? 'default' : 'pointer',
            opacity: disabled || !session ? 0.55 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {triggerLabel}
          {!overridden && <span style={{ fontWeight: 400, color: 'var(--sh-text-tertiary)' }}>· default</span>}
          <ChevronDownIcon size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start">
        <DropdownMenu.Label>Model for this chat</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
          <DropdownMenu.RadioItem value="default">
            <span>
              Default
              {defaultCaption && <span style={{ display: 'block', fontSize: 11, color: 'var(--sh-text-tertiary)' }}>{defaultCaption}</span>}
            </span>
          </DropdownMenu.RadioItem>
          <DropdownMenu.Separator />
          {llmModels.map(m => (
            <DropdownMenu.RadioItem key={encodeModelRef(m.provider, m.id)} value={encodeModelRef(m.provider, m.id)}>
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
  return <div style={{ marginTop: 4, fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{label}</div>;
}
