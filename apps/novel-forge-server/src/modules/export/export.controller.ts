import { type FastifyReply } from 'fastify';
import { Authenticated } from '@shadow-library/auth/module';
import { Get, HttpController, Params, Res } from '@shadow-library/fastify';

import { ExportParams } from './export.dto';
import { NovelPackageService } from './novel-package.service';

@Authenticated()
@HttpController('/api/v1/projects/:projectId/export')
export class ExportController {
  constructor(private readonly novelPackage: NovelPackageService) {}

  // Streams the `.novel` package as a download. Uses @Res raw-byte delivery (like the image route) since
  // the body is a binary zip, not a JSON DTO; a thrown ServerError still surfaces as the usual error JSON.
  @Get('/novel')
  async exportNovel(@Params() params: ExportParams, @Res() reply: FastifyReply): Promise<void> {
    const { filename, bytes } = await this.novelPackage.build(params.projectId);
    reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="${filename}"`).send(Buffer.from(bytes));
  }
}
