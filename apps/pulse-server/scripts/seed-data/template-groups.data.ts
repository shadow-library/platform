/**
 * Importing npm packages
 */
import { InferInsertModel } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';

/**
 * Defining types
 */
type TemplateGroupInsertModel = InferInsertModel<typeof schema.templateGroups>;

/**
 * Declaring the constants
 */
export const templateGroups: TemplateGroupInsertModel[] = [
  {
    id: 1n,
    templateKey: 'sign-up',
    messageType: 'TRANSACTIONAL',
    description: 'Templates for user sign-up notifications',
    priority: 'MEDIUM',
    isActive: true,
  },
  {
    id: 2n,
    templateKey: 'password-reset',
    messageType: 'TRANSACTIONAL',
    description: 'Templates for password reset notifications',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 3n,
    templateKey: 'weekly-newsletter',
    messageType: 'PROMOTIONAL',
    description: 'Templates for weekly marketing newsletters',
    priority: 'LOW',
    isActive: true,
  },
  {
    id: 4n,
    templateKey: 'account-alerts',
    messageType: 'TRANSACTIONAL',
    description: 'Templates for account activity alerts',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 5n,
    templateKey: 'spring-promo',
    messageType: 'PROMOTIONAL',
    description: 'Templates for seasonal promotional campaigns',
    priority: 'MEDIUM',
    isActive: false,
  },

  /** Identity-server notification catalog: every template key identity-server sends must resolve on a fresh database */
  {
    id: 6n,
    templateKey: 'auth.register.otp',
    messageType: 'OTP',
    description: 'OTP delivered during new account registration',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 7n,
    templateKey: 'auth.login.otp',
    messageType: 'OTP',
    description: 'OTP delivered during sign-in and account linking',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 8n,
    templateKey: 'auth.recovery.otp',
    messageType: 'OTP',
    description: 'OTP delivered during account recovery',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 9n,
    templateKey: 'auth.password.changed',
    messageType: 'TRANSACTIONAL',
    description: 'Alert sent after an account password change',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 10n,
    templateKey: 'auth.mfa.enrolled',
    messageType: 'TRANSACTIONAL',
    description: 'Alert sent when a multi-factor authentication method is enrolled',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 11n,
    templateKey: 'auth.mfa.disabled',
    messageType: 'TRANSACTIONAL',
    description: 'Alert sent when a multi-factor authentication method is disabled',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 12n,
    templateKey: 'auth.mfa.recovery-code-used',
    messageType: 'TRANSACTIONAL',
    description: 'Alert sent when an MFA recovery code is used',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 13n,
    templateKey: 'security.new-signin',
    messageType: 'TRANSACTIONAL',
    description: 'Alert sent for a sign-in from an unseen device or IP address',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 14n,
    templateKey: 'user.email.verification',
    messageType: 'OTP',
    description: 'OTP delivered to verify a newly added email address',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 15n,
    templateKey: 'user.phone.verification',
    messageType: 'OTP',
    description: 'OTP delivered to verify a newly added phone number',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 16n,
    templateKey: 'user.contact.changed',
    messageType: 'TRANSACTIONAL',
    description: 'Alert sent when account contact details change',
    priority: 'HIGH',
    isActive: true,
  },
  {
    id: 17n,
    templateKey: 'organisation-invitation',
    messageType: 'TRANSACTIONAL',
    description: 'Invitation to join an organisation',
    priority: 'MEDIUM',
    isActive: true,
  },
  {
    id: 18n,
    templateKey: 'organisation-role-changed',
    messageType: 'TRANSACTIONAL',
    description: 'Notice that an organisation member role changed',
    priority: 'MEDIUM',
    isActive: true,
  },
  {
    id: 19n,
    templateKey: 'organisation-member-removed',
    messageType: 'TRANSACTIONAL',
    description: 'Notice that a member was removed from an organisation',
    priority: 'MEDIUM',
    isActive: true,
  },
];
