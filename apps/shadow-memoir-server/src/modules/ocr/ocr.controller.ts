/**
 * Importing npm packages
 */
import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Body, Get, HttpController, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { OcrParseDto, OcrParseResponseDto, OcrQuotaResponseDto } from './ocr.dto';
import { type OcrStructuringResult } from './ocr-structuring.client';
import { OcrService } from './ocr.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/ocr')
@Authenticated()
@RequireScope('memoir:sync')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('/parse')
  @RespondFor(200, OcrParseResponseDto)
  parse(@Body() body: OcrParseDto): Promise<OcrStructuringResult> {
    return this.ocrService.parse(body);
  }

  @Get('/quota')
  @RespondFor(200, OcrQuotaResponseDto)
  quota(): Promise<OcrQuotaResponseDto> {
    return this.ocrService.getQuota();
  }
}
