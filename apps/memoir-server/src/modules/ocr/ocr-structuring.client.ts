import { Injectable } from '@shadow-library/app';

import { type InferencePlan } from '@modules/inference';
import { AppErrorCode } from '@server/classes';

export interface OcrLineItem {
  label: string;
  amountText?: string | null;
  amountMinor?: number | null;
}

export interface OcrStructuringRequest {
  extractedText: string;
  subjectId: string;
  plan: InferencePlan;
}

/** The structuring response shape; `lineItems` mirrors the jsonb the client later hands back on `expense.create`, display-structured and never aggregated relationally. */
export interface OcrStructuringResult {
  amount: string;
  merchant: string | null;
  category: string | null;
  date: string | null;
  confidence: number;
  lineItems: OcrLineItem[] | null;
}

/**
 * The structuring seam: a class token, not a TS interface, so DI has something to bind; `OcrModule` binds `SynapseOcrStructuringClient`, specs
 * swap in the deterministic double.
 */
export abstract class OcrStructuringClient {
  abstract parse(request: OcrStructuringRequest): Promise<OcrStructuringResult>;
}

/** Sentinel `extractedText` that makes {@link DeterministicOcrStructuringClient} throw, so specs can exercise the failed-parse-still-consumes-quota path without a flaky fake. */
export const OCR_STRUCTURING_FORCED_FAILURE = '__ocr_structuring_forced_failure__';

/** Deterministic double for tests: the same input always produces the same output, and `OCR_STRUCTURING_FORCED_FAILURE` lets a spec simulate a structuring failure. */
@Injectable()
export class DeterministicOcrStructuringClient extends OcrStructuringClient {
  async parse({ extractedText }: OcrStructuringRequest): Promise<OcrStructuringResult> {
    if (extractedText === OCR_STRUCTURING_FORCED_FAILURE) throw AppErrorCode.OCR_002.create();
    return { amount: '12.34', merchant: 'Test Merchant', category: 'food', date: '2026-08-24', confidence: 0.92, lineItems: null };
  }
}
