import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Textarea, toast } from '@shadow-library/ui';

import { SparkIcon } from '@/components/icons';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import { type ChatScope, type ChatSessionResponse, type ChatTurnResponse, useCreateChatSessionMutation, useForgeTurnMutation } from '@/lib/apis';

import styles from './ForgeBar.module.css';

/**
 * The section the bar refines. `type`/`ref` map to the backend chat scope, so whatever the author is
 * looking at (an entity, a volume, an arc, a chapter) rides along as the model's context.
 */
export interface ForgeScope {
  type: ChatScope;
  ref?: string;
  title: string;
}

/** The hub playbook only knows what the author is looking at if the first turn tells it — `ref` is the literal lookup key, so it wins; title is the only signal for the scopes that carry no ref (an entity bio, the volume plan). */
function contextLine(scope: ForgeScope): string {
  return scope.ref ? `[context: ${scope.ref} — "${scope.title}"]` : `[context: ${scope.title}]`;
}

export function ForgeBar({ novelId, scope, placeholder }: { novelId: string; scope: ForgeScope; placeholder?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [createdSession, setCreatedSession] = useState<ChatSessionResponse | undefined>();
  const [last, setLast] = useState<ChatTurnResponse | undefined>();
  const creatingRef = useRef<string | null>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const contextSentFor = useRef<string | null>(null);

  const createSession = useCreateChatSessionMutation(novelId);
  const turn = useForgeTurnMutation(novelId);

  const scopeKey = JSON.stringify([scope.type, scope.ref, scope.title]);
  const [syncedScope, setSyncedScope] = useState(scopeKey);
  if (syncedScope !== scopeKey) {
    setSyncedScope(scopeKey);
    setCreatedSession(undefined);
    setLast(undefined);
  }

  const sessionId = createdSession?.id;

  useEffect(() => {
    contextSentFor.current = null;
  }, [scopeKey]);

  useEffect(() => {
    if (!open || sessionId || creatingRef.current === scopeKey) return;
    creatingRef.current = scopeKey;
    createSession.mutate(
      {},
      {
        onSuccess: s => setCreatedSession(s),
        onError: e => {
          creatingRef.current = null;
          toast.danger(e.message);
        },
      },
    );
  }, [open, sessionId, scopeKey, createSession]);

  useEffect(() => {
    if (open) inputWrapRef.current?.querySelector('textarea')?.focus();
  }, [open, sessionId]);

  const session = createdSession;

  const propose = (): void => {
    const message = text.trim();
    if (!message || !sessionId || turn.isPending) return;
    const isFirstTurn = contextSentFor.current !== sessionId;
    const content = isFirstTurn ? `${contextLine(scope)}\n${message}` : message;
    turn.mutate(
      { sessionId, content },
      {
        onSuccess: result => {
          if (isFirstTurn) contextSentFor.current = sessionId;
          setText('');
          setLast(result);
          if (result.proposal) toast.success('Forge staged a proposal — review it in Proposals');
        },
        onError: e => toast.danger(e.message),
      },
    );
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={styles.pill}>
        <SparkIcon size={16} className={styles.pillIcon} />
        <span className={styles.pillLabel}>Ask Forge to update {scope.title}…</span>
      </button>
    );
  }

  return (
    <div className={styles.card}>
      <div ref={inputWrapRef} className={styles.inputRow}>
        <SparkIcon size={16} className={styles.inputIcon} />
        <Textarea
          value={text}
          onValueChange={setText}
          placeholder={placeholder ?? `Ask Forge to update ${scope.title} — add a detail, change a trait, note a new relationship…`}
          minRows={1}
          autoGrow
          disabled={!sessionId}
          className={styles.input}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              propose();
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <IconButton variant="ghost" size="sm" aria-label="Close" icon={<span className={styles.closeGlyph}>×</span>} onClick={() => setOpen(false)} />
      </div>

      {(last || turn.isPending) && (
        <div className={styles.reply}>
          {turn.isPending ? (
            <span className={styles.thinking}>Forge is thinking…</span>
          ) : (
            last && (
              <>
                <div className={`nf-scroll ${styles.replyBody}`}>{last.assistantMessage.content}</div>
                <MessageModelTag message={last.assistantMessage} />
              </>
            )
          )}
        </div>
      )}

      <div className={styles.footerRow}>
        <span className="nf-chip" data-intent="neutral">
          scope · {scope.title}
        </span>
        <ChatModelMenu novelId={novelId} session={session} scopeType={scope.type} />
        <span className={styles.hint}>Produces a reviewable proposal — canon isn&apos;t edited directly.</span>
        <div className={styles.spacer} />
        <Button variant="primary" size="sm" loading={turn.isPending} disabled={!sessionId || !text.trim()} onClick={propose}>
          Propose
        </Button>
      </div>
    </div>
  );
}
