import { EnumType } from '@shadow-library/class-schema';

// Enum vocabularies specific to AI structured output — no matching DB enum exists for these, unlike
// entity/thread/mystery/judge-verdict status which reuse `@server/common`'s DB-backed EnumTypes.
export const JudgeSeverity = EnumType.create('JudgeSeverity', ['hard', 'soft']);
export const FixAction = EnumType.create('FixAction', ['patch', 'rewrite']);
export const ReviewDisposition = EnumType.create('ReviewDisposition', ['approve', 'revision_requested']);
export const ReviewSeverity = EnumType.create('ReviewSeverity', ['blocking', 'suggestion']);
export const ValidationSeverity = EnumType.create('ValidationSeverity', ['error', 'warning']);
export const HOOK_TYPES = ['cliffhanger', 'revelation', 'quiet_dread', 'promise', 'turn', 'closure_with_momentum', 'earned_rest'] as const;
export type HookTypeValue = (typeof HOOK_TYPES)[number];
export const HookType = EnumType.create<HookTypeValue>('HookType', [...HOOK_TYPES]);
export const AuditAction = EnumType.create('AuditAction', ['add', 'revise', 'remove', 'keep']);
export const RebrandFixKind = EnumType.create('RebrandFixKind', ['name', 'attribution', 'grammar']);
export const RebrandAuditVerdict = EnumType.create('RebrandAuditVerdict', ['clean', 'issues']);
export const RebrandAuditIssueType = EnumType.create('RebrandAuditIssueType', ['nationalism', 'discrimination', 'naming', 'real_world_reference']);
export const RecombineVerdict = EnumType.create('RecombineVerdict', ['merge', 'split']);
export const ReforgeJudgeVerdict = EnumType.create('ReforgeJudgeVerdict', ['clean', 'issues']);
export const ReforgeJudgeIssueType = EnumType.create('ReforgeJudgeIssueType', ['missing_beat', 'invented_beat', 'naming', 'nationalism', 'discrimination', 'real_world_reference']);
// The transform judge measures the plan contract, not taste: a beat the plan never kept is outside the
// contract, so there is no `invented_beat` — condensation is not drift.
export const ReforgeTransformIssueType = EnumType.create('ReforgeTransformIssueType', [
  'missing_kept_beat',
  'resurfaced_cut',
  'seam_break',
  'naming',
  'nationalism',
  'discrimination',
  'real_world_reference',
]);
export const ReforgeCutKind = EnumType.create('ReforgeCutKind', ['subplot', 'thread', 'entity', 'arc', 'running_gag', 'scene_pattern']);
export const ReforgeCutDisposition = EnumType.create('ReforgeCutDisposition', ['cut', 'condensed', 'resolved_early']);
export const ReforgeSpanAction = EnumType.create('ReforgeSpanAction', ['keep', 'condense', 'merge', 'drop']);
export const ReforgeMovement = EnumType.create('ReforgeMovement', ['advances', 'sidesteps', 'stalls']);
// The model-facing subset of the `reforge_finding_type` DB enum: `window_failed` is recorded by the
// stage when a window throws, never claimed by a model.
export const ReforgeFindingKind = EnumType.create('ReforgeFindingKind', [
  'filler',
  'repetition',
  'pacing_stall',
  'dead_subplot',
  'dropped_thread',
  'arc_boundary',
  'quality_outlier',
]);
