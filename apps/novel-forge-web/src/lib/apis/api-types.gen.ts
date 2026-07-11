export interface paths {
  '/api/v1/ai/models': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Models */
    get: operations['listModels'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/seed-from-brief': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Seed From Brief */
    post: operations['seedFromBrief'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/plan': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Plan */
    post: operations['plan'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Approve Plan */
    post: operations['approvePlan'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/outline': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Outline */
    post: operations['outline'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/arcs/{arcKey}/outline': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Outline Arc */
    post: operations['outlineArc'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/briefs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Briefs */
    get: operations['listBriefs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/briefs/{n}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Brief */
    get: operations['getBrief'];
    /** Update Brief */
    put: operations['updateBrief'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/generate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Generate */
    post: operations['generate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/jobs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Jobs */
    get: operations['listJobs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Drafts */
    get: operations['listDrafts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Draft */
    get: operations['getDraft'];
    /** Update Draft */
    put: operations['updateDraft'];
    post?: never;
    /** Delete Draft */
    delete: operations['deleteDraft'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/revise': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Revise Draft */
    post: operations['reviseDraft'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/judge': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Judge Draft */
    post: operations['judgeDraft'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/feedback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Feedback Draft */
    post: operations['feedbackDraft'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Approve Draft */
    post: operations['approveDraft'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/revisions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Revisions */
    get: operations['listRevisions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/revisions/{r}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Revision */
    get: operations['getRevision'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/prompt': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Draft Prompt */
    get: operations['getDraftPrompt'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/drafts/{n}/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Import Draft */
    post: operations['importDraft'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/finalize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Finalize */
    post: operations['finalize'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/generate-grok': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Generate Grok */
    post: operations['generateGrok'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/propose-continuity': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Propose Continuity */
    post: operations['proposeContinuity'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/extract-to-bible': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Extract To Bible */
    post: operations['extractToBible'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/continuity-proposal': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Continuity Proposal */
    get: operations['getContinuityProposal'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Continuity Proposal */
    patch: operations['updateContinuityProposal'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/continuity-proposal/apply': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Apply Continuity Proposal */
    post: operations['applyContinuityProposal'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/continuity-proposal/discard': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Discard Continuity Proposal */
    post: operations['discardContinuityProposal'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/validate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Validate */
    post: operations['validate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/review': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Review Chapter */
    post: operations['reviewChapter'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/review-queue': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Review Queue */
    get: operations['getReviewQueue'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/runs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Runs */
    get: operations['listRuns'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/runs/{runId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Run */
    get: operations['getRun'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/ai-usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Ai Usage */
    get: operations['getAiUsage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/search': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Search */
    get: operations['search'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/manuscript': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Manuscript */
    get: operations['getManuscript'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/backfill': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Backfill */
    post: operations['backfill'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/jobs/{jobId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Job */
    get: operations['getJob'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/source/chapters': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Chapters */
    get: operations['listChapters'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/source/chapters/{n}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Chapter */
    get: operations['getChapter'];
    put?: never;
    post?: never;
    /** Delete Chapter */
    delete: operations['deleteChapter'];
    options?: never;
    head?: never;
    /** Update Chapter */
    patch: operations['updateChapter'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/proposals': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Proposals */
    get: operations['listProposals'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/proposals/{proposalId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Proposal */
    get: operations['getProposal'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Proposal */
    patch: operations['updateProposal'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/proposals/{proposalId}/apply': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Apply Proposal */
    post: operations['applyProposal'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/proposals/{proposalId}/revert': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Revert Proposal */
    post: operations['revertProposal'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/proposals/{proposalId}/discard': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Discard Proposal */
    post: operations['discardProposal'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/changes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Changes */
    get: operations['listChanges'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/changes/rollback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Rollback */
    post: operations['rollback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Sessions */
    get: operations['listSessions'];
    put?: never;
    /** Create Session */
    post: operations['createSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Session */
    get: operations['getSession'];
    put?: never;
    post?: never;
    /** Delete Session */
    delete: operations['deleteSession'];
    options?: never;
    head?: never;
    /** Update Session */
    patch: operations['updateSession'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/messages': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Messages */
    get: operations['listMessages'];
    put?: never;
    /** Turn */
    post: operations['turn'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/model': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Session Model */
    patch: operations['updateSessionModel'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/archive': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Archive Session */
    post: operations['archiveSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/unarchive': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Unarchive Session */
    post: operations['unarchiveSession'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/premise/enhance': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Enhance Premise */
    post: operations['enhancePremise'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/bible/audit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Audit Bible */
    post: operations['auditBible'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/volumes/{volumeKey}/arcs/plan': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Plan Arcs */
    post: operations['planArcs'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/context/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Preview Context */
    get: operations['previewContext'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Entities */
    get: operations['listEntities'];
    put?: never;
    /** Create Entity */
    post: operations['createEntity'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Entity */
    get: operations['getEntity'];
    put?: never;
    post?: never;
    /** Delete Entity */
    delete: operations['deleteEntity'];
    options?: never;
    head?: never;
    /** Update Entity */
    patch: operations['updateEntity'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}/image': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Upload Image */
    post: operations['uploadImage'];
    /** Delete Image */
    delete: operations['deleteImage'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/volumes/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Approve Volumes */
    post: operations['approveVolumes'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/volumes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Volumes */
    get: operations['listVolumes'];
    put?: never;
    /** Create Volume */
    post: operations['createVolume'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/volumes/{volumeKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Volume */
    get: operations['getVolume'];
    put?: never;
    post?: never;
    /** Delete Volume */
    delete: operations['deleteVolume'];
    options?: never;
    head?: never;
    /** Update Volume */
    patch: operations['updateVolume'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/volumes/{volumeKey}/arcs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Arcs */
    get: operations['listArcs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/volumes/{volumeKey}/arcs/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Approve Arcs */
    post: operations['approveArcs'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/arcs/{arcKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Arc */
    get: operations['getArc'];
    /** Upsert Arc */
    put: operations['upsertArc'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/bible': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Bible Docs */
    get: operations['listBibleDocs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/bible/{section}/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Bible Doc */
    get: operations['getBibleDoc'];
    /** Upsert Bible Doc */
    put: operations['upsertBibleDoc'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/images/{projectId}/{filename}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Serve */
    get: operations['serve'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}/illustration': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start */
    post: operations['start'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}/illustration/refine': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Refine */
    post: operations['refine'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}/illustration/save': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Save */
    post: operations['save'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}/illustration/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel */
    post: operations['cancel'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/ingest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Ingest */
    post: operations['ingest'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/extract': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Extract */
    post: operations['extract'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/consolidate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Consolidate */
    post: operations['consolidate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/assets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Assets */
    get: operations['assets'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/skeleton': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Skeleton */
    post: operations['skeleton'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/resume': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Resume */
    post: operations['resume'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Projects */
    get: operations['listProjects'];
    put?: never;
    /** Create Project */
    post: operations['createProject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Project */
    get: operations['getProject'];
    put?: never;
    post?: never;
    /** Delete Project */
    delete: operations['deleteProject'];
    options?: never;
    head?: never;
    /** Update Project */
    patch: operations['updateProject'];
    trace?: never;
  };
  '/api/v1/projects/{projectId}/status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Project Status */
    get: operations['getProjectStatus'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/clone': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Clone Project */
    post: operations['cloneProject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reset': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Reset Project */
    post: operations['resetProject'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/cost': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Project Cost */
    get: operations['getProjectCost'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/cover': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Upload Cover */
    post: operations['uploadCover'];
    /** Delete Cover */
    delete: operations['deleteCover'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    AiModelsResponse: {
      profile: string;
      models: components['schemas']['AiModelOption'][];
      defaults: components['schemas']['AiRoleDefault'][];
    };
    AiModelOption: {
      id: string;
      provider: string;
      label: string;
      /** @enum {string} */
      kind: 'llm' | 'embedding' | 'image';
      enabled: boolean;
      contextWindow?: number;
      inputPricePerMToken?: number;
      outputPricePerMToken?: number;
      supportsTools?: boolean;
      supportsStructuredOutput?: boolean;
    };
    AiRoleDefault: {
      role: string;
      provider: string;
      model: string;
    };
    DevErrorResponseDto: {
      code: string;
      type: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
      stack?: string;
    };
    ErrorFieldDto: {
      field: string;
      msg: string;
    };
    SeedFromBriefBody: {
      brief: string;
      force?: boolean;
    };
    WorkflowRunResponse: {
      runId: string;
      outcome: string;
      status: string;
    };
    PlanBody: {
      volumeCount: number;
      chaptersPerVolume: number;
      skeleton?: string;
    };
    PlanResponse: {
      volumes: components['schemas']['PlanVolumeItem'][];
    };
    PlanVolumeItem: {
      id: string;
      projectId: string;
      volumeKey: string;
      ordinal: number;
      title?: null | string;
      objective?: null | string;
      conflict?: null | string;
      payoff?: null | string;
      startChapter?: null | number;
      endChapter?: null | number;
      status: components['schemas']['PlanStatus'];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    PlanStatus: 'draft' | 'approved' | 'source';
    ApprovePlanResponse: {
      volumesApproved: number;
      approved: boolean;
    };
    OutlineBody: {
      count?: number;
      start?: number;
      context?: string;
    };
    OutlineResponse: {
      briefs: components['schemas']['BriefResponse'][];
    };
    BriefResponse: {
      id: string;
      projectId: string;
      chapter: number;
      volumeKey?: null | string;
      title?: null | string;
      body: string;
      contextRefs?: null | string[];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    OutlineArcBody: {
      context?: string;
    };
    ListBriefSummaryResponse: {
      items: components['schemas']['BriefSummaryResponse'][];
    };
    BriefSummaryResponse: {
      chapter: number;
      volumeKey?: null | string;
      arcKey?: null | string;
      title?: null | string;
      staleReason?: null | string;
      /** Format: date-time */
      updatedAt: string;
    };
    UpdateBriefBody: {
      title?: string;
      body: string;
    };
    GenerateBody: {
      limit?: number;
      autoFix?: boolean;
      maxFixes?: number;
      guidance?: string;
    };
    JobEnqueueResponse: {
      jobId: string;
      kind: string;
      status: string;
      target: string;
    };
    ListGenerationJobResponse: {
      items: components['schemas']['GenerationJobItem'][];
    };
    GenerationJobItem: {
      id: string;
      projectId: string;
      kind: components['schemas']['JobKind'];
      target: string;
      status: components['schemas']['JobStatus'];
      attempts: number;
      lastError?: null | string;
      payload?: null | {
        [key: string]: unknown;
      };
      progress?: null | {
        [key: string]: unknown;
      };
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    JobKind: 'ingest' | 'extract' | 'generate' | 'finalize' | 'backfill' | 'resume';
    /** @enum {string} */
    JobStatus: 'pending' | 'in_progress' | 'done' | 'failed';
    ListDraftResponse: {
      items: components['schemas']['DraftResponse'][];
    };
    DraftResponse: {
      id: string;
      projectId: string;
      chapter: number;
      title?: null | string;
      status: components['schemas']['DraftStatus'];
      revision: number;
      summary?: null | string;
      body?: null | string;
      state?: null | {
        [key: string]: unknown;
      };
      volumeKey?: null | string;
      reviewStatus: components['schemas']['DraftReviewStatus'];
      generator: string;
      judge?: null | string;
      judgeNote?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    DraftStatus: 'draft' | 'final';
    /** @enum {string} */
    DraftReviewStatus: 'generating' | 'needs_review' | 'contradiction' | 'approved' | 'final';
    UpdateDraftBody: {
      title?: string;
      body: string;
      summary?: string;
      state?: {
        [key: string]: unknown;
      };
    };
    ReviseDraftBody: {
      note: string;
    };
    JudgeResponse: {
      verdict: string;
      findings: components['schemas']['JudgeFindingResponse'][];
    };
    JudgeFindingResponse: {
      severity: string;
      text: string;
    };
    FeedbackBody: {
      note: string;
      disposition?: components['schemas']['UserFeedbackDisposition'];
    };
    /** @enum {string} */
    UserFeedbackDisposition: 'revision_requested' | 'approved' | 'rejected' | 'comment';
    UserFeedbackResponse: {
      id: string;
      projectId: string;
      artifactType: string;
      artifactRef: string;
      disposition: components['schemas']['UserFeedbackDisposition'];
      note?: null | string;
      /** Format: date-time */
      createdAt: string;
    };
    ApproveDraftBody: {
      reviewerId?: string;
      idempotencyKey?: string;
    };
    ListDraftRevisionResponse: {
      items: components['schemas']['DraftRevisionResponse'][];
    };
    DraftRevisionResponse: {
      id: string;
      draftId: string;
      revision: number;
      source: components['schemas']['DraftRevisionSource'];
      body: string;
      summary?: null | string;
      state?: null | {
        [key: string]: unknown;
      };
      runId?: null | string;
      /** Format: date-time */
      createdAt: string;
    };
    /** @enum {string} */
    DraftRevisionSource: 'generated' | 'patched' | 'rewritten' | 'revised' | 'imported' | 'hand_edited' | 'chat_edited';
    MarkdownResponse: {
      markdown: string;
    };
    ImportDraftBody: {
      prose: string;
      title?: string;
      summary?: string;
    };
    FinalizeBody: {
      chapter?: number;
    };
    GenerateGrokBody: {
      guidance?: string;
    };
    ContinuityProposalResponse: {
      id: string;
      projectId: string;
      chapter: number;
      status: string;
      proposal: {
        [key: string]: unknown;
      };
      model?: null | string;
      /** Format: date-time */
      appliedAt?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ProposalResponse: {
      id: string;
      projectId: string;
      sessionId?: null | string;
      messageId?: null | string;
      scopeType: components['schemas']['ChatScope'];
      scopeRef?: null | string;
      kind: components['schemas']['RefinementKind'];
      status: components['schemas']['RefinementProposalStatus'];
      summary?: null | string;
      changeSet: components['schemas']['ChangeOpItem'][];
      baseline: {
        [key: string]: unknown;
      };
      autoApplied: boolean;
      revertible: boolean;
      opResults?: null | components['schemas']['OpResultItem'][];
      model?: null | string;
      runId?: null | string;
      /** Format: date-time */
      appliedAt?: null | string;
      /** Format: date-time */
      revertedAt?: null | string;
      error?: null | {
        [key: string]: unknown;
      };
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ChatScope: 'project' | 'novel' | 'bible_document' | 'volume_plan' | 'volume' | 'arc_plan' | 'arc' | 'brief';
    /** @enum {string} */
    RefinementKind: 'chat' | 'hub' | 'premise_enhance' | 'bible_audit' | 'arc_plan' | 'chapter_extract';
    /** @enum {string} */
    RefinementProposalStatus: 'pending' | 'applied' | 'discarded' | 'superseded' | 'conflicted' | 'reverted';
    ChangeOpItem: {
      op: string;
    } & {
      [key: string]: unknown;
    };
    OpResultItem: {
      index: number;
      status: string;
      error?: string;
      result?: {
        [key: string]: unknown;
      };
    } & {
      [key: string]: unknown;
    };
    UpdateContinuityBody: {
      proposal: {
        [key: string]: unknown;
      };
    };
    ChapterReviewResponse: {
      disposition: string;
      note?: null | string;
      findings?: null | components['schemas']['JudgeFindingResponse'][];
    };
    ReviewQueueResponse: {
      drafts: components['schemas']['DraftResponse'][];
      proposals: components['schemas']['ContinuityProposalResponse'][];
    };
    ListWorkflowRunResponse: {
      items: components['schemas']['WorkflowRunDetailResponse'][];
    };
    WorkflowRunDetailResponse: {
      id: string;
      projectId: string;
      jobId?: null | string;
      graph: string;
      target: string;
      status: components['schemas']['WorkflowRunStatus'];
      outcome?: null | string;
      input?: null | {
        [key: string]: unknown;
      };
      error?: null | {
        [key: string]: unknown;
      };
      nodeTrace?: null | string[];
      modelCalls?: components['schemas']['RunModelCallResponse'][];
      /** Format: date-time */
      startedAt: string;
      /** Format: date-time */
      endedAt?: null | string;
    };
    /** @enum {string} */
    WorkflowRunStatus: 'running' | 'completed' | 'awaiting_review' | 'failed' | 'cancelled';
    RunModelCallResponse: {
      id: string;
      node?: null | string;
      role: string;
      provider: string;
      model: string;
      promptKey: string;
      status: string;
      inputTokens?: null | number;
      outputTokens?: null | number;
      latencyMs?: null | number;
      costUsd?: null | string;
      attempt: number;
      /** Format: date-time */
      createdAt: string;
    };
    AiUsageResponse: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: number;
      callsPerRole: components['schemas']['RoleCallCounts'];
      roles: components['schemas']['RoleUsage'][];
    };
    RoleCallCounts: {
      [key: string]: number;
    };
    RoleUsage: {
      role: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    };
    SearchResponse: {
      hits: components['schemas']['SearchHitResponse'][];
    };
    SearchHitResponse: {
      text: string;
      score: number;
      metadata: {
        [key: string]: unknown;
      };
    };
    JobResponse: {
      id: string;
      projectId: string;
      kind: components['schemas']['JobKind'];
      target: string;
      status: components['schemas']['JobStatus'];
      attempts: number;
      lastError?: null | string;
      payload?: null | {
        [key: string]: unknown;
      };
      progress?: null | {
        [key: string]: unknown;
      };
      /** Format: date-time */
      nextAttemptAt?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    SortOrder: 'asc' | 'desc';
    /** @enum {string} */
    SortByTime: 'createdAt' | 'updatedAt';
    /** @enum {string} */
    ChapterStatus: 'done' | 'failed' | 'skipped';
    ListChapterResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ChapterListResponse'][];
    };
    ChapterListResponse: {
      id: string;
      projectId: string;
      number: number;
      title?: null | string;
      url?: null | string;
      wordCount?: null | number;
      status: components['schemas']['ChapterStatus'];
      generator?: null | string;
      continuityApplied: boolean;
      /** Format: date-time */
      scrapedAt?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ChapterResponse: {
      id: string;
      projectId: string;
      number: number;
      title?: null | string;
      url?: null | string;
      wordCount?: null | number;
      status: components['schemas']['ChapterStatus'];
      generator?: null | string;
      continuityApplied: boolean;
      /** Format: date-time */
      scrapedAt?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
      content?: null | string;
      summary?: null | string;
      note?: null | string;
    };
    UpdateChapterBody: {
      title?: string;
      content?: string;
    };
    ListProposalResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ProposalResponse'][];
    };
    UpdateProposalBody: {
      changeSet: components['schemas']['ChangeOpItem'][];
    };
    ApplyProposalBody: {
      opIndexes?: number[];
    };
    ApplyProposalResponse: {
      proposal: components['schemas']['ProposalResponse'];
      applied: components['schemas']['AppliedArtifactItem'][];
      staleMarked: string[];
      opResults: components['schemas']['OpResultItem'][];
    };
    AppliedArtifactItem: {
      artifactRef: string;
      newRevision?: null | number;
    };
    RevertProposalResponse: {
      proposal: components['schemas']['ProposalResponse'];
      reverted: components['schemas']['AppliedArtifactItem'][];
      staleMarked: string[];
    };
    ListChangesResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ChangeItemResponse'][];
    };
    ChangeItemResponse: {
      id: string;
      sessionId?: null | string;
      kind: components['schemas']['RefinementKind'];
      scopeType: components['schemas']['ChatScope'];
      status: components['schemas']['RefinementProposalStatus'];
      summary?: null | string;
      autoApplied: boolean;
      refs: string[];
      revertible: boolean;
      opResults?: null | components['schemas']['OpResultItem'][];
      /** Format: date-time */
      appliedAt?: null | string;
      /** Format: date-time */
      revertedAt?: null | string;
    };
    RollbackBody: {
      afterProposalId: string;
    };
    RollbackResponse: {
      reverted: components['schemas']['RolledBackItem'][];
      skipped: string[];
      stoppedAt?: string;
      conflict?: {
        [key: string]: unknown;
      };
    };
    RolledBackItem: {
      proposalId: string;
      artifacts: components['schemas']['AppliedArtifactItem'][];
    };
    CreateChatSessionBody: {
      scopeType: components['schemas']['ChatScope'];
      scopeRef?: string;
      title?: string;
      mode?: components['schemas']['ChatMode'];
    };
    /** @enum {string} */
    ChatMode: 'manual' | 'auto';
    ChatSessionResponse: {
      id: string;
      projectId: string;
      scopeType: components['schemas']['ChatScope'];
      scopeRef?: null | string;
      title?: null | string;
      status: components['schemas']['ChatSessionStatus'];
      mode: components['schemas']['ChatMode'];
      modelProvider?: null | string;
      modelId?: null | string;
      summary?: null | string;
      summaryThroughOrdinal: number;
      /** Format: date-time */
      lastTurnAt?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ChatSessionStatus: 'active' | 'archived';
    ListChatSessionResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ChatSessionResponse'][];
    };
    ListChatMessagesResponse: {
      messages: components['schemas']['ChatMessageResponse'][];
    };
    ChatMessageResponse: {
      id: string;
      sessionId: string;
      ordinal: number;
      role: string;
      content: string;
      proposalId?: null | string;
      runId?: null | string;
      modelProvider?: null | string;
      modelId?: null | string;
      /** Format: date-time */
      createdAt: string;
    };
    ChatTurnBody: {
      content: string;
    };
    ChatTurnResponse: {
      userMessage: components['schemas']['ChatMessageResponse'];
      assistantMessage: components['schemas']['ChatMessageResponse'];
      proposal?: components['schemas']['ProposalResponse'];
      /** @description present when the session runs in auto mode and this turn applied its change-set */
      applied?: components['schemas']['TurnAppliedResult'];
      /** @description why an auto-mode change-set was NOT applied (conflict, finalize gating, action failure) */
      applyNote?: string;
      runId: string;
    };
    TurnAppliedResult: {
      applied: components['schemas']['AppliedArtifactItem'][];
      staleMarked: string[];
      opResults: components['schemas']['OpResultItem'][];
    };
    UpdateChatSessionBody: {
      mode?: components['schemas']['ChatMode'];
      title?: string;
    };
    UpdateSessionModelBody: {
      provider?: string | null;
      model?: string | null;
    };
    EnhancePremiseBody: {
      /** @description rough overview to enhance; falls back to the project brief/premise when omitted */
      overview?: string;
    };
    EnhancePremiseResponse: {
      proposal: components['schemas']['ProposalResponse'];
      rationale: components['schemas']['PremiseRationaleResponse'];
      runId: string;
    };
    PremiseRationaleResponse: {
      enhancedPremise: string;
      hook: string;
      stakes: string;
      protagonistDrive: string;
      progressionSystem: string;
      serializationNotes: string;
      genre: string;
      themes: string[];
    };
    AuditBibleResponse: {
      proposal?: components['schemas']['ProposalResponse'];
      findings: components['schemas']['AuditFindingResponse'][];
      runId: string;
    };
    AuditFindingResponse: {
      docRef: string;
      action: string;
      finding: string;
    };
    PlanArcsBody: {
      arcCount?: number;
      guidance?: string;
    };
    PlanArcsResponse: {
      proposal: components['schemas']['ProposalResponse'];
      arcs: components['schemas']['PlannedArcItem'][];
      runId: string;
    };
    PlannedArcItem: {
      arcKey: string;
      title: string;
      objective: string;
      escalation: string;
      payoff: string;
      hook: string;
      chapterStart: number;
      chapterEnd: number;
      cast: string[];
      body: string;
      ideas: string[];
    };
    ContextPreviewResponse: {
      purpose: string;
      budgetTokens: number;
      usedTokens: number;
      sections: components['schemas']['ContextSectionPreview'][];
      unresolvedRefs: string[];
      renderedStable: string;
      renderedVolatile: string;
      rendered: string;
    };
    ContextSectionPreview: {
      key: string;
      tier: string;
      segment: string;
      tokens: number;
      truncated: boolean;
    };
    CreateEntityBody: {
      entityKey: string;
      type: components['schemas']['EntityType'];
      name: string;
      significance?: components['schemas']['EntitySignificance'];
      status?: string;
      origin?: components['schemas']['EntityOrigin'];
      notes?: string;
      motivation?: string;
      body?: string;
      aliases?: string[];
    };
    /** @enum {string} */
    EntityType: 'character' | 'faction' | 'location' | 'power_rule' | 'item' | 'concept';
    /** @enum {string} */
    EntitySignificance: 'major' | 'minor';
    /** @enum {string} */
    EntityOrigin: 'extracted' | 'seeded' | 'generated';
    EntityResponse: {
      id: string;
      projectId: string;
      entityKey: string;
      type: components['schemas']['EntityType'];
      name: string;
      /** @enum {string} */
      significance?: 'major' | 'minor';
      status?: null | string;
      origin?: null | string;
      firstSeenChapter?: null | number;
      notes?: null | string;
      motivation?: null | string;
      body?: null | string;
      imagePath?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ListEntityResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['EntityResponse'][];
    };
    UpdateEntityBody: {
      name?: string;
      significance?: components['schemas']['EntitySignificance'];
      status?: string;
      origin?: components['schemas']['EntityOrigin'];
      notes?: string;
      motivation?: string;
      body?: string;
      aliases?: string[];
    };
    UploadImageBody: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      image: string;
    };
    ApprovePlanResponse1: {
      volumesApproved: number;
      approved: boolean;
    };
    CreateVolumeBody: {
      volumeKey: string;
      ordinal?: number;
      title?: string;
      objective?: string;
      conflict?: string;
      payoff?: string;
      startChapter?: number;
      endChapter?: number;
      targetChapterCount?: number;
      status?: components['schemas']['PlanStatus'];
      cast?: string[];
      body?: string;
    };
    VolumeResponse: {
      id: string;
      projectId: string;
      volumeKey: string;
      ordinal: number;
      title?: null | string;
      objective?: null | string;
      conflict?: null | string;
      payoff?: null | string;
      startChapter?: null | number;
      endChapter?: null | number;
      targetChapterCount?: null | number;
      revision: number;
      staleReason?: null | string;
      status: components['schemas']['PlanStatus'];
      cast?: null | string[];
      body?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ListVolumeResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['VolumeResponse'][];
    };
    UpdateVolumeBody: {
      ordinal?: number;
      title?: string;
      objective?: string;
      conflict?: string;
      payoff?: string;
      startChapter?: number;
      endChapter?: number;
      targetChapterCount?: number;
      status?: components['schemas']['PlanStatus'];
      cast?: string[];
      body?: string;
    };
    ListArcResponse: {
      arcs: components['schemas']['ArcResponse'][];
    };
    ArcResponse: {
      id: string;
      projectId: string;
      arcKey: string;
      volumeKey: string;
      ordinal: number;
      title?: null | string;
      objective?: null | string;
      escalation?: null | string;
      payoff?: null | string;
      hook?: null | string;
      chapterStart?: null | number;
      chapterEnd?: null | number;
      cast?: null | string[];
      status: components['schemas']['PlanStatus'];
      body?: null | string;
      revision: number;
      staleReason?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ApproveArcsResponse: {
      arcsApproved: number;
      approved: boolean;
    };
    UpsertArcBody: {
      volumeKey: string;
      ordinal?: number;
      title?: string;
      objective?: string;
      escalation?: string;
      payoff?: string;
      hook?: string;
      chapterStart?: number;
      chapterEnd?: number;
      cast?: string[];
      body?: string;
    };
    ListBibleDocResponse: {
      docs: components['schemas']['BibleDocListItem'][];
    };
    BibleDocListItem: {
      section: components['schemas']['BibleSection'];
      slug: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    BibleSection: 'project' | 'world' | 'power' | 'plot' | 'story_state' | 'ai' | 'lore';
    BibleDocResponse: {
      id: string;
      projectId: string;
      section: components['schemas']['BibleSection'];
      slug: string;
      frontmatter?: null | {
        [key: string]: unknown;
      };
      body?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    UpsertBibleDocBody: {
      frontmatter?: {
        [key: string]: unknown;
      };
      body?: string;
    };
    StartIllustrationBody: {
      instruction?: string;
      noChat?: boolean;
    };
    StartIllustrationResponse: {
      sessionId: string;
      previewUrl: string;
    };
    RefineIllustrationBody: {
      sessionId: string;
      instruction: string;
    };
    RefineIllustrationResponse: {
      previewUrl: string;
    };
    SaveIllustrationBody: {
      sessionId: string;
    };
    SaveIllustrationResponse: {
      saved: boolean;
      imagePath: string;
    };
    CancelIllustrationBody: {
      sessionId: string;
    };
    CancelIllustrationResponse: {
      cancelled: boolean;
    };
    IngestBody: {
      limit?: number;
      delayMs?: number;
    };
    JobEnqueueResponse1: {
      jobId: string;
      kind: string;
      status: string;
      target: string;
    };
    ExtractBody: {
      limit?: number;
      rearm?: boolean;
    };
    ConsolidateResponse: {
      significanceUpdated: number;
      relationshipsPromoted: number;
    };
    AssetsResponse: {
      markdown: string;
    };
    SkeletonResponse: {
      characterArcs: {
        [key: string]: unknown;
      };
      powerCurve: string;
    };
    ResumeResponse: {
      jobId: string;
    };
    CreateProjectBody: {
      name: string;
      kind: components['schemas']['ProjectKind'];
      url?: string;
      title?: string;
      contentMode?: components['schemas']['ContentMode'];
    };
    /** @enum {string} */
    ProjectKind: 'source' | 'new_novel';
    /** @enum {string} */
    ContentMode: 'standard' | 'grok_only';
    ProjectResponse: {
      id: string;
      name: string;
      kind: components['schemas']['ProjectKind'];
      title?: null | string;
      coverImagePath?: null | string;
      contentMode: components['schemas']['ContentMode'];
      config?: components['schemas']['ProjectConfig'];
      brief?: null | string;
      sourceUrl?: null | string;
      scrapeComplete: boolean;
      storyCurrentChapter?: null | number;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ProjectConfig: {
      models?: components['schemas']['ProjectModelOverrides'];
    };
    ProjectModelOverrides: {
      extraction?: components['schemas']['ProjectModelRef'];
      generation?: components['schemas']['ProjectModelRef'];
      judge?: components['schemas']['ProjectModelRef'];
      fix?: components['schemas']['ProjectModelRef'];
      outline?: components['schemas']['ProjectModelRef'];
      revision?: components['schemas']['ProjectModelRef'];
      title?: components['schemas']['ProjectModelRef'];
      continuity?: components['schemas']['ProjectModelRef'];
      validation?: components['schemas']['ProjectModelRef'];
      review?: components['schemas']['ProjectModelRef'];
      plan?: components['schemas']['ProjectModelRef'];
      skeleton?: components['schemas']['ProjectModelRef'];
      bible?: components['schemas']['ProjectModelRef'];
      premise?: components['schemas']['ProjectModelRef'];
      audit?: components['schemas']['ProjectModelRef'];
      chat?: components['schemas']['ProjectModelRef'];
      compact?: components['schemas']['ProjectModelRef'];
      arc?: components['schemas']['ProjectModelRef'];
      embedding?: components['schemas']['ProjectModelRef'];
      image?: components['schemas']['ProjectModelRef'];
    };
    ProjectModelRef: {
      provider: string;
      model: string;
    };
    ListProjectResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ProjectResponse'][];
    };
    ProjectStatusResponse: {
      kind: components['schemas']['ProjectKind'];
      chaptersTotal?: number;
      chaptersExtracted?: number;
      draftsTotal?: number;
      draftsFinal?: number;
      planApproved?: boolean;
      volumesTotal?: number;
    };
    UpdateProjectBody: {
      title?: string;
      config?: components['schemas']['ProjectConfig'];
      contentMode?: components['schemas']['ContentMode'];
      brief?: string;
    };
    CloneProjectBody: {
      name: string;
      config?: components['schemas']['ProjectConfig'];
      contentMode?: components['schemas']['ContentMode'];
      resetDerived?: boolean;
    };
    ResetBody: {
      /** @enum {string} */
      stage: 'extract' | 'plan' | 'generate' | 'all';
    };
    ResetResponse: {
      stage: string;
      tablesCleared: string[];
    };
    CostResponse: {
      estimate: null | string;
      message: string;
    };
    UploadImageBody1: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      image: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  listModels: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AiModelsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  seedFromBrief: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['SeedFromBriefBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WorkflowRunResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  plan: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PlanBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PlanResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  approvePlan: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ApprovePlanResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  outline: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['OutlineBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OutlineResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  outlineArc: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        arcKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['OutlineArcBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OutlineResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listBriefs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListBriefSummaryResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getBrief: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number | string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BriefResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateBrief: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateBriefBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BriefResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  generate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['GenerateBody'];
      };
    };
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobEnqueueResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listJobs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListGenerationJobResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listDrafts: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListDraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number | string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateDraftBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  reviseDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ReviseDraftBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  judgeDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JudgeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  feedbackDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['FeedbackBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserFeedbackResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  approveDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ApproveDraftBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listRevisions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number | string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListDraftRevisionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getRevision: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number | string;
        r: number | string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftRevisionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getDraftPrompt: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number | string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MarkdownResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  importDraft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ImportDraftBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  finalize: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['FinalizeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WorkflowRunResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  generateGrok: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['GenerateGrokBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  proposeContinuity: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContinuityProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  extractToBible: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getContinuityProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number | string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContinuityProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateContinuityProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateContinuityBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContinuityProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  applyContinuityProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContinuityProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  discardContinuityProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContinuityProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  validate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WorkflowRunResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  reviewChapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterReviewResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getReviewQueue: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReviewQueueResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listRuns: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListWorkflowRunResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getRun: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        runId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WorkflowRunDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getAiUsage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AiUsageResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  search: {
    parameters: {
      query: {
        q: string;
        index?: string;
        k?: number | string;
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SearchResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getManuscript: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MarkdownResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  backfill: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobEnqueueResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getJob: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        jobId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listChapters: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        status?: components['schemas']['ChapterStatus'];
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListChapterResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getChapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number | string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteChapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateChapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateChapterBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listProposals: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        status?: components['schemas']['RefinementProposalStatus'];
        kind?: components['schemas']['RefinementKind'];
        scopeType?: components['schemas']['ChatScope'];
        sessionId?: string;
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateProposalBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  applyProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ApplyProposalBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ApplyProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  revertProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RevertProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  discardProposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProposalResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listChanges: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListChangesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  rollback: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RollbackBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RollbackResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listSessions: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        scopeType?: components['schemas']['ChatScope'];
        status?: components['schemas']['ChatSessionStatus'];
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  createSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateChatSessionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateChatSessionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listMessages: {
    parameters: {
      query?: {
        /** @description return messages with ordinal strictly below this value */
        before?: number | string;
        limit?: number | string;
      };
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListChatMessagesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  turn: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ChatTurnBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatTurnResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateSessionModel: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateSessionModelBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  archiveSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  unarchiveSession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatSessionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  enhancePremise: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['EnhancePremiseBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EnhancePremiseResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  auditBible: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuditBibleResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  planArcs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['PlanArcsBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PlanArcsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  previewContext: {
    parameters: {
      query: {
        purpose: 'generation' | 'outline' | 'chat' | 'arc_plan' | 'premise' | 'audit';
        /** @description required for generation/outline */
        chapter?: number | string;
        /** @description chat scope type (novel, volume, arc, brief, …) */
        scopeType?: string;
        /** @description chat scope ref (volume:v1, arc:a1, chapter:3, doc:section/slug) */
        scopeRef?: string;
        /** @description volume for arc_plan previews */
        volumeKey?: string;
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContextPreviewResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listEntities: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        type?: components['schemas']['EntityType'];
        origin?: components['schemas']['EntityOrigin'];
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListEntityResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  createEntity: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateEntityBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EntityResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getEntity: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EntityResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteEntity: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateEntity: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateEntityBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EntityResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  uploadImage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UploadImageBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EntityResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteImage: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EntityResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  approveVolumes: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ApprovePlanResponse1'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listVolumes: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        status?: components['schemas']['PlanStatus'];
      };
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListVolumeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  createVolume: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateVolumeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VolumeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getVolume: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VolumeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteVolume: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateVolume: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateVolumeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VolumeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listArcs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListArcResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  approveArcs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ApproveArcsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getArc: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        arcKey: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ArcResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  upsertArc: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        arcKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpsertArcBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ArcResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listBibleDocs: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListBibleDocResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getBibleDoc: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        section: components['schemas']['BibleSection'];
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BibleDocResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  upsertBibleDoc: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        section: components['schemas']['BibleSection'];
        slug: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpsertBibleDocBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BibleDocResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  serve: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        filename: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  start: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['StartIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StartIllustrationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  refine: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RefineIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RefineIllustrationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  save: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['SaveIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaveIllustrationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  cancel: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CancelIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CancelIllustrationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  ingest: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['IngestBody'];
      };
    };
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobEnqueueResponse1'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  extract: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ExtractBody'];
      };
    };
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['JobEnqueueResponse1'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  consolidate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConsolidateResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  assets: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AssetsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  skeleton: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SkeletonResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  resume: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ResumeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  listProjects: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        kind?: components['schemas']['ProjectKind'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListProjectResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  createProject: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateProjectBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  updateProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateProjectBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getProjectStatus: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  cloneProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CloneProjectBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  resetProject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ResetBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ResetResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  getProjectCost: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CostResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  uploadCover: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UploadImageBody1'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  deleteCover: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
}
export type AiModelsResponse = components['schemas']['AiModelsResponse'];
export type AiModelOption = components['schemas']['AiModelOption'];
export type AiRoleDefault = components['schemas']['AiRoleDefault'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type SeedFromBriefBody = components['schemas']['SeedFromBriefBody'];
export type WorkflowRunResponse = components['schemas']['WorkflowRunResponse'];
export type PlanBody = components['schemas']['PlanBody'];
export type PlanResponse = components['schemas']['PlanResponse'];
export type PlanVolumeItem = components['schemas']['PlanVolumeItem'];
export type PlanStatus = components['schemas']['PlanStatus'];
export type ApprovePlanResponse = components['schemas']['ApprovePlanResponse'];
export type OutlineBody = components['schemas']['OutlineBody'];
export type OutlineResponse = components['schemas']['OutlineResponse'];
export type BriefResponse = components['schemas']['BriefResponse'];
export type OutlineArcBody = components['schemas']['OutlineArcBody'];
export type ListBriefSummaryResponse = components['schemas']['ListBriefSummaryResponse'];
export type BriefSummaryResponse = components['schemas']['BriefSummaryResponse'];
export type UpdateBriefBody = components['schemas']['UpdateBriefBody'];
export type GenerateBody = components['schemas']['GenerateBody'];
export type JobEnqueueResponse = components['schemas']['JobEnqueueResponse'];
export type ListGenerationJobResponse = components['schemas']['ListGenerationJobResponse'];
export type GenerationJobItem = components['schemas']['GenerationJobItem'];
export type JobKind = components['schemas']['JobKind'];
export type JobStatus = components['schemas']['JobStatus'];
export type ListDraftResponse = components['schemas']['ListDraftResponse'];
export type DraftResponse = components['schemas']['DraftResponse'];
export type DraftStatus = components['schemas']['DraftStatus'];
export type DraftReviewStatus = components['schemas']['DraftReviewStatus'];
export type UpdateDraftBody = components['schemas']['UpdateDraftBody'];
export type ReviseDraftBody = components['schemas']['ReviseDraftBody'];
export type JudgeResponse = components['schemas']['JudgeResponse'];
export type JudgeFindingResponse = components['schemas']['JudgeFindingResponse'];
export type FeedbackBody = components['schemas']['FeedbackBody'];
export type UserFeedbackDisposition = components['schemas']['UserFeedbackDisposition'];
export type UserFeedbackResponse = components['schemas']['UserFeedbackResponse'];
export type ApproveDraftBody = components['schemas']['ApproveDraftBody'];
export type ListDraftRevisionResponse = components['schemas']['ListDraftRevisionResponse'];
export type DraftRevisionResponse = components['schemas']['DraftRevisionResponse'];
export type DraftRevisionSource = components['schemas']['DraftRevisionSource'];
export type MarkdownResponse = components['schemas']['MarkdownResponse'];
export type ImportDraftBody = components['schemas']['ImportDraftBody'];
export type FinalizeBody = components['schemas']['FinalizeBody'];
export type GenerateGrokBody = components['schemas']['GenerateGrokBody'];
export type ContinuityProposalResponse = components['schemas']['ContinuityProposalResponse'];
export type ProposalResponse = components['schemas']['ProposalResponse'];
export type ChatScope = components['schemas']['ChatScope'];
export type RefinementKind = components['schemas']['RefinementKind'];
export type RefinementProposalStatus = components['schemas']['RefinementProposalStatus'];
export type ChangeOpItem = components['schemas']['ChangeOpItem'];
export type OpResultItem = components['schemas']['OpResultItem'];
export type UpdateContinuityBody = components['schemas']['UpdateContinuityBody'];
export type ChapterReviewResponse = components['schemas']['ChapterReviewResponse'];
export type ReviewQueueResponse = components['schemas']['ReviewQueueResponse'];
export type ListWorkflowRunResponse = components['schemas']['ListWorkflowRunResponse'];
export type WorkflowRunDetailResponse = components['schemas']['WorkflowRunDetailResponse'];
export type WorkflowRunStatus = components['schemas']['WorkflowRunStatus'];
export type RunModelCallResponse = components['schemas']['RunModelCallResponse'];
export type AiUsageResponse = components['schemas']['AiUsageResponse'];
export type RoleCallCounts = components['schemas']['RoleCallCounts'];
export type RoleUsage = components['schemas']['RoleUsage'];
export type SearchResponse = components['schemas']['SearchResponse'];
export type SearchHitResponse = components['schemas']['SearchHitResponse'];
export type JobResponse = components['schemas']['JobResponse'];
export type SortOrder = components['schemas']['SortOrder'];
export type SortByTime = components['schemas']['SortByTime'];
export type ChapterStatus = components['schemas']['ChapterStatus'];
export type ListChapterResponse = components['schemas']['ListChapterResponse'];
export type ChapterListResponse = components['schemas']['ChapterListResponse'];
export type ChapterResponse = components['schemas']['ChapterResponse'];
export type UpdateChapterBody = components['schemas']['UpdateChapterBody'];
export type ListProposalResponse = components['schemas']['ListProposalResponse'];
export type UpdateProposalBody = components['schemas']['UpdateProposalBody'];
export type ApplyProposalBody = components['schemas']['ApplyProposalBody'];
export type ApplyProposalResponse = components['schemas']['ApplyProposalResponse'];
export type AppliedArtifactItem = components['schemas']['AppliedArtifactItem'];
export type RevertProposalResponse = components['schemas']['RevertProposalResponse'];
export type ListChangesResponse = components['schemas']['ListChangesResponse'];
export type ChangeItemResponse = components['schemas']['ChangeItemResponse'];
export type RollbackBody = components['schemas']['RollbackBody'];
export type RollbackResponse = components['schemas']['RollbackResponse'];
export type RolledBackItem = components['schemas']['RolledBackItem'];
export type CreateChatSessionBody = components['schemas']['CreateChatSessionBody'];
export type ChatMode = components['schemas']['ChatMode'];
export type ChatSessionResponse = components['schemas']['ChatSessionResponse'];
export type ChatSessionStatus = components['schemas']['ChatSessionStatus'];
export type ListChatSessionResponse = components['schemas']['ListChatSessionResponse'];
export type ListChatMessagesResponse = components['schemas']['ListChatMessagesResponse'];
export type ChatMessageResponse = components['schemas']['ChatMessageResponse'];
export type ChatTurnBody = components['schemas']['ChatTurnBody'];
export type ChatTurnResponse = components['schemas']['ChatTurnResponse'];
export type TurnAppliedResult = components['schemas']['TurnAppliedResult'];
export type UpdateChatSessionBody = components['schemas']['UpdateChatSessionBody'];
export type UpdateSessionModelBody = components['schemas']['UpdateSessionModelBody'];
export type EnhancePremiseBody = components['schemas']['EnhancePremiseBody'];
export type EnhancePremiseResponse = components['schemas']['EnhancePremiseResponse'];
export type PremiseRationaleResponse = components['schemas']['PremiseRationaleResponse'];
export type AuditBibleResponse = components['schemas']['AuditBibleResponse'];
export type AuditFindingResponse = components['schemas']['AuditFindingResponse'];
export type PlanArcsBody = components['schemas']['PlanArcsBody'];
export type PlanArcsResponse = components['schemas']['PlanArcsResponse'];
export type PlannedArcItem = components['schemas']['PlannedArcItem'];
export type ContextPreviewResponse = components['schemas']['ContextPreviewResponse'];
export type ContextSectionPreview = components['schemas']['ContextSectionPreview'];
export type CreateEntityBody = components['schemas']['CreateEntityBody'];
export type EntityType = components['schemas']['EntityType'];
export type EntitySignificance = components['schemas']['EntitySignificance'];
export type EntityOrigin = components['schemas']['EntityOrigin'];
export type EntityResponse = components['schemas']['EntityResponse'];
export type ListEntityResponse = components['schemas']['ListEntityResponse'];
export type UpdateEntityBody = components['schemas']['UpdateEntityBody'];
export type UploadImageBody = components['schemas']['UploadImageBody'];
export type ApprovePlanResponse1 = components['schemas']['ApprovePlanResponse1'];
export type CreateVolumeBody = components['schemas']['CreateVolumeBody'];
export type VolumeResponse = components['schemas']['VolumeResponse'];
export type ListVolumeResponse = components['schemas']['ListVolumeResponse'];
export type UpdateVolumeBody = components['schemas']['UpdateVolumeBody'];
export type ListArcResponse = components['schemas']['ListArcResponse'];
export type ArcResponse = components['schemas']['ArcResponse'];
export type ApproveArcsResponse = components['schemas']['ApproveArcsResponse'];
export type UpsertArcBody = components['schemas']['UpsertArcBody'];
export type ListBibleDocResponse = components['schemas']['ListBibleDocResponse'];
export type BibleDocListItem = components['schemas']['BibleDocListItem'];
export type BibleSection = components['schemas']['BibleSection'];
export type BibleDocResponse = components['schemas']['BibleDocResponse'];
export type UpsertBibleDocBody = components['schemas']['UpsertBibleDocBody'];
export type StartIllustrationBody = components['schemas']['StartIllustrationBody'];
export type StartIllustrationResponse = components['schemas']['StartIllustrationResponse'];
export type RefineIllustrationBody = components['schemas']['RefineIllustrationBody'];
export type RefineIllustrationResponse = components['schemas']['RefineIllustrationResponse'];
export type SaveIllustrationBody = components['schemas']['SaveIllustrationBody'];
export type SaveIllustrationResponse = components['schemas']['SaveIllustrationResponse'];
export type CancelIllustrationBody = components['schemas']['CancelIllustrationBody'];
export type CancelIllustrationResponse = components['schemas']['CancelIllustrationResponse'];
export type IngestBody = components['schemas']['IngestBody'];
export type JobEnqueueResponse1 = components['schemas']['JobEnqueueResponse1'];
export type ExtractBody = components['schemas']['ExtractBody'];
export type ConsolidateResponse = components['schemas']['ConsolidateResponse'];
export type AssetsResponse = components['schemas']['AssetsResponse'];
export type SkeletonResponse = components['schemas']['SkeletonResponse'];
export type ResumeResponse = components['schemas']['ResumeResponse'];
export type CreateProjectBody = components['schemas']['CreateProjectBody'];
export type ProjectKind = components['schemas']['ProjectKind'];
export type ContentMode = components['schemas']['ContentMode'];
export type ProjectResponse = components['schemas']['ProjectResponse'];
export type ProjectConfig = components['schemas']['ProjectConfig'];
export type ProjectModelOverrides = components['schemas']['ProjectModelOverrides'];
export type ProjectModelRef = components['schemas']['ProjectModelRef'];
export type ListProjectResponse = components['schemas']['ListProjectResponse'];
export type ProjectStatusResponse = components['schemas']['ProjectStatusResponse'];
export type UpdateProjectBody = components['schemas']['UpdateProjectBody'];
export type CloneProjectBody = components['schemas']['CloneProjectBody'];
export type ResetBody = components['schemas']['ResetBody'];
export type ResetResponse = components['schemas']['ResetResponse'];
export type CostResponse = components['schemas']['CostResponse'];
export type UploadImageBody1 = components['schemas']['UploadImageBody1'];
export type ListBriefsPathParams = Exclude<paths['/api/v1/projects/{projectId}/briefs']['get']['parameters']['path'], undefined>;
export type GetBriefPathParams = Exclude<paths['/api/v1/projects/{projectId}/briefs/{n}']['get']['parameters']['path'], undefined>;
export type ListJobsPathParams = Exclude<paths['/api/v1/projects/{projectId}/jobs']['get']['parameters']['path'], undefined>;
export type ListDraftsPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts']['get']['parameters']['path'], undefined>;
export type GetDraftPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}']['get']['parameters']['path'], undefined>;
export type ListRevisionsPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}/revisions']['get']['parameters']['path'], undefined>;
export type GetRevisionPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}/revisions/{r}']['get']['parameters']['path'], undefined>;
export type GetDraftPromptPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}/prompt']['get']['parameters']['path'], undefined>;
export type GetContinuityProposalPathParams = Exclude<paths['/api/v1/projects/{projectId}/chapters/{n}/continuity-proposal']['get']['parameters']['path'], undefined>;
export type GetReviewQueuePathParams = Exclude<paths['/api/v1/projects/{projectId}/review-queue']['get']['parameters']['path'], undefined>;
export type ListRunsPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs']['get']['parameters']['path'], undefined>;
export type GetRunPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs/{runId}']['get']['parameters']['path'], undefined>;
export type GetAiUsagePathParams = Exclude<paths['/api/v1/projects/{projectId}/ai-usage']['get']['parameters']['path'], undefined>;
export type SearchQueryParams = Exclude<paths['/api/v1/projects/{projectId}/search']['get']['parameters']['query'], undefined>;
export type SearchPathParams = Exclude<paths['/api/v1/projects/{projectId}/search']['get']['parameters']['path'], undefined>;
export type GetManuscriptPathParams = Exclude<paths['/api/v1/projects/{projectId}/manuscript']['get']['parameters']['path'], undefined>;
export type GetJobPathParams = Exclude<paths['/api/v1/jobs/{jobId}']['get']['parameters']['path'], undefined>;
export type ListChaptersQueryParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters']['get']['parameters']['query'], undefined>;
export type ListChaptersPathParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters']['get']['parameters']['path'], undefined>;
export type GetChapterPathParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters/{n}']['get']['parameters']['path'], undefined>;
export type ListProposalsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/proposals']['get']['parameters']['query'], undefined>;
export type ListProposalsPathParams = Exclude<paths['/api/v1/projects/{projectId}/proposals']['get']['parameters']['path'], undefined>;
export type GetProposalPathParams = Exclude<paths['/api/v1/projects/{projectId}/proposals/{proposalId}']['get']['parameters']['path'], undefined>;
export type ListChangesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/changes']['get']['parameters']['query'], undefined>;
export type ListChangesPathParams = Exclude<paths['/api/v1/projects/{projectId}/changes']['get']['parameters']['path'], undefined>;
export type ListSessionsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions']['get']['parameters']['query'], undefined>;
export type ListSessionsPathParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions']['get']['parameters']['path'], undefined>;
export type GetSessionPathParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}']['get']['parameters']['path'], undefined>;
export type ListMessagesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/messages']['get']['parameters']['query'], undefined>;
export type ListMessagesPathParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/messages']['get']['parameters']['path'], undefined>;
export type PreviewContextQueryParams = Exclude<paths['/api/v1/projects/{projectId}/context/preview']['get']['parameters']['query'], undefined>;
export type PreviewContextPathParams = Exclude<paths['/api/v1/projects/{projectId}/context/preview']['get']['parameters']['path'], undefined>;
export type ListEntitiesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/entities']['get']['parameters']['query'], undefined>;
export type ListEntitiesPathParams = Exclude<paths['/api/v1/projects/{projectId}/entities']['get']['parameters']['path'], undefined>;
export type GetEntityPathParams = Exclude<paths['/api/v1/projects/{projectId}/entities/{entityKey}']['get']['parameters']['path'], undefined>;
export type ListVolumesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/volumes']['get']['parameters']['query'], undefined>;
export type ListVolumesPathParams = Exclude<paths['/api/v1/projects/{projectId}/volumes']['get']['parameters']['path'], undefined>;
export type GetVolumePathParams = Exclude<paths['/api/v1/projects/{projectId}/volumes/{volumeKey}']['get']['parameters']['path'], undefined>;
export type ListArcsPathParams = Exclude<paths['/api/v1/projects/{projectId}/volumes/{volumeKey}/arcs']['get']['parameters']['path'], undefined>;
export type GetArcPathParams = Exclude<paths['/api/v1/projects/{projectId}/arcs/{arcKey}']['get']['parameters']['path'], undefined>;
export type ListBibleDocsPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible']['get']['parameters']['path'], undefined>;
export type GetBibleDocPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/{section}/{slug}']['get']['parameters']['path'], undefined>;
export type ServePathParams = Exclude<paths['/api/v1/images/{projectId}/{filename}']['get']['parameters']['path'], undefined>;
export type AssetsPathParams = Exclude<paths['/api/v1/projects/{projectId}/assets']['get']['parameters']['path'], undefined>;
export type ListProjectsQueryParams = Exclude<paths['/api/v1/projects']['get']['parameters']['query'], undefined>;
export type GetProjectPathParams = Exclude<paths['/api/v1/projects/{projectId}']['get']['parameters']['path'], undefined>;
export type GetProjectStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/status']['get']['parameters']['path'], undefined>;
export type GetProjectCostPathParams = Exclude<paths['/api/v1/projects/{projectId}/cost']['get']['parameters']['path'], undefined>;
