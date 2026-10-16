import { Handler } from '@shadow-library/app';

import { SynapseErrorResponse } from './inference.dto';

type SynapseErrorResponsesDecorator = ClassDecorator & MethodDecorator;

/** Documents the OpenAI error shape `SynapseErrorHandler` answers these routes with, in place of the platform's default 4xx/5xx schema */
export const SynapseErrorResponses = (): SynapseErrorResponsesDecorator => Handler({ schemas: { response: { '4xx': SynapseErrorResponse, '5xx': SynapseErrorResponse } } });
