/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

/**
 * Defining types
 */

export interface OcrLineItem {
  label: string;
  amountText?: string | null;
  amountMinor?: number | null;
}

/** ARCHITECTURE §14.3 step 2's structuring response shape; `lineItems` mirrors the jsonb the client later hands back on `expense.create` (T-25 `lineItems: jsonb`, display-structured, never aggregated relationally). */
export interface OcrStructuringResult {
  amount: string;
  merchant: string | null;
  category: string | null;
  date: string | null;
  confidence: number;
  lineItems: OcrLineItem[] | null;
}

/**
 * The structuring seam (ARCHITECTURE §14.3): a class token, not a TS interface, because interfaces
 * vanish at runtime and DI needs something to bind against (`{ token: OcrStructuringClient, useClass: ... }`,
 * mirroring `apps/identity-server`'s `KeyProvider`/`EnvKeyProvider`). `OcrModule` binds it to
 * `InClusterOcrStructuringClient` (§14.3 step 2); specs swap in the deterministic double below.
 */
export abstract class OcrStructuringClient {
  abstract parse(extractedText: string): Promise<OcrStructuringResult>;
}

/** Sentinel `extractedText` that makes {@link DeterministicOcrStructuringClient} throw, so specs can exercise the failed-parse-still-consumes-quota path without a flaky fake. */
export const OCR_STRUCTURING_FORCED_FAILURE = '__ocr_structuring_forced_failure__';

/**
 * Deterministic double for tests: swapped in for `OcrStructuringClient` via
 * `ShadowFactory.create(TestAppModule, { overrides: [{ token: OcrStructuringClient, useClass: DeterministicOcrStructuringClient }] })`.
 * Same input always produces the same output — no randomness, no network — and {@link OCR_STRUCTURING_FORCED_FAILURE}
 * lets a spec simulate a structuring failure deterministically.
 */
@Injectable()
export class DeterministicOcrStructuringClient extends OcrStructuringClient {
  async parse(extractedText: string): Promise<OcrStructuringResult> {
    if (extractedText === OCR_STRUCTURING_FORCED_FAILURE) throw AppErrorCode.OCR_002.create();
    return { amount: '12.34', merchant: 'Test Merchant', category: 'food', date: '2026-08-24', confidence: 0.92, lineItems: null };
  }
}
