/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { ExportJobStatus } from '@server/classes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ExportJobIdParams {
  @Field({ description: 'The export job id' })
  id: string;
}

@Schema()
export class ExportJobResponseDto {
  @Field()
  id: string;

  @Field(() => ExportJobStatus)
  status: string;

  @Field({ format: 'date-time' })
  requestedAt: string;

  @Field({ format: 'date-time', optional: true, nullable: true })
  completedAt: string | null;

  @Field({ optional: true, nullable: true, description: 'Presigned `GET` URL for the assembled manifest; present only once `status` is `done`' })
  downloadUrl: string | null;

  @Field({ format: 'date-time', optional: true, nullable: true, description: 'When the manifest object and this job row are removed by the cleanup sweep' })
  expiresAt: string | null;
}
