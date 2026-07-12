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
  static readonly PRJ_003 = new AppErrorCode('PRJ_003', ErrorType.CLIENT_ERROR, 'Operation not valid for this project kind');

  /*!
   * Source Errors
   */
  static readonly SRC_001 = new AppErrorCode('SRC_001', ErrorType.CLIENT_ERROR, 'No source adapter found for this URL');
  static readonly SRC_002 = new AppErrorCode('SRC_002', ErrorType.CLIENT_ERROR, 'Recombine requires a completed scrape — finish ingesting the source first');
  static readonly SRC_003 = new AppErrorCode(
    'SRC_003',
    ErrorType.CLIENT_ERROR,
    'Recombine is unavailable once extraction, briefs, or conversions reference chapters — renumbering would corrupt them',
  );
  static readonly SRC_004 = new AppErrorCode('SRC_004', ErrorType.CLIENT_ERROR, 'No webnovel book id is configured for this project');

  /*!
   * Export Errors
   */
  static readonly EXP_001 = new AppErrorCode('EXP_001', ErrorType.CLIENT_ERROR, 'Nothing to export — this project has no chapters yet');

  /*!
   * Chapter Errors
   */
  static readonly CHP_001 = new AppErrorCode('CHP_001', ErrorType.NOT_FOUND, 'Chapter not found');

  /*!
   * Planning Errors
   */
  static readonly PLN_001 = new AppErrorCode('PLN_001', ErrorType.CLIENT_ERROR, 'Volume plan is not approved — approve all volumes before generating');
  static readonly PLN_002 = new AppErrorCode(
    'PLN_002',
    ErrorType.CLIENT_ERROR,
    'Every volume needs a target chapter count (or an explicit chapter range) before the plan can be approved',
  );

  /*!
   * Draft Errors
   */
  static readonly DRF_001 = new AppErrorCode('DRF_001', ErrorType.NOT_FOUND, 'Draft not found');
  static readonly DRF_002 = new AppErrorCode('DRF_002', ErrorType.CLIENT_ERROR, 'Draft is already finalized');
  static readonly DRF_003 = new AppErrorCode('DRF_003', ErrorType.CLIENT_ERROR, 'Unresolved contradiction — resolve or use autoFix before generating next chapter');
  static readonly DRF_004 = new AppErrorCode('DRF_004', ErrorType.CLIENT_ERROR, 'Draft is not approved — approve draft before finalizing');
  static readonly DRF_005 = new AppErrorCode('DRF_005', ErrorType.CLIENT_ERROR, 'Chapter adds no new canon to the bible');
  static readonly DRF_006 = new AppErrorCode('DRF_006', ErrorType.NOT_FOUND, 'Chapter scene image not found');

  /*!
   * Finalize Errors
   */
  static readonly FIN_001 = new AppErrorCode('FIN_001', ErrorType.CLIENT_ERROR, 'Chapters must be finalized in order');
  static readonly FIN_002 = new AppErrorCode(
    'FIN_002',
    ErrorType.CLIENT_ERROR,
    'An earlier chapter needs re-validation after a bible or chapter change — run validation before finalizing',
  );
  static readonly FIN_003 = new AppErrorCode(
    'FIN_003',
    ErrorType.CLIENT_ERROR,
    'The latest validation report has an unresolved error for this chapter — resolve it before finalizing',
  );

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
  static readonly ENT_002 = new AppErrorCode('ENT_002', ErrorType.NOT_FOUND, 'Entity image not found');

  /*!
   * Volume Errors
   */
  static readonly VOL_001 = new AppErrorCode('VOL_001', ErrorType.NOT_FOUND, 'Volume not found');

  /*!
   * Bible Document Errors
   */
  static readonly DOC_001 = new AppErrorCode('DOC_001', ErrorType.NOT_FOUND, 'Bible document not found');

  /*!
   * Job Errors
   */
  static readonly JOB_001 = new AppErrorCode('JOB_001', ErrorType.NOT_FOUND, 'Job not found');

  /*!
   * Arc Errors
   */
  static readonly ARC_001 = new AppErrorCode('ARC_001', ErrorType.NOT_FOUND, 'Arc not found');
  static readonly ARC_002 = new AppErrorCode('ARC_002', ErrorType.CLIENT_ERROR, 'Arcs must be contiguous, non-overlapping, and exactly cover the volume chapter range');
  static readonly ARC_003 = new AppErrorCode(
    'ARC_003',
    ErrorType.CLIENT_ERROR,
    'Volume plan is not approved or is missing target chapter counts — approve volumes before planning arcs',
  );
  static readonly ARC_004 = new AppErrorCode('ARC_004', ErrorType.CLIENT_ERROR, 'Arcs are not approved — approve all arcs of the volume before outlining');

  /*!
   * Chat Errors
   */
  static readonly CHT_001 = new AppErrorCode('CHT_001', ErrorType.NOT_FOUND, 'Chat session not found');
  static readonly CHT_002 = new AppErrorCode('CHT_002', ErrorType.CLIENT_ERROR, 'Chat session is archived');
  static readonly CHT_003 = new AppErrorCode('CHT_003', ErrorType.CLIENT_ERROR, 'Invalid chat scope reference');
  static readonly CHT_004 = new AppErrorCode('CHT_004', ErrorType.CLIENT_ERROR, 'Lookup budget exhausted — the turn hit its declared-lookup round cap');
  static readonly CHT_005 = new AppErrorCode('CHT_005', ErrorType.CLIENT_ERROR, 'Invalid chat session mode');

  /*!
   * Refinement Proposal Errors
   */
  static readonly RFN_001 = new AppErrorCode('RFN_001', ErrorType.NOT_FOUND, 'Refinement proposal not found');
  static readonly RFN_002 = new AppErrorCode('RFN_002', ErrorType.CLIENT_ERROR, 'Refinement proposal is not pending');
  static readonly RFN_003 = new AppErrorCode(
    'RFN_003',
    ErrorType.CONFLICT,
    'Refinement proposal conflicts with the current artifact state — the artifact changed since the proposal was made',
  );
  static readonly RFN_004 = new AppErrorCode('RFN_004', ErrorType.CLIENT_ERROR, 'Change-set operation not allowed for this scope');
  static readonly RFN_005 = new AppErrorCode('RFN_005', ErrorType.CLIENT_ERROR, 'Finalized chapters are immutable — briefs at or before the story cursor cannot be modified');
  static readonly RFN_006 = new AppErrorCode('RFN_006', ErrorType.CONFLICT, 'Revert conflict — an artifact changed since this proposal was applied');
  static readonly RFN_007 = new AppErrorCode('RFN_007', ErrorType.CLIENT_ERROR, 'Proposal is not revertible — it is not applied, has no content ops, or was already reverted');
  static readonly RFN_008 = new AppErrorCode('RFN_008', ErrorType.SERVER_ERROR, 'Action execution failed — see the per-op results on the proposal');
  static readonly RFN_009 = new AppErrorCode('RFN_009', ErrorType.CLIENT_ERROR, 'Finalize is never auto-applied — apply the proposal manually to finalize chapters');
  static readonly RFN_010 = new AppErrorCode('RFN_010', ErrorType.CLIENT_ERROR, 'Draft is final or the chapter is already finalized — prose cannot be modified');
  static readonly RFN_011 = new AppErrorCode('RFN_011', ErrorType.CLIENT_ERROR, 'Invalid op selection — indexes must reference ops in the change-set and select at least one');

  /*!
   * Rebrand Errors
   */
  static readonly RBR_001 = new AppErrorCode('RBR_001', ErrorType.NOT_FOUND, 'Rebrand is not configured for this project');
  static readonly RBR_002 = new AppErrorCode('RBR_002', ErrorType.NOT_FOUND, 'Converted chapter not found');
  static readonly RBR_003 = new AppErrorCode('RBR_003', ErrorType.CLIENT_ERROR, 'Rebrand is only available for source projects');

  /*!
   * Context Errors
   */
  static readonly CTX_001 = new AppErrorCode('CTX_001', ErrorType.NOT_FOUND, 'No context pack is linked to this run');

  /*!
   * Premise Errors
   */
  static readonly PRM_001 = new AppErrorCode('PRM_001', ErrorType.CLIENT_ERROR, 'No overview available — provide an overview or set the project brief or premise first');
}
