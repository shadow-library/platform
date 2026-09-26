import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type CancelJobResponse,
  type ChatJobEventResponse,
  type ChatJobResponse,
  type JobKind,
  type JobStatus,
  type ListChatJobsResponse,
  type NotesResponse,
  type ProgressItemKey,
  type ProgressOverrideStatus,
  type ProgressResponse,
  type SavedNotesResponse,
  type SaveMessageAsNotesBody,
  type UndoImpactResponse,
} from './api-types.gen';
import { invalidateSoon } from './batched-invalidation';
import { invalidateProjectStatus } from './project.api';
import { invalidateChat } from './refinement.api';
import { ApiError, APIRequest } from './transport';

const chatKeys = {
  jobs: (projectId: string, sessionId: string) => ['projects', projectId, 'chat-sessions', sessionId, 'jobs'] as const,
  progress: (projectId: string) => ['projects', projectId, 'progress'] as const,
  undoImpact: (projectId: string, proposalId: string) => ['projects', projectId, 'refinement-proposals', proposalId, 'undo-impact'] as const,
  proposals: (projectId: string) => ['projects', projectId, 'refinement-proposals'] as const,
};

export type OrganiseEntryLabel = 'from_notes' | 'suggested' | 'planner_only' | 'retired' | 'rule';

export interface OrganiseCardEntry {
  opIndex: number;
  label: OrganiseEntryLabel;
  paragraphs: number[];
  /** Notebook entries an earlier organise answer kept that declining this op takes out. */
  retires?: string[];
}

/** Mirrors the server's `OrganiseReceipt`, which rides in the job's untyped progress. */
export interface OrganiseReceipt {
  /** Fingerprint of the notes the paragraph numbers refer to (`textDigest` from the sdk). */
  notesDigest: string;
  paragraphs: number;
  unusedParagraphs: number[];
  fromNotes: number;
  suggested: number;
  rules: number;
  applied: OrganiseCardEntry[];
  card: OrganiseCardEntry[];
}

export interface ChatJobProgress {
  done?: number;
  total?: number;
  phase?: string;
  current?: string;
  /** The card the job staged. */
  proposalId?: string;
  /** What the job applied at once from the author's own words. */
  appliedProposalId?: string;
  /** Why something resting on the author's words did not apply. */
  applyNote?: string;
  organised?: OrganiseReceipt;
}

/** One chat job as the transcript draws it, folded from the jobs list and the event stream. */
export interface ChatJobState {
  id: string;
  kind: JobKind;
  status: JobStatus;
  progress: ChatJobProgress;
  error?: string;
  retrying: boolean;
  messageId?: string | null;
  seq: number;
  /** The seq it was first seen at, which keeps a job's place in the transcript as later events arrive. */
  firstSeq: number;
}

export type ChatJobStreamStatus = 'connecting' | 'live' | 'reconnecting' | 'closed';

const TERMINAL: Record<string, JobStatus> = { done: 'done', failed: 'failed', cancelled: 'cancelled' };

function asNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === 'number') : [];
}

function asEntries(value: unknown): OrganiseCardEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    const record = entry as Record<string, unknown> | null;
    if (!record || typeof record.opIndex !== 'number' || typeof record.label !== 'string') return [];
    const retires = Array.isArray(record.retires) ? record.retires.filter((id): id is string => typeof id === 'string') : undefined;
    return [{ opIndex: record.opIndex, label: record.label as OrganiseEntryLabel, paragraphs: asNumbers(record.paragraphs), ...(retires?.length ? { retires } : {}) }];
  });
}

function receiptOf(value: unknown): OrganiseReceipt | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.notesDigest !== 'string') return undefined;
  const count = (key: string): number => (typeof record[key] === 'number' ? (record[key] as number) : 0);
  return {
    notesDigest: record.notesDigest,
    paragraphs: count('paragraphs'),
    unusedParagraphs: asNumbers(record.unusedParagraphs),
    fromNotes: count('fromNotes'),
    suggested: count('suggested'),
    rules: count('rules'),
    applied: asEntries(record.applied),
    card: asEntries(record.card),
  };
}

function progressOf(data: unknown): ChatJobProgress {
  if (typeof data !== 'object' || data === null) return {};
  const record = data as Record<string, unknown>;
  const string = (key: string): string | undefined => (typeof record[key] === 'string' ? (record[key] as string) : undefined);
  const progress: ChatJobProgress = {
    done: typeof record.done === 'number' ? record.done : undefined,
    total: typeof record.total === 'number' ? record.total : undefined,
    phase: string('phase'),
    current: string('current'),
    proposalId: string('proposalId'),
    appliedProposalId: string('appliedProposalId'),
    applyNote: string('applyNote'),
    organised: receiptOf(record.organised),
  };
  return Object.fromEntries(Object.entries(progress).filter(([, value]) => value !== undefined)) as ChatJobProgress;
}

function errorOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const { error, message } = data as Record<string, unknown>;
  if (typeof error === 'string') return error;
  return typeof message === 'string' ? message : undefined;
}

export function jobStateFromListing(job: ChatJobResponse): ChatJobState {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: progressOf(job.progress),
    error: job.lastError ?? undefined,
    retrying: Boolean(job.nextAttemptAt),
    messageId: job.origin.messageId,
    seq: 0,
    firstSeq: 0,
  };
}

export function parseChatJobEvent(data: unknown): ChatJobEventResponse | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const event = JSON.parse(data) as Partial<ChatJobEventResponse> | null;
    if (!event || typeof event.seq !== 'number' || typeof event.jobId !== 'string' || typeof event.type !== 'string') return undefined;
    return event as ChatJobEventResponse;
  } catch {
    return undefined;
  }
}

/** Replays are expected after every reconnect, so an event at or below a job's last seq is dropped rather than applied twice. */
export function reduceChatJobs(jobs: Readonly<Record<string, ChatJobState>>, event: ChatJobEventResponse): Record<string, ChatJobState> {
  const previous = jobs[event.jobId];
  if (previous && event.seq <= previous.seq) return jobs as Record<string, ChatJobState>;
  const base: ChatJobState = previous ?? { id: event.jobId, kind: event.kind, status: 'pending', progress: {}, retrying: false, seq: 0, firstSeq: event.seq };
  const next: ChatJobState = { ...base, kind: event.kind, seq: event.seq, firstSeq: base.firstSeq || event.seq };
  if (event.type === 'queued') next.status = 'pending';
  if (event.type === 'started') Object.assign(next, { status: 'in_progress', retrying: false });
  if (event.type === 'step') Object.assign(next, { status: 'in_progress', progress: { ...base.progress, ...progressOf(event.data) } });
  if (event.type === 'retrying') Object.assign(next, { retrying: true, error: errorOf(event.data) ?? base.error });
  if (event.type === 'done') next.progress = { ...base.progress, ...progressOf(event.data) };
  if (event.type === 'failed') next.error = errorOf(event.data) ?? base.error;
  const terminal = TERMINAL[event.type];
  if (terminal) Object.assign(next, { status: terminal, retrying: false });
  return { ...jobs, [event.jobId]: next };
}

/** Every message a listing has ever named for a job; a later listing that leaves the job out cannot take its anchor away. */
export function learnAnchors(anchors: ReadonlyMap<string, string>, listed: readonly ChatJobResponse[]): ReadonlyMap<string, string> {
  const learned = listed.filter(job => job.origin.messageId && anchors.get(job.id) !== job.origin.messageId);
  if (learned.length === 0) return anchors;
  const next = new Map(anchors);
  for (const job of learned) next.set(job.id, job.origin.messageId ?? '');
  return next;
}

/**
 * The listing knows which message started a job; events never carry it, so the anchor comes from the listing — the current one, or any
 * earlier one through `anchors`. A streamed state no newer than the listing's cursor is older than the listing itself, so the listing wins,
 * settled jobs included; anything past the cursor is the stream's. Jobs keep the order they were first seen in.
 */
export function mergeChatJobs(
  listed: readonly ChatJobResponse[],
  streamed: Readonly<Record<string, ChatJobState>>,
  cursor = 0,
  anchors: ReadonlyMap<string, string> = new Map(),
): ChatJobState[] {
  const merged = new Map<string, ChatJobState>(listed.map(job => [job.id, jobStateFromListing(job)]));
  for (const [id, job] of Object.entries(streamed)) {
    const fromListing = merged.get(id);
    if (!fromListing) merged.set(id, job);
    else if (job.seq > cursor) merged.set(id, { ...job, messageId: fromListing.messageId, progress: { ...fromListing.progress, ...job.progress } });
  }
  return [...merged.values()].map(job => (job.messageId ? job : { ...job, messageId: anchors.get(job.id) ?? job.messageId })).sort((a, b) => a.firstSeq - b.firstSeq);
}

export function useChatJobsQuery(projectId: string, sessionId: string | undefined): UseQueryResult<ListChatJobsResponse, ApiError> {
  return useQuery<ListChatJobsResponse, ApiError>({
    queryKey: chatKeys.jobs(projectId, sessionId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chat/sessions/${sessionId}/jobs`).execute(),
    enabled: Boolean(projectId) && Boolean(sessionId),
  });
}

export interface ChatJobStream {
  jobs: ChatJobState[];
  status: ChatJobStreamStatus;
  error?: ApiError;
  /** Shows a job the moment an apply starts it, before its first event arrives, and asks the listing which message it belongs to. */
  track: (started: readonly { id: string; kind: JobKind }[]) => void;
}

/**
 * The chat's jobs, followed over SSE from the list's first cursor. The server tags every event with its seq as the SSE id, so the browser's
 * own reconnect resumes after `Last-Event-ID` and the replay it sends is folded idempotently by `reduceChatJobs`. A job the listing does not
 * know yet makes it refetch once — that is the only way to learn the message it anchors under — without reopening the stream.
 */
export function useChatJobStream(projectId: string, sessionId: string | undefined): ChatJobStream {
  const queryClient = useQueryClient();
  const listing = useChatJobsQuery(projectId, sessionId);
  const [jobs, setJobs] = useState<Record<string, ChatJobState>>({});
  const [status, setStatus] = useState<ChatJobStreamStatus>('connecting');
  const [openedAt, setOpenedAt] = useState<number>();
  const cursor = listing.data?.cursor;
  const listed = listing.data?.items;
  const known = useRef(new Set<string>());
  const refetch = listing.refetch;
  const [anchors, setAnchors] = useState<ReadonlyMap<string, string>>(new Map());
  const [anchoredFrom, setAnchoredFrom] = useState(listed);

  if (cursor !== undefined && openedAt === undefined) setOpenedAt(cursor);
  if (listed !== anchoredFrom) {
    setAnchoredFrom(listed);
    setAnchors(current => learnAnchors(current, listed ?? []));
  }

  useEffect(() => {
    known.current = new Set([...known.current, ...(listed ?? []).map(job => job.id)]);
  }, [listed]);

  useEffect(() => {
    if (!sessionId || openedAt === undefined || typeof EventSource === 'undefined') return;
    const source = new EventSource(`${APIRequest.basePath}/projects/${projectId}/chat/sessions/${sessionId}/jobs/stream?after=${openedAt}`);
    source.addEventListener('ready', () => setStatus('live'));
    source.addEventListener('job', message => {
      const event = parseChatJobEvent(message.data);
      if (!event) return;
      setJobs(current => reduceChatJobs(current, event));
      if (!known.current.has(event.jobId)) {
        known.current.add(event.jobId);
        void refetch();
      }
      if (TERMINAL[event.type] || progressOf(event.data).proposalId) invalidateChat(queryClient, projectId, sessionId);
    });
    source.onerror = () => setStatus(source.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
    return () => source.close();
  }, [openedAt, projectId, queryClient, refetch, sessionId]);

  const track = (started: readonly { id: string; kind: JobKind }[]): void => {
    if (started.length === 0) return;
    setJobs(current => {
      const next = { ...current };
      for (const { id, kind } of started) next[id] ??= { id, kind, status: 'pending', progress: {}, retrying: false, seq: 0, firstSeq: Number.MAX_SAFE_INTEGER };
      return next;
    });
    void refetch();
  };

  const merged = useMemo(() => mergeChatJobs(listed ?? [], jobs, cursor, anchors), [anchors, cursor, jobs, listed]);
  return { jobs: merged, status: listing.error ? 'closed' : status, error: listing.error ?? undefined, track };
}

export function useCancelChatJobMutation(projectId: string, sessionId: string | undefined): UseMutationResult<CancelJobResponse, ApiError, string> {
  return useMutation<CancelJobResponse, ApiError, string>({
    mutationFn: jobId => APIRequest.post(`/projects/${projectId}/chat/sessions/${sessionId}/jobs/${jobId}/cancel`).execute(),
  });
}

export function useUndoImpactQuery(projectId: string, proposalId: string | undefined, enabled = true): UseQueryResult<UndoImpactResponse, ApiError> {
  return useQuery<UndoImpactResponse, ApiError>({
    queryKey: chatKeys.undoImpact(projectId, proposalId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/proposals/${proposalId}/undo-impact`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(proposalId),
    staleTime: 0,
  });
}

export function useProgressQuery(projectId: string, enabled = true): UseQueryResult<ProgressResponse, ApiError> {
  return useQuery<ProgressResponse, ApiError>({
    queryKey: chatKeys.progress(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/progress`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export interface ProgressOverrideVariables {
  key: ProgressItemKey;
  /** Null clears the override, so the item is judged from the Story Bible again. */
  status: ProgressOverrideStatus | null;
}

export function useProgressOverrideMutation(projectId: string): UseMutationResult<ProgressResponse, ApiError, ProgressOverrideVariables> {
  const queryClient = useQueryClient();
  return useMutation<ProgressResponse, ApiError, ProgressOverrideVariables>({
    mutationFn: ({ key, status }) =>
      status ? APIRequest.put(`/projects/${projectId}/progress/${key}`).body({ status }).execute() : APIRequest.delete(`/projects/${projectId}/progress/${key}`).execute(),
    onSuccess: progress => {
      queryClient.setQueryData(chatKeys.progress(projectId), progress);
      invalidateProjectStatus(queryClient, projectId);
    },
  });
}

export function invalidateProgress(queryClient: ReturnType<typeof useQueryClient>, projectId: string): void {
  invalidateSoon(queryClient, { queryKey: chatKeys.progress(projectId) });
}

export function useAuthorNotesQuery(projectId: string, enabled = true): UseQueryResult<NotesResponse, ApiError> {
  return useQuery<NotesResponse, ApiError>({
    queryKey: ['projects', projectId, 'notes'],
    queryFn: () => APIRequest.get(`/projects/${projectId}/notes`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useSaveMessageAsNotesMutation(projectId: string): UseMutationResult<SavedNotesResponse, ApiError, SaveMessageAsNotesBody> {
  const queryClient = useQueryClient();
  return useMutation<SavedNotesResponse, ApiError, SaveMessageAsNotesBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/notes/from-message`).body(body).execute(),
    onSuccess: (_saved, { sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'notes'] });
      invalidateChat(queryClient, projectId, sessionId);
    },
  });
}
