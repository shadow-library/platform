import { useEffect, useRef, useState } from 'react';
import { toast } from '@shadow-library/ui';

import {
  type DraftResponse,
  isApiError,
  type PassageSuggestionResponse,
  useApplyPassageMutation,
  useDismissPassageMutation,
  usePassageSuggestionsQuery,
  useRequestPassageMutation,
} from '@/lib/apis';
import { type DraftBase, type SettledBase, unsettledMessage } from '@/lib/chapter-editor';
import { appliedMessage, passageHash, type PassageSelection, SELECTION_CHANGED_MESSAGE, selectionOf, writeRefusalMessage } from '@/lib/passage-suggestions';

import { useSingleFlight } from './use-single-flight';

export interface PassageAsk {
  selection: PassageSelection;
  request: string;
  /** The suggestion this ask tries again, dismissed once the new one arrives. */
  replaces?: string;
}

export interface PassageAskController {
  ask?: PassageAsk;
  suggestions: PassageSuggestionResponse[];
  /** A request, an apply or a dismiss is in flight — including the save it waits for first; only one runs at a time. */
  busy: boolean;
  requesting: boolean;
  /** The suggestion an Apply or Dismiss is in flight for. */
  busyId?: string;
  open: (selection: PassageSelection, request?: string, replaces?: string) => void;
  setRequest: (request: string) => void;
  cancel: () => void;
  submit: () => Promise<void>;
  apply: (suggestion: PassageSuggestionResponse) => Promise<void>;
  dismiss: (suggestion: PassageSuggestionResponse) => Promise<void>;
  /** Where Try again would select: the passage where the server placed it now. A stale suggestion has no place, so no retry (P4-45). */
  retryTarget: (suggestion: PassageSuggestionResponse) => PassageSelection | undefined;
}

function baseBody(base: DraftBase): { baseDraftId: string; baseRevision: number; baseSaveSeq: number } {
  return { baseDraftId: base.draftId, baseRevision: base.revision, baseSaveSeq: base.saveSeq };
}

function refuse(error: unknown): void {
  toast.warning(isApiError(error) ? writeRefusalMessage(error) : 'That didn’t go through — try again.');
}

export function usePassageAsk(novelId: string, draft: DraftResponse, settledBase: () => Promise<SettledBase>): PassageAskController {
  const chapter = draft.chapter;
  const final = draft.status === 'final';
  const suggestionsQuery = usePassageSuggestionsQuery(novelId, chapter, !final);
  const requestPassage = useRequestPassageMutation(novelId, chapter);
  const applyPassage = useApplyPassageMutation(novelId, chapter);
  const dismissPassage = useDismissPassageMutation(novelId, chapter);
  // One flight for request, apply and dismiss on purpose: each writes against the draft's current base, and every card's buttons disable on `busy`.
  const flight = useSingleFlight();
  const [ask, setAsk] = useState<PassageAsk | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const body = draft.body ?? '';

  // An autosave marks the list stale without refetching it; the server re-locates every suggestion against the new text, so it is read again.
  const { refetch } = suggestionsQuery;
  const locatedAt = useRef(`${draft.revision}:${draft.saveSeq}`);
  useEffect(() => {
    const at = `${draft.revision}:${draft.saveSeq}`;
    if (locatedAt.current === at) return;
    locatedAt.current = at;
    if (!final) void refetch();
  }, [draft.revision, draft.saveSeq, final, refetch]);

  const settled = async (): Promise<DraftBase | undefined> => {
    const result = await settledBase();
    if (result.kind === 'settled') return result.base;
    toast.warning(unsettledMessage(result.status));
    return undefined;
  };

  const submit = (): Promise<void> =>
    flight
      .run(async () => {
        if (!ask || !ask.request.trim()) return;
        const { selection } = ask;
        if (body.slice(selection.start, selection.end) !== selection.text) {
          toast.warning(SELECTION_CHANGED_MESSAGE);
          setAsk(undefined);
          return;
        }
        const base = await settled();
        if (!base) return;
        try {
          await requestPassage.mutateAsync({
            ...baseBody(base),
            start: selection.start,
            end: selection.end,
            passageHash: await passageHash(selection.text),
            request: ask.request.trim(),
          });
          setAsk(undefined);
          if (ask.replaces) await dismissPassage.mutateAsync(ask.replaces).catch(() => undefined);
        } catch (error) {
          refuse(error);
        }
      })
      .then(() => undefined);

  const onSuggestion = (suggestion: PassageSuggestionResponse, task: () => Promise<void>): Promise<void> =>
    flight
      .run(async () => {
        setBusyId(suggestion.id);
        try {
          await task();
        } catch (error) {
          refuse(error);
        } finally {
          setBusyId(undefined);
        }
      })
      .then(() => undefined);

  const apply = (suggestion: PassageSuggestionResponse): Promise<void> =>
    onSuggestion(suggestion, async () => {
      const base = await settled();
      if (!base) return;
      const applied = await applyPassage.mutateAsync({ suggestionId: suggestion.id, base: baseBody(base) });
      const message = appliedMessage(applied.draft);
      if (message.tone === 'warning') toast.warning(message.text);
      else toast.success(message.text);
    });

  const dismiss = (suggestion: PassageSuggestionResponse): Promise<void> =>
    onSuggestion(suggestion, async () => {
      await dismissPassage.mutateAsync(suggestion.id);
    });

  const retryTarget = (suggestion: PassageSuggestionResponse): PassageSelection | undefined => {
    const { start, end } = suggestion.location;
    if (start === null || end === null) return undefined;
    const found = selectionOf(body, start, end);
    return found.kind === 'ok' ? found.selection : undefined;
  };

  return {
    ask,
    suggestions: final ? [] : (suggestionsQuery.data?.items ?? []),
    busy: flight.busy,
    requesting: flight.busy && busyId === undefined,
    busyId,
    open: (selection, request = '', replaces) => setAsk({ selection, request, replaces }),
    setRequest: request => setAsk(current => current && { ...current, request }),
    cancel: () => setAsk(undefined),
    submit,
    apply,
    dismiss,
    retryTarget,
  };
}
