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
  static readonly PRJ_004 = AppErrorCode.conflict('PRJ_004', 'Project limit reached for this account — delete an existing project before creating another');
  static readonly PRJ_010 = AppErrorCode.badRequest('PRJ_010', 'wordTarget.max must be greater than wordTarget.min');
  static readonly PRJ_011 = AppErrorCode.conflict('PRJ_011', 'A chapter is being written or planned for this novel — cancel that job before resetting');
  static readonly PRJ_012 = AppErrorCode.badRequest('PRJ_012', 'The notes are {words} words; keep them to {max} words or fewer');
  static readonly PRJ_013 = AppErrorCode.badRequest('PRJ_013', 'Unknown checklist item {key}');
  static readonly PRJ_014 = AppErrorCode.badRequest('PRJ_014', 'The title cannot be blank');

  /*!
   * Export Errors
   */
  static readonly EXP_001 = AppErrorCode.badRequest('EXP_001', 'Nothing to export — this project has no chapters yet');

  /*!
   * Chapter Errors
   */
  static readonly CHP_001 = AppErrorCode.notFound('CHP_001', 'Chapter not found');
  static readonly CHP_003 = AppErrorCode.badRequest('CHP_003', 'Insert position is behind the write frontier — only chapters ahead of the last finalized chapter can be inserted');
  static readonly CHP_004 = AppErrorCode.conflict('CHP_004', 'A chapter is being written, planned or finalized for this novel — wait for it to finish before inserting a chapter');
  static readonly CHP_005 = AppErrorCode.badRequest('CHP_005', 'Isolated chapter has no summary or continuation state — summarize the chapter before finalizing');
  static readonly CHP_006 = AppErrorCode.badRequest('CHP_006', 'Chapter is not finalized canon — amend is only available once the chapter is finalized');
  static readonly CHP_007 = AppErrorCode.badRequest('CHP_007', 'Draft has no prose yet — import or generate the chapter before summarizing it');
  static readonly CHP_008 = AppErrorCode.conflict('CHP_008', 'Chapter is locked — finalized prose changes only through amend');
  static readonly CHP_009 = AppErrorCode.conflict(
    'CHP_009',
    'Chapter {chapter} is already written — a chapter can only be inserted after the last written chapter, because inserting earlier would renumber written chapters',
  );
  static readonly CHP_010 = AppErrorCode.badRequest('CHP_010', 'Chapter {chapter} has no summary — write one or summarise with AI');

  /*!
   * Brief Errors
   */
  static readonly BRF_001 = AppErrorCode.badRequest('BRF_001', 'No brief exists for the requested chapter(s) — outline the plan before generating');
  static readonly BRF_002 = AppErrorCode.badRequest('BRF_002', 'Brief is stale for chapter(s) {chapters} — refresh the outline or clear staleness before generating');
  static readonly BRF_003 = AppErrorCode.badRequest('BRF_003', 'Ending contract is incomplete — {fields} must not be empty');
  static readonly BRF_004 = AppErrorCode.badRequest('BRF_004', 'Chapter plan scenes are malformed — {reason}');

  /*!
   * Plan Rule Errors
   */
  static readonly PLN_001 = AppErrorCode.badRequest('PLN_001', 'The plan for chapter {chapter} reveals facts that are still locked there: {violations}');
  static readonly PLN_002 = AppErrorCode.conflict('PLN_002', 'Chapter {chapter} is already planned as the ending — clear its ending flag first');
  static readonly PLN_003 = AppErrorCode.badRequest('PLN_003', 'The plan for chapter {chapter} cannot claim these milestones: {reason}');
  static readonly PLN_004 = AppErrorCode.conflict(
    'PLN_004',
    'The plan for chapter {chapter} reveals facts that are locked there — change the plan before approving or finalizing: {violations}',
  );
  static readonly PLN_005 = AppErrorCode.badRequest('PLN_005', 'Chapter {chapter} is finalized — its plan can no longer change');
  static readonly PLN_006 = AppErrorCode.badRequest('PLN_006', 'Only the next chapter can be planned — that is chapter {next}, not chapter {chapter}');
  static readonly PLN_007 = AppErrorCode.conflict('PLN_007', 'Chapter {chapter} already has a plan — edit it instead');
  static readonly PLN_008 = AppErrorCode.conflict('PLN_008', 'The plan for chapter {chapter} is out of date — the story has moved on to chapter {next}; plan again');
  static readonly PLN_009 = AppErrorCode.conflict('PLN_009', 'A plan for chapter {chapter} is already being made — wait for it or cancel it');

  /*!
   * Draft Errors
   */
  static readonly DRF_001 = AppErrorCode.notFound('DRF_001', 'Draft not found');
  static readonly DRF_002 = AppErrorCode.badRequest('DRF_002', 'Draft is already finalized');
  static readonly DRF_003 = AppErrorCode.badRequest('DRF_003', 'Unresolved contradiction — repair or regenerate the contradicted draft before generating further chapters');
  static readonly DRF_004 = AppErrorCode.badRequest('DRF_004', 'Draft is not approved — approve draft before finalizing');
  static readonly DRF_005 = AppErrorCode.badRequest('DRF_005', 'Chapter adds no new canon to the bible');
  static readonly DRF_006 = AppErrorCode.notFound('DRF_006', 'Chapter scene image not found');
  static readonly DRF_007 = AppErrorCode.badRequest('DRF_007', 'Draft is stale — something it was written against changed; regenerate or edit it, or approve it as written');
  static readonly DRF_009 = AppErrorCode.badRequest('DRF_009', 'Draft approval is never applied automatically — select the approval step and apply it deliberately');
  static readonly DRF_010 = AppErrorCode.conflict('DRF_010', 'A generation job is already running for this project — wait for it to finish before regenerating a chapter');
  static readonly DRF_011 = AppErrorCode.badRequest('DRF_011', 'Chapter {chapter} cannot be generated before chapter {blocker} is drafted — chapters are generated in order');
  static readonly DRF_012 = AppErrorCode.badRequest(
    'DRF_012',
    'Chapter {chapter} cannot be regenerated while chapter {blocker} is an unfinalized external chapter — fill and finalize it first',
  );
  static readonly DRF_013 = AppErrorCode.conflict('DRF_013', 'This chapter changed while you were working on it. Reload it and try again.');
  static readonly DRF_014 = AppErrorCode.badRequest('DRF_014', 'Chapter generation is never applied automatically — select the generation step and apply it deliberately');
  static readonly DRF_015 = AppErrorCode.conflict('DRF_015', 'Chapter {chapter} already has a draft — regenerate it from the chapter itself');
  static readonly DRF_016 = AppErrorCode.badRequest(
    'DRF_016',
    'Chapter {chapter} cannot be written by the AI until chapter {teacher} is approved — its characters learn something there that later chapters build on. You can still write chapter {chapter} yourself.',
  );
  static readonly DRF_017 = AppErrorCode.badRequest('DRF_017', 'This draft is stale because a reveal in its plan no longer holds — fix the plan; it cannot be approved as written');
  static readonly DRF_018 = AppErrorCode.badRequest(
    'DRF_018',
    'Only chapter {next} can be started now — chapters are written in order, so chapter {chapter} cannot get a new draft',
  );
  static readonly DRF_019 = AppErrorCode.conflict(
    'DRF_019',
    'Chapter {chapter} is being written by the AI right now — wait for it to finish, or cancel it to write the chapter yourself',
  );
  static readonly DRF_020 = AppErrorCode.badRequest('DRF_020', 'A save made against an earlier read must send baseDraftId, baseRevision and baseSaveSeq together');
  static readonly DRF_021 = AppErrorCode.conflict('DRF_021', 'This save collided with another save happening at the same time — try again');

  /*!
   * Finalize Errors
   */
  static readonly FIN_001 = AppErrorCode.badRequest('FIN_001', 'Chapters must be finalized in order');
  static readonly FIN_002 = AppErrorCode.badRequest('FIN_002', 'An earlier chapter needs re-validation after a bible or chapter change — run validation before finalizing');
  static readonly FIN_003 = AppErrorCode.badRequest('FIN_003', 'The latest validation report has an unresolved error for this chapter — resolve it before finalizing');
  static readonly FIN_004 = AppErrorCode.badRequest(
    'FIN_004',
    'Chapter {chapter} has a blocking review finding still open — change the text, dismiss the finding or approve over it before finalizing',
  );

  /*!
   * AI Errors
   */
  static readonly AI_001 = AppErrorCode.badRequest('AI_001', 'AI model returned unparseable response');
  static readonly AI_002 = AppErrorCode.badRequest('AI_002', 'Role or model not in registry, or provider is not supported');
  static readonly AI_003 = AppErrorCode.badRequest('AI_003', 'Unrestricted projects and unrestricted-generation operations may only use models on the unrestricted allowlist');
  // User-facing 500s: both are actionable by the operator (set the key / retry), so the detail must not
  // be swallowed by the internal() mask.
  static readonly AI_004 = new AppErrorCode('AI_004', 'Image generation is not configured — set AI_OPENROUTER_API_KEY', 500);
  static readonly AI_005 = new AppErrorCode('AI_005', 'Image generation failed — see the model call log', 500);
  static readonly AI_006 = new AppErrorCode('AI_006', 'AI is not configured — set AI_OPENROUTER_API_KEY', 500);
  static readonly AI_007 = new AppErrorCode('AI_007', 'AI model call failed — see the model call log', 502);
  static readonly AI_008 = AppErrorCode.badRequest('AI_008', 'AI request rate limit reached — too many model calls in the current window, try again shortly', 429);
  static readonly AI_009 = AppErrorCode.badRequest('AI_009', 'AI spend limit reached for this account in the current window — try again later', 429);
  static readonly AI_010 = AppErrorCode.badRequest('AI_010', 'Model {model} accepts at most {max} reference image(s), but {count} were supplied');
  static readonly AI_011 = AppErrorCode.badRequest('AI_011', 'Model {model} does not accept image input');
  static readonly AI_012 = AppErrorCode.badRequest('AI_012', 'Appearance description needs the reference image as an inline base64 data: URL');
  static readonly AI_013 = AppErrorCode.conflict('AI_013', 'Workflow run was cancelled');
  static readonly AI_014 = AppErrorCode.badRequest('AI_014', 'Invalid date range — from and to must be valid dates, and from must not be after to');
  static readonly AI_015 = AppErrorCode.badRequest(
    'AI_015',
    'This request was declined before it reached a model: {source} appears to involve sexual content with a minor, which Novel Forge never writes in any mode',
    422,
  );

  /*!
   * Illustration Errors
   */
  static readonly ILL_001 = AppErrorCode.notFound('ILL_001', 'Illustration not found');
  static readonly ILL_002 = AppErrorCode.badRequest('ILL_002', 'Illustration is no longer active — start a new one to keep iterating');
  static readonly ILL_003 = AppErrorCode.badRequest('ILL_003', 'Select a candidate before saving the illustration');
  static readonly ILL_004 = AppErrorCode.badRequest('ILL_004', 'Candidate is not part of this illustration');
  static readonly ILL_005 = AppErrorCode.badRequest('ILL_005', 'Save target does not match the illustration subject');
  static readonly ILL_006 = AppErrorCode.badRequest('ILL_006', 'Illustration subject requires an entity key or chapter number');
  static readonly ILL_007 = AppErrorCode.badRequest('ILL_007', 'Refinement must add, remove, or replace exactly one instruction');
  static readonly ILL_008 = AppErrorCode.badRequest('ILL_008', 'Instruction index is out of range');
  static readonly ILL_009 = AppErrorCode.badRequest('ILL_009', 'Reference source {source} has an invalid source id');
  static readonly ILL_010 = AppErrorCode.notFound('ILL_010', 'Reference image not found for {source}');
  static readonly ILL_011 = AppErrorCode.badRequest('ILL_011', 'The image model accepts at most {capacity} reference image(s), but {count} were requested');
  static readonly ILL_012 = AppErrorCode.badRequest('ILL_012', 'Reference image for {source} is {size} bytes, over the {limit} byte limit');
  static readonly ILL_013 = AppErrorCode.badRequest('ILL_013', 'Reference images total {size} bytes, over the {limit} byte request limit');
  static readonly ILL_014 = AppErrorCode.badRequest('ILL_014', 'Reference image for {source} is {contentType}; only PNG, JPEG and WebP are supported');
  static readonly ILL_015 = AppErrorCode.badRequest('ILL_015', 'Reference for {source} cannot use the edit-source role — it is reserved for the image being refined');

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
  static readonly VOL_002 = AppErrorCode.conflict('VOL_002', 'Volume is still assigned to the plan for chapter {chapter} — move or remove the chapter plans in it first');

  /*!
   * Bible Document Errors
   */
  static readonly DOC_001 = AppErrorCode.notFound('DOC_001', 'Bible document not found');
  static readonly DOC_002 = AppErrorCode.conflict('DOC_002', 'The Story Bible changed since the tidy-up preview — reload the preview and choose again');

  /*!
   * Job Errors
   */
  static readonly JOB_001 = AppErrorCode.notFound('JOB_001', 'Job not found');
  static readonly JOB_002 = AppErrorCode.conflict(
    'JOB_002',
    'A chapter is being written, planned or finalized for this novel — wait for it to finish or cancel it, then try again',
  );

  /*!
   * Chat Errors
   */
  static readonly CHT_001 = AppErrorCode.notFound('CHT_001', 'Chat session not found');
  static readonly CHT_002 = AppErrorCode.badRequest('CHT_002', 'Chat session is archived');
  static readonly CHT_003 = AppErrorCode.badRequest('CHT_003', 'Invalid chat scope reference');
  static readonly CHT_004 = AppErrorCode.badRequest('CHT_004', 'Lookup budget exhausted — the turn hit its declared-lookup round cap');
  static readonly CHT_005 = AppErrorCode.badRequest('CHT_005', 'Invalid chat session mode');
  static readonly CHT_006 = AppErrorCode.conflict('CHT_006', 'Another turn wrote to this conversation at the same time — send the message again');
  static readonly CHT_007 = AppErrorCode.notFound('CHT_007', 'Turn stream not found — the run is unknown, belongs to another project, or its buffer has expired');
  static readonly CHT_008 = AppErrorCode.badRequest('CHT_008', 'Invalid job event cursor — Last-Event-ID must be a sequence number this chat’s job stream sent');

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
  static readonly RFN_009 = AppErrorCode.badRequest('RFN_009', 'Finalize is never applied automatically — select the finalize step and apply it deliberately');
  static readonly RFN_010 = AppErrorCode.badRequest('RFN_010', 'Draft is final or the chapter is already finalized — prose cannot be modified');
  static readonly RFN_011 = AppErrorCode.badRequest('RFN_011', 'Invalid op selection — indexes must reference ops in the change-set and select at least one');
  static readonly RFN_012 = AppErrorCode.badRequest(
    'RFN_012',
    'This chapter is isolated — chat cannot see its prose, so it cannot rewrite it. Edit the prose in the chapter editor.',
  );

  /*!
   * Context Errors
   */
  static readonly CTX_001 = AppErrorCode.notFound('CTX_001', 'No context pack is linked to this run');
  static readonly CTX_002 = AppErrorCode.badRequest('CTX_002', "The writer's required material does not fit — {detail}.");

  /*!
   * Premise Errors
   */
  static readonly PRM_001 = AppErrorCode.badRequest('PRM_001', 'No overview available — provide an overview or set the project brief or premise first');

  /*!
   * Canon Fact Errors
   */
  static readonly FCT_001 = AppErrorCode.notFound('FCT_001', 'Canon fact not found');
  static readonly FCT_002 = AppErrorCode.badRequest('FCT_002', 'Unknown entity key referenced by the knowledge operation');
  static readonly FCT_003 = AppErrorCode.badRequest('FCT_003', 'Canon fact has ledgered reveals — retract them before removing the fact');
  static readonly FCT_004 = AppErrorCode.conflict('FCT_004', 'A canon fact with this key already exists in the project');
  static readonly FCT_005 = AppErrorCode.badRequest('FCT_005', 'Unlock condition is malformed — {reason}');
  static readonly FCT_006 = AppErrorCode.badRequest('FCT_006', 'An allowed clue names a give-away term of its fact — {reason}');

  /*!
   * Milestone Errors
   */
  static readonly MIL_001 = AppErrorCode.notFound('MIL_001', 'Milestone not found');
  static readonly MIL_002 = AppErrorCode.conflict('MIL_002', 'A milestone with this key already exists in the project');
  static readonly MIL_003 = AppErrorCode.conflict('MIL_003', 'Milestone {milestoneKey} is still referenced by {references} — remove those references first');
  static readonly MIL_004 = AppErrorCode.badRequest('MIL_004', 'Milestone subject {entityKey} is not an entity of this novel');

  /*!
   * Decision Ledger Errors
   */
  static readonly LDG_001 = AppErrorCode.notFound('LDG_001', 'Ledger entry not found');
  static readonly LDG_002 = AppErrorCode.conflict('LDG_002', 'Ledger entry is already superseded or withdrawn — change the active entry on its topic instead');
  static readonly LDG_003 = AppErrorCode.badRequest('LDG_003', 'Only a decision or a system detail can be rewritten as a decision');
  static readonly LDG_004 = AppErrorCode.badRequest('LDG_004', 'Ledger topic "{topic}" is not a key of lowercase words joined by dots, dashes or underscores');
  static readonly LDG_005 = AppErrorCode.badRequest('LDG_005', 'Topic "{topic}" is reserved for the server; the author cannot write to it directly');

  /*!
   * Notes Errors
   */
  static readonly NTS_001 = AppErrorCode.badRequest('NTS_001', 'What you kept from your organised notes cannot be written: {issues}');
  static readonly NTS_002 = AppErrorCode.badRequest('NTS_002', 'Option "{optionId}" is not one the organised notes offered');
  static readonly NTS_003 = AppErrorCode.badRequest('NTS_003', 'There are no notes long enough to organise yet — organising needs at least {words} words of your notes');
  static readonly NTS_004 = AppErrorCode.conflict(
    'NTS_004',
    'Your notes are already organised into the Story Bible, or a card organising them is waiting for you — organising them again now would write the same pages a second time. Accept or discard that card, or undo the applied change, to organise afresh',
  );

  /*!
   * Chapter Review Errors
   */
  static readonly REV_001 = AppErrorCode.notFound('REV_001', 'Review not found');
  static readonly REV_002 = AppErrorCode.notFound('REV_002', 'That finding is not part of this review');
  static readonly REV_003 = AppErrorCode.conflict('REV_003', 'The chapter changed after this review — review the current text again before answering its findings');
  static readonly REV_004 = AppErrorCode.badRequest('REV_004', 'Say why you are dismissing this finding');
  static readonly REV_005 = AppErrorCode.badRequest('REV_005', 'Only a blocking finding can be overridden');
  static readonly REV_006 = AppErrorCode.badRequest('REV_006', 'Chapter {chapter} has no prose to review yet');
  static readonly REV_007 = AppErrorCode.conflict('REV_007', 'Chapter {chapter} is still being written — review it once the draft is ready');

  /*!
   * Story Bible Audit Errors
   */
  static readonly AUD_001 = AppErrorCode.notFound('AUD_001', 'Audit report not found');
  static readonly AUD_002 = AppErrorCode.notFound('AUD_002', 'That finding is not part of this audit report');
  static readonly AUD_003 = AppErrorCode.conflict(
    'AUD_003',
    'The changes from this audit were already applied or undone — run the audit again to review the Story Bible as it is now',
  );
  static readonly AUD_004 = AppErrorCode.unavailable('AUD_004', 'Neither audit check could run — try the audit again');
  static readonly AUD_005 = AppErrorCode.conflict('AUD_005', 'Every finding on this audit card was skipped — keep one before applying it');
  static readonly AUD_006 = AppErrorCode.badRequest('AUD_006', 'An audit card applies only changes from findings you kept — keep the finding first');
  static readonly AUD_007 = AppErrorCode.badRequest('AUD_007', 'An audit card changes only by keeping or skipping its findings — run the audit again for different changes');

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
  static readonly PUB_007 = AppErrorCode.conflict('PUB_007', 'That novel slug already belongs to another project');
  static readonly PUB_008 = AppErrorCode.conflict('PUB_008', 'No free novel slug remains near “{base}” — publish with an explicit novelSlug');
  // Refused rather than auto-raised: the novel-level rating is the author's published promise to readers, and
  // silently rewriting it from a chapter edit changes what the catalog advertises without anyone deciding to.
  static readonly PUB_009 = AppErrorCode.badRequest('PUB_009', 'The novel rating is below a published chapter’s — raise it first ({violations})');
  // Attribution to someone outside the platform is a curation decision, not an authoring one: it is what tells readers
  // the work is not the author's own, so an ordinary publisher may clear it but never assert one.
  static readonly PUB_010 = AppErrorCode.forbidden('PUB_010', 'Naming an original author requires the curate permission');

  /*!
   * Plugin Errors
   */
  static readonly PLG_001 = AppErrorCode.notFound('PLG_001', 'Plugin is not loaded on this deployment');
  // Deliberately the same 404 as PLG_001, so a probe cannot tell "no such plugin on this deploy" from
  // "installed but not enabled on this novel" by the response status.
  static readonly PLG_002 = AppErrorCode.notFound('PLG_002', 'Plugin is not enabled on this novel');
  static readonly PLG_003 = AppErrorCode.badRequest('PLG_003', 'Plugin configuration was rejected — {reason}');
  static readonly PLG_004 = AppErrorCode.conflict('PLG_004', 'Another enabled plugin already claims an exclusive decision point this plugin claims: {decisionPoint}');
  static readonly PLG_005 = AppErrorCode.badRequest('PLG_005', 'Plugin proposed a change it is not allowed to propose — {reason}');
}
