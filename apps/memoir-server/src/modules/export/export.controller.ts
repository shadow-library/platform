import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

import { ExportJobIdParams, ExportJobResponseDto } from './export.dto';
import { type ExportJobView, ExportService } from './export.service';

@HttpController('/api/v1/account/export')
@Authenticated()
@RequireScope('memoir:account')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  @HttpStatus(201)
  @RespondFor(201, ExportJobResponseDto)
  request(): Promise<ExportJobView> {
    return this.exportService.request();
  }

  @Get('/:id')
  @RespondFor(200, ExportJobResponseDto)
  status(@Params() params: ExportJobIdParams): Promise<ExportJobView> {
    return this.exportService.status(params.id);
  }
}
