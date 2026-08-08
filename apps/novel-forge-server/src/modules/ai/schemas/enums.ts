import { EnumType } from '@shadow-library/class-schema';

// Enum vocabularies specific to AI structured output — no matching DB enum exists for these, unlike
// entity/thread/mystery/judge-verdict status which reuse `@server/common`'s DB-backed EnumTypes.
export const JudgeSeverity = EnumType.create('JudgeSeverity', ['hard', 'soft']);
export const FixAction = EnumType.create('FixAction', ['patch', 'rewrite']);
export const ReviewDisposition = EnumType.create('ReviewDisposition', ['approve', 'revision_requested']);
export const ReviewSeverity = EnumType.create('ReviewSeverity', ['blocking', 'suggestion']);
export const ValidationSeverity = EnumType.create('ValidationSeverity', ['error', 'warning']);
export const HookType = EnumType.create('HookType', ['cliffhanger', 'revelation', 'quiet_dread', 'promise', 'turn']);
export const AuditAction = EnumType.create('AuditAction', ['add', 'revise', 'remove', 'keep']);
export const RebrandFixKind = EnumType.create('RebrandFixKind', ['name', 'attribution', 'grammar']);
export const RebrandAuditVerdict = EnumType.create('RebrandAuditVerdict', ['clean', 'issues']);
export const RebrandAuditIssueType = EnumType.create('RebrandAuditIssueType', ['nationalism', 'discrimination', 'naming', 'real_world_reference']);
export const RecombineVerdict = EnumType.create('RecombineVerdict', ['merge', 'split']);
export const ReforgeJudgeVerdict = EnumType.create('ReforgeJudgeVerdict', ['clean', 'issues']);
export const ReforgeJudgeIssueType = EnumType.create('ReforgeJudgeIssueType', ['missing_beat', 'invented_beat', 'naming', 'nationalism', 'discrimination', 'real_world_reference']);
