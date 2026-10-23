import { type APIResponse } from '@playwright/test';

import { memoirDb } from '../../lib';
import { expect, test } from './fixtures';
import { errorCodeOf, memoirMutate, submitCommand, todayLocal } from './helpers';
import { fetchPresignedUrl, type MintedReceipt, mintReceipt, uploadAndConfirm } from './receipt-helpers';

/**
 * `POST /receipts`, `/:ref/confirm`, `/:ref/download` and the `expense.delete` cascade, the only route removing a stored object. `ReceiptSweepService`'s sweeps (60-min
 * pending-upload,
 * weekly orphan-object) are out of scope: no manual trigger exists and a test timeout cannot await either cadence.
 */

async function expectRefusal(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status(), `${response.url()} answered ${await response.text()}`).toBe(status);
  expect(await errorCodeOf(response)).toBe(code);
}

test.describe('memoir receipts', () => {
  test('should reject an unsupported content type with 400 RCP_002, an oversize declaration with 422 VALIDATION_ERROR, and a non-integer size declaration with 400 RCP_003', async ({
    memoir,
  }) => {
    const persona = await memoir.persona({ label: 'rcp-upload-validation' });

    const unsupportedType = await memoirMutate(persona.ctx, 'post', '/api/v1/receipts', { data: { contentType: 'application/pdf', sizeBytes: 1024 } });
    await expectRefusal(unsupportedType, 400, 'RCP_002');

    /**
     * `storage.max-receipt-bytes` defaults to 8_388_608, the DTO's own `maximum` on `sizeBytes`, so a literal oversize declaration is rejected by class-schema first (422
     * VALIDATION_ERROR).
     * RCP_003 (400) is reachable only via `createUpload`'s guard: `sizeBytes` is a plain `number` (not `Integer`), so a non-integer within [1, 8_388_608] passes the DTO and hits
     * its `!Number.isInteger` branch.
     */
    const oversizeDeclaration = await memoirMutate(persona.ctx, 'post', '/api/v1/receipts', { data: { contentType: 'image/jpeg', sizeBytes: 9_000_000 } });
    expect(oversizeDeclaration.status(), await oversizeDeclaration.text()).toBe(422);
    expect(await errorCodeOf(oversizeDeclaration)).toBe('VALIDATION_ERROR');

    const nonIntegerSize = await memoirMutate(persona.ctx, 'post', '/api/v1/receipts', { data: { contentType: 'image/jpeg', sizeBytes: 1024.5 } });
    await expectRefusal(nonIntegerSize, 400, 'RCP_003');
  });

  test('should 404 confirming/downloading a foreign or never-confirmed receipt, and reject confirming with nothing uploaded', async ({ memoir }) => {
    const owner = await memoir.persona({ label: 'rcp-owner' });
    const stranger = await memoir.persona({ label: 'rcp-stranger' });

    const created = await memoirMutate(owner.ctx, 'post', '/api/v1/receipts', { data: { contentType: 'image/jpeg', sizeBytes: 1024 } });
    expect(created.status(), await created.text()).toBe(201);
    const { ref } = (await created.json()) as { ref: string };

    const confirmWithoutUpload = await memoirMutate(owner.ctx, 'post', `/api/v1/receipts/${encodeURIComponent(ref)}/confirm`);
    await expectRefusal(confirmWithoutUpload, 400, 'RCP_004');

    const downloadNeverConfirmed = await owner.ctx.get(`/api/v1/receipts/${encodeURIComponent(ref)}/download`);
    await expectRefusal(downloadNeverConfirmed, 404, 'RCP_001');

    const strangerConfirms = await memoirMutate(stranger.ctx, 'post', `/api/v1/receipts/${encodeURIComponent(ref)}/confirm`);
    await expectRefusal(strangerConfirms, 404, 'RCP_001');

    const strangerDownloads = await stranger.ctx.get(`/api/v1/receipts/${encodeURIComponent(ref)}/download`);
    await expectRefusal(strangerDownloads, 404, 'RCP_001');
  });

  test('should cascade-delete both the storage object and the row when expense.delete removes an expense with a confirmed receipt', async ({ memoir }) => {
    const persona = await memoir.persona({ label: 'rcp-cascade' });
    const stranger = await memoir.persona({ label: 'rcp-cascade-stranger' });
    const expenseId = crypto.randomUUID();
    const expensePayload = { id: expenseId, currency: 'USD', occurredOn: todayLocal(), categoryId: 'uncat', amountText: '$12.34', amountMinor: 1234 };

    let receipt: MintedReceipt | undefined;
    let cleaned = false;
    try {
      receipt = await mintReceipt(persona.ctx);
      await uploadAndConfirm(persona.ctx, receipt);

      const strangerConfirm = await memoirMutate(stranger.ctx, 'post', `/api/v1/receipts/${encodeURIComponent(receipt.ref)}/confirm`);
      await expectRefusal(strangerConfirm, 404, 'RCP_001');
      const strangerDownload = await stranger.ctx.get(`/api/v1/receipts/${encodeURIComponent(receipt.ref)}/download`);
      await expectRefusal(strangerDownload, 404, 'RCP_001');

      const ownerDownload = await persona.ctx.get(`/api/v1/receipts/${encodeURIComponent(receipt.ref)}/download`);
      expect(ownerDownload.status(), await ownerDownload.text()).toBe(200);
      const downloadUrl = ((await ownerDownload.json()) as { url: string }).url;

      const create = await submitCommand(persona.ctx, 'expense.create', { ...expensePayload, receiptRef: receipt.ref });
      expect(create.status, JSON.stringify(create)).toBe('applied');

      const [rowBeforeDelete] = await memoirDb()<{ ref: string; status: string }[]>`SELECT ref, status FROM receipts WHERE ref = ${receipt.ref}`;
      expect(rowBeforeDelete, 'the receipt row exists and is stored before the expense is deleted').toMatchObject({ ref: receipt.ref, status: 'stored' });

      const del = await submitCommand(persona.ctx, 'expense.delete', { id: expenseId });
      expect(del.status, JSON.stringify(del)).toBe('applied');
      cleaned = true;

      const rowsAfterDelete = await memoirDb()<{ ref: string }[]>`SELECT ref FROM receipts WHERE ref = ${receipt.ref}`;
      expect(rowsAfterDelete, 'the receipt row is gone from the database, not merely unlinked').toHaveLength(0);

      const apiDownloadAfterDelete = await persona.ctx.get(`/api/v1/receipts/${encodeURIComponent(receipt.ref)}/download`);
      await expectRefusal(apiDownloadAfterDelete, 404, 'RCP_001');

      const objectAfterDelete = await fetchPresignedUrl(downloadUrl);
      expect(objectAfterDelete.status, `the storage object itself must be gone, not just memoir's own route: ${objectAfterDelete.body}`).toBe(404);
    } finally {
      /**
       * `expense.delete`'s cascade is the only route removing a stored object, and the upload may be live in any status if an earlier step threw. Re-link it (an earlier
       * `expense.create` may or may not have landed) and delete, so cleanup runs through that API path rather than the storage client.
       */
      if (receipt && !cleaned) {
        const orphanRisk = receipt.ref;
        await submitCommand(persona.ctx, 'expense.create', { ...expensePayload, receiptRef: orphanRisk })
          .catch(() => undefined)
          .then(() => submitCommand(persona.ctx, 'expense.delete', { id: expenseId }))
          .then(outcome => {
            if (outcome.status !== 'applied') throw new Error(`cleanup expense.delete did not apply: ${JSON.stringify(outcome)}`);
          })
          .catch(error => {
            throw new Error(`receipt object ${orphanRisk} may be orphaned in storage — cleanup via the expense.delete cascade failed: ${error}`);
          });
      }
    }
  });
});
