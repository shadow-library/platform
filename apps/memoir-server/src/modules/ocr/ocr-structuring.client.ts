import { type InferencePlan } from '@modules/inference';

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

/** The structuring seam: a class token, not a TS interface, so DI has something to bind; `OcrModule` binds `SynapseOcrStructuringClient`. */
export abstract class OcrStructuringClient {
  abstract parse(request: OcrStructuringRequest): Promise<OcrStructuringResult>;
}
