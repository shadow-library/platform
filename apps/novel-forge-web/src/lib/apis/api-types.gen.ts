export interface paths {
  '/api/auth/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Login */
    get: operations['get_api_auth_login'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Callback */
    get: operations['get_api_auth_callback'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Logout */
    post: operations['post_api_auth_logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/session': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Session */
    get: operations['get_api_auth_session'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/userinfo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Userinfo */
    get: operations['get_api_auth_userinfo'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/organisations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Organisations */
    get: operations['get_api_auth_organisations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/organisation': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Switch Organisation */
    post: operations['post_api_auth_organisation'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/step-up': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Step Up */
    get: operations['get_api_auth_step_up'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ai/models': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Models */
    get: operations['get_api_v1_ai_models'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/export/novel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Export Novel */
    get: operations['get_api_v1_projects_projectId_export_novel'];
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
    post: operations['post_api_v1_projects_projectId_seed_from_brief'];
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
    /** Plan Volumes */
    post: operations['post_api_v1_projects_projectId_plan'];
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
    post: operations['post_api_v1_projects_projectId_approve'];
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
    /** Outline Chapters */
    post: operations['post_api_v1_projects_projectId_outline'];
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
    post: operations['post_api_v1_projects_projectId_arcs_arcKey_outline'];
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
    get: operations['get_api_v1_projects_projectId_briefs'];
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
    get: operations['get_api_v1_projects_projectId_briefs_n'];
    /** Update Brief */
    put: operations['put_api_v1_projects_projectId_briefs_n'];
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
    /** Generate Chapters */
    post: operations['post_api_v1_projects_projectId_generate'];
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
    get: operations['get_api_v1_projects_projectId_jobs'];
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
    get: operations['get_api_v1_projects_projectId_drafts'];
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
    get: operations['get_api_v1_projects_projectId_drafts_n'];
    /** Update Draft */
    put: operations['put_api_v1_projects_projectId_drafts_n'];
    post?: never;
    /** Delete Draft */
    delete: operations['delete_api_v1_projects_projectId_drafts_n'];
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
    post: operations['post_api_v1_projects_projectId_drafts_n_revise'];
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
    post: operations['post_api_v1_projects_projectId_drafts_n_judge'];
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
    post: operations['post_api_v1_projects_projectId_drafts_n_feedback'];
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
    post: operations['post_api_v1_projects_projectId_drafts_n_approve'];
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
    get: operations['get_api_v1_projects_projectId_drafts_n_revisions'];
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
    get: operations['get_api_v1_projects_projectId_drafts_n_revisions_r'];
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
    get: operations['get_api_v1_projects_projectId_drafts_n_prompt'];
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
    post: operations['post_api_v1_projects_projectId_drafts_n_import'];
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
    /** Finalize Chapters */
    post: operations['post_api_v1_projects_projectId_finalize'];
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
    post: operations['post_api_v1_projects_projectId_chapters_n_generate_grok'];
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
    post: operations['post_api_v1_projects_projectId_chapters_n_propose_continuity'];
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
    post: operations['post_api_v1_projects_projectId_chapters_n_extract_to_bible'];
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
    get: operations['get_api_v1_projects_projectId_chapters_n_continuity_proposal'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Continuity Proposal */
    patch: operations['patch_api_v1_projects_projectId_chapters_n_continuity_proposal'];
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
    post: operations['post_api_v1_projects_projectId_chapters_n_continuity_proposal_apply'];
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
    post: operations['post_api_v1_projects_projectId_chapters_n_continuity_proposal_discard'];
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
    /** Validate Continuity */
    post: operations['post_api_v1_projects_projectId_validate'];
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
    post: operations['post_api_v1_projects_projectId_chapters_n_review'];
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
    get: operations['get_api_v1_projects_projectId_review_queue'];
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
    get: operations['get_api_v1_projects_projectId_runs'];
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
    get: operations['get_api_v1_projects_projectId_runs_runId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/runs/{runId}/context': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Run Context */
    get: operations['get_api_v1_projects_projectId_runs_runId_context'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/runs/{runId}/calls/{callId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Run Call */
    get: operations['get_api_v1_projects_projectId_runs_runId_calls_callId'];
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
    get: operations['get_api_v1_projects_projectId_ai_usage'];
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
    /** Search Prose */
    get: operations['get_api_v1_projects_projectId_search'];
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
    get: operations['get_api_v1_projects_projectId_manuscript'];
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
    /** Backfill Indexes */
    post: operations['post_api_v1_projects_projectId_backfill'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/images': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Chapter Images */
    get: operations['get_api_v1_projects_projectId_chapters_n_images'];
    put?: never;
    /** Add Chapter Image */
    post: operations['post_api_v1_projects_projectId_chapters_n_images'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/images/{imageId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove Chapter Image */
    delete: operations['delete_api_v1_projects_projectId_chapters_n_images_imageId'];
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
    get: operations['get_api_v1_jobs_jobId'];
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
    get: operations['get_api_v1_projects_projectId_source_chapters'];
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
    get: operations['get_api_v1_projects_projectId_source_chapters_n'];
    put?: never;
    post?: never;
    /** Delete Chapter */
    delete: operations['delete_api_v1_projects_projectId_source_chapters_n'];
    options?: never;
    head?: never;
    /** Update Chapter */
    patch: operations['patch_api_v1_projects_projectId_source_chapters_n'];
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
    get: operations['get_api_v1_projects_projectId_proposals'];
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
    get: operations['get_api_v1_projects_projectId_proposals_proposalId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Proposal */
    patch: operations['patch_api_v1_projects_projectId_proposals_proposalId'];
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
    post: operations['post_api_v1_projects_projectId_proposals_proposalId_apply'];
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
    post: operations['post_api_v1_projects_projectId_proposals_proposalId_revert'];
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
    post: operations['post_api_v1_projects_projectId_proposals_proposalId_discard'];
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
    get: operations['get_api_v1_projects_projectId_changes'];
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
    /** Rollback Changes */
    post: operations['post_api_v1_projects_projectId_changes_rollback'];
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
    get: operations['get_api_v1_projects_projectId_chat_sessions'];
    put?: never;
    /** Create Session */
    post: operations['post_api_v1_projects_projectId_chat_sessions'];
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
    get: operations['get_api_v1_projects_projectId_chat_sessions_sessionId'];
    put?: never;
    post?: never;
    /** Delete Session */
    delete: operations['delete_api_v1_projects_projectId_chat_sessions_sessionId'];
    options?: never;
    head?: never;
    /** Update Session */
    patch: operations['patch_api_v1_projects_projectId_chat_sessions_sessionId'];
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
    get: operations['get_api_v1_projects_projectId_chat_sessions_sessionId_messages'];
    put?: never;
    /** Create Turn */
    post: operations['post_api_v1_projects_projectId_chat_sessions_sessionId_messages'];
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
    patch: operations['patch_api_v1_projects_projectId_chat_sessions_sessionId_model'];
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
    post: operations['post_api_v1_projects_projectId_chat_sessions_sessionId_archive'];
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
    post: operations['post_api_v1_projects_projectId_chat_sessions_sessionId_unarchive'];
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
    post: operations['post_api_v1_projects_projectId_premise_enhance'];
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
    post: operations['post_api_v1_projects_projectId_bible_audit'];
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
    post: operations['post_api_v1_projects_projectId_volumes_volumeKey_arcs_plan'];
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
    get: operations['get_api_v1_projects_projectId_context_preview'];
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
    get: operations['get_api_v1_projects_projectId_entities'];
    put?: never;
    /** Create Entity */
    post: operations['post_api_v1_projects_projectId_entities'];
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
    get: operations['get_api_v1_projects_projectId_entities_entityKey'];
    put?: never;
    post?: never;
    /** Delete Entity */
    delete: operations['delete_api_v1_projects_projectId_entities_entityKey'];
    options?: never;
    head?: never;
    /** Update Entity */
    patch: operations['patch_api_v1_projects_projectId_entities_entityKey'];
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
    post: operations['post_api_v1_projects_projectId_entities_entityKey_image'];
    /** Delete Image */
    delete: operations['delete_api_v1_projects_projectId_entities_entityKey_image'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}/images': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Add Image */
    post: operations['post_api_v1_projects_projectId_entities_entityKey_images'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/entities/{entityKey}/images/{imageId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove Image */
    delete: operations['delete_api_v1_projects_projectId_entities_entityKey_images_imageId'];
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
    post: operations['post_api_v1_projects_projectId_volumes_approve'];
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
    get: operations['get_api_v1_projects_projectId_volumes'];
    put?: never;
    /** Create Volume */
    post: operations['post_api_v1_projects_projectId_volumes'];
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
    get: operations['get_api_v1_projects_projectId_volumes_volumeKey'];
    put?: never;
    post?: never;
    /** Delete Volume */
    delete: operations['delete_api_v1_projects_projectId_volumes_volumeKey'];
    options?: never;
    head?: never;
    /** Update Volume */
    patch: operations['patch_api_v1_projects_projectId_volumes_volumeKey'];
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
    get: operations['get_api_v1_projects_projectId_volumes_volumeKey_arcs'];
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
    post: operations['post_api_v1_projects_projectId_volumes_volumeKey_arcs_approve'];
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
    get: operations['get_api_v1_projects_projectId_arcs_arcKey'];
    /** Upsert Arc */
    put: operations['put_api_v1_projects_projectId_arcs_arcKey'];
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
    get: operations['get_api_v1_projects_projectId_bible'];
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
    get: operations['get_api_v1_projects_projectId_bible_section_slug'];
    /** Upsert Bible Doc */
    put: operations['put_api_v1_projects_projectId_bible_section_slug'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/facts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Facts */
    get: operations['get_api_v1_projects_projectId_facts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/facts/{factKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Fact */
    get: operations['get_api_v1_projects_projectId_facts_factKey'];
    /** Upsert Fact */
    put: operations['put_api_v1_projects_projectId_facts_factKey'];
    post?: never;
    /** Delete Fact */
    delete: operations['delete_api_v1_projects_projectId_facts_factKey'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/facts/{factKey}/reveal': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Reveal Fact */
    post: operations['post_api_v1_projects_projectId_facts_factKey_reveal'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/facts/{factKey}/knowledge/{entityKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Retract Knowledge */
    delete: operations['delete_api_v1_projects_projectId_facts_factKey_knowledge_entityKey'];
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
    /** Start Illustration */
    post: operations['post_api_v1_projects_projectId_entities_entityKey_illustration'];
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
    /** Refine Illustration */
    post: operations['post_api_v1_projects_projectId_entities_entityKey_illustration_refine'];
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
    /** Save Illustration */
    post: operations['post_api_v1_projects_projectId_entities_entityKey_illustration_save'];
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
    /** Cancel Illustration */
    post: operations['post_api_v1_projects_projectId_entities_entityKey_illustration_cancel'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Import Novel */
    post: operations['post_api_v1_import'];
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
    /** Extract Knowledge */
    post: operations['post_api_v1_projects_projectId_extract'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/recombine': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Recombine Chapters */
    post: operations['post_api_v1_projects_projectId_recombine'];
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
    /** Consolidate Source */
    post: operations['post_api_v1_projects_projectId_consolidate'];
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
    /** Get Assets */
    get: operations['get_api_v1_projects_projectId_assets'];
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
    /** Generate Skeleton */
    post: operations['post_api_v1_projects_projectId_skeleton'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/rebrand/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Update Config */
    put: operations['put_api_v1_projects_projectId_rebrand_config'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/rebrand': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Rebrand Status */
    get: operations['get_api_v1_projects_projectId_rebrand'];
    put?: never;
    /** Start Rebrand */
    post: operations['post_api_v1_projects_projectId_rebrand'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/rebrand/glossary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Glossary */
    get: operations['get_api_v1_projects_projectId_rebrand_glossary'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/rebrand/chapters': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Conversions */
    get: operations['get_api_v1_projects_projectId_rebrand_chapters'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/rebrand/chapters/{chapter}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Conversion */
    get: operations['get_api_v1_projects_projectId_rebrand_chapters_chapter'];
    put?: never;
    /** Rerun Chapter */
    post: operations['post_api_v1_projects_projectId_rebrand_chapters_chapter'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/rebrand/manuscript': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Rebrand Manuscript */
    get: operations['get_api_v1_projects_projectId_rebrand_manuscript'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/config': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Update Config */
    put: operations['put_api_v1_projects_projectId_reforge_config'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Reforge Status */
    get: operations['get_api_v1_projects_projectId_reforge'];
    put?: never;
    /** Start Reforge */
    post: operations['post_api_v1_projects_projectId_reforge'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/chapters': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Reforges */
    get: operations['get_api_v1_projects_projectId_reforge_chapters'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/chapters/{chapter}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Reforge */
    get: operations['get_api_v1_projects_projectId_reforge_chapters_chapter'];
    put?: never;
    /** Rerun Chapter */
    post: operations['post_api_v1_projects_projectId_reforge_chapters_chapter'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/manuscript': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Reforge Manuscript */
    get: operations['get_api_v1_projects_projectId_reforge_manuscript'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Publish Novel */
    post: operations['post_api_v1_projects_projectId_publish'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{chapter}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Publish Chapter */
    post: operations['post_api_v1_projects_projectId_chapters_chapter_publish'];
    /** Unpublish Chapter */
    delete: operations['delete_api_v1_projects_projectId_chapters_chapter_publish'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/publications/access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Access */
    get: operations['get_api_v1_projects_projectId_publications_access'];
    /** Set Access */
    put: operations['put_api_v1_projects_projectId_publications_access'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/publications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Publications */
    get: operations['get_api_v1_projects_projectId_publications'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/publications/reconcile': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Reconcile Publications */
    post: operations['post_api_v1_projects_projectId_publications_reconcile'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/plan/import': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Import Plan */
    post: operations['post_api_v1_projects_projectId_plan_import'];
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
    get: operations['get_api_v1_projects'];
    put?: never;
    /** Create Project */
    post: operations['post_api_v1_projects'];
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
    get: operations['get_api_v1_projects_projectId'];
    put?: never;
    post?: never;
    /** Delete Project */
    delete: operations['delete_api_v1_projects_projectId'];
    options?: never;
    head?: never;
    /** Update Project */
    patch: operations['patch_api_v1_projects_projectId'];
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
    get: operations['get_api_v1_projects_projectId_status'];
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
    post: operations['post_api_v1_projects_projectId_clone'];
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
    post: operations['post_api_v1_projects_projectId_reset'];
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
    get: operations['get_api_v1_projects_projectId_cost'];
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
    post: operations['post_api_v1_projects_projectId_cover'];
    /** Delete Cover */
    delete: operations['delete_api_v1_projects_projectId_cover'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    DevErrorResponseDto: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
      stack?: string;
    };
    ErrorFieldDto: {
      field: string;
      msg: string;
    };
    AuthLogoutResponse: {
      success: boolean;
      redirectTo?: string;
    };
    AuthSessionResponse: {
      sub: string;
      scopes: string[];
      org?: string;
      aal?: string;
      clientId?: string;
    };
    AuthUserInfoResponse: {
      sub: string;
      name?: string;
      given_name?: string;
      family_name?: string;
      preferred_username?: string;
      picture?: string;
      email?: string;
      email_verified?: boolean;
    };
    AuthOrganisationsResponse: {
      organisations: components['schemas']['AuthOrganisationItem'][];
    };
    AuthOrganisationItem: {
      id: string;
      slug: string;
      name: string;
      /** @enum {string} */
      type: 'PERSONAL' | 'TEAM';
      active: boolean;
    };
    SwitchOrganisationBody: {
      organisationId: string;
    };
    SwitchOrganisationResponse: {
      organisationId: string;
    };
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
      knowledgeContract?: components['schemas']['KnowledgeContractSchema'];
    };
    KnowledgeContractSchema: {
      /** @description entity keys whose ledgered knowledge bounds what the chapter may state */
      pov: string[];
      /** @description facts discovered on-page during this chapter; ledgered when the draft is approved */
      learns?: components['schemas']['KnowledgeRevealSchema'][];
    };
    KnowledgeRevealSchema: {
      /** @description entity key of the character who learns the fact on-page this chapter */
      entityKey: string;
      /** @description key of the canon fact being revealed */
      factKey: string;
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
    JobKind: 'extract' | 'generate' | 'finalize' | 'backfill' | 'rebrand' | 'reforge' | 'publish' | 'import';
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
      toolCalls?: components['schemas']['RunToolCallResponse'][];
      contextPack?: components['schemas']['RunContextPackResponse'];
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
      promptVersion: string;
      status: string;
      inputTokens?: null | number;
      outputTokens?: null | number;
      latencyMs?: null | number;
      costUsd?: null | string;
      attempt: number;
      /** Format: date-time */
      createdAt: string;
    };
    RunToolCallResponse: {
      id: string;
      node?: null | string;
      tool: string;
      args?: null | {
        [key: string]: unknown;
      };
      status: string;
      resultDigest?: null | string;
      latencyMs?: null | number;
      /** Format: date-time */
      createdAt: string;
    };
    RunContextPackResponse: {
      id: string;
      purpose: string;
      budgetTokens?: null | number;
      usedTokens?: null | number;
      sections: components['schemas']['RunContextSectionItem'][];
    };
    RunContextSectionItem: {
      key: string;
      tier: string;
      segment: string;
      tokens: number;
      truncated: boolean;
    };
    RunContextResponse: {
      id: string;
      purpose: string;
      budgetTokens?: null | number;
      usedTokens?: null | number;
      sections: components['schemas']['RunContextSectionItem'][];
      rendered: string;
    };
    RunModelCallDetailResponse: {
      id: string;
      node?: null | string;
      role: string;
      provider: string;
      model: string;
      promptKey: string;
      promptVersion: string;
      status: string;
      inputTokens?: null | number;
      outputTokens?: null | number;
      latencyMs?: null | number;
      costUsd?: null | string;
      attempt: number;
      /** Format: date-time */
      createdAt: string;
      rawOutput?: null | string;
      error?: null | {
        [key: string]: unknown;
      };
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
    ListChapterImageResponse: {
      items: components['schemas']['ChapterImageResponse'][];
    };
    ChapterImageResponse: {
      id: string;
      projectId: string;
      chapter: number;
      imageUrl: string;
      caption?: null | string;
      sortOrder: number;
      /** Format: date-time */
      createdAt: string;
    };
    AddChapterImageBody: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      image: string;
      caption?: string;
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
      wordCount?: null | number;
      status: components['schemas']['ChapterStatus'];
      generator?: null | string;
      continuityApplied: boolean;
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
      wordCount?: null | number;
      status: components['schemas']['ChapterStatus'];
      generator?: null | string;
      continuityApplied: boolean;
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
      pendingTurn: boolean;
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
      imageUrl?: null | string;
      images?: components['schemas']['EntityImageResponse'][];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    EntityImageResponse: {
      id: string;
      imageUrl: string;
      caption?: null | string;
      sortOrder: number;
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
    AddEntityImageBody: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      image: string;
      caption?: string;
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
    ListFactsResponse: {
      facts: components['schemas']['FactResponse'][];
    };
    FactResponse: {
      id: string;
      projectId: string;
      factKey: string;
      text: string;
      subjects?: null | string[];
      constraintNote?: null | string;
      terms?: null | string[];
      revealChapter?: null | number;
      knowledge: components['schemas']['KnowledgeEntryResponse'][];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    KnowledgeEntryResponse: {
      entityKey: string;
      entityName: string;
      learnedInChapter: number;
      source: components['schemas']['FactSource'];
      note?: null | string;
      /** Format: date-time */
      createdAt: string;
    };
    /** @enum {string} */
    FactSource: 'brief' | 'manual' | 'import';
    UpsertFactBody: {
      text: string;
      subjects?: string[];
      constraintNote?: string;
      terms?: string[];
      revealChapter?: number;
    };
    RevealFactBody: {
      entityKey: string;
      chapter: number;
      note?: string;
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
      imageUrl: string;
    };
    CancelIllustrationBody: {
      sessionId: string;
    };
    CancelIllustrationResponse: {
      cancelled: boolean;
    };
    ImportNovelBody: {
      bundle: components['schemas']['NovelBundle'];
    };
    NovelBundle: {
      /** @enum {string} */
      format: 'novel-import';
      /** @enum {integer} */
      schemaVersion: 1;
      mode: components['schemas']['NovelImportMode'];
      novel: components['schemas']['NovelImportMeta'];
      volumes: components['schemas']['NovelImportVolume'][];
      assets?: components['schemas']['NovelImportAsset'][];
    };
    /** @enum {string} */
    NovelImportMode: 'final' | 'source';
    NovelImportMeta: {
      title: string;
      synopsis: string;
      genre?: string;
      tags?: string[];
      cover?: string;
      instructions?: string;
    };
    NovelImportVolume: {
      ordinal: number;
      title?: string;
      chapters: components['schemas']['NovelImportChapter'][];
    };
    NovelImportChapter: {
      title: string;
      content: string;
    };
    NovelImportAsset: {
      name: string;
      /** @enum {string} */
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
      dataBase64: string;
    };
    ImportNovelResponse: {
      projectId: string;
      jobId: string;
    };
    ExtractBody: {
      limit?: number;
      rearm?: boolean;
    };
    JobEnqueueResponse1: {
      jobId: string;
      kind: string;
      status: string;
      target: string;
    };
    RecombineBody: {
      dryRun?: boolean;
      useAi?: boolean;
    };
    RecombineResponse: {
      applied: boolean;
      before: number;
      after: number;
      merged: components['schemas']['MergedChapterItem'][];
      ambiguous: components['schemas']['AmbiguousBoundaryItem'][];
    };
    MergedChapterItem: {
      number: number;
      title?: null | string;
      parts: number;
    };
    AmbiguousBoundaryItem: {
      afterNumber: number;
      reason: string;
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
    RebrandConfigBody: {
      directives?: string | null;
      settings?: components['schemas']['RebrandSettingsBody'];
    };
    RebrandSettingsBody: {
      bannedExtra?: string[];
      auditEnabled?: boolean;
    };
    RebrandResponse: {
      id: string;
      status: components['schemas']['RebrandStatus'];
      directives?: null | string;
      worldNotes?: null | string;
      settings?: null | {
        [key: string]: unknown;
      };
      lastError?: null | string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    RebrandStatus: 'pending' | 'glossary' | 'converting' | 'done' | 'failed';
    RebrandStartBody: {
      force?: boolean;
      limit?: number;
    };
    RebrandStatusResponse: {
      rebrand: components['schemas']['RebrandResponse'];
      sourceChapters: number;
      glossaryCount: number;
      counts: components['schemas']['ConversionCountsResponse'];
      job?: null | {
        [key: string]: unknown;
      };
    };
    ConversionCountsResponse: {
      converted: number;
      attention: number;
      failed: number;
    };
    /** @enum {string} */
    RebrandGlossaryCategory: 'character' | 'place' | 'country' | 'culture' | 'faction' | 'technique' | 'item' | 'term';
    GlossaryListResponse: {
      items: components['schemas']['GlossaryEntryResponse'][];
    };
    GlossaryEntryResponse: {
      sourceName: string;
      variants?: null | string[];
      replacement: string;
      category: components['schemas']['RebrandGlossaryCategory'];
      notes?: null | string;
      createdChapter?: null | number;
    };
    ListConversionsResponse: {
      items: components['schemas']['ConversionSummaryResponse'][];
    };
    ConversionSummaryResponse: {
      chapter: number;
      title?: null | string;
      status: components['schemas']['RebrandConversionStatus'];
      issueCount: number;
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    RebrandConversionStatus: 'converted' | 'attention' | 'failed';
    ConversionResponse: {
      chapter: number;
      title?: null | string;
      body: string;
      summaryOfChanges?: null | string;
      fixes?: null | components['schemas']['ConversionDetailItem'][];
      addedScenes?: null | components['schemas']['ConversionDetailItem'][];
      issues?: null | components['schemas']['ConversionDetailItem'][];
      status: components['schemas']['RebrandConversionStatus'];
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    ConversionDetailItem: {
      detail?: string;
    } & {
      [key: string]: unknown;
    };
    ManuscriptResponse: {
      markdown: string;
    };
    ReforgeConfigBody: {
      instructions?: string | null;
      fidelity?: components['schemas']['ReforgeFidelity'];
      settings?: components['schemas']['ReforgeSettingsBody'];
    };
    /** @enum {string} */
    ReforgeFidelity: 'preserve' | 'close' | 'loose';
    ReforgeSettingsBody: {
      judgeEnabled?: boolean;
      targetWords?: number;
    };
    ReforgeResponse: {
      id: string;
      status: components['schemas']['ReforgeStatus'];
      instructions?: null | string;
      fidelity: components['schemas']['ReforgeFidelity'];
      settings?: null | {
        [key: string]: unknown;
      };
      lastError?: null | string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ReforgeStatus: 'pending' | 'glossary' | 'reforging' | 'done' | 'failed';
    ReforgeStartBody: {
      force?: boolean;
      limit?: number;
    };
    ReforgeStatusResponse: {
      reforge: components['schemas']['ReforgeResponse'];
      sourceChapters: number;
      glossaryCount: number;
      counts: components['schemas']['ReforgeCountsResponse'];
      job?: null | {
        [key: string]: unknown;
      };
    };
    ReforgeCountsResponse: {
      reforged: number;
      attention: number;
      failed: number;
    };
    ListReforgesResponse: {
      items: components['schemas']['ReforgeSummaryResponse'][];
    };
    ReforgeSummaryResponse: {
      chapter: number;
      title?: null | string;
      status: components['schemas']['ReforgeChapterStatus'];
      issueCount: number;
      wordCount?: null | number;
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ReforgeChapterStatus: 'reforged' | 'attention' | 'failed';
    ReforgeChapterResponse: {
      chapter: number;
      title?: null | string;
      body: string;
      summary?: null | string;
      sourceBeats?: null | {
        [key: string]: unknown;
      };
      changes?: null | {
        [key: string]: unknown;
      };
      fidelity?: null | {
        [key: string]: unknown;
      };
      issues?: null | components['schemas']['ReforgeDetailItem'][];
      status: components['schemas']['ReforgeChapterStatus'];
      wordCount?: null | number;
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    ReforgeDetailItem: {
      detail?: string;
    } & {
      [key: string]: unknown;
    };
    ReforgeManuscriptResponse: {
      markdown: string;
    };
    PublishNovelBody: {
      novelSlug?: string;
      title?: string;
      blurb?: string | null;
      coverPath?: string | null;
      genres?: string[];
      /** @enum {string} */
      status?: 'live' | 'retired';
    };
    PublicationResponse: {
      id: string;
      novelSlug: string;
      title: string;
      blurb?: null | string;
      coverPath?: null | string;
      genres?: null | string[];
      status: components['schemas']['PublicationStatus'];
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    PublicationStatus: 'draft' | 'live' | 'retired';
    PublishChapterBody: {
      scheduledAt?: string;
    };
    ChapterPublicationResponse: {
      id: string;
      chapter: number;
      publishedOrdinal: number;
      title: string;
      authorNote?: null | string;
      contentHash: string;
      revision: number;
      status: components['schemas']['ChapterPublicationStatus'];
      /** Format: date-time */
      scheduledAt?: null | string;
      /** Format: date-time */
      publishedAt?: null | string;
      error?: null | string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ChapterPublicationStatus: 'scheduled' | 'published' | 'failed' | 'unpublished';
    PublicationAccessResponse: {
      visibility: components['schemas']['PublicationVisibility'];
      organisationId?: null | string;
      accessRevision: number;
      grants: components['schemas']['AccessGrantItem'][];
    };
    /** @enum {string} */
    PublicationVisibility: 'PUBLIC' | 'ORGANISATION' | 'RESTRICTED';
    AccessGrantItem: {
      email: string;
      subjectId?: null | string;
      state: components['schemas']['PublicationGrantState'];
    };
    /** @enum {string} */
    PublicationGrantState: 'resolved' | 'pending';
    PublicationAccessBody: {
      visibility: components['schemas']['PublicationVisibility'];
      grants?: components['schemas']['AccessGrantInput'][];
    };
    AccessGrantInput: {
      email: string;
    };
    PublicationsLedgerResponse: {
      publication?: components['schemas']['PublicationResponse'];
      chapters: components['schemas']['ChapterPublicationResponse'][];
    };
    ReconcileResponse: {
      /** @enum {string} */
      novel: 'applied' | 'noop';
      /** @enum {string} */
      access: 'applied' | 'noop';
      pushed: number[];
      deleted: number[];
      skipped: number[];
      failed: components['schemas']['ReconcileFailureItem'][];
      unknownOrdinals: number[];
      wiki: components['schemas']['WikiReconcileResult'];
    };
    ReconcileFailureItem: {
      ordinal: number;
      error: string;
    };
    WikiReconcileResult: {
      pushed: string[];
      deleted: string[];
      skipped: string[];
      failed: components['schemas']['WikiReconcileFailureItem'][];
      unknownEntries: string[];
    };
    WikiReconcileFailureItem: {
      entryKey: string;
      error: string;
    };
    ImportPlanBody: {
      bundle: components['schemas']['PlanBundle'];
      overwrite?: boolean;
      approve?: boolean;
    };
    PlanBundle: {
      format: string;
      version: number;
      bible?: components['schemas']['PlanBundleBibleDoc'][];
      entities?: components['schemas']['PlanBundleEntity'][];
      facts?: components['schemas']['PlanBundleFact'][];
      volumes?: components['schemas']['PlanBundleVolume'][];
      arcs?: components['schemas']['PlanBundleArc'][];
      briefs?: components['schemas']['PlanBundleBrief'][];
    };
    PlanBundleBibleDoc: {
      section: components['schemas']['PlanBundleSection'];
      slug: string;
      frontmatter?: {
        [key: string]: unknown;
      };
      body: string;
    };
    /** @enum {string} */
    PlanBundleSection: 'project' | 'world' | 'power' | 'plot' | 'lore';
    PlanBundleEntity: {
      entityKey: string;
      type: components['schemas']['EntityType'];
      name: string;
      significance?: components['schemas']['EntitySignificance'];
      status?: string;
      motivation?: string;
      notes?: string;
      body?: string;
    };
    PlanBundleFact: {
      factKey: string;
      text: string;
      subjects?: string[];
      constraintNote?: string;
      terms?: string[];
      revealChapter?: number;
    };
    PlanBundleVolume: {
      volumeKey: string;
      ordinal: number;
      title: string;
      objective: string;
      conflict: string;
      payoff: string;
      targetChapterCount: number;
      cast?: string[];
      body?: string;
    };
    PlanBundleArc: {
      arcKey: string;
      volumeKey: string;
      ordinal: number;
      title: string;
      objective: string;
      escalation: string;
      payoff: string;
      hook: string;
      chapterStart: number;
      chapterEnd: number;
      cast?: string[];
      body?: string;
    };
    PlanBundleBrief: {
      chapter: number;
      volumeKey: string;
      arcKey?: string;
      title: string;
      objective: string;
      events: string[];
      requiredContext?: string[];
      continuesIntoNextChapter?: boolean;
      startsFromPreviousChapter?: boolean;
      handoffBeat?: string;
      endingContract: components['schemas']['EndingContractSchema'];
      knowledgeContract?: components['schemas']['KnowledgeContractSchema'];
    };
    EndingContractSchema: {
      /** @description the kind of hook the closing scene must land on */
      hookType: components['schemas']['HookType'];
      /** @description what the reader should feel on the last line */
      emotionalBeat: string;
      /** @description the question the ending must leave open */
      openQuestion: string;
      /** @description the situation the next chapter picks up from — specific enough for a different author to continue */
      handoffState: string;
      /** @description refs (e.g. "thread:heir_mystery") the ending must NOT resolve */
      mustNotResolve?: string[];
    };
    /** @enum {string} */
    HookType: 'cliffhanger' | 'revelation' | 'quiet_dread' | 'promise' | 'turn';
    ImportPlanResponse: {
      results: components['schemas']['ImportResults'];
      approval?: components['schemas']['ApprovalResult'];
      warnings: string[];
    };
    ImportResults: {
      bible: components['schemas']['CollectionResult'];
      entities: components['schemas']['CollectionResult'];
      facts: components['schemas']['CollectionResult'];
      volumes: components['schemas']['CollectionResult'];
      arcs: components['schemas']['CollectionResult'];
      briefs: components['schemas']['CollectionResult'];
    };
    CollectionResult: {
      created: number;
      updated: number;
      unchanged: number;
      pruned: number;
    };
    ApprovalResult: {
      volumesApproved: number;
      arcsApproved: number;
    };
    CreateProjectBody: {
      name: string;
      kind: components['schemas']['ProjectKind'];
      title?: string;
      instructions?: string;
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
      coverUrl?: null | string;
      contentMode: components['schemas']['ContentMode'];
      config?: components['schemas']['ProjectConfig'];
      brief?: null | string;
      instructions?: null | string;
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
      instructions?: string | null;
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
  get_api_auth_login: {
    parameters: {
      query?: {
        return_to?: string;
      };
      header?: never;
      path?: never;
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
  get_api_auth_callback: {
    parameters: {
      query?: {
        code?: string;
        state?: string;
        error?: string;
        error_description?: string;
      };
      header?: never;
      path?: never;
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
  post_api_auth_logout: {
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
          'application/json': components['schemas']['AuthLogoutResponse'];
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
  get_api_auth_session: {
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
          'application/json': components['schemas']['AuthSessionResponse'];
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
  get_api_auth_userinfo: {
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
          'application/json': components['schemas']['AuthUserInfoResponse'];
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
  get_api_auth_organisations: {
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
          'application/json': components['schemas']['AuthOrganisationsResponse'];
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
  post_api_auth_organisation: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SwitchOrganisationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SwitchOrganisationResponse'];
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
  get_api_auth_step_up: {
    parameters: {
      query?: {
        return_to?: string;
        claimed?: string;
        retried?: string;
      };
      header?: never;
      path?: never;
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
  get_api_v1_ai_models: {
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
  get_api_v1_projects_projectId_export_novel: {
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
  post_api_v1_projects_projectId_seed_from_brief: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_plan: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_approve: {
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
  post_api_v1_projects_projectId_outline: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_arcs_arcKey_outline: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        arcKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_briefs: {
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
  get_api_v1_projects_projectId_briefs_n: {
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
  put_api_v1_projects_projectId_briefs_n: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_generate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_jobs: {
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
  get_api_v1_projects_projectId_drafts: {
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
  get_api_v1_projects_projectId_drafts_n: {
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
  put_api_v1_projects_projectId_drafts_n: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  delete_api_v1_projects_projectId_drafts_n: {
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
  post_api_v1_projects_projectId_drafts_n_revise: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_drafts_n_judge: {
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
  post_api_v1_projects_projectId_drafts_n_feedback: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_drafts_n_approve: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_drafts_n_revisions: {
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
  get_api_v1_projects_projectId_drafts_n_revisions_r: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
        r: number;
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
  get_api_v1_projects_projectId_drafts_n_prompt: {
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
  post_api_v1_projects_projectId_drafts_n_import: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_finalize: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_chapters_n_generate_grok: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_chapters_n_propose_continuity: {
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
  post_api_v1_projects_projectId_chapters_n_extract_to_bible: {
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
  get_api_v1_projects_projectId_chapters_n_continuity_proposal: {
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
  patch_api_v1_projects_projectId_chapters_n_continuity_proposal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_chapters_n_continuity_proposal_apply: {
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
  post_api_v1_projects_projectId_chapters_n_continuity_proposal_discard: {
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
  post_api_v1_projects_projectId_validate: {
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
  post_api_v1_projects_projectId_chapters_n_review: {
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
  get_api_v1_projects_projectId_review_queue: {
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
  get_api_v1_projects_projectId_runs: {
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
  get_api_v1_projects_projectId_runs_runId: {
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
  get_api_v1_projects_projectId_runs_runId_context: {
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
          'application/json': components['schemas']['RunContextResponse'];
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
  get_api_v1_projects_projectId_runs_runId_calls_callId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        runId: string;
        callId: string;
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
          'application/json': components['schemas']['RunModelCallDetailResponse'];
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
  get_api_v1_projects_projectId_ai_usage: {
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
  get_api_v1_projects_projectId_search: {
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
  get_api_v1_projects_projectId_manuscript: {
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
  post_api_v1_projects_projectId_backfill: {
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
  get_api_v1_projects_projectId_chapters_n_images: {
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
          'application/json': components['schemas']['ListChapterImageResponse'];
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
  post_api_v1_projects_projectId_chapters_n_images: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AddChapterImageBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterImageResponse'];
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
  delete_api_v1_projects_projectId_chapters_n_images_imageId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
        imageId: string;
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
  get_api_v1_jobs_jobId: {
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
  get_api_v1_projects_projectId_source_chapters: {
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
  get_api_v1_projects_projectId_source_chapters_n: {
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
  delete_api_v1_projects_projectId_source_chapters_n: {
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
  patch_api_v1_projects_projectId_source_chapters_n: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_proposals: {
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
  get_api_v1_projects_projectId_proposals_proposalId: {
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
  patch_api_v1_projects_projectId_proposals_proposalId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_proposals_proposalId_apply: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_proposals_proposalId_revert: {
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
  post_api_v1_projects_projectId_proposals_proposalId_discard: {
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
  get_api_v1_projects_projectId_changes: {
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
  post_api_v1_projects_projectId_changes_rollback: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_chat_sessions: {
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
  post_api_v1_projects_projectId_chat_sessions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_chat_sessions_sessionId: {
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
  delete_api_v1_projects_projectId_chat_sessions_sessionId: {
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
  patch_api_v1_projects_projectId_chat_sessions_sessionId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_chat_sessions_sessionId_messages: {
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
  post_api_v1_projects_projectId_chat_sessions_sessionId_messages: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  patch_api_v1_projects_projectId_chat_sessions_sessionId_model: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_chat_sessions_sessionId_archive: {
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
  post_api_v1_projects_projectId_chat_sessions_sessionId_unarchive: {
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
  post_api_v1_projects_projectId_premise_enhance: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_bible_audit: {
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
  post_api_v1_projects_projectId_volumes_volumeKey_arcs_plan: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_context_preview: {
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
  get_api_v1_projects_projectId_entities: {
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
  post_api_v1_projects_projectId_entities: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_entities_entityKey: {
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
  delete_api_v1_projects_projectId_entities_entityKey: {
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
  patch_api_v1_projects_projectId_entities_entityKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_entities_entityKey_image: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  delete_api_v1_projects_projectId_entities_entityKey_image: {
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
  post_api_v1_projects_projectId_entities_entityKey_images: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AddEntityImageBody'];
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
  delete_api_v1_projects_projectId_entities_entityKey_images_imageId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
        imageId: string;
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
  post_api_v1_projects_projectId_volumes_approve: {
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
  get_api_v1_projects_projectId_volumes: {
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
  post_api_v1_projects_projectId_volumes: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_volumes_volumeKey: {
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
  delete_api_v1_projects_projectId_volumes_volumeKey: {
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
  patch_api_v1_projects_projectId_volumes_volumeKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        volumeKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_volumes_volumeKey_arcs: {
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
  post_api_v1_projects_projectId_volumes_volumeKey_arcs_approve: {
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
  get_api_v1_projects_projectId_arcs_arcKey: {
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
  put_api_v1_projects_projectId_arcs_arcKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        arcKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_bible: {
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
  get_api_v1_projects_projectId_bible_section_slug: {
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
  put_api_v1_projects_projectId_bible_section_slug: {
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
    requestBody: {
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
  get_api_v1_projects_projectId_facts: {
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
          'application/json': components['schemas']['ListFactsResponse'];
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
  get_api_v1_projects_projectId_facts_factKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        factKey: string;
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
          'application/json': components['schemas']['FactResponse'];
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
  put_api_v1_projects_projectId_facts_factKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        factKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpsertFactBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FactResponse'];
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
  delete_api_v1_projects_projectId_facts_factKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        factKey: string;
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
  post_api_v1_projects_projectId_facts_factKey_reveal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        factKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RevealFactBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FactResponse'];
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
  delete_api_v1_projects_projectId_facts_factKey_knowledge_entityKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        factKey: string;
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
          'application/json': components['schemas']['FactResponse'];
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
  post_api_v1_projects_projectId_entities_entityKey_illustration: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_entities_entityKey_illustration_refine: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_entities_entityKey_illustration_save: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_entities_entityKey_illustration_cancel: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entityKey: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_import: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ImportNovelBody'];
      };
    };
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportNovelResponse'];
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
  post_api_v1_projects_projectId_extract: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_recombine: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RecombineBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RecombineResponse'];
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
  post_api_v1_projects_projectId_consolidate: {
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
  get_api_v1_projects_projectId_assets: {
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
  post_api_v1_projects_projectId_skeleton: {
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
  put_api_v1_projects_projectId_rebrand_config: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RebrandConfigBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RebrandResponse'];
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
  get_api_v1_projects_projectId_rebrand: {
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
          'application/json': components['schemas']['RebrandStatusResponse'];
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
  post_api_v1_projects_projectId_rebrand: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RebrandStartBody'];
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
  get_api_v1_projects_projectId_rebrand_glossary: {
    parameters: {
      query?: {
        category?: components['schemas']['RebrandGlossaryCategory'];
        page?: number | string;
        limit?: number | string;
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
          'application/json': components['schemas']['GlossaryListResponse'];
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
  get_api_v1_projects_projectId_rebrand_chapters: {
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
          'application/json': components['schemas']['ListConversionsResponse'];
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
  get_api_v1_projects_projectId_rebrand_chapters_chapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        chapter: number;
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
          'application/json': components['schemas']['ConversionResponse'];
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
  post_api_v1_projects_projectId_rebrand_chapters_chapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        chapter: number;
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
  get_api_v1_projects_projectId_rebrand_manuscript: {
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
          'application/json': components['schemas']['ManuscriptResponse'];
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
  put_api_v1_projects_projectId_reforge_config: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReforgeConfigBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReforgeResponse'];
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
  get_api_v1_projects_projectId_reforge: {
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
          'application/json': components['schemas']['ReforgeStatusResponse'];
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
  post_api_v1_projects_projectId_reforge: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReforgeStartBody'];
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
  get_api_v1_projects_projectId_reforge_chapters: {
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
          'application/json': components['schemas']['ListReforgesResponse'];
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
  get_api_v1_projects_projectId_reforge_chapters_chapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        chapter: number;
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
          'application/json': components['schemas']['ReforgeChapterResponse'];
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
  post_api_v1_projects_projectId_reforge_chapters_chapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        chapter: number;
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
  get_api_v1_projects_projectId_reforge_manuscript: {
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
          'application/json': components['schemas']['ReforgeManuscriptResponse'];
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
  post_api_v1_projects_projectId_publish: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishNovelBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublicationResponse'];
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
  post_api_v1_projects_projectId_chapters_chapter_publish: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        chapter: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishChapterBody'];
      };
    };
    responses: {
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterPublicationResponse'];
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
  delete_api_v1_projects_projectId_chapters_chapter_publish: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        chapter: number;
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
          'application/json': components['schemas']['ChapterPublicationResponse'];
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
  get_api_v1_projects_projectId_publications_access: {
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
          'application/json': components['schemas']['PublicationAccessResponse'];
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
  put_api_v1_projects_projectId_publications_access: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublicationAccessBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublicationAccessResponse'];
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
  get_api_v1_projects_projectId_publications: {
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
          'application/json': components['schemas']['PublicationsLedgerResponse'];
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
  post_api_v1_projects_projectId_publications_reconcile: {
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
          'application/json': components['schemas']['ReconcileResponse'];
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
  post_api_v1_projects_projectId_plan_import: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ImportPlanBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImportPlanResponse'];
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
  get_api_v1_projects: {
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
  post_api_v1_projects: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId: {
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
  delete_api_v1_projects_projectId: {
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
  patch_api_v1_projects_projectId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_status: {
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
  post_api_v1_projects_projectId_clone: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  post_api_v1_projects_projectId_reset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  get_api_v1_projects_projectId_cost: {
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
  post_api_v1_projects_projectId_cover: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
      };
      cookie?: never;
    };
    requestBody: {
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
  delete_api_v1_projects_projectId_cover: {
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
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type AuthLogoutResponse = components['schemas']['AuthLogoutResponse'];
export type AuthSessionResponse = components['schemas']['AuthSessionResponse'];
export type AuthUserInfoResponse = components['schemas']['AuthUserInfoResponse'];
export type AuthOrganisationsResponse = components['schemas']['AuthOrganisationsResponse'];
export type AuthOrganisationItem = components['schemas']['AuthOrganisationItem'];
export type SwitchOrganisationBody = components['schemas']['SwitchOrganisationBody'];
export type SwitchOrganisationResponse = components['schemas']['SwitchOrganisationResponse'];
export type AiModelsResponse = components['schemas']['AiModelsResponse'];
export type AiModelOption = components['schemas']['AiModelOption'];
export type AiRoleDefault = components['schemas']['AiRoleDefault'];
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
export type KnowledgeContractSchema = components['schemas']['KnowledgeContractSchema'];
export type KnowledgeRevealSchema = components['schemas']['KnowledgeRevealSchema'];
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
export type RunToolCallResponse = components['schemas']['RunToolCallResponse'];
export type RunContextPackResponse = components['schemas']['RunContextPackResponse'];
export type RunContextSectionItem = components['schemas']['RunContextSectionItem'];
export type RunContextResponse = components['schemas']['RunContextResponse'];
export type RunModelCallDetailResponse = components['schemas']['RunModelCallDetailResponse'];
export type AiUsageResponse = components['schemas']['AiUsageResponse'];
export type RoleCallCounts = components['schemas']['RoleCallCounts'];
export type RoleUsage = components['schemas']['RoleUsage'];
export type SearchResponse = components['schemas']['SearchResponse'];
export type SearchHitResponse = components['schemas']['SearchHitResponse'];
export type ListChapterImageResponse = components['schemas']['ListChapterImageResponse'];
export type ChapterImageResponse = components['schemas']['ChapterImageResponse'];
export type AddChapterImageBody = components['schemas']['AddChapterImageBody'];
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
export type EntityImageResponse = components['schemas']['EntityImageResponse'];
export type ListEntityResponse = components['schemas']['ListEntityResponse'];
export type UpdateEntityBody = components['schemas']['UpdateEntityBody'];
export type UploadImageBody = components['schemas']['UploadImageBody'];
export type AddEntityImageBody = components['schemas']['AddEntityImageBody'];
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
export type ListFactsResponse = components['schemas']['ListFactsResponse'];
export type FactResponse = components['schemas']['FactResponse'];
export type KnowledgeEntryResponse = components['schemas']['KnowledgeEntryResponse'];
export type FactSource = components['schemas']['FactSource'];
export type UpsertFactBody = components['schemas']['UpsertFactBody'];
export type RevealFactBody = components['schemas']['RevealFactBody'];
export type StartIllustrationBody = components['schemas']['StartIllustrationBody'];
export type StartIllustrationResponse = components['schemas']['StartIllustrationResponse'];
export type RefineIllustrationBody = components['schemas']['RefineIllustrationBody'];
export type RefineIllustrationResponse = components['schemas']['RefineIllustrationResponse'];
export type SaveIllustrationBody = components['schemas']['SaveIllustrationBody'];
export type SaveIllustrationResponse = components['schemas']['SaveIllustrationResponse'];
export type CancelIllustrationBody = components['schemas']['CancelIllustrationBody'];
export type CancelIllustrationResponse = components['schemas']['CancelIllustrationResponse'];
export type ImportNovelBody = components['schemas']['ImportNovelBody'];
export type NovelBundle = components['schemas']['NovelBundle'];
export type NovelImportMode = components['schemas']['NovelImportMode'];
export type NovelImportMeta = components['schemas']['NovelImportMeta'];
export type NovelImportVolume = components['schemas']['NovelImportVolume'];
export type NovelImportChapter = components['schemas']['NovelImportChapter'];
export type NovelImportAsset = components['schemas']['NovelImportAsset'];
export type ImportNovelResponse = components['schemas']['ImportNovelResponse'];
export type ExtractBody = components['schemas']['ExtractBody'];
export type JobEnqueueResponse1 = components['schemas']['JobEnqueueResponse1'];
export type RecombineBody = components['schemas']['RecombineBody'];
export type RecombineResponse = components['schemas']['RecombineResponse'];
export type MergedChapterItem = components['schemas']['MergedChapterItem'];
export type AmbiguousBoundaryItem = components['schemas']['AmbiguousBoundaryItem'];
export type ConsolidateResponse = components['schemas']['ConsolidateResponse'];
export type AssetsResponse = components['schemas']['AssetsResponse'];
export type SkeletonResponse = components['schemas']['SkeletonResponse'];
export type RebrandConfigBody = components['schemas']['RebrandConfigBody'];
export type RebrandSettingsBody = components['schemas']['RebrandSettingsBody'];
export type RebrandResponse = components['schemas']['RebrandResponse'];
export type RebrandStatus = components['schemas']['RebrandStatus'];
export type RebrandStartBody = components['schemas']['RebrandStartBody'];
export type RebrandStatusResponse = components['schemas']['RebrandStatusResponse'];
export type ConversionCountsResponse = components['schemas']['ConversionCountsResponse'];
export type RebrandGlossaryCategory = components['schemas']['RebrandGlossaryCategory'];
export type GlossaryListResponse = components['schemas']['GlossaryListResponse'];
export type GlossaryEntryResponse = components['schemas']['GlossaryEntryResponse'];
export type ListConversionsResponse = components['schemas']['ListConversionsResponse'];
export type ConversionSummaryResponse = components['schemas']['ConversionSummaryResponse'];
export type RebrandConversionStatus = components['schemas']['RebrandConversionStatus'];
export type ConversionResponse = components['schemas']['ConversionResponse'];
export type ConversionDetailItem = components['schemas']['ConversionDetailItem'];
export type ManuscriptResponse = components['schemas']['ManuscriptResponse'];
export type ReforgeConfigBody = components['schemas']['ReforgeConfigBody'];
export type ReforgeFidelity = components['schemas']['ReforgeFidelity'];
export type ReforgeSettingsBody = components['schemas']['ReforgeSettingsBody'];
export type ReforgeResponse = components['schemas']['ReforgeResponse'];
export type ReforgeStatus = components['schemas']['ReforgeStatus'];
export type ReforgeStartBody = components['schemas']['ReforgeStartBody'];
export type ReforgeStatusResponse = components['schemas']['ReforgeStatusResponse'];
export type ReforgeCountsResponse = components['schemas']['ReforgeCountsResponse'];
export type ListReforgesResponse = components['schemas']['ListReforgesResponse'];
export type ReforgeSummaryResponse = components['schemas']['ReforgeSummaryResponse'];
export type ReforgeChapterStatus = components['schemas']['ReforgeChapterStatus'];
export type ReforgeChapterResponse = components['schemas']['ReforgeChapterResponse'];
export type ReforgeDetailItem = components['schemas']['ReforgeDetailItem'];
export type ReforgeManuscriptResponse = components['schemas']['ReforgeManuscriptResponse'];
export type PublishNovelBody = components['schemas']['PublishNovelBody'];
export type PublicationResponse = components['schemas']['PublicationResponse'];
export type PublicationStatus = components['schemas']['PublicationStatus'];
export type PublishChapterBody = components['schemas']['PublishChapterBody'];
export type ChapterPublicationResponse = components['schemas']['ChapterPublicationResponse'];
export type ChapterPublicationStatus = components['schemas']['ChapterPublicationStatus'];
export type PublicationAccessResponse = components['schemas']['PublicationAccessResponse'];
export type PublicationVisibility = components['schemas']['PublicationVisibility'];
export type AccessGrantItem = components['schemas']['AccessGrantItem'];
export type PublicationGrantState = components['schemas']['PublicationGrantState'];
export type PublicationAccessBody = components['schemas']['PublicationAccessBody'];
export type AccessGrantInput = components['schemas']['AccessGrantInput'];
export type PublicationsLedgerResponse = components['schemas']['PublicationsLedgerResponse'];
export type ReconcileResponse = components['schemas']['ReconcileResponse'];
export type ReconcileFailureItem = components['schemas']['ReconcileFailureItem'];
export type WikiReconcileResult = components['schemas']['WikiReconcileResult'];
export type WikiReconcileFailureItem = components['schemas']['WikiReconcileFailureItem'];
export type ImportPlanBody = components['schemas']['ImportPlanBody'];
export type PlanBundle = components['schemas']['PlanBundle'];
export type PlanBundleBibleDoc = components['schemas']['PlanBundleBibleDoc'];
export type PlanBundleSection = components['schemas']['PlanBundleSection'];
export type PlanBundleEntity = components['schemas']['PlanBundleEntity'];
export type PlanBundleFact = components['schemas']['PlanBundleFact'];
export type PlanBundleVolume = components['schemas']['PlanBundleVolume'];
export type PlanBundleArc = components['schemas']['PlanBundleArc'];
export type PlanBundleBrief = components['schemas']['PlanBundleBrief'];
export type EndingContractSchema = components['schemas']['EndingContractSchema'];
export type HookType = components['schemas']['HookType'];
export type ImportPlanResponse = components['schemas']['ImportPlanResponse'];
export type ImportResults = components['schemas']['ImportResults'];
export type CollectionResult = components['schemas']['CollectionResult'];
export type ApprovalResult = components['schemas']['ApprovalResult'];
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
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
export type ExportNovelPathParams = Exclude<paths['/api/v1/projects/{projectId}/export/novel']['get']['parameters']['path'], undefined>;
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
export type GetRunContextPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs/{runId}/context']['get']['parameters']['path'], undefined>;
export type GetRunCallPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs/{runId}/calls/{callId}']['get']['parameters']['path'], undefined>;
export type GetAiUsagePathParams = Exclude<paths['/api/v1/projects/{projectId}/ai-usage']['get']['parameters']['path'], undefined>;
export type SearchProseQueryParams = Exclude<paths['/api/v1/projects/{projectId}/search']['get']['parameters']['query'], undefined>;
export type SearchProsePathParams = Exclude<paths['/api/v1/projects/{projectId}/search']['get']['parameters']['path'], undefined>;
export type GetManuscriptPathParams = Exclude<paths['/api/v1/projects/{projectId}/manuscript']['get']['parameters']['path'], undefined>;
export type ListChapterImagesPathParams = Exclude<paths['/api/v1/projects/{projectId}/chapters/{n}/images']['get']['parameters']['path'], undefined>;
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
export type ListFactsPathParams = Exclude<paths['/api/v1/projects/{projectId}/facts']['get']['parameters']['path'], undefined>;
export type GetFactPathParams = Exclude<paths['/api/v1/projects/{projectId}/facts/{factKey}']['get']['parameters']['path'], undefined>;
export type GetAssetsPathParams = Exclude<paths['/api/v1/projects/{projectId}/assets']['get']['parameters']['path'], undefined>;
export type GetRebrandStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/rebrand']['get']['parameters']['path'], undefined>;
export type GetGlossaryQueryParams = Exclude<paths['/api/v1/projects/{projectId}/rebrand/glossary']['get']['parameters']['query'], undefined>;
export type GetGlossaryPathParams = Exclude<paths['/api/v1/projects/{projectId}/rebrand/glossary']['get']['parameters']['path'], undefined>;
export type ListConversionsPathParams = Exclude<paths['/api/v1/projects/{projectId}/rebrand/chapters']['get']['parameters']['path'], undefined>;
export type GetConversionPathParams = Exclude<paths['/api/v1/projects/{projectId}/rebrand/chapters/{chapter}']['get']['parameters']['path'], undefined>;
export type GetRebrandManuscriptPathParams = Exclude<paths['/api/v1/projects/{projectId}/rebrand/manuscript']['get']['parameters']['path'], undefined>;
export type GetReforgeStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge']['get']['parameters']['path'], undefined>;
export type ListReforgesPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/chapters']['get']['parameters']['path'], undefined>;
export type GetReforgePathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/chapters/{chapter}']['get']['parameters']['path'], undefined>;
export type GetReforgeManuscriptPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/manuscript']['get']['parameters']['path'], undefined>;
export type GetAccessPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications/access']['get']['parameters']['path'], undefined>;
export type ListPublicationsPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications']['get']['parameters']['path'], undefined>;
export type ListProjectsQueryParams = Exclude<paths['/api/v1/projects']['get']['parameters']['query'], undefined>;
export type GetProjectPathParams = Exclude<paths['/api/v1/projects/{projectId}']['get']['parameters']['path'], undefined>;
export type GetProjectStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/status']['get']['parameters']['path'], undefined>;
export type GetProjectCostPathParams = Exclude<paths['/api/v1/projects/{projectId}/cost']['get']['parameters']['path'], undefined>;
