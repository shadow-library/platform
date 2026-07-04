/**
 * Importing packages with side effects
 */

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
   * Project Errors
   */
  static readonly PRJ_001 = new AppErrorCode('PRJ_001', ErrorType.NOT_FOUND, 'Project not found');
  static readonly PRJ_002 = new AppErrorCode('PRJ_002', ErrorType.CONFLICT, 'Project with this name already exists');
  static readonly PRJ_003 = new AppErrorCode('PRJ_003', ErrorType.CLIENT_ERROR, 'Operation not valid for this project kind');

  /*!
   * Source Errors
   */
  static readonly SRC_001 = new AppErrorCode('SRC_001', ErrorType.CLIENT_ERROR, 'No source adapter found for this URL');

  /*!
   * Chapter Errors
   */
  static readonly CHP_001 = new AppErrorCode('CHP_001', ErrorType.NOT_FOUND, 'Chapter not found');

  /*!
   * Planning Errors
   */
  static readonly PLN_001 = new AppErrorCode('PLN_001', ErrorType.CLIENT_ERROR, 'Volume plan is not approved — approve all volumes before generating');

  /*!
   * Draft Errors
   */
  static readonly DRF_001 = new AppErrorCode('DRF_001', ErrorType.NOT_FOUND, 'Draft not found');
  static readonly DRF_002 = new AppErrorCode('DRF_002', ErrorType.CLIENT_ERROR, 'Draft is already finalized');
  static readonly DRF_003 = new AppErrorCode('DRF_003', ErrorType.CLIENT_ERROR, 'Unresolved contradiction — resolve or use autoFix before generating next chapter');

  /*!
   * Finalize Errors
   */
  static readonly FIN_001 = new AppErrorCode('FIN_001', ErrorType.CLIENT_ERROR, 'Chapters must be finalized in order');

  /*!
   * AI Errors
   */
  static readonly AI_001 = new AppErrorCode('AI_001', ErrorType.CLIENT_ERROR, 'AI model returned unparseable response');
  static readonly AI_002 = new AppErrorCode('AI_002', ErrorType.CLIENT_ERROR, 'Role or model not in registry, or provider is disabled');
  static readonly AI_003 = new AppErrorCode('AI_003', ErrorType.CLIENT_ERROR, 'Grok-only projects and grok interlude operations may only use xAI');

  /*!
   * Continuity Errors
   */
  static readonly CNT_001 = new AppErrorCode('CNT_001', ErrorType.NOT_FOUND, 'No pending continuity proposal for this chapter');

  /*!
   * Entity Errors
   */
  static readonly ENT_001 = new AppErrorCode('ENT_001', ErrorType.NOT_FOUND, 'Entity not found');

  /*!
   * Volume Errors
   */
  static readonly VOL_001 = new AppErrorCode('VOL_001', ErrorType.NOT_FOUND, 'Volume not found');

  /*!
   * Bible Document Errors
   */
  static readonly DOC_001 = new AppErrorCode('DOC_001', ErrorType.NOT_FOUND, 'Bible document not found');
}
