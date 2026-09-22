import { Field, Schema } from '@shadow-library/class-schema';

import { PREMISE_PREVIEW_MAX, PREMISE_SENTENCE_MAX } from '../../ai/schemas/blueprint-premise.schema';

export const PREMISE_PREVIEW_MIN_LENGTH = 20;

@Schema()
export class PremisePreviewBody {
  @Field({
    minLength: PREMISE_PREVIEW_MIN_LENGTH,
    maxLength: PREMISE_SENTENCE_MAX,
    description: 'The premise sentence as it stands on screen; it need not be locked.',
  })
  premise: string;
}

@Schema()
export class PremisePreviewResponse {
  @Field({ maxLength: PREMISE_PREVIEW_MAX, description: 'A sample opening paragraph. It is never stored, never a decision and never the novel’s voice.' })
  paragraph: string;
}
