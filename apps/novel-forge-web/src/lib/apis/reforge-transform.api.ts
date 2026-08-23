import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { type JobEnqueueResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * Transform mode: the structural re-authoring path. The source is analysed once, the author approves a
 * span → output-chapter plan, the writer obeys it, and the finished outputs promote into a publishable
 * project. Body types are hand-authored, matching the sibling reforge module.
 */

export type SpanAction = 'keep' | 'condense' | 'merge' | 'drop';
export type TransformPlanStatus = 'draft' | 'pending' | 'approved' | 'superseded';
export type OutputStatus = 'written' | 'attention' | 'failed';
export type FindingType = 'filler' | 'repetition' | 'pacing_stall' | 'dead_subplot' | 'dropped_thread' | 'arc_boundary' | 'quality_outlier' | 'window_failed';

export interface AnalysisMetrics {
  repetitionRatio: number;
  stallRatio: number;
  medianWords: number;
  arcCount: number;
  deadThreadCount: number;
}

export interface ReforgeAnalysis {
  id: string;
  status: 'pending' | 'signals' | 'analyzing' | 'synthesizing' | 'done' | 'failed';
  windowSize: number;
  chaptersAnalyzed: number;
  windowsFailed: number;
  metrics?: AnalysisMetrics;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisOverview {
  analysis: ReforgeAnalysis;
  findingCounts: Record<string, number>;
}

export interface ReforgeFinding {
  id: string;
  type: FindingType;
  fromChapter: number;
  toChapter: number;
  severity: number;
  confidence: number;
  detectedBy: 'signal' | 'model' | 'both';
  label: string;
  detail?: string | null;
}

export interface PlanSpan {
  ordinal: number;
  fromChapter: number;
  toChapter: number;
  action: SpanAction;
  targetChapters: number;
  arcLabel?: string | null;
  rationale?: string | null;
  keptBeats?: string[] | null;
  cutThreads?: string[] | null;
  continuityNotes?: string | null;
  findingIds?: string[] | null;
  spanKey: string;
  firstOutputChapter?: number | null;
  lastOutputChapter?: number | null;
}

export interface ReforgePlan {
  id: string;
  revision: number;
  status: TransformPlanStatus;
  summary?: string | null;
  sourceChapterCount: number;
  outputChapterCount: number;
  promotedProjectId?: string | null;
  approvedAt?: string | null;
  updatedAt: string;
}

export interface PlanDetail {
  plan: ReforgePlan;
  spans: PlanSpan[];
  outputChapterCount: number;
}

export interface ReforgeOutputSummary {
  outputChapter: number;
  spanOrdinal: number;
  fromChapter: number;
  toChapter: number;
  indexInSpan: number;
  title?: string | null;
  status: OutputStatus;
  issueCount: number;
  wordCount?: number | null;
  revision: number;
  updatedAt: string;
}

export interface ReforgeOutputIssue {
  source?: string;
  type: string;
  detail: string;
  excerpt?: string;
}

export interface ReforgeOutput extends Omit<ReforgeOutputSummary, 'issueCount'> {
  body: string;
  summary?: string | null;
  planBeats?: string[] | null;
  issues?: ReforgeOutputIssue[] | null;
  fidelity?: { verdict?: 'clean' | 'issues'; coveredBeats?: number; totalBeats?: number } | null;
}

export interface ReforgeCut {
  cutKey: string;
  kind: 'subplot' | 'thread' | 'entity' | 'arc' | 'running_gag' | 'scene_pattern';
  label: string;
  aliases?: string[] | null;
  detail?: string | null;
  disposition: 'cut' | 'condensed' | 'resolved_early';
  replacementNote?: string | null;
  originSpanOrdinal: number;
  firstSourceChapter: number;
  lastSourceChapter: number;
  effectiveFromOutput: number;
}

export interface PlanSpansBody {
  spans: Omit<PlanSpan, 'spanKey' | 'firstOutputChapter' | 'lastOutputChapter'>[];
  baseRevision?: number;
}

export interface TransformStartBody {
  outputs?: number[];
  force?: boolean;
  limit?: number;
}

export interface PromoteBody {
  title?: string;
  seedVolumes?: boolean;
}

const transformKeys = {
  all: (projectId: string) => ['projects', projectId, 'reforge', 'transform'] as const,
  analysis: (projectId: string) => [...transformKeys.all(projectId), 'analysis'] as const,
  report: (projectId: string) => [...transformKeys.all(projectId), 'report'] as const,
  findings: (projectId: string, type?: string) => [...transformKeys.all(projectId), 'findings', type ?? 'all'] as const,
  plan: (projectId: string) => [...transformKeys.all(projectId), 'plan'] as const,
  outputs: (projectId: string) => [...transformKeys.all(projectId), 'outputs'] as const,
  output: (projectId: string, outputChapter: number) => [...transformKeys.all(projectId), 'outputs', outputChapter] as const,
  cuts: (projectId: string) => [...transformKeys.all(projectId), 'cuts'] as const,
};

function useTransformInvalidation(projectId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'reforge'] });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
  };
}

export function useReforgeAnalysisQuery(projectId: string, poll = false): UseQueryResult<AnalysisOverview, ApiError> {
  return useQuery<AnalysisOverview, ApiError>({
    queryKey: transformKeys.analysis(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/analysis`).execute(),
    enabled: Boolean(projectId),
    retry: false,
    refetchInterval: poll ? 3000 : false,
  });
}

export function useAnalysisReportQuery(projectId: string, enabled = true): UseQueryResult<{ markdown: string }, ApiError> {
  return useQuery<{ markdown: string }, ApiError>({
    queryKey: transformKeys.report(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/analysis/report`).execute(),
    enabled: enabled && Boolean(projectId),
    retry: false,
  });
}

export function useAnalysisFindingsQuery(
  projectId: string,
  filter: { type?: FindingType; minSeverity?: number } = {},
): UseQueryResult<{ items: ReforgeFinding[]; total: number }, ApiError> {
  return useQuery<{ items: ReforgeFinding[]; total: number }, ApiError>({
    queryKey: transformKeys.findings(projectId, filter.type),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/reforge/analysis/findings`)
        .query({ ...(filter.type ? { type: filter.type } : {}), ...(filter.minSeverity ? { minSeverity: filter.minSeverity } : {}), limit: 200 })
        .execute(),
    enabled: Boolean(projectId),
    retry: false,
  });
}

export function useReforgePlanQuery(projectId: string, poll = false): UseQueryResult<PlanDetail, ApiError> {
  return useQuery<PlanDetail, ApiError>({
    queryKey: transformKeys.plan(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/plan`).execute(),
    enabled: Boolean(projectId),
    retry: false,
    refetchInterval: poll ? 3000 : false,
  });
}

export function useReforgeOutputsQuery(projectId: string, poll = false): UseQueryResult<{ items: ReforgeOutputSummary[] }, ApiError> {
  return useQuery<{ items: ReforgeOutputSummary[] }, ApiError>({
    queryKey: transformKeys.outputs(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/outputs`).execute(),
    enabled: Boolean(projectId),
    refetchInterval: poll ? 3000 : false,
  });
}

export function useReforgeOutputQuery(projectId: string, outputChapter: number | null): UseQueryResult<ReforgeOutput, ApiError> {
  return useQuery<ReforgeOutput, ApiError>({
    queryKey: transformKeys.output(projectId, outputChapter ?? 0),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/outputs/${outputChapter}`).execute(),
    enabled: Boolean(projectId) && outputChapter !== null,
  });
}

export function useReforgeCutsQuery(projectId: string): UseQueryResult<{ items: ReforgeCut[] }, ApiError> {
  return useQuery<{ items: ReforgeCut[] }, ApiError>({
    queryKey: transformKeys.cuts(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/cuts`).execute(),
    enabled: Boolean(projectId),
  });
}

export function useStartAnalysisMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, undefined> {
  const invalidate = useTransformInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/reforge/analyze`).body({}).execute(),
    onSuccess: invalidate,
  });
}

export function useDraftPlanMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, undefined> {
  const invalidate = useTransformInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/reforge/plan`).body({}).execute(),
    onSuccess: invalidate,
  });
}

export function useReplacePlanSpansMutation(projectId: string): UseMutationResult<PlanDetail, ApiError, PlanSpansBody> {
  const invalidate = useTransformInvalidation(projectId);
  return useMutation<PlanDetail, ApiError, PlanSpansBody>({
    mutationFn: body => APIRequest.put(`/projects/${projectId}/reforge/plan/spans`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useApprovePlanMutation(projectId: string): UseMutationResult<PlanDetail, ApiError, { baseRevision?: number }> {
  const invalidate = useTransformInvalidation(projectId);
  return useMutation<PlanDetail, ApiError, { baseRevision?: number }>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/reforge/plan/approve`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useStartTransformMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, TransformStartBody | undefined> {
  const invalidate = useTransformInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, TransformStartBody | undefined>({
    mutationFn: body =>
      APIRequest.post(`/projects/${projectId}/reforge/transform`)
        .body(body ?? {})
        .execute(),
    onSuccess: invalidate,
  });
}

export function useRerunOutputMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, number> {
  const invalidate = useTransformInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, number>({
    mutationFn: outputChapter => APIRequest.post(`/projects/${projectId}/reforge/outputs/${outputChapter}`).body({}).execute(),
    onSuccess: invalidate,
  });
}

export function usePromoteReforgeMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, PromoteBody> {
  const invalidate = useTransformInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, PromoteBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/reforge/promote`).body(body).execute(),
    onSuccess: invalidate,
  });
}
