/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type AiResult, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class AiResultRepository extends OwnerScopedRepository {
  async findById(id: bigint): Promise<AiResult.Row | null> {
    const [row] = await this.scoped(schema.aiResults, eq(schema.aiResults.id, id));
    return (row as AiResult.Row) ?? null;
  }
}
