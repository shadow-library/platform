import { createFileRoute } from '@tanstack/react-router';

import { AiScreen } from '@/features/ai';

interface AskSearch {
  ask?: string;
}

/** The server's `ai.submit` question limit; a longer prefill could never be sent as it stands, so it is dropped rather than cut mid-sentence. */
const ASK_MAX_LENGTH = 2000;

function validateAskSearch(search: Record<string, unknown>): AskSearch {
  const { ask } = search;
  return { ask: typeof ask === 'string' && ask.trim().length > 0 && ask.length <= ASK_MAX_LENGTH ? ask : undefined };
}

export const Route = createFileRoute('/_account/_app/ai')({ validateSearch: validateAskSearch, staticData: { title: 'Ask' }, component: AiScreen });
