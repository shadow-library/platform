import {
  type AiApplySuggestionDto,
  type AiConsentListResponseDto,
  type AiConsentUpdateDto,
  type AiScheduledQueryResponseDto,
  type AiScheduledQueryUpsertDto,
  type AiTaskResponseDto,
  type AiTaskSubmitDto,
  type AppliedSuggestionResponseDto,
} from './api-types.gen';
import { APIRequest } from './transport';

/**
 * Tasks, consents and results all reach the client a second time through the sync delta, so these calls are
 * writes and acknowledgements only — the screens read from the mirrored rows.
 */
export const aiApi = {
  submitTask: (body: AiTaskSubmitDto): Promise<AiTaskResponseDto> => APIRequest.post('/v1/ai/tasks').body(body).execute<AiTaskResponseDto>(),
  cancelTask: (taskId: string): Promise<AiTaskResponseDto> => APIRequest.post(`/v1/ai/tasks/${taskId}/cancel`).execute<AiTaskResponseDto>(),

  getConsents: (): Promise<AiConsentListResponseDto> => APIRequest.get('/v1/ai/consents').execute<AiConsentListResponseDto>(),
  putConsents: (body: AiConsentUpdateDto): Promise<AiConsentListResponseDto> => APIRequest.put('/v1/ai/consents').body(body).execute<AiConsentListResponseDto>(),

  putScheduledQuery: (body: AiScheduledQueryUpsertDto): Promise<AiScheduledQueryResponseDto> =>
    APIRequest.put('/v1/ai/scheduled-query').body(body).execute<AiScheduledQueryResponseDto>(),
  removeScheduledQuery: async (): Promise<void> => void (await APIRequest.delete('/v1/ai/scheduled-query').execute()),

  applySuggestion: (resultId: string, body: AiApplySuggestionDto): Promise<AppliedSuggestionResponseDto> =>
    APIRequest.post(`/v1/ai/results/${resultId}/apply`).body(body).execute<AppliedSuggestionResponseDto>(),
};
