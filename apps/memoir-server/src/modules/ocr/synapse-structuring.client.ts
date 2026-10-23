import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { InferenceClient } from '@modules/inference';
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { type OcrLineItem, OcrStructuringClient, type OcrStructuringRequest, type OcrStructuringResult } from './ocr-structuring.client';

const SYSTEM_PROMPT = [
  'You convert the raw text of a shop receipt into structured JSON. You never invent a value that is not in the text.',
  'Reply with JSON only: { "amount": string, "merchant": string | null, "category": string | null, "date": string | null, "confidence": number, "lineItems": [{ "label": string, "amountText": string | null }] | null }.',
  '"amount" is the final total as it appears, "date" is ISO yyyy-mm-dd if one is legible, and "confidence" is 0-1.',
  'Use null wherever the receipt does not say, rather than guessing.',
].join('\n');

const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

function toLineItems(raw: unknown): OcrLineItem[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      label: String(item['label'] ?? ''),
      amountText: typeof item['amountText'] === 'string' ? item['amountText'] : null,
      amountMinor: typeof item['amountMinor'] === 'number' ? item['amountMinor'] : null,
    }))
    .filter(item => item.label.length > 0);
}

/**
 * A model answering off-contract is an unavailable service, never a partially-trusted one: nothing is fabricated, the user confirms a sheet
 * the model actually produced or none.
 */
export function toStructuringResult(raw: unknown): OcrStructuringResult {
  if (!raw || typeof raw !== 'object') throw AppErrorCode.OCR_002.create();

  const parsed = raw as Record<string, unknown>;
  const amount = typeof parsed['amount'] === 'string' ? parsed['amount'].trim() : String(parsed['amount'] ?? '');
  if (!AMOUNT_PATTERN.test(amount)) throw AppErrorCode.OCR_002.create();

  const confidence = typeof parsed['confidence'] === 'number' ? Math.min(Math.max(parsed['confidence'], 0), 1) : 0;
  return {
    amount,
    merchant: typeof parsed['merchant'] === 'string' ? parsed['merchant'] : null,
    category: typeof parsed['category'] === 'string' ? parsed['category'] : null,
    date: typeof parsed['date'] === 'string' ? parsed['date'] : null,
    confidence,
    lineItems: toLineItems(parsed['lineItems']),
  };
}

/** Any inference failure surfaces as `OCR_002`, which the endpoint already treats as "the attempt consumed quota and produced nothing", never as a fabricated result. */
@Injectable()
export class SynapseOcrStructuringClient extends OcrStructuringClient {
  private readonly logger = Logger.getLogger(APP_NAME, SynapseOcrStructuringClient.name);

  constructor(private readonly inference: InferenceClient) {
    super();
  }

  async parse(request: OcrStructuringRequest): Promise<OcrStructuringResult> {
    const { content } = await this.inference
      .completeJson({
        task: 'memoir.receipt-structuring',
        subjectId: request.subjectId,
        plan: request.plan,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: `Receipt text:\n${request.extractedText}`,
      })
      .catch(error => {
        this.logger.warn('Receipt structuring inference failed', { error });
        throw AppErrorCode.OCR_002.create();
      });
    return toStructuringResult(content);
  }
}
