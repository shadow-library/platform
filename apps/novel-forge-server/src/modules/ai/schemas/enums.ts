/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { EnumType } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Enum vocabularies specific to AI structured output — no matching DB enum exists for these, unlike
// entity/thread/mystery/judge-verdict status which reuse `@server/common`'s DB-backed EnumTypes.
export const JudgeSeverity = EnumType.create('JudgeSeverity', ['hard', 'soft']);
export const FixAction = EnumType.create('FixAction', ['patch', 'rewrite']);
export const ReviewDisposition = EnumType.create('ReviewDisposition', ['approve', 'revision_requested']);
export const ReviewSeverity = EnumType.create('ReviewSeverity', ['blocking', 'suggestion']);
export const ValidationSeverity = EnumType.create('ValidationSeverity', ['error', 'warning']);
export const HookType = EnumType.create('HookType', ['cliffhanger', 'revelation', 'quiet_dread', 'promise', 'turn']);
export const AuditAction = EnumType.create('AuditAction', ['add', 'revise', 'remove', 'keep']);
