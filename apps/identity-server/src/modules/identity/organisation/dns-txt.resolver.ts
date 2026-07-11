/**
 * Importing npm packages
 */
import { resolveTxt } from 'node:dns/promises';

import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Thin injectable seam over the system resolver: domain verification must be testable without
 * real DNS, and a future move to DNS-over-HTTPS only touches this class. Multi-chunk TXT records
 * are joined per RFC 7208 §3.3 semantics.
 */
@Injectable()
export class DnsTxtResolver {
  async resolveTxt(name: string): Promise<string[]> {
    const records = await resolveTxt(name);
    return records.map(chunks => chunks.join(''));
  }
}
