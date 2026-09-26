export type CostTier = 'economy' | 'balanced' | 'performant';
export type ContentMode = 'standard' | 'unrestricted';
export type ChatMode = 'manual' | 'auto';
type JobStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';
type FinalizeReviewStatus = 'preparing' | 'ready' | 'failed' | 'applied' | 'reverted';

export const COST_TIERS: readonly CostTier[] = ['economy', 'balanced', 'performant'];

export interface ChangeOp {
  op: string;
  [field: string]: unknown;
}

export interface Proposal {
  id: string;
  sessionId?: string | null;
  kind: string;
  status: string;
  summary?: string | null;
  changeSet: ChangeOp[];
  autoApplied: boolean;
  runId?: string | null;
  opResults?: Record<string, unknown>[] | null;
  warnings: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  ordinal: number;
  role: string;
  content: string;
  proposalId?: string | null;
  appliedProposalId?: string | null;
  runId?: string | null;
  costTier?: CostTier | null;
  costUsd?: number | null;
}

export interface ChatTurnResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  proposal?: Proposal;
  appliedProposal?: Proposal;
  applyNote?: string;
  runId: string;
}

export interface TurnRequest {
  content: string;
  justDiscussing?: boolean;
  proseEdits?: boolean;
  contentMode?: ContentMode;
  costTier?: CostTier;
}

/** A turn as the author experienced it: the result plus when each lookup round landed, in ms from the POST. */
export interface TurnTrace {
  result: ChatTurnResult;
  totalMs: number;
  lookupAtMs: number[];
}

export interface ChatSession {
  id: string;
  mode: ChatMode;
  contentMode?: ContentMode | null;
  costTier?: CostTier | null;
}

export interface Project {
  id: string;
  name: string;
  contentMode: ContentMode;
  costTier: CostTier;
  brief?: string | null;
  theme?: string | null;
  ending?: string | null;
  endingQuestion?: string | null;
  readerPromise?: string | null;
  opposition?: string | null;
  protagonistKey?: string | null;
}

export interface Job {
  id: string;
  kind: string;
  status: JobStatus;
  attempts: number;
  lastError?: string | null;
  progress?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

interface AppliedJob {
  index: number;
  jobId: string;
  runId?: string;
}

export interface ApplyResult {
  proposal: Proposal;
  jobs: AppliedJob[];
  opResults: { index: number; status: string; error?: string }[];
}

export interface BibleDocItem {
  section: string;
  slug: string;
  title: string;
  isEmpty: boolean;
  plannerOnly: boolean;
}

export interface BibleDoc {
  section: string;
  slug: string;
  body?: string | null;
  frontmatter?: Record<string, unknown> | null;
  plannerOnly: boolean;
}

export interface Entity {
  entityKey: string;
  type: string;
  name: string;
  status?: string | null;
  notes?: string | null;
  motivation?: string | null;
  body?: string | null;
}

export interface Fact {
  factKey: string;
  text: string;
  terms?: string[] | null;
  writerNote?: string | null;
  allowedClues?: string[] | null;
}

export interface Volume {
  volumeKey: string;
  ordinal: number;
  title?: string | null;
  objective?: string | null;
  body?: string | null;
}

export interface Draft {
  id: string;
  chapter: number;
  title?: string | null;
  status: 'draft' | 'final';
  revision: number;
  saveSeq: number;
  approvedRevision: number | null;
  body: string;
  summary?: string | null;
  isolated: boolean;
  judge?: string | null;
  judgeNote?: string | null;
}

interface FinalizeReviewItem {
  id: string;
  category: string;
  triage: 'consequential' | 'routine';
  claim: string;
  flag?: string | null;
  decision?: string | null;
}

export interface FinalizeReview {
  id: string;
  chapter: number;
  status: FinalizeReviewStatus;
  isolated: boolean;
  bridgeOnly: boolean;
  error?: string | null;
  disclosure: { clear: boolean; findings: string[]; copy: string };
  consequential: FinalizeReviewItem[];
  routine: FinalizeReviewItem[];
}

export interface IsolationBridge {
  chapter: number;
  revision: number;
  approved: boolean;
  summary?: string | null;
  positions: { entityKey: string; location?: string | null; conditions: string[] }[];
}

export interface WriterSnapshotSummary {
  id: string;
  chapter: number;
  draftRevision: number;
  attempt: number;
  role: string;
  isolated: boolean;
}

export interface WriterSnapshot extends WriterSnapshotSummary {
  messages: { role: string; content: string }[];
}

export interface ModelCall {
  role: string;
  provider: string;
  model: string;
  status: string;
  latencyMs?: number | null;
  attempt: number;
  costUsd?: string | null;
  tier?: CostTier | null;
  contentMode?: ContentMode | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface RunUsage {
  id: string;
  graph: string;
  jobId?: string | null;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  totals: { calls: number; costUsd: number; durationMs?: number | null };
  calls: ModelCall[];
}

export interface RunListItem {
  id: string;
  graph: string;
  jobId?: string | null;
  status: string;
  startedAt: string;
  endedAt?: string | null;
}

interface CostBreakdownItem {
  key: string;
  calls: number;
  costUsd: number;
}

export interface ProjectCost {
  totalCostUsd: number;
  calls: number;
  byTier: CostBreakdownItem[];
  byRole: CostBreakdownItem[];
  byModel: CostBreakdownItem[];
}

export interface ChapterCost {
  chapter: number;
  totals: { calls: number; costUsd: number };
}

export interface Quota {
  calls: number;
  costUsd: number;
  maxCalls: number;
  maxCostUsd: number;
  windowMs: number;
}

export interface NovelBundle {
  format: 'novel-import';
  schemaVersion: 1;
  mode: 'final';
  novel: { title: string; synopsis: string };
  volumes: { ordinal: number; title?: string; chapters: { title: string; content: string }[] }[];
}

export interface EntityInput {
  entityKey: string;
  type: string;
  name: string;
  significance?: 'major' | 'minor';
  notes?: string;
}

export interface MilestoneInput {
  milestoneKey: string;
  label: string;
  subjectEntityKey?: string;
  kind?: string;
}

export interface FactInput {
  text: string;
  subjects?: string[];
  terms?: string[];
  writerNote?: string;
  allowedClues?: string[];
  unlock?: { all: ({ milestone: string } | { chapter: number })[] };
}

export interface BriefInput {
  title?: string;
  body: string;
  pov?: string;
  contentMode?: ContentMode;
  claimedMilestones?: string[];
}

export interface DraftInput {
  title?: string;
  body: string;
}
