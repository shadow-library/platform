/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AccountContext, AccountRepository } from '@modules/auth';
import { ProgressionService } from '@modules/progression';
import { addDays, formatLocalDate, localDateAt, startOfLocalDay } from '@modules/rules';
import { AppErrorCode } from '@server/classes';
import type { Account } from '@server/database';

import { type OcrParseDto, type OcrQuotaResponseDto } from './ocr.dto';
import { OcrStructuringClient, type OcrStructuringResult } from './ocr-structuring.client';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class OcrService {
  constructor(
    private readonly accountContext: AccountContext,
    private readonly accountRepository: AccountRepository,
    private readonly structuringClient: OcrStructuringClient,
    private readonly progressionService: ProgressionService,
  ) {}

  async getQuota(): Promise<OcrQuotaResponseDto> {
    const account = await this.requireAccount();
    return this.quotaView(account);
  }

  /**
   * Guard order per ARCHITECTURE §14.3: authenticate (controller) → atomically consume quota → run
   * structuring. Quota is consumed before the structuring call so a failed parse — including an
   * unconfigured structuring client — still costs an attempt [PRD §2.5/§4.14: "counted per attempt"].
   */
  async parse(body: OcrParseDto): Promise<OcrStructuringResult> {
    const account = await this.requireAccount();
    const cap = Config.get('quotas.ocr-daily');
    const today = formatLocalDate(localDateAt(Date.now(), account.timezone));

    const updated = await this.accountRepository.consumeOcrQuota(account.id, today, cap);
    if (!updated) AppErrorCode.OCR_001.throw({ resetAt: this.nextResetAt(account.timezone) });

    const result = await this.structuringClient.parse(body.extractedText);
    await this.progressionService.onReceiptScanned(account.id, today);
    return result;
  }

  private quotaView(account: Account.Row): OcrQuotaResponseDto {
    const cap = Config.get('quotas.ocr-daily');
    const today = formatLocalDate(localDateAt(Date.now(), account.timezone));
    const used = account.ocrQuotaDate === today ? account.ocrQuotaCount : 0;
    return { cap, used, remaining: Math.max(cap - used, 0), resetAt: this.nextResetAt(account.timezone) };
  }

  private nextResetAt(timezone: string): string {
    const tomorrow = addDays(localDateAt(Date.now(), timezone), 1);
    return new Date(startOfLocalDay(tomorrow, timezone)).toISOString();
  }

  private async requireAccount(): Promise<Account.Row> {
    const accountId = this.accountContext.getAccountId();
    if (accountId === null) throw AppError.internal('OcrService used without a resolved account context');
    const account = await this.accountRepository.findById(accountId);
    if (!account) throw AppError.internal(`resolved account id '${accountId}' has no accounts row`);
    return account;
  }
}
