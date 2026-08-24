/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ReceiptRefParams {
  @Field({ maxLength: 200, description: 'The receipt ref (the storage object key); URL-encode the embedded slashes' })
  ref: string;
}

@Schema()
export class ReceiptCreateDto {
  @Field({ description: 'MIME type the client will upload; one of image/jpeg, image/png, image/webp, image/heic' })
  contentType: string;

  @Field({ minimum: 1, maximum: 8_388_608, description: 'Declared upload size in bytes; the confirm step HEAD-verifies the actual size against `storage.max-receipt-bytes`' })
  sizeBytes: number;
}

@Schema()
export class ReceiptCreateResponseDto {
  @Field({ description: 'The minted receipt ref — also the storage object key; pass it back to `expense.create`/`expense.update` as `receiptRef`' })
  ref: string;

  @Field({ description: 'Presigned `PUT` URL, content-type pinned; expires at `expiresAt`' })
  uploadUrl: string;

  @Field({ format: 'date-time' })
  expiresAt: string;
}

@Schema()
export class ReceiptConfirmResponseDto {
  @Field()
  ref: string;

  @Field()
  status: string;
}

@Schema()
export class ReceiptDownloadResponseDto {
  @Field({ description: 'Presigned `GET` URL; expires at `expiresAt`' })
  url: string;

  @Field({ format: 'date-time' })
  expiresAt: string;
}
