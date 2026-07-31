/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export interface BaseConfig {
  notificationId: string;
  payload?: Record<string, any>;
}

export interface SendSMSConfig extends BaseConfig {
  from: string;
  to: string;
  message: string;
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface SendEmailConfig extends BaseConfig {
  from: EmailAddress;
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  to: EmailAddress[];
  subject: string;
  body: string;
}

export interface SendPushNotificationConfig extends BaseConfig {
  deviceToken: string;
  title: string;
  message: string;
}

interface SuccessOpResult {
  success: true;
}

interface FailureOpResult {
  success: false;
  retriable: boolean;
  error: Error;
}

export type NotificationOpResult = SuccessOpResult | FailureOpResult;

/**
 * Declaring the constants
 */

export interface SMSProvider {
  sendSMS(config: SendSMSConfig): Promise<NotificationOpResult>;
}

export interface EmailProvider {
  sendEmail(config: SendEmailConfig): Promise<NotificationOpResult>;
}

export interface PushNotificationProvider {
  sendPushNotification(config: SendPushNotificationConfig): Promise<NotificationOpResult>;
}
