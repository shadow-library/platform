/**
 * Importing npm packages
 */
import { Authenticated, RequireScope } from '@shadow-library/auth/module';
import { Body, Get, HttpController, HttpStatus, Params, Post, RespondFor } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ReceiptConfirmResponseDto, ReceiptCreateDto, ReceiptCreateResponseDto, ReceiptDownloadResponseDto, ReceiptRefParams } from './receipt.dto';
import { ReceiptService } from './receipt.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api/v1/receipts')
@Authenticated()
@RequireScope('memoir:sync')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Post()
  @HttpStatus(201)
  @RespondFor(201, ReceiptCreateResponseDto)
  create(@Body() body: ReceiptCreateDto): Promise<ReceiptCreateResponseDto> {
    return this.receiptService.createUpload(body);
  }

  @Post('/:ref/confirm')
  @RespondFor(200, ReceiptConfirmResponseDto)
  async confirm(@Params() params: ReceiptRefParams): Promise<ReceiptConfirmResponseDto> {
    const receipt = await this.receiptService.confirm(params.ref);
    return { ref: receipt.ref, status: receipt.status };
  }

  @Get('/:ref/download')
  @RespondFor(200, ReceiptDownloadResponseDto)
  download(@Params() params: ReceiptRefParams): Promise<ReceiptDownloadResponseDto> {
    return this.receiptService.createDownload(params.ref);
  }
}
