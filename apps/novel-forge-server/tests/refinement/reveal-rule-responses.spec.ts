import { describe, expect, it } from 'bun:test';

import { RevealRuleErrorResponse } from '@server/common';

import { ChapterInsertController } from '@modules/generation/chapter-insert.controller';
import { GenerationController } from '@modules/generation/generation.controller';
import { DraftConflictResponse } from '@modules/generation/generation.dto';
import { ProposalController } from '@modules/refinement/proposal.controller';

type Handler = (...args: never[]) => unknown;

/** The route's declared response schemas by status: what the response serialiser keeps of an error body. */
function responses(handler: Handler): Record<number, unknown> {
  const key = Reflect.getMetadataKeys(handler).find(candidate => typeof candidate === 'symbol' && candidate.description === 'handler-metadata');
  return (Reflect.getMetadata(key, handler) as { schemas?: { response?: Record<number, unknown> } }).schemas?.response ?? {};
}

describe('routes that refuse a plan under the reveal rule', () => {
  it('should declare the PLN_001 body with its violations wherever a plan is written', () => {
    expect(responses(ProposalController.prototype.applyProposal)[400]).toBe(RevealRuleErrorResponse);
    expect(responses(ProposalController.prototype.revertProposal)[400]).toBe(RevealRuleErrorResponse);
    expect(responses(GenerationController.prototype.updateBrief)[400]).toBe(RevealRuleErrorResponse);
    expect(responses(ChapterInsertController.prototype.insertChapter)[400]).toBe(RevealRuleErrorResponse);
  });

  it('should declare the one 409 body, carrying the PLN_004 violations, where an approval or finalize would ledger a plan', () => {
    expect(responses(GenerationController.prototype.approveDraft)[409]).toBe(DraftConflictResponse);
    expect(responses(GenerationController.prototype.finalizeChapters)[409]).toBe(DraftConflictResponse);
  });
});
