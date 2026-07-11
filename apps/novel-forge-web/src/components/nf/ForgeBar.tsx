/**
 * Importing npm packages
 */
import { Button, IconButton, Textarea, toast } from '@shadow-library/ui';
import { useEffect, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { SparkIcon } from '@/components/icons';
import { ChatModelMenu, MessageModelTag } from '@/components/nf/ChatModel';
import { type ChatScope, type ChatTurnResponse, useCreateChatSessionMutation, useForgeTurnMutation, useListChatSessionsQuery } from '@/lib/apis';

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

/**
 * The compact Forge composer from the design: a floating pill ("✦ Ask Forge to update X…") that
 * expands in place into a small card — borderless input, scope chip pre-set to what's on screen,
 * a quiet model menu, and a Propose button. Each ask lands as a reviewable proposal; the latest
 * reply shows inline so quick back-and-forth never leaves the page.
 */
export function ForgeBar({ novelId, scope, placeholder }: { novelId: string; scope: ForgeScope; placeholder?: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [last, setLast] = useState<ChatTurnResponse | undefined>();
  const creatingRef = useRef(false);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  const sessionsQuery = useListChatSessionsQuery(novelId, { scopeType: scope.type, status: 'active', limit: 50 }, open);
  const createSession = useCreateChatSessionMutation(novelId);
  const turn = useForgeTurnMutation(novelId);

  // The bar follows the content on screen — a different section means a different conversation.
  useEffect(() => {
    setSessionId(undefined);
    setLast(undefined);
    creatingRef.current = false;
  }, [scope.type, scope.ref, scope.title]);

  // Reuse the section's existing scoped session, or open one the first time it is refined.
  useEffect(() => {
    if (!open || sessionId || !sessionsQuery.isSuccess) return;
    const match = sessionsQuery.data.items.find(s => (s.scopeRef ?? '') === (scope.ref ?? '') && (s.title ?? '') === scope.title);
    if (match) {
      setSessionId(match.id);
      return;
    }
    if (creatingRef.current) return;
    creatingRef.current = true;
    createSession.mutate(
      { scopeType: scope.type, scopeRef: scope.ref, title: scope.title },
      {
        onSuccess: s => setSessionId(s.id),
        onError: e => {
          creatingRef.current = false;
          toast.danger(e.message);
        },
      },
    );
  }, [open, sessionId, sessionsQuery.isSuccess, sessionsQuery.data, scope, createSession]);

  useEffect(() => {
    if (open) inputWrapRef.current?.querySelector('textarea')?.focus();
  }, [open, sessionId]);

  const session = sessionsQuery.data?.items.find(s => s.id === sessionId);

  const propose = (): void => {
    const content = text.trim();
    if (!content || !sessionId || turn.isPending) return;
    turn.mutate(
      { sessionId, content },
      {
        onSuccess: result => {
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
