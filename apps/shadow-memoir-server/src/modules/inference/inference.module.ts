import { Module } from '@shadow-library/app';

import { InferenceClient, OllamaInferenceClient } from './inference.client';

/** The in-cluster model boundary, shared by the AI batch executor (§15.6) and receipt-OCR structuring (§14.3) so there is exactly one place a non-cluster endpoint could ever be configured. */
@Module({
  providers: [{ token: InferenceClient, useClass: OllamaInferenceClient }],
  exports: [InferenceClient],
})
export class InferenceModule {}
