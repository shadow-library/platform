import {
  type AccountPatchDto,
  type AccountResponseDto,
  type CheckoutDto,
  type CheckoutResponseDto,
  type DeletionStatusDto,
  type DeviceResponseDto,
  type DeviceUpsertDto,
  type ExportJobResponseDto,
  type OnboardingDto,
} from './api-types.gen';
import { apiClient, APIRequest } from './transport';

/**
 * The account surfaces are online-first (ARCHITECTURE §9.1): settings, export, deletion and billing are
 * ordinary request/response calls, not offline commands, so they go out through the app's transport rather
 * than the outbox. Only the device registry overlaps with sync, and it is the same PUT the engine already
 * uses to register this browser.
 */
export const accountApi = {
  get: (): Promise<AccountResponseDto> => APIRequest.get('/v1/account').execute<AccountResponseDto>(),
  patch: (body: AccountPatchDto): Promise<AccountResponseDto> => APIRequest.patch('/v1/account').body(body).execute<AccountResponseDto>(),
  onboard: (body: OnboardingDto): Promise<AccountResponseDto> => APIRequest.post('/v1/account/onboarding').body(body).execute<AccountResponseDto>(),

  updateDevice: (deviceId: string, body: DeviceUpsertDto): Promise<DeviceResponseDto> => APIRequest.put(`/v1/account/devices/${deviceId}`).body(body).execute<DeviceResponseDto>(),
  removeDevice: async (deviceId: string): Promise<void> => void (await APIRequest.delete(`/v1/account/devices/${deviceId}`).execute()),

  requestExport: (): Promise<ExportJobResponseDto> => APIRequest.post('/v1/account/export').execute<ExportJobResponseDto>(),
  exportStatus: (jobId: string): Promise<ExportJobResponseDto> => APIRequest.get(`/v1/account/export/${jobId}`).execute<ExportJobResponseDto>(),

  deletionStatus: (): Promise<DeletionStatusDto> => APIRequest.get('/v1/account/deletion').execute<DeletionStatusDto>(),
  startDeletion: (): Promise<DeletionStatusDto> => APIRequest.post('/v1/account/deletion').execute<DeletionStatusDto>(),

  checkout: (body: CheckoutDto): Promise<CheckoutResponseDto> => APIRequest.post('/v1/billing/checkout').body(body).execute<CheckoutResponseDto>(),
};

/**
 * Deletion is the one elevated route, and an XHR is not a navigation — the guard answers `IAM_003` instead
 * of bouncing, so the browser has to walk into the step-up prompt itself.
 */
export function stepUpUrl(returnTo: string): string {
  return `${apiClient.auth.basePath}/step-up?return_to=${encodeURIComponent(returnTo)}`;
}
