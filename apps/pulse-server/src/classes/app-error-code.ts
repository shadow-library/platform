/**
 * Importing npm packages
 */
import { ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class AppErrorCode extends ServerErrorCode {
  /*!
   * Template Group Errors
   */

  /** Template group not found */
  static readonly TPL_GRP_001 = AppErrorCode.notFound('TPL_GRP_001', 'Template group not found');
  /** Template group with the given key already exists */
  static readonly TPL_GRP_002 = AppErrorCode.conflict('TPL_GRP_002', 'Template group with the given key already exists');

  /*!
   * Template Channel Setting Errors
   */

  /** Template channel setting not found */
  static readonly TPL_CHN_001 = AppErrorCode.notFound('TPL_CHN_001', 'Template channel setting not found');

  /*!
   * Template Variant Errors
   */

  /** Template variant not found */
  static readonly TPL_VRT_001 = AppErrorCode.notFound('TPL_VRT_001', 'Template variant not found');
  /** Template variant with the given channel and locale already exists for the template group */
  static readonly TPL_VRT_002 = AppErrorCode.conflict('TPL_VRT_002', 'Template variant with the given channel and locale already exists for the template group');
  /** Active template variant not found */
  static readonly TPL_VRT_003 = AppErrorCode.conflict('TPL_VRT_003', 'Active template variant not found');

  /*!
   * Sender Profile Errors
   */

  /** Sender profile not found */
  static readonly SND_PRF_001 = AppErrorCode.notFound('SND_PRF_001', 'Sender profile not found');
  /** Sender profile with the given key already exists */
  static readonly SND_PRF_002 = AppErrorCode.conflict('SND_PRF_002', 'Sender profile with the given key already exists');
  /** Cannot delete sender profile with active routing rules */
  static readonly SND_PRF_003 = AppErrorCode.conflict('SND_PRF_003', 'Cannot delete sender profile with active routing rules');

  /*!
   * Sender Endpoint Errors
   */

  /** Sender endpoint not found */
  static readonly SND_EP_001 = AppErrorCode.notFound('SND_EP_001', 'Sender endpoint not found');
  /** Sender endpoint with this channel, provider, and identifier already exists */
  static readonly SND_EP_002 = AppErrorCode.conflict('SND_EP_002', 'Sender endpoint with this channel, provider, and identifier already exists');

  /*!
   * Sender Routing Rule Errors
   */

  /** Sender routing rule not found */
  static readonly SND_RTR_001 = AppErrorCode.notFound('SND_RTR_001', 'Sender routing rule not found');
  /** Sender routing rule already exists for this combination */
  static readonly SND_RTR_002 = AppErrorCode.conflict('SND_RTR_002', 'Sender routing rule already exists for this combination');
  /** Sender profile must be active to create routing rule */
  static readonly SND_RTR_003 = AppErrorCode.conflict('SND_RTR_003', 'Sender profile must be active to create routing rule');
  /** Cannot delete default routing rule */
  static readonly SND_RTR_004 = AppErrorCode.conflict('SND_RTR_004', 'Cannot delete default routing rule');

  /*!
   * Notification Errors
   */

  /** No valid recipients provided for SMS notification */
  static readonly NTF_001 = AppErrorCode.badRequest('NTF_001', 'No valid recipients provided for SMS notification');
  /** No valid recipients provided for Email notification */
  static readonly NTF_002 = AppErrorCode.badRequest('NTF_002', 'No valid recipients provided for Email notification');
  /** No valid recipients provided for Push notification */
  static readonly NTF_003 = AppErrorCode.badRequest('NTF_003', 'No valid recipients provided for Push notification');
  /** Notification template not found for the given key and locale */
  static readonly NTF_004 = AppErrorCode.badRequest('NTF_004', 'Notification template not found for the given key and locale');

  /*!
   * Authorization Errors
   */

  /** Authentication is required but no valid session or bearer token accompanied the request */
  static readonly SEC_001 = AppErrorCode.unauthenticated('SEC_001', 'Authentication required');
  /** A route reached the default-deny sentinel without declaring an access policy */
  static readonly SEC_003 = AppErrorCode.forbidden('SEC_003', 'Access denied');

  /*!
   * Session Errors
   */

  /** The OIDC callback did not match a pending login flow (missing/expired flow cookie or state mismatch) */
  static readonly SES_001 = AppErrorCode.badRequest('SES_001', 'Login flow not found or expired');
}
