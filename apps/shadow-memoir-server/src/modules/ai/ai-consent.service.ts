/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type AiConsent } from '@server/database';

import { AiConsentRepository } from './ai-consent.repository';
import { type AiConsentGrantDto } from './ai.dto';

/**
 * Defining types
 */

export interface AiConsentView {
  dataClass: AiConsent.DataClass;
  granted: boolean;
  grantedAt: Date | null;
  withdrawnAt: Date | null;
}

/**
 * Declaring the constants
 */

const CONSENT_DATA_CLASSES: AiConsent.DataClass[] = ['journal_reflection_reason', 'health'];

/**
 * A class absent from the account's `ai_consents` rows has never been granted (PRD §6.7): the view
 * always carries every known class, synthesizing the ungranted state rather than letting the client
 * infer "no row" as "granted".
 */
@Injectable()
export class AiConsentService {
  constructor(private readonly consentRepository: AiConsentRepository) {}

  async list(): Promise<AiConsentView[]> {
    const rows = await this.consentRepository.list();
    return this.toView(rows);
  }

  /** Withdrawal is reflected in the very next read (PRD §6.7 acceptance) because it is a plain committed UPDATE with no cache layer in front of it. */
  async update(grants: AiConsentGrantDto[]): Promise<AiConsentView[]> {
    for (const grant of grants) {
      if (grant.granted) await this.consentRepository.grant(grant.dataClass as AiConsent.DataClass);
      else await this.consentRepository.withdraw(grant.dataClass as AiConsent.DataClass);
    }
    return this.list();
  }

  private toView(rows: AiConsent.Row[]): AiConsentView[] {
    return CONSENT_DATA_CLASSES.map(dataClass => {
      const row = rows.find(candidate => candidate.dataClass === dataClass);
      if (!row) return { dataClass, granted: false, grantedAt: null, withdrawnAt: null };
      return { dataClass, granted: row.withdrawnAt === null, grantedAt: row.grantedAt, withdrawnAt: row.withdrawnAt };
    });
  }
}
