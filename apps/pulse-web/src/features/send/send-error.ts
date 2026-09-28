import { type ApiError } from '@/lib';

const SECURITY_TEMPLATE_REFUSED =
  'Templates identity sends (sign-in, account, organisation and bot notices) and other authentication, security, one-time-code or password-reset templates cannot be sent from the console. Only the flows that own them send them.';

function retryHint(retryAfterSeconds?: number): string {
  if (!retryAfterSeconds) return 'Try again later.';
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export function describeSendError(error: ApiError): string {
  if (error.code === 'NTF_005') return SECURITY_TEMPLATE_REFUSED;
  if (error.status === 429) return `You've reached the console's send limit. ${retryHint(error.retryAfterSeconds)}`;
  return error.message;
}
