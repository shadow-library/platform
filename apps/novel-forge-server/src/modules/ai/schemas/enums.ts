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
export const ExtractionConfidence = EnumType.create('ExtractionConfidence', ['high', 'low']);
