/**
 * Importing npm packages
 */
import { ErrorType } from '@shadow-library/common';
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
  static readonly TPL_GRP_001 = new AppErrorCode('TPL_GRP_001', ErrorType.NOT_FOUND, 'Template group not found');
  /** Template group with the given key already exists */
  static readonly TPL_GRP_002 = new AppErrorCode('TPL_GRP_002', ErrorType.CONFLICT, 'Template group with the given key already exists');

  /*!
   * Template Channel Setting Errors
   */

  /** Template channel setting not found */
  static readonly TPL_CHN_001 = new AppErrorCode('TPL_CHN_001', ErrorType.NOT_FOUND, 'Template channel setting not found');

  /*!
   * Template Variant Errors
   */

  /** Template variant not found */
  static readonly TPL_VRT_001 = new AppErrorCode('TPL_VRT_001', ErrorType.NOT_FOUND, 'Template variant not found');
  /** Template variant with the given channel and locale already exists for the template group */
  static readonly TPL_VRT_002 = new AppErrorCode('TPL_VRT_002', ErrorType.CONFLICT, 'Template variant with the given channel and locale already exists for the template group');

  /*!
   * Sender Profile Errors
   */

  /** Sender profile not found */
  static readonly SND_PRF_001 = new AppErrorCode('SND_PRF_001', ErrorType.NOT_FOUND, 'Sender profile not found');
  /** Sender profile with the given key already exists */
  static readonly SND_PRF_002 = new AppErrorCode('SND_PRF_002', ErrorType.CONFLICT, 'Sender profile with the given key already exists');
  /** Cannot delete sender profile with active assignments */
  static readonly SND_PRF_003 = new AppErrorCode('SND_PRF_003', ErrorType.CONFLICT, 'Cannot delete sender profile with active assignments');

  /*!
   * Sender Endpoint Errors
   */

  /** Sender endpoint not found */
  static readonly SND_EP_001 = new AppErrorCode('SND_EP_001', ErrorType.NOT_FOUND, 'Sender endpoint not found');
  /** Sender endpoint with this channel, provider, and identifier already exists */
  static readonly SND_EP_002 = new AppErrorCode('SND_EP_002', ErrorType.CONFLICT, 'Sender endpoint with this channel, provider, and identifier already exists');

  /*!
   * Sender Profile Assignment Errors
   */

  /** Sender profile assignment not found */
  static readonly SND_ASGN_001 = new AppErrorCode('SND_ASGN_001', ErrorType.NOT_FOUND, 'Sender profile assignment not found');
  /** Sender profile assignment already exists for this combination */
  static readonly SND_ASGN_002 = new AppErrorCode('SND_ASGN_002', ErrorType.CONFLICT, 'Sender profile assignment already exists for this combination');
  /** Sender profile must be active to create assignment */
  static readonly SND_ASGN_003 = new AppErrorCode('SND_ASGN_003', ErrorType.CONFLICT, 'Sender profile must be active to create assignment');
}
