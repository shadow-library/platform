/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { pollUntil } from '../../lib';
import { createMemoirTokenIssuer, fetchObject, RECEIPT_PNG, storeReceipt, wipeAccount } from './deletion-helpers';
import { expect, test } from './fixtures';
import { createDailyQuest, errorCodeOf, getAccount, memoirMutate, submitCommand, todayLocal } from './helpers';

/**
 * Defining types
 */

interface ExportJobView {
  id: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
  expiresAt: string | null;
}

interface SensitiveField {
  table: string;
  column: string;
  classification: string;
}

interface ExportManifest {
  schemaVersion: number;
  accountId: string;
  jobId: string;
  generatedAt: string;
  account: Record<string, unknown>;
  sensitiveFields: SensitiveField[];
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * Declaring the constants
 *
 * Account export (ARCHITECTURE §20): request/status polling plus the assembler sweep that actually builds the
 * manifest. `export.assembler-interval-minutes` is 1 in dev, so a request here is awaited out rather than seeded
 * past.
 *
 * An assembled export writes a real object under `exports/<accountId>/<jobId>.json`, and a stored receipt writes
 * one under `r/<id>/`; memoir's orphan sweep only walks the prefixes of accounts that still exist, so deleting an
 * account row (the harness's ordinary persona teardown) would otherwise leak both. The one test here that uploads
 * a receipt and completes an export instead drives its own account to `data_deleted` first (`wipeAccount`, which
 * removes both prefixes) — in a `finally`, so a failed assertion still cleans up, after first giving the export job
 * a bounded wait to settle so the sweep never races the account's own deletion.
 */

const EXPORT_PATH = '/api/v1/account/export';
/** `export.assembler-interval-minutes` (1) plus assembly time, with headroom for a shared dev cluster under load. */
const ASSEMBLE_TIMEOUT_MS = 120_000;

function requestExport(ctx: APIRequestContext) {
  return memoirMutate(ctx, 'post', EXPORT_PATH);
}

async function waitForJobToSettle(ctx: APIRequestContext, jobId: string, timeoutMs: number): Promise<void> {
  await pollUntil(
    async () => {
      const response = await ctx.get(`${EXPORT_PATH}/${jobId}`).catch(() => undefined);
      if (!response?.ok()) return true;
      const body = (await response.json().catch(() => undefined)) as ExportJobView | undefined;
      return !body || body.status === 'done' || body.status === 'failed';
    },
    settled => settled,
    { timeoutMs, intervalMs: 3_000 },
  ).catch(() => undefined);
}

test.describe('memoir export', () => {
  test('should assemble a completeness-checked, sensitivity-documented manifest with a presigned receipt url, and never leak a job across accounts', async ({ memoir }) => {
    test.setTimeout(ASSEMBLE_TIMEOUT_MS + 60_000);
    const persona = await memoir.persona({ label: 'export', onboard: true });
    const stranger = await memoir.persona({ label: 'export-stranger', onboard: true });
    const account = await getAccount(persona.ctx);
    const issuer = await createMemoirTokenIssuer(memoir, 'export-cleanup');
    const guest = await memoir.guest();
    const today = todayLocal();
    let jobId: string | undefined;

    try {
      const { occurrenceId } = await createDailyQuest(persona.ctx, `E2E export quest ${randomUUID()}`);
      const completed = await submitCommand(persona.ctx, 'quest.complete', { occurrenceId });
      expect(completed.status, JSON.stringify(completed)).toBe('applied');

      const device = await memoirMutate(persona.ctx, 'put', `/api/v1/account/devices/${randomUUID()}`, { data: { userAgent: 'e2e-export', pushOptIn: false } });
      expect(device.status(), await device.text()).toBe(200);

      const receipt = await storeReceipt(persona.ctx);
      const expenseId = randomUUID();
      const created = await submitCommand(persona.ctx, 'expense.create', {
        id: expenseId,
        currency: 'USD',
        occurredOn: today,
        categoryId: 'uncat',
        amountText: '12.34',
        amountMinor: 1234,
        merchant: 'Original Merchant',
        note: 'expense note',
        receiptRef: receipt.ref,
      });
      expect(created.status, JSON.stringify(created)).toBe('applied');

      const updated = await submitCommand(persona.ctx, 'expense.update', { id: expenseId, merchant: 'Updated Merchant' });
      expect(updated.status, JSON.stringify(updated)).toBe('applied');

      const journalId = randomUUID();
      const journal = await submitCommand(persona.ctx, 'journal.save', { id: journalId, draft: { date: today, text: 'export sensitive journal text' } });
      expect(journal.status, JSON.stringify(journal)).toBe('applied');

      const requested = await requestExport(persona.ctx);
      expect(requested.status(), await requested.text()).toBe(201);
      ({ id: jobId } = (await requested.json()) as ExportJobView);

      const crossAccountPending = await stranger.ctx.get(`${EXPORT_PATH}/${jobId}`);
      expect(crossAccountPending.status(), 'a non-owner reads a foreign job id as not-found, never forbidden').toBe(404);
      expect(await errorCodeOf(crossAccountPending)).toBe('EXP_001');

      const settled = await pollUntil<ExportJobView>(
        async () => {
          const response = await persona.ctx.get(`${EXPORT_PATH}/${jobId}`);
          expect(response.status(), await response.text()).toBe(200);
          return (await response.json()) as ExportJobView;
        },
        job => job.status === 'done' || job.status === 'failed',
        { timeoutMs: ASSEMBLE_TIMEOUT_MS, intervalMs: 3_000 },
      );
      expect(settled.status, JSON.stringify(settled)).toBe('done');
      expect(settled.downloadUrl).not.toBeNull();
      expect(settled.expiresAt).not.toBeNull();

      const crossAccountDone = await stranger.ctx.get(`${EXPORT_PATH}/${jobId}`);
      expect(crossAccountDone.status(), 'still not-found once the job has actually completed').toBe(404);
      expect(await errorCodeOf(crossAccountDone)).toBe('EXP_001');

      const fetched = await fetchObject(settled.downloadUrl!);
      expect(fetched.status).toBe(200);
      const manifest = JSON.parse(fetched.body.toString('utf8')) as ExportManifest;

      expect(manifest.jobId).toBe(jobId);
      expect(manifest.accountId).toBe(account.id);

      const populatedDomains = ['devices', 'quests', 'quest_logs', 'hero_events', 'expenses', 'expense_categories', 'expense_audits', 'receipts', 'journal_entries'];
      for (const domain of populatedDomains) expect(manifest.tables[domain]?.length ?? 0, `manifest.tables.${domain} must be non-empty`).toBeGreaterThan(0);

      const receiptRow = manifest.tables['receipts']!.find(row => row['ref'] === receipt.ref) as { status: string; downloadUrl?: string } | undefined;
      expect(receiptRow?.status).toBe('stored');
      expect(receiptRow?.downloadUrl, 'a stored receipt must carry a presigned url rather than embedding its bytes').toBeTruthy();
      const receiptFetched = await fetchObject(receiptRow!.downloadUrl!);
      expect(receiptFetched.status).toBe(200);
      expect(receiptFetched.body.equals(RECEIPT_PNG), 'the presigned url must serve the exact bytes that were uploaded').toBe(true);

      const expenseAuditActions = manifest.tables['expense_audits']!.filter(row => row['expenseId'] === expenseId).map(row => row['action']);
      expect(expenseAuditActions.sort()).toEqual(['created', 'receipt_confirmed', 'updated'].sort());
      const updateRow = manifest.tables['expense_audits']!.find(row => row['expenseId'] === expenseId && row['action'] === 'updated') as {
        changes: { field: string; from: string | null; to: string | null }[];
      };
      expect(updateRow.changes).toContainEqual({ field: 'merchant', from: 'Original Merchant', to: 'Updated Merchant' });

      const journalRow = manifest.tables['journal_entries']!.find(row => row['id'] === journalId) as { text: string } | undefined;
      expect(journalRow?.text, 'sensitive free text is included verbatim, not redacted').toBe('export sensitive journal text');

      expect(manifest.sensitiveFields.length).toBeGreaterThan(0);
      expect(manifest.sensitiveFields).toContainEqual({ table: 'expense_audits', column: 'changes', classification: 'sensitive' });
      expect(manifest.sensitiveFields).toContainEqual({ table: 'journal_entries', column: 'text', classification: 'most-sensitive' });
      // Sensitivity manifest columns are the raw DB names (log-redaction.ts's own toCamelCase() fallback confirms
      // getSensitivityManifest() reports snake_case), not the JS-side camelCase field names.
      expect(manifest.sensitiveFields).toContainEqual({ table: 'quest_logs', column: 'reason_note', classification: 'most-sensitive' });
      expect(manifest.sensitiveFields).toContainEqual({ table: 'quest_logs', column: 'reflection_text', classification: 'most-sensitive' });
    } finally {
      if (jobId) await waitForJobToSettle(persona.ctx, jobId, 70_000);
      await wipeAccount(issuer, guest, persona, account.id);
    }
  });

  test('should answer 404 EXP_001 for a nonexistent export id', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'export-missing', onboard: true });

    const missing = await persona.ctx.get(`${EXPORT_PATH}/${randomUUID()}`);
    expect(missing.status(), await missing.text()).toBe(404);
    expect(await errorCodeOf(missing)).toBe('EXP_001');
  });
});
