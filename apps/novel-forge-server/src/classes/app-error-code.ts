/**
 * Importing packages with side effects
 */

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
   * Project Errors
   */
  static readonly PRJ_001 = AppErrorCode.notFound('PRJ_001', 'Project not found');
  static readonly PRJ_003 = AppErrorCode.badRequest('PRJ_003', 'Operation not valid for this project kind');

  /*!
   * Source Errors
   */
  static readonly SRC_002 = AppErrorCode.badRequest('SRC_002', 'Recombine requires chapters to exist for this project');
  static readonly SRC_003 = AppErrorCode.badRequest(
    'SRC_003',
    'Recombine is unavailable once extraction, briefs, or conversions reference chapters — renumbering would corrupt them',
  );

  /*!
   * Export Errors
   */
  static readonly EXP_001 = AppErrorCode.badRequest('EXP_001', 'Nothing to export — this project has no chapters yet');

  /*!
   * Chapter Errors
   */
  static readonly CHP_001 = AppErrorCode.notFound('CHP_001', 'Chapter not found');

  /*!
   * Planning Errors
   */
  static readonly PLN_001 = AppErrorCode.badRequest('PLN_001', 'Volume plan is not approved — approve all volumes before generating');
  static readonly PLN_002 = AppErrorCode.badRequest('PLN_002', 'Every volume needs a target chapter count (or an explicit chapter range) before the plan can be approved');

  /*!
   * Draft Errors
   */
  static readonly DRF_001 = AppErrorCode.notFound('DRF_001', 'Draft not found');
  static readonly DRF_002 = AppErrorCode.badRequest('DRF_002', 'Draft is already finalized');
  static readonly DRF_003 = AppErrorCode.badRequest('DRF_003', 'Unresolved contradiction — resolve or use autoFix before generating next chapter');
  static readonly DRF_004 = AppErrorCode.badRequest('DRF_004', 'Draft is not approved — approve draft before finalizing');
  static readonly DRF_005 = AppErrorCode.badRequest('DRF_005', 'Chapter adds no new canon to the bible');
  static readonly DRF_006 = AppErrorCode.notFound('DRF_006', 'Chapter scene image not found');

  /*!
   * Finalize Errors
   */
  static readonly FIN_001 = AppErrorCode.badRequest('FIN_001', 'Chapters must be finalized in order');
  static readonly FIN_002 = AppErrorCode.badRequest('FIN_002', 'An earlier chapter needs re-validation after a bible or chapter change — run validation before finalizing');
  static readonly FIN_003 = AppErrorCode.badRequest('FIN_003', 'The latest validation report has an unresolved error for this chapter — resolve it before finalizing');

  /*!
   * AI Errors
   */
  static readonly AI_001 = AppErrorCode.badRequest('AI_001', 'AI model returned unparseable response');
  static readonly AI_002 = AppErrorCode.badRequest('AI_002', 'Role or model not in registry, or provider is disabled');
  static readonly AI_003 = AppErrorCode.badRequest('AI_003', 'Grok-only projects and grok interlude operations may only use xAI');

  /*!
   * Continuity Errors
   */
  static readonly CNT_001 = AppErrorCode.notFound('CNT_001', 'No pending continuity proposal for this chapter');

  /*!
   * Entity Errors
   */
  static readonly ENT_001 = AppErrorCode.notFound('ENT_001', 'Entity not found');
  static readonly ENT_002 = AppErrorCode.notFound('ENT_002', 'Entity image not found');

  /*!
   * Volume Errors
   */
  static readonly VOL_001 = AppErrorCode.notFound('VOL_001', 'Volume not found');

  /*!
   * Bible Document Errors
   */
  static readonly DOC_001 = AppErrorCode.notFound('DOC_001', 'Bible document not found');

  /*!
   * Job Errors
   */
  static readonly JOB_001 = AppErrorCode.notFound('JOB_001', 'Job not found');

  /*!
   * Arc Errors
   */
  static readonly ARC_001 = AppErrorCode.notFound('ARC_001', 'Arc not found');
  static readonly ARC_002 = AppErrorCode.badRequest('ARC_002', 'Arcs must be contiguous, non-overlapping, and exactly cover the volume chapter range');
  static readonly ARC_003 = AppErrorCode.badRequest('ARC_003', 'Volume plan is not approved or is missing target chapter counts — approve volumes before planning arcs');
  static readonly ARC_004 = AppErrorCode.badRequest('ARC_004', 'Arcs are not approved — approve all arcs of the volume before outlining');

  /*!
   * Chat Errors
   */
  static readonly CHT_001 = AppErrorCode.notFound('CHT_001', 'Chat session not found');
  static readonly CHT_002 = AppErrorCode.badRequest('CHT_002', 'Chat session is archived');
  static readonly CHT_003 = AppErrorCode.badRequest('CHT_003', 'Invalid chat scope reference');
  static readonly CHT_004 = AppErrorCode.badRequest('CHT_004', 'Lookup budget exhausted — the turn hit its declared-lookup round cap');
  static readonly CHT_005 = AppErrorCode.badRequest('CHT_005', 'Invalid chat session mode');

  /*!
   * Refinement Proposal Errors
   */
  static readonly RFN_001 = AppErrorCode.notFound('RFN_001', 'Refinement proposal not found');
  static readonly RFN_002 = AppErrorCode.badRequest('RFN_002', 'Refinement proposal is not pending');
  static readonly RFN_003 = AppErrorCode.conflict('RFN_003', 'Refinement proposal conflicts with the current artifact state — the artifact changed since the proposal was made');
  static readonly RFN_004 = AppErrorCode.badRequest('RFN_004', 'Change-set operation not allowed for this scope');
  static readonly RFN_005 = AppErrorCode.badRequest('RFN_005', 'Finalized chapters are immutable — briefs at or before the story cursor cannot be modified');
  static readonly RFN_006 = AppErrorCode.conflict('RFN_006', 'Revert conflict — an artifact changed since this proposal was applied');
  static readonly RFN_007 = AppErrorCode.badRequest('RFN_007', 'Proposal is not revertible — it is not applied, has no content ops, or was already reverted');
  // A user-facing 500: the message must reach the client, so this stays out of the internal() mask
  static readonly RFN_008 = new AppErrorCode('RFN_008', 'Action execution failed — see the per-op results on the proposal', 500);
  static readonly RFN_009 = AppErrorCode.badRequest('RFN_009', 'Finalize is never auto-applied — apply the proposal manually to finalize chapters');
  static readonly RFN_010 = AppErrorCode.badRequest('RFN_010', 'Draft is final or the chapter is already finalized — prose cannot be modified');
  static readonly RFN_011 = AppErrorCode.badRequest('RFN_011', 'Invalid op selection — indexes must reference ops in the change-set and select at least one');

  /*!
   * Rebrand Errors
   */
  static readonly RBR_001 = AppErrorCode.notFound('RBR_001', 'Rebrand is not configured for this project');
  static readonly RBR_002 = AppErrorCode.notFound('RBR_002', 'Converted chapter not found');
  static readonly RBR_003 = AppErrorCode.badRequest('RBR_003', 'Rebrand is only available for source projects');

  /*!
   * Reforge Errors
   */
  static readonly REF_001 = AppErrorCode.notFound('REF_001', 'Reforge is not configured for this project');
  static readonly REF_002 = AppErrorCode.notFound('REF_002', 'Reforged chapter not found');
  static readonly REF_003 = AppErrorCode.badRequest('REF_003', 'Reforge is only available for source projects');

  /*!
   * Context Errors
   */
  static readonly CTX_001 = AppErrorCode.notFound('CTX_001', 'No context pack is linked to this run');

  /*!
   * Premise Errors
   */
  static readonly PRM_001 = AppErrorCode.badRequest('PRM_001', 'No overview available — provide an overview or set the project brief or premise first');

  /*!
   * Canon Fact Errors
   */
  static readonly FCT_001 = AppErrorCode.notFound('FCT_001', 'Canon fact not found');
  static readonly FCT_002 = AppErrorCode.badRequest('FCT_002', 'Unknown entity key referenced by the knowledge operation');

  /*!
   * Plan Import Errors
   */
  static readonly IMP_001 = AppErrorCode.conflict('IMP_001', 'Project already contains plan data for a collection in this bundle — pass overwrite to replace it');
  static readonly IMP_002 = AppErrorCode.badRequest('IMP_002', 'Unsupported bundle format or version');
  static readonly IMP_003 = AppErrorCode.badRequest('IMP_003', 'Overwrite is not allowed once drafts or chapters exist — edit the plan in the app instead');

  /*!
   * Publishing Errors
   */
  static readonly PUB_001 = AppErrorCode.notFound('PUB_001', 'Publication not found');
  static readonly PUB_002 = AppErrorCode.badRequest('PUB_002', 'Chapter is not finalized — only reviewed, finalized chapters can be published');
  static readonly PUB_003 = AppErrorCode.badRequest('PUB_003', 'Chapters must be published contiguously — publish or restore every earlier chapter first');
  // A user-facing 500: the push failure detail must reach the client, so it stays out of the internal() mask
  static readonly PUB_004 = new AppErrorCode('PUB_004', 'Reader service push failed — see the publication ledger error', 500);
  // Same reasoning as PUB_004: the author needs to know sharing failed because identity was unreachable,
  // not that "something went wrong", since the fix is to retry rather than to change the share list.
  static readonly PUB_005 = new AppErrorCode('PUB_005', 'Could not resolve the people to share with — the identity service is unavailable', 503);
  static readonly PUB_006 = AppErrorCode.badRequest('PUB_006', 'Organisation visibility requires the session to be acting in an organisation');
}
