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
   * Template Errors — the `templates` aggregate addressed by `templateKey`
   */

  /** Template not found */
  static readonly TPL_001 = AppErrorCode.notFound('TPL_001', 'Template not found');
  /** Template with the given key already exists */
  static readonly TPL_002 = AppErrorCode.conflict('TPL_002', 'Template with the given key already exists');

  /*!
   * Template Channel Setting Errors
   */

  /** Template channel setting not found */
  static readonly TPL_CHN_001 = AppErrorCode.notFound('TPL_CHN_001', 'Template channel setting not found');

  /*!
   * Template Version Errors — the immutable publishing lifecycle
   */

  /** Template version not found */
  static readonly TPL_VER_001 = AppErrorCode.notFound('TPL_VER_001', 'Template version not found');
  /** A version with the given number already exists for the template */
  static readonly TPL_VER_002 = AppErrorCode.conflict('TPL_VER_002', 'A version with the given number already exists for this template');
  /** The template has no published version to send */
  static readonly TPL_VER_003 = AppErrorCode.conflict('TPL_VER_003', 'Template has no published version');

  /*!
   * Template Content Errors — per (version, channel, locale) renderable content
   */

  /** Template content not found */
  static readonly TPL_CNT_001 = AppErrorCode.notFound('TPL_CNT_001', 'Template content not found');
  /** Content for the given channel and locale already exists in this version */
  static readonly TPL_CNT_002 = AppErrorCode.conflict('TPL_CNT_002', 'Content for the given channel and locale already exists in this version');
  /** No published content for the requested channel and locale */
  static readonly TPL_CNT_003 = AppErrorCode.conflict('TPL_CNT_003', 'No published content for the requested channel and locale');

  /*!
   * Template Publishing Errors — draft → published transitions and rollback
   */

  /** There is no draft version to publish (templates, layouts, partials) */
  static readonly TPL_PUB_001 = AppErrorCode.conflict('TPL_PUB_001', 'No draft version to publish');
  /** The draft has no content and cannot be published */
  static readonly TPL_PUB_002 = AppErrorCode.conflict('TPL_PUB_002', 'Cannot publish a draft with no content');
  /** The draft references variables not declared in the template variable schema */
  static readonly TPL_PUB_003 = AppErrorCode.validation('TPL_PUB_003', 'Draft content references variables not declared in the template schema');
  /** A draft already exists; edit or discard it before opening another */
  static readonly TPL_PUB_004 = AppErrorCode.conflict('TPL_PUB_004', 'A draft version already exists for this template');

  /*!
   * Layout Errors — the branded shells that wrap EMAIL content
   */

  /** Layout not found */
  static readonly TPL_LYT_001 = AppErrorCode.notFound('TPL_LYT_001', 'Layout not found');
  /** Layout with the given key already exists */
  static readonly TPL_LYT_002 = AppErrorCode.conflict('TPL_LYT_002', 'Layout with the given key already exists');
  /** The layout has no published version */
  static readonly TPL_LYT_003 = AppErrorCode.conflict('TPL_LYT_003', 'Layout has no published version');

  /*!
   * Partial Errors — reusable content blocks rendered via Liquid `{% render %}`
   */

  /** Partial not found */
  static readonly TPL_PRT_001 = AppErrorCode.notFound('TPL_PRT_001', 'Partial not found');
  /** Partial with the given key already exists */
  static readonly TPL_PRT_002 = AppErrorCode.conflict('TPL_PRT_002', 'Partial with the given key already exists');

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
  /** The payload does not satisfy the template's declared variable contract */
  static readonly NTF_004 = AppErrorCode.badRequest('NTF_004', 'Payload does not satisfy the template variable contract');

  /*!
   * Authorization Errors
   *
   * Authentication (`IAM_001`), authorization (`IAM_002`) and step-up (`IAM_003`) failures are owned
   * by `@shadow-library/auth`; the browser session surface it mounts answers those directly. Pulse
   * keeps only the default-deny sentinel's own code here.
   */

  /** A route reached the default-deny sentinel without declaring an access policy */
  static readonly SEC_003 = AppErrorCode.forbidden('SEC_003', 'Access denied');
}
