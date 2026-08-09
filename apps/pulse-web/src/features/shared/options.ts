import { type MessageType, type NotificationChannel, type NotificationServiceProvider, type Priority, type VersionStatus } from '@/lib';

export interface Option {
  value: string;
  label: string;
}

export const MESSAGE_TYPE_OPTIONS: { value: MessageType; label: string }[] = [
  { value: 'OTP', label: 'OTP' },
  { value: 'TRANSACTIONAL', label: 'Transactional' },
  { value: 'PROMOTIONAL', label: 'Promotional' },
];

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
];

export const CHANNEL_OPTIONS: { value: NotificationChannel; label: string }[] = [
  { value: 'EMAIL', label: 'Email' },
  { value: 'SMS', label: 'SMS' },
  { value: 'PUSH', label: 'Push' },
];

export const VARIABLE_TYPE_OPTIONS: Option[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
];

export const VERSION_STATUS_OPTIONS: { value: VersionStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export const PROVIDER_OPTIONS: { value: NotificationServiceProvider; label: string }[] = [
  { value: 'DEV', label: 'Dev' },
  { value: 'SENDGRID', label: 'SendGrid' },
  { value: 'TWILIO', label: 'Twilio' },
  { value: 'FIREBASE', label: 'Firebase' },
  { value: 'AWS_SES', label: 'AWS SES' },
  { value: 'RESEND', label: 'Resend' },
];

export const ALL = 'ALL';

export const CHANNEL_FILTER_OPTIONS: Option[] = [{ value: ALL, label: 'All channels' }, ...CHANNEL_OPTIONS];
export const PROVIDER_FILTER_OPTIONS: Option[] = [{ value: ALL, label: 'All providers' }, ...PROVIDER_OPTIONS];
export const MESSAGE_TYPE_FILTER_OPTIONS: Option[] = [{ value: ALL, label: 'All types' }, ...MESSAGE_TYPE_OPTIONS];
export const ACTIVE_FILTER_OPTIONS: Option[] = [
  { value: ALL, label: 'Any status' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

export const PAGE_SIZE_OPTIONS = [20, 50, 100];
