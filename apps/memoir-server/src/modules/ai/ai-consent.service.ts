/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { type AiConsent } from '@server/database';

import { type AiConsentDecision, AiConsentRepository } from './ai-consent.repository';
import { type AiConsentGrantDto, type AiConsentUpdateDto } from './ai.dto';

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

  async update(update: AiConsentUpdateDto): Promise<AiConsentView[]> {
    if (update.onlyIfUndecided) await this.recordFirstDecision(update.grants);
    else await this.apply(update.grants);
    return this.list();
  }

  private async apply(grants: AiConsentGrantDto[]): Promise<void> {
    for (const grant of grants) {
      if (grant.granted) await this.consentRepository.grant(grant.dataClass as AiConsent.DataClass);
      else await this.consentRepository.withdraw(grant.dataClass as AiConsent.DataClass);
    }
  }

  private async recordFirstDecision(grants: AiConsentGrantDto[]): Promise<void> {
    const perClass = CONSENT_DATA_CLASSES.map(dataClass => grants.filter(grant => grant.dataClass === dataClass));
    if (grants.length !== CONSENT_DATA_CLASSES.length || perClass.some(matches => matches.length !== 1)) throw AppErrorCode.AI_012.create();
    const decisions = perClass.flat().map<AiConsentDecision>(grant => ({ dataClass: grant.dataClass as AiConsent.DataClass, granted: grant.granted }));
    const recorded = await this.consentRepository.recordFirstDecision(decisions);
    if (!recorded) throw AppErrorCode.AI_011.create();
  }

  private toView(rows: AiConsent.Row[]): AiConsentView[] {
    return CONSENT_DATA_CLASSES.map(dataClass => {
      const row = rows.find(candidate => candidate.dataClass === dataClass);
      if (!row) return { dataClass, granted: false, grantedAt: null, withdrawnAt: null };
      return { dataClass, granted: row.withdrawnAt === null, grantedAt: row.grantedAt, withdrawnAt: row.withdrawnAt };
    });
  }
}
