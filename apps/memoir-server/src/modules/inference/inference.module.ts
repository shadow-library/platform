import { Module } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { AuthModule } from '@shadow-library/auth/module';
import { SynapseClient } from '@shadow-library/synapse';

import { InferenceClient, SynapseInferenceClient } from './inference.client';

/** The model boundary shared by the AI batch executor and receipt-OCR structuring: every call goes to Synapse, which owns provider choice. */
@Module({
  imports: [AuthModule],
  providers: [
    { token: SynapseClient, useFactory: (authClient: AuthClient) => new SynapseClient({ authClient }), inject: [AuthClient] },
    { token: InferenceClient, useClass: SynapseInferenceClient },
  ],
  exports: [InferenceClient],
})
export class InferenceModule {}
