import { type ChatMessageResponse, useAdminModelsQuery } from '@/lib/apis';
import { modelTagParts } from '@/lib/chat-model';
import { messageTime } from '@/lib/format';
import { modelLabel } from '@/lib/model-defaults';
import { useIsAdmin } from '@/lib/session';

import styles from './ChatModel.module.css';

interface MessageModelTagProps {
  message: ChatMessageResponse;
  /** How long the turn worked and what it read; unknown for a reply older than the turn trace. */
  worked?: string | null;
}

export function MessageModelTag({ message, worked }: MessageModelTagProps): React.JSX.Element | null {
  const isAdmin = useIsAdmin();
  const catalog = useAdminModelsQuery(isAdmin && Boolean(message.modelId));
  if (message.role !== 'assistant') return null;
  const model = modelLabel(catalog.data, message.modelId, message.modelProvider);
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
