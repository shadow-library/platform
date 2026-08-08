import { describe, expect, it } from 'bun:test';

import { IllustrationModule } from '@modules/illustration/illustration.module';
import { IllustrationService } from '@modules/illustration/illustration.service';

// Object storage itself (content-addressing, public URLs, the local/S3 providers) is exercised in
// `@shadow-library/modules`' storage-module suite; here we only assert the illustration wiring survives.
describe('IllustrationService', () => {
  it('class is defined', () => {
    expect(IllustrationService).toBeDefined();
  });

  it('IllustrationModule is defined', () => {
    expect(IllustrationModule).toBeDefined();
  });
});
