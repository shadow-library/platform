import { describe, expect, it } from 'bun:test';
import { type AuthClient } from '@shadow-library/auth';

import { HASH_MISMATCH_ERROR_PREFIX, STALE_ERROR_PREFIX, UNKNOWN_CONFLICT_ERROR_PREFIX, UNSWEEPABLE_ERROR_PREFIXES } from '@modules/publishing/publish-runner';
import {
  PayloadHashMismatchError,
  ReaderPushClient,
  ReaderPushError,
  SLUG_CONFLICT_ERROR_PREFIX,
  SlugConflictError,
  StaleRevisionError,
  UnknownConflictError,
} from '@modules/publishing/reader-push.client';

function clientAnswering(statusCode: number, data: unknown): ReaderPushClient {
  const authClient = { fetchService: () => Promise.resolve({ statusCode, headers: {}, data }) } as unknown as AuthClient;
  return new ReaderPushClient(authClient);
}

function pushChapter(statusCode: number, data: unknown): Promise<unknown> {
  return clientAnswering(statusCode, data).upsertChapter('taken-slug', 1, { title: 'One', content: 'Prose.', contentHash: 'hash', revision: 3 });
}

describe('ReaderPushClient', () => {
  describe('rejection discrimination', () => {
    it('should raise a stale revision error when a 409 names WBN_003', async () => {
      const error = await pushChapter(409, { code: 'WBN_003', message: 'Stale publish rejected' }).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(StaleRevisionError);
      expect((error as StaleRevisionError).incoming).toBe(3);
      expect((error as Error).message).toStartWith(STALE_ERROR_PREFIX);
    });

    it('should raise a slug conflict rather than a stale revision when a 409 names WBN_010', async () => {
      const error = await pushChapter(409, { code: 'WBN_010', message: 'published by a different source' }).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(SlugConflictError);
      expect(error).not.toBeInstanceOf(StaleRevisionError);
      expect((error as SlugConflictError).slug).toBe('taken-slug');
      expect((error as Error).message).toStartWith(SLUG_CONFLICT_ERROR_PREFIX);
    });

    it('should read a 409 carrying no readable code as an unattributed conflict the sweep never retries', async () => {
      for (const body of [null, 'not json at all', { message: 'no code here' }, { code: 42 }]) {
        const error = await pushChapter(409, body).catch((err: unknown) => err);
        expect(error).toBeInstanceOf(UnknownConflictError);
        expect((error as Error).message).toStartWith(UNKNOWN_CONFLICT_ERROR_PREFIX);
        expect(UNSWEEPABLE_ERROR_PREFIXES).toContain(UNKNOWN_CONFLICT_ERROR_PREFIX);
      }
    });

    it('should not attribute an unreadable 409 to a stale revision or a slug conflict', async () => {
      const error = await pushChapter(409, { message: 'no code here' }).catch((err: unknown) => err);
      expect(error).not.toBeInstanceOf(StaleRevisionError);
      expect(error).not.toBeInstanceOf(SlugConflictError);
      expect((error as Error).message).not.toStartWith(STALE_ERROR_PREFIX);
      expect((error as Error).message).not.toStartWith(SLUG_CONFLICT_ERROR_PREFIX);
    });

    it('should raise a payload hash mismatch when a 400 names WBN_011', async () => {
      const error = await pushChapter(400, { code: 'WBN_011', message: 'contentHash does not match' }).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(PayloadHashMismatchError);
      expect(error).not.toBeInstanceOf(ReaderPushError);
      expect((error as Error).message).toStartWith(HASH_MISMATCH_ERROR_PREFIX);
    });

    it('should surface any other failure status as a generic reader push error carrying the reader code and message', async () => {
      const error = await pushChapter(400, { code: 'WBN_007', message: 'organisation mismatch' }).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ReaderPushError);
      expect((error as ReaderPushError).status).toBe(400);
      expect((error as Error).message).toContain('WBN_007');
      expect((error as Error).message).toContain('organisation mismatch');
    });

    it('should not park a 5xx echoing the hash-mismatch code, which only a 400 attributes', async () => {
      const error = await pushChapter(503, { code: 'WBN_011' }).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(ReaderPushError);
      expect(error).not.toBeInstanceOf(PayloadHashMismatchError);
      expect((error as ReaderPushError).status).toBe(503);
    });

    it('should raise a slug conflict when an unpublish is refused with WBN_010', async () => {
      const client = clientAnswering(409, { code: 'WBN_010' });
      await expect(client.deleteChapter('taken-slug', 1)).rejects.toBeInstanceOf(SlugConflictError);
      await expect(client.deleteWiki('taken-slug', 'char.rin')).rejects.toBeInstanceOf(SlugConflictError);
    });

    it('should discriminate novel, access and wiki pushes by the same body code', async () => {
      const conflicted = clientAnswering(409, { code: 'WBN_010' });
      await expect(conflicted.upsertNovel('taken-slug', { title: 'A', visibility: 'PUBLIC', revision: 1 })).rejects.toBeInstanceOf(SlugConflictError);
      await expect(conflicted.upsertAccess('taken-slug', { visibility: 'PUBLIC', revision: 1 })).rejects.toBeInstanceOf(SlugConflictError);

      const stale = clientAnswering(409, { code: 'WBN_003' });
      const wiki = { type: 'character' as const, name: 'Rin', firstVisibleOrdinal: 1, contentHash: 'hash', revision: 1, facets: [], images: [] };
      await expect(stale.upsertWiki('runner-slug', 'char.rin', wiki)).rejects.toBeInstanceOf(StaleRevisionError);
    });
  });
});
