import { resolveTxt } from 'node:dns/promises';

import { Injectable } from '@shadow-library/app';

@Injectable()
export class DnsTxtResolver {
  async resolveTxt(name: string): Promise<string[]> {
    const records = await resolveTxt(name);
    return records.map(chunks => chunks.join(''));
  }
}
