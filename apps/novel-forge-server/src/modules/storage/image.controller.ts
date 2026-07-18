/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type FastifyReply } from 'fastify';
import { Inject } from '@shadow-library/app';
import { Authenticated } from '@shadow-library/auth/module';
import { Field, Schema } from '@shadow-library/class-schema';
import { Get, HttpController, Params, Res } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { IMAGE_STORAGE, type ImageStorageProvider } from './image-storage.interface';

/**
 * Defining types
 */

@Schema()
export class ImageParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  projectId: string;

  // Restrict to a plain filename so a crafted `../` can never escape the storage root.
  @Field(() => String, { pattern: '^[A-Za-z0-9._-]+$' })
  filename: string;
}

/**
 * Declaring the constants
 */

// Serves the bytes written by the storage provider. `getUrl` on the provider points here, so uploaded
// covers and entity portraits resolve to a real image response.
@Authenticated()
@HttpController('/api/v1/images')
export class ImageController {
  constructor(@Inject(IMAGE_STORAGE) private readonly storage: ImageStorageProvider) {}

  @Get('/:projectId/:filename')
  async serve(@Params() params: ImageParams, @Res() reply: FastifyReply): Promise<void> {
    try {
      const { bytes, mime } = await this.storage.read(`${params.projectId}/${params.filename}`);
      reply.header('Content-Type', mime).header('Cache-Control', 'public, max-age=3600').send(Buffer.from(bytes));
    } catch {
      reply.status(404).send({ message: 'Image not found' });
    }
  }
}
