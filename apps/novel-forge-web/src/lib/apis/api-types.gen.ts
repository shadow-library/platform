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
  '/api/v1/api-keys': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Api Keys */
    get: operations['get_api_v1_api_keys'];
    put?: never;
    /** Create Api Key */
    post: operations['post_api_v1_api_keys'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/api-keys/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Revoke Api Key */
    delete: operations['delete_api_v1_api_keys_id'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ingest/novels/{sourceRef}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Upsert Novel */
    put: operations['put_api_v1_ingest_novels_sourceRef'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ingest/novels/{sourceRef}/chapters/{sourceOrdinal}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Push Chapter */
    put: operations['put_api_v1_ingest_novels_sourceRef_chapters_sourceOrdinal'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ingest/novels/{sourceRef}/cover': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Set Cover */
    post: operations['post_api_v1_ingest_novels_sourceRef_cover'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ingest/novels/{sourceRef}/manifest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Manifest */
    get: operations['get_api_v1_ingest_novels_sourceRef_manifest'];
    put?: never;
    post?: never;
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
  '/api/v1/projects/{projectId}/chapters/{n}/generate-unrestricted': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Generate Unrestricted */
    post: operations['post_api_v1_projects_projectId_chapters_n_generate_unrestricted'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/summarize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Summarize Chapter */
    post: operations['post_api_v1_projects_projectId_chapters_n_summarize'];
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
  '/api/v1/projects/{projectId}/chapters/{afterChapter}/insert': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Insert Chapter */
    post: operations['post_api_v1_projects_projectId_chapters_afterChapter_insert'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/amend': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Amend Chapter */
    post: operations['post_api_v1_projects_projectId_chapters_n_amend'];
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
  '/api/v1/seeds': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Seeds */
    get: operations['get_api_v1_seeds'];
    put?: never;
    /** Create Seed */
    post: operations['post_api_v1_seeds'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/seed': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Seed */
    get: operations['get_api_v1_projects_projectId_seed'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/seed/stress': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Stress Seed */
    post: operations['post_api_v1_projects_projectId_seed_stress'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/seed/graduate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Graduate Seed */
    post: operations['post_api_v1_projects_projectId_seed_graduate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/illustrations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Illustrations */
    get: operations['get_api_v1_projects_projectId_illustrations'];
    put?: never;
    /** Start Illustration */
    post: operations['post_api_v1_projects_projectId_illustrations'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/illustrations/{id}/refine': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Refine Illustration */
    post: operations['post_api_v1_projects_projectId_illustrations_id_refine'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/illustrations/{id}/select': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Select Illustration */
    post: operations['post_api_v1_projects_projectId_illustrations_id_select'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/illustrations/{id}/save': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Save Illustration */
    post: operations['post_api_v1_projects_projectId_illustrations_id_save'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/illustrations/{id}/discard': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Discard Illustration */
    post: operations['post_api_v1_projects_projectId_illustrations_id_discard'];
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
  '/api/v1/projects/{projectId}/reforge/analyze': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start Analysis */
    post: operations['post_api_v1_projects_projectId_reforge_analyze'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/analysis': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Analysis */
    get: operations['get_api_v1_projects_projectId_reforge_analysis'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/analysis/report': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Analysis Report */
    get: operations['get_api_v1_projects_projectId_reforge_analysis_report'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/analysis/findings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Findings */
    get: operations['get_api_v1_projects_projectId_reforge_analysis_findings'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/plan': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Plan */
    get: operations['get_api_v1_projects_projectId_reforge_plan'];
    put?: never;
    /** Start Plan */
    post: operations['post_api_v1_projects_projectId_reforge_plan'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/plan/spans': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Replace Plan Spans */
    put: operations['put_api_v1_projects_projectId_reforge_plan_spans'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/plan/approve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Approve Plan */
    post: operations['post_api_v1_projects_projectId_reforge_plan_approve'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/transform': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start Transform */
    post: operations['post_api_v1_projects_projectId_reforge_transform'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/outputs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Outputs */
    get: operations['get_api_v1_projects_projectId_reforge_outputs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/outputs/{outputChapter}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Output */
    get: operations['get_api_v1_projects_projectId_reforge_outputs_outputChapter'];
    put?: never;
    /** Rerun Output */
    post: operations['post_api_v1_projects_projectId_reforge_outputs_outputChapter'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/promote': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start Promote */
    post: operations['post_api_v1_projects_projectId_reforge_promote'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/reforge/cuts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Cuts */
    get: operations['get_api_v1_projects_projectId_reforge_cuts'];
    put?: never;
    post?: never;
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
      /** @description The active server profile. Roles without an override inherit this profile's defaults. */
      profile: string;
      models: components['schemas']['AiModelOption'][];
      defaults: components['schemas']['AiRoleDefault'][];
      /** @description Group defaults used when a project is in Unrestricted content mode. */
      unrestrictedDefaults: components['schemas']['AiRoleDefault'][];
      /** @description Model ids that Unrestricted projects may select. Others are coerced to the Unrestricted group default. */
      unrestrictedAllowlist: string[];
    };
    AiModelOption: {
      id: string;
      provider: string;
      label: string;
      /** @enum {string} */
      kind: 'llm' | 'embedding' | 'image';
      /** @description Whether the server can currently route requests to this model. */
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
    CreateApiKeyBody: {
      /** @description Human-readable label; it is the only way to tell two keys apart once the secret is gone. */
      name: string;
    };
    CreateApiKeyResponse: {
      id: string;
      name: string;
      /** @description The first 8 characters of the secret, for identification only — it authenticates nothing. */
      keyPrefix: string;
      /** Format: date-time */
      createdAt: string;
      /**
       * Format: date-time
       * @description Recorded at most once a minute, so it lags real usage by up to 60 seconds.
       */
      lastUsedAt?: null | string;
      /** Format: date-time */
      revokedAt?: null | string;
      /** @description The plaintext secret. Returned by this call alone — the server keeps only its hash and can never show it again. */
      secret: string;
    };
    ListApiKeysResponse: {
      keys: components['schemas']['ApiKeyResponse'][];
    };
    ApiKeyResponse: {
      id: string;
      name: string;
      /** @description The first 8 characters of the secret, for identification only — it authenticates nothing. */
      keyPrefix: string;
      /** Format: date-time */
      createdAt: string;
      /**
       * Format: date-time
       * @description Recorded at most once a minute, so it lags real usage by up to 60 seconds.
       */
      lastUsedAt?: null | string;
      /** Format: date-time */
      revokedAt?: null | string;
    };
    IngestNovelBody: {
      title: string;
      /** @description The source’s blurb; lands as the project brief. */
      synopsis: string;
      /** @description The novel’s author at the source, shown to readers alongside the title. */
      originalAuthor?: string;
      /** @description Catalog genres claimed by the source. */
      genres?: components['schemas']['NovelGenre'][];
      /** @description Catalog tags claimed by the source. */
      tags?: components['schemas']['NovelTag'][];
      sexualContent?: components['schemas']['SexualContentRating'];
      violence?: components['schemas']['ViolenceRating'];
      darkContent?: components['schemas']['DarkContentRating'];
    };
    /** @enum {string} */
    NovelGenre:
      | 'Action'
      | 'Adult'
      | 'Adventure'
      | 'Comedy'
      | 'Drama'
      | 'Ecchi'
      | 'Fantasy'
      | 'Gender Bender'
      | 'Harem'
      | 'Historical'
      | 'Horror'
      | 'Josei'
      | 'Martial Arts'
      | 'Mature'
      | 'Mecha'
      | 'Mystery'
      | 'Psychological'
      | 'Romance'
      | 'School Life'
      | 'Sci-fi'
      | 'Seinen'
      | 'Shoujo'
      | 'Shoujo Ai'
      | 'Shounen'
      | 'Shounen Ai'
      | 'Slice of Life'
      | 'Smut'
      | 'Sports'
      | 'Supernatural'
      | 'Tragedy'
      | 'Wuxia'
      | 'Xianxia'
      | 'Xuanhuan'
      | 'Yaoi'
      | 'Yuri';
    /** @enum {string} */
    NovelTag:
      | 'Male Protagonist'
      | 'Female Protagonist'
      | 'Overpowered Protagonist'
      | 'Weak to Strong'
      | 'Protagonist Strong from the Start'
      | 'Antihero Protagonist'
      | 'Evil Protagonist'
      | 'Ruthless Protagonist'
      | 'Genius Protagonist'
      | 'Calm Protagonist'
      | 'Lazy Protagonist'
      | 'Loner Protagonist'
      | 'Underestimated Protagonist'
      | 'Multiple Protagonists'
      | 'Slow Romance'
      | 'Love Triangles'
      | 'Childhood Friends'
      | 'Arranged Marriage'
      | 'Marriage of Convenience'
      | 'Enemies Become Lovers'
      | 'Fated Lovers'
      | 'Unrequited Love'
      | 'Obsessive Love'
      | 'Secret Relationship'
      | 'Office Romance'
      | 'Reverse Harem'
      | 'Polygamy'
      | 'Tsundere'
      | 'Yandere'
      | 'Cross-dressing'
      | 'Cultivation'
      | 'Sect Development'
      | 'Master-Disciple Relationship'
      | 'Dao Companion'
      | 'Alchemy'
      | 'Martial Spirits'
      | 'Immortals'
      | 'Multiple Realms'
      | 'Strength-based Social Hierarchy'
      | 'Bloodlines'
      | 'Ancient China'
      | 'Magic'
      | 'Magic Beasts'
      | 'Dragons'
      | 'Elves'
      | 'Demons'
      | 'Demon Lord'
      | 'Gods'
      | 'Vampires'
      | 'Werebeasts'
      | 'Zombies'
      | 'Ghosts'
      | 'Witches'
      | 'Necromancer'
      | 'Beastkin'
      | 'Monster Tamer'
      | 'Curses'
      | 'Artificial Intelligence'
      | 'Androids'
      | 'Aliens'
      | 'Cosmic Wars'
      | 'Apocalypse'
      | 'Post-apocalyptic'
      | 'Dystopia'
      | 'Genetic Modifications'
      | 'Virtual Reality'
      | 'Time Travel'
      | 'Game Elements'
      | 'Level System'
      | 'MMORPG'
      | 'Dungeons'
      | 'Tower Climbing'
      | 'Cheats'
      | 'Hidden Abilities'
      | 'Transported into a Game World'
      | 'Survival Game'
      | 'e-Sports'
      | 'Modern Knowledge'
      | 'Business Management'
      | 'Showbiz'
      | 'Celebrities'
      | 'Medical Knowledge'
      | 'Organized Crime'
      | 'Academy'
      | 'College/University'
      | 'Nobles'
      | 'Royalty'
      | 'Court Official'
      | 'Imperial Harem'
      | 'Kingdom Building'
      | 'Politics'
      | 'Schemes And Conspiracies'
      | 'Wars'
      | 'Military'
      | 'Medieval'
      | 'Reincarnation'
      | 'Transmigration'
      | 'Transported to Another World'
      | 'Returning from Another World'
      | 'Parallel Worlds'
      | 'Time Loop'
      | 'Time Skip'
      | 'Second Chance'
      | 'Amnesia'
      | 'Hiding True Identity'
      | 'Mistaken Identity'
      | 'Body Swap'
      | 'Possession'
      | 'Prophecies'
      | 'Revenge'
      | 'Villainess Noble Girls'
      | 'Assassins'
      | 'Mercenaries'
      | 'Knights'
      | 'Ninjas'
      | 'Samurai'
      | 'Pirates'
      | 'Hunters'
      | 'Strategic Battles'
      | 'Battle Competition'
      | 'Harsh Training'
      | 'Sword Wielder'
      | 'Firearms'
      | 'Farming'
      | 'Cooking'
      | 'Crafting'
      | 'Blacksmith'
      | 'Herbalist'
      | 'Merchants'
      | 'Healers'
      | 'Easy Going Life'
      | 'Found Family'
      | 'Survival'
      | 'Betrayal'
      | 'Past Trauma'
      | 'Death of Loved Ones'
      | 'Bullying'
      | 'Discrimination'
      | 'Slaves'
      | 'Human Experimentation'
      | 'Drugs'
      | 'Depression'
      | 'Terminal Illness';
    /** @enum {string} */
    SexualContentRating: 'none' | 'suggestive' | 'moderate' | 'explicit';
    /** @enum {string} */
    ViolenceRating: 'none' | 'mild' | 'graphic' | 'extreme';
    /** @enum {string} */
    DarkContentRating: 'none' | 'mild' | 'heavy';
    IngestNovelResponse: {
      projectId: string;
      /** @description False when the source reference already named a project — the push carried no metadata across, because the forge owns it once landed. */
      created: boolean;
    };
    IngestChapterBody: {
      title: string;
      /** @description The chapter prose, landed verbatim as a locked human final. */
      content: string;
      /** @description Reader-facing author note; not part of the identity the idempotent re-push compares. */
      authorNote?: string;
    };
    IngestCoverBody: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded image bytes without a data URL prefix. */
      image: string;
    };
    IngestManifestResponse: {
      projectId: string;
      /** @description Every ingested chapter in source order; chapters the forge itself inserted carry no source ordinal and are absent. */
      chapters: components['schemas']['IngestManifestChapter'][];
    };
    IngestManifestChapter: {
      sourceOrdinal: number;
      /** @description Digest of exactly `{ title, content, authorNote: null }` as pushed, stamped once when the chapter landed, so a scraper can re-hash its own copy and skip an unchanged chapter. It is deliberately not the published digest, which also covers the author note and the content rating. */
      contentHash: string;
    };
    CreateProjectBody: {
      name: string;
      kind: components['schemas']['ProjectKind'];
      title?: string;
      /** @description Instructions for chapter voice, craft, and length; omission uses the application default. */
      instructions?: string;
      contentMode?: components['schemas']['ContentMode'];
    };
    /** @enum {string} */
    ProjectKind: 'source' | 'new_novel';
    /** @enum {string} */
    ContentMode: 'standard' | 'unrestricted';
    ProjectResponse: {
      id: string;
      name: string;
      kind: components['schemas']['ProjectKind'];
      /** @description A `seed` project is an Ideation Studio idea and has no bible, plan, or chapters until it graduates. */
      status: components['schemas']['ProjectStatus'];
      title?: null | string;
      /** @description Absolute public cover URL resolved by the server; absent when the project has no cover. */
      coverUrl?: null | string;
      contentMode: components['schemas']['ContentMode'];
      config?: components['schemas']['ProjectConfig'];
      brief?: null | string;
      /** @description Effective chapter-writing instructions, including the application default. */
      instructions?: null | string;
      storyCurrentChapter?: null | number;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ProjectStatus: 'seed' | 'active';
    ProjectConfig: {
      models?: components['schemas']['ProjectModelOverrides'];
    };
    /** @description Optional provider and model overrides keyed by AI role. */
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
    /** @description Provider and model reference used for a project-level AI role override. */
    ProjectModelRef: {
      provider: string;
      model: string;
    };
    /** @enum {string} */
    SortOrder: 'asc' | 'desc';
    /** @enum {string} */
    SortByTime: 'createdAt' | 'updatedAt';
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
      /** @description Chapter-writing instructions; send an empty string to restore the application default. */
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
    UploadImageBody: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded image bytes without a data URL prefix. */
      image: string;
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
      /** @description Artifact keys for the retrieval context used to build this draft. */
      contextRefs?: null | string[];
      /** @description 'external' means the primary writer's batch loop skips this slot; fill it via generate-unrestricted or POST /drafts/:n/import instead of the normal generate button. */
      writeMode: components['schemas']['BriefWriteMode'];
      /**
       * Format: date-time
       * @description Set when this brief was created by the insert operation rather than by an outline pass.
       */
      insertedAt?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    BriefWriteMode: 'standard' | 'external';
    OutlineArcBody: {
      context?: string;
    };
    ListBriefSummaryResponse: {
      items: components['schemas']['BriefSummaryResponse'][];
    };
    /** @description A brief's identity and freshness without its body. */
    BriefSummaryResponse: {
      chapter: number;
      volumeKey?: null | string;
      arcKey?: null | string;
      title?: null | string;
      staleReason?: null | string;
      /** @description 'external' means the primary writer's batch loop skips this slot; fill it via generate-unrestricted or POST /drafts/:n/import instead of the normal generate button. */
      writeMode: components['schemas']['BriefWriteMode'];
      /**
       * Format: date-time
       * @description Set when this brief was created by the insert operation rather than by an outline pass.
       */
      insertedAt?: null | string;
      /** Format: date-time */
      updatedAt: string;
    };
    UpdateBriefBody: {
      title?: string;
      body: string;
      /** @description Replacement knowledge contract. Omit to leave the existing contract unchanged. */
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
      /** @description Present when the batch was cut short of its limit: this chapter is an external-write slot that must be filled by hand before generation continues past it. */
      stoppedAtExternalChapter?: number;
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
      /** @description Event-specific payload. */
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
      staleReason?: null | string;
      generator: string;
      /** @description Firewalls this chapter's prose from the vector index, continuity extraction, and the verbatim-prose adjacency rule. Independent of `generator` — a pasted chapter can be `generator: 'human'` and still isolated. */
      isolated: boolean;
      /** @description Content rating of this draft's prose; null means unrated — never "none". */
      contentRating?: components['schemas']['ContentRatingInput'] | null;
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
    ContentRatingInput: {
      /** @description Content rating level; an omitted dimension is unrated — never send "none" to say it. */
      sexualContent?: components['schemas']['SexualContentRating'];
      /** @description Content rating level; an omitted dimension is unrated — never send "none" to say it. */
      violence?: components['schemas']['ViolenceRating'];
      /** @description Content rating level; an omitted dimension is unrated — never send "none" to say it. */
      darkContent?: components['schemas']['DarkContentRating'];
    };
    UpdateDraftBody: {
      title?: string;
      body: string;
      summary?: string;
      /** @description Opaque workflow-specific draft state produced by the generation graph. */
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
    DraftRevisionSource: 'generated' | 'patched' | 'rewritten' | 'revised' | 'imported' | 'hand_edited' | 'chat_edited' | 'amended';
    MarkdownResponse: {
      markdown: string;
    };
    ImportDraftBody: {
      prose: string;
      title?: string;
      summary?: string;
      /** @description Rating of the pasted prose; omission keeps the stored rating, an empty object clears it back to unrated. */
      contentRating?: components['schemas']['ContentRatingInput'];
      /** @description Continuation state the next chapter builds on; omission keeps the stored state. */
      state?: {
        [key: string]: unknown;
      };
      /** @description Firewalls this prose from the vector index, continuity extraction, and the verbatim-prose adjacency rule. Omission keeps the stored value — send false to lift an existing firewall. */
      isolated?: boolean;
    };
    FinalizeBody: {
      chapter?: number;
    };
    GenerateUnrestrictedBody: {
      guidance?: string;
      /** @description Rating of the generated prose; omission keeps the stored rating, an empty object clears it back to unrated. */
      contentRating?: components['schemas']['ContentRatingInput'];
    };
    ChapterSummarizeResponse: {
      /** @description 2-3 sentence summary of what happened in the chapter, past tense — not persisted until saved through PUT /drafts/:n. */
      summary: string;
      /** @description Continuation state the next chapter would build on — review and edit before saving through PUT /drafts/:n. */
      state: {
        [key: string]: unknown;
      };
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
      /** @description Proposed operations, each discriminated by its op field. */
      changeSet: components['schemas']['ChangeOpItem'][];
      /** @description Artifact snapshots keyed by the references the change-set was drafted against. */
      baseline: {
        [key: string]: unknown;
      };
      autoApplied: boolean;
      /** @description Whether this proposal has been applied and carries inverse operations, allowing it to be reverted. */
      revertible: boolean;
      /** @description Apply-time result for each operation. */
      opResults?: null | components['schemas']['OpResultItem'][];
      model?: null | string;
      runId?: null | string;
      /** Format: date-time */
      appliedAt?: null | string;
      /** Format: date-time */
      revertedAt?: null | string;
      /** @description Error-source-specific failure details recorded when proposal application fails. */
      error?: null | {
        [key: string]: unknown;
      };
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ChatScope: 'project' | 'novel' | 'bible_document' | 'volume_plan' | 'volume' | 'arc_plan' | 'arc' | 'brief' | 'ideation';
    /** @enum {string} */
    RefinementKind: 'chat' | 'hub' | 'premise_enhance' | 'bible_audit' | 'arc_plan' | 'chapter_extract' | 'ideation';
    /** @enum {string} */
    RefinementProposalStatus: 'pending' | 'applied' | 'discarded' | 'superseded' | 'conflicted' | 'reverted';
    /** @description Change-set operation whose remaining fields depend on its server-validated op value. */
    ChangeOpItem: {
      op: string;
    } & {
      [key: string]: unknown;
    };
    /** @description Apply-time disposition for one operation, optionally including a job, run, or proposal result. */
    OpResultItem: {
      index: number;
      status: string;
      error?: string;
      /** @description Why an op nobody rejected was declined anyway — an action that may not run from an auto-mode turn. */
      note?: string;
      result?: {
        [key: string]: unknown;
      };
    } & {
      [key: string]: unknown;
    };
    UpdateContinuityBody: {
      /** @description Continuity findings and suggested edits produced by the continuity model. */
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
      /** @description Workflow-specific input captured for this run. */
      input?: null | {
        [key: string]: unknown;
      };
      error?: null | {
        [key: string]: unknown;
      };
      nodeTrace?: null | string[];
      /** @description Model calls made by this run. Included only by the run-detail endpoint. */
      modelCalls?: components['schemas']['RunModelCallResponse'][];
      /** @description Tool lookups performed by this run. Included only by the run-detail endpoint. */
      toolCalls?: components['schemas']['RunToolCallResponse'][];
      /** @description Prompt context breakdown. Included only by the run-detail endpoint when linked. */
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
    /** @description A read-only lookup performed by a model during a run. */
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
    /** @description The context sections that contributed to a run's prompt token usage. */
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
    /** @description The context sections that contributed to a run's prompt token usage. */
    RunContextResponse: {
      id: string;
      purpose: string;
      budgetTokens?: null | number;
      usedTokens?: null | number;
      sections: components['schemas']['RunContextSectionItem'][];
      /** @description The exact stable and volatile context text supplied to the prompt, in order. */
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
      /** @description Per-role usage sorted by total token count in descending order. */
      roles: components['schemas']['RoleUsage'][];
    };
    /** @description Model call counts keyed by AI role. */
    RoleCallCounts: {
      [key: string]: number;
    };
    RoleUsage: {
      /** @description An AI role identifier, including scoped roles such as 'bible:plot'. */
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
      /** @description Index-specific vector metadata, including source references and chunk information. */
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
      /** @description Absolute public URL for the stored scene image. */
      imageUrl: string;
      caption?: null | string;
      sortOrder: number;
      /** Format: date-time */
      createdAt: string;
    };
    AddChapterImageBody: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded image bytes without a data URL prefix. */
      image: string;
      caption?: string;
    };
    InsertChapterBody: {
      /**
       * @description 'hand' takes briefBody verbatim; 'planner' drafts the brief from intent.
       * @enum {string}
       */
      briefOrigin: 'hand' | 'planner';
      /** @description The brief body to store verbatim. Required when briefOrigin is 'hand'. */
      briefBody?: string;
      /** @description One line describing what the inserted chapter must do. Required when briefOrigin is 'planner'. */
      intent?: string;
    };
    /** @description The brief created in the freed slot, plus the extent of the renumber that freed it. */
    InsertChapterResponse: {
      brief: components['schemas']['BriefResponse'];
      /** @description Number the inserted chapter now occupies. */
      newChapter: number;
      /** @description How many briefs the insert renumbered. */
      shiftedChapters: number;
    };
    AmendChapterBody: {
      /** @description Replacement prose for the finalized chapter. Amend is the only path that writes past the immutability lock, and it never unlocks the chapter. */
      content: string;
      /** @description Replacement title; omission keeps the stored title. */
      title?: string;
      /** @description Replacement author's note; omission keeps the stored note. The note reaches the reader, so changing it does move the published payload. */
      note?: string;
      /** @description Rating of the amended prose; omission keeps the stored rating, an empty object clears it back to unrated. */
      contentRating?: components['schemas']['ContentRatingInput'];
    };
    /** @description Outcome of amending finalized canon in place. The amendment is prose-only: the bible, continuity, and downstream chapters are untouched. */
    AmendChapterResponse: {
      chapter: number;
      /** @description Word count recomputed from the amended prose. */
      wordCount: number;
      /** @description False when the chapter is isolated (isolated prose is never indexed) or the re-embed failed. A failed re-embed leaves the chapter unindexed until the next backfill; the amended prose is committed either way. */
      indexed: boolean;
      /** @description True when the reader-facing payload hash moved and the publication was rescheduled for the next push sweep. An unchanged payload never republishes. */
      republished: boolean;
      /** @description Publication revision after the bump; absent when nothing was republished. */
      publicationRevision?: number;
      /** @description Always true. Amend replaces prose only, so anything this chapter already contributed to the bible stays there and keeps propagating — offer POST /chapters/:n/extract-to-bible so the author can re-derive canon deliberately. */
      suggestExtractToBible: boolean;
    };
    JobResponse: {
      id: string;
      projectId: string;
      kind: components['schemas']['JobKind'];
      target: string;
      status: components['schemas']['JobStatus'];
      attempts: number;
      lastError?: null | string;
      /** @description Job input whose fields depend on the job kind. */
      payload?: null | {
        [key: string]: unknown;
      };
      /** @description Current progress snapshot whose fields depend on the job kind. */
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
      /** @description Replacement change-set operations, each discriminated by its op field. */
      changeSet: components['schemas']['ChangeOpItem'][];
    };
    ApplyProposalBody: {
      /** @description Change-set indexes to apply; omission applies every operation. */
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
      /** @description Newest applied proposal to keep; every later proposal is reverted newest first. */
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
      /** @description Whether a chat turn is currently running for this session. */
      pendingTurn: boolean;
    };
    ChatMessageResponse: {
      id: string;
      sessionId: string;
      ordinal: number;
      role: string;
      content: string;
      /** @description Structured turn payload the studio renders beside the prose. Discriminated by `kind`: "questions" (option chips), "cards" (concept cards), "readiness" (the stress table). */
      payload?: null | Record<string, never>;
      proposalId?: null | string;
      runId?: null | string;
      modelProvider?: null | string;
      modelId?: null | string;
      /** Format: date-time */
      createdAt: string;
    };
    ChatTurnBody: {
      /** @description Chat content; accepts long premises, chapters, and reference documents up to 200,000 characters. */
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
      /** @description the story seed sheet as this turn left it; present only on Ideation Studio turns */
      seed?: components['schemas']['SeedResponse'];
      runId: string;
    };
    /** @description Proposal application outcome returned as part of an automatic-mode turn. */
    TurnAppliedResult: {
      applied: components['schemas']['AppliedArtifactItem'][];
      staleMarked: string[];
      opResults: components['schemas']['OpResultItem'][];
    };
    SeedResponse: {
      id: string;
      projectId: string;
      /** @description The ideation chat session driving this seed. */
      sessionId?: null | string;
      fields: components['schemas']['SeedFieldsResponse'];
      provenance: components['schemas']['SeedProvenanceResponse'];
      constraints: components['schemas']['SeedConstraintResponse'][];
      tasteAnchors: components['schemas']['TasteAnchorsResponse'];
      concepts: components['schemas']['ConceptCardResponse'][];
      /** @description The last stress-pass result; empty until a stress pass has run. */
      readiness: components['schemas']['ReadinessEntryResponse'][];
      /** @description Question-bank ids already answered or skipped, which is what the question router remembers. */
      askedQuestions: string[];
      revision: number;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @description The story seed sheet — idea altitude only: no places, chapter structure, or volume detail. */
    SeedFieldsResponse: {
      genre?: string;
      themes?: string[];
      premise?: string;
      hook?: string;
      /** @description Lead count plus configuration — one lead, dual leads bonded, an ensemble of four. */
      castShape?: string;
      progressionSystem?: string;
      protagonistDrive?: string;
      stakes?: string;
      serializationNotes?: string;
      voice?: string;
      workingTitle?: string;
    };
    /** @description Provenance for each sheet field the studio or the author has settled. */
    SeedProvenanceResponse: {
      genre?: components['schemas']['FieldProvenanceResponse'];
      themes?: components['schemas']['FieldProvenanceResponse'];
      premise?: components['schemas']['FieldProvenanceResponse'];
      hook?: components['schemas']['FieldProvenanceResponse'];
      castShape?: components['schemas']['FieldProvenanceResponse'];
      progressionSystem?: components['schemas']['FieldProvenanceResponse'];
      protagonistDrive?: components['schemas']['FieldProvenanceResponse'];
      stakes?: components['schemas']['FieldProvenanceResponse'];
      serializationNotes?: components['schemas']['FieldProvenanceResponse'];
      voice?: components['schemas']['FieldProvenanceResponse'];
      workingTitle?: components['schemas']['FieldProvenanceResponse'];
    };
    /** @description Who settled one sheet field, and on which turn. */
    FieldProvenanceResponse: {
      /** @enum {string} */
      source: 'author' | 'studio' | 'crossed';
      /** @description The chat ordinal that settled the field; null when no conversational turn did. */
      turnOrdinal: null | number;
    };
    SeedConstraintResponse: {
      key: string;
      /** @enum {string} */
      kind: 'shape' | 'scope' | 'promise';
      text: string;
      /** @description The matching constraint playbook; absent when nothing in the library recognised the constraint. */
      playbookKey?: string;
      /** @enum {string} */
      lockedBy: 'author' | 'inferred';
    };
    TasteAnchorsResponse: {
      /** @description Comparable works the author named at the Taste stage. */
      comps: string[];
      /** @description The preferences derived from those comps, in editor terms. */
      preferences: string[];
    };
    ConceptCardResponse: {
      /** @description The card's stable identity, minted when the round was generated; verdicts are attributed by it, never by position. */
      id: string;
      round: number;
      title: string;
      logline: string;
      engine: string;
      ladder: string;
      posture: string;
      /** @description The line that would make a browsing reader open chapter one. */
      hookLine?: string;
      /**
       * @description Offered until the author reacts to the card, then their verdict.
       * @enum {string}
       */
      fate: 'offered' | 'kept' | 'killed' | 'crossed';
      reason?: string;
    };
    ReadinessEntryResponse: {
      dimension: string;
      /** @enum {string} */
      verdict: 'strong' | 'thin' | 'empty';
      note: string;
      fix?: string;
    };
    UpdateChatSessionBody: {
      mode?: components['schemas']['ChatMode'];
      title?: string;
    };
    UpdateSessionModelBody: {
      /** @description Model provider override; clear both override fields to use the project or profile default. */
      provider?: string | null;
      /** @description Model name override; clear both override fields to use the project or profile default. */
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
      omitted: components['schemas']['OmittedSectionPreview'][];
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
    OmittedSectionPreview: {
      key: string;
      /** @description why the section did not reach the model: 'budget' (evicted) or 'unresolved' (ref never resolved) */
      reason: string;
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
      /** @description Canonical visual description; anchors every generated illustration of this entity so re-rolls keep the same look. */
      appearance?: string;
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
      /** @description Canonical visual description used as the anchor for generated illustrations. */
      appearance?: null | string;
      /** @description Absolute public URL for the portrait, or null when the entity has no portrait. */
      imageUrl?: null | string;
      /** @description The entity's additional reference images. Included by the single-entity endpoint. */
      images?: components['schemas']['EntityImageResponse'][];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    EntityImageResponse: {
      id: string;
      /** @description Absolute public URL for the stored image. */
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
      /** @description Canonical visual description; anchors every generated illustration of this entity so re-rolls keep the same look. */
      appearance?: string;
      aliases?: string[];
    };
    UploadImageBody1: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded image bytes without a data URL prefix. */
      image: string;
    };
    AddEntityImageBody: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded image bytes without a data URL prefix. */
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
      /** @description Entity keys for the characters featured in this volume. */
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
      /** @description Entity keys for the characters featured in this volume. */
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
      /** @description Entity keys for the characters featured in this volume. */
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
      /** @description Author-authored YAML frontmatter with document-specific keys. */
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
      /** @description Author-authored YAML frontmatter with document-specific keys. */
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
    FactSource: 'brief' | 'manual' | 'import' | 'seed' | 'generated';
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
    CreateSeedBody: {
      /** @description The idea as the author first typed it; kept verbatim as the opening turn of the studio conversation. */
      spark?: string;
      /** @description Content policy for the seed. Unrestricted routes studio chat through models that will write adult material. */
      contentMode?: components['schemas']['ContentMode'];
    };
    ListSeedsResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['SeedSummaryResponse'][];
    };
    /** @description One card on the Ideas shelf. */
    SeedSummaryResponse: {
      id: string;
      projectId: string;
      sessionId?: null | string;
      workingTitle?: null | string;
      /** @description Opening of the spark the author typed, for a seed that has not earned a working title yet. */
      sparkExcerpt?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @description The result of a stress pass: the readiness verdict and the sheet carrying it. */
    SeedStressResponse: {
      seed: components['schemas']['SeedResponse'];
      /** @description The verdict per dimension, in the fixed dimension order. It advises; it never blocks graduation. */
      readiness: components['schemas']['ReadinessEntryResponse'][];
      runId: string;
    };
    GraduateSeedBody: {
      /** @description The novel’s title. Graduation names the project after it; there is no other hard requirement beyond a premise. */
      title: string;
    };
    /** @description What graduation wrote: the project, the two handoff documents, the betrayal facts, and the provenance honesty check. */
    GraduationResponse: {
      project: components['schemas']['GraduatedProjectResponse'];
      provenance: components['schemas']['ProvenanceSummaryResponse'];
      /** @description The `section/slug` of every bible document graduation wrote — the entire handoff into lore-bible refinement. */
      documents: string[];
      /** @description Canon facts written for the named reader-promise betrayals, and nothing else. */
      factKeys: string[];
    };
    /** @description The project the seed became. */
    GraduatedProjectResponse: {
      id: string;
      name: string;
      title?: null | string;
      /** @enum {string} */
      status: 'seed' | 'active';
      premise?: null | string;
      themes?: null | string[];
      /** @description The chapter-instruction channel, now carrying the narration voice the studio settled. */
      instructions?: null | string;
    };
    /** @description The honesty check: how much of the graduated sheet the author decided themselves. The seed is deleted at graduation, so this response is the last place it can be read. */
    ProvenanceSummaryResponse: {
      /** @description Sheet fields carrying a value. */
      filled: number;
      author: number;
      studio: number;
      crossed: number;
      /** @description Filled fields with no recorded source — counted apart so the check never overstates authorship. */
      unattributed: number;
      fields: components['schemas']['ProvenanceFieldResponse'][];
    };
    /** @description One sheet field and where its value came from. */
    ProvenanceFieldResponse: {
      field: string;
      /**
       * @description Absent when the sheet carries a value the studio never recorded a source for.
       * @enum {string}
       */
      source?: 'author' | 'studio' | 'crossed';
      /** @description The chat ordinal that settled the field; null when no conversational turn did. */
      turnOrdinal?: null | number;
    };
    StartIllustrationBody: {
      subjectType: components['schemas']['IllustrationSubjectType'];
      /** @description Entity key for 'entity', the chapter number for 'chapter'; omitted for the project cover. */
      subjectKey?: string;
      /** @description Opening art direction from the author; becomes the first entry in the prompt spec instruction list. */
      instruction?: string;
    };
    /** @enum {string} */
    IllustrationSubjectType: 'entity' | 'chapter' | 'cover';
    IllustrationResponse: {
      id: string;
      projectId: string;
      subjectType: components['schemas']['IllustrationSubjectType'];
      subjectKey?: null | string;
      status: components['schemas']['IllustrationStatus'];
      revision: number;
      /** @description The author instruction list, in application order — refine edits address it by index. */
      instructions: string[];
      /** @description The exact prompt text sent to the image model for the current revision. */
      prompt: string;
      candidates: components['schemas']['IllustrationCandidateResponse'][];
      selectedRef?: null | string;
      selectedUrl?: null | string;
      /** @description Appearance the composer derived because the entity had none; PATCH it onto the entity to make it canon. */
      suggestedAppearance?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    IllustrationStatus: 'active' | 'saved' | 'discarded';
    IllustrationCandidateResponse: {
      ref: string;
      /** @description Absolute public object-storage URL resolved using the server runtime configuration. */
      imageUrl: string;
      createdAt: string;
      instructionsHash: string;
    };
    ListIllustrationsResponse: {
      items: components['schemas']['IllustrationResponse'][];
    };
    /** @description Exactly one structured edit to the prompt spec instruction list. */
    RefineIllustrationBody: {
      /** @description Appends an instruction. */
      add?: string;
      /** @description Removes the instruction at this index. */
      removeIndex?: number;
      /** @description Replaces the instruction at the given index. */
      replace?: components['schemas']['ReplaceInstruction'];
    };
    ReplaceInstruction: {
      index: number;
      text: string;
    };
    SelectIllustrationBody: {
      /** @description Storage ref of the candidate to select; must be one of this illustration’s candidates. */
      ref: string;
    };
    SaveIllustrationBody: {
      /** @description Where the selected image lands: 'portrait' and 'gallery' for an entity subject, 'chapter' for a chapter subject, 'cover' for the project cover. */
      target: components['schemas']['IllustrationSaveTarget'];
    };
    /** @enum {string} */
    IllustrationSaveTarget: 'portrait' | 'gallery' | 'chapter' | 'cover';
    LegacyStartIllustrationBody: {
      instruction?: string;
    };
    LegacyStartIllustrationResponse: {
      sessionId: string;
      previewUrl: string;
    };
    LegacyRefineIllustrationBody: {
      /** @description Illustration id, named `sessionId` for the retired in-memory session API. */
      sessionId: string;
      instruction: string;
    };
    LegacyRefineIllustrationResponse: {
      previewUrl: string;
    };
    LegacySessionBody: {
      /** @description Illustration id, named `sessionId` for the retired in-memory session API. */
      sessionId: string;
    };
    LegacySaveIllustrationResponse: {
      saved: boolean;
      /** @description Absolute public object-storage URL resolved using the server runtime configuration. */
      imageUrl: string;
    };
    LegacyCancelIllustrationResponse: {
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
      /** @description Ordered volume groups; global chapter numbers are derived by flattening them in ordinal order. */
      volumes: components['schemas']['NovelImportVolume'][];
      assets?: components['schemas']['NovelImportAsset'][];
    };
    /** @enum {string} */
    NovelImportMode: 'final' | 'source';
    NovelImportMeta: {
      /** @description Novel title, limited to the project name column capacity. */
      title: string;
      /** @description Novel overview used as the project's brief and exported description. */
      synopsis: string;
      /** @description Optional authoring metadata; accepted but not currently persisted. */
      genre?: string;
      /** @description Novel tags stored as project themes. */
      tags?: string[];
      /** @description Name of the bundle asset to use as the novel cover. */
      cover?: string;
      /** @description Chapter-writing instructions; omission uses the application default. */
      instructions?: string;
    };
    NovelImportVolume: {
      /** @description One-based volume position; ordinals must be unique and contiguous across the bundle. */
      ordinal: number;
      title?: string;
      chapters: components['schemas']['NovelImportChapter'][];
    };
    NovelImportChapter: {
      /** @description Chapter title, limited to the database column capacity. */
      title: string;
      content: string;
    };
    NovelImportAsset: {
      /** @description Asset name referenced by novel.cover; it must be unique within the bundle. */
      name: string;
      /** @enum {string} */
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded bytes without a data URL prefix. */
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
      /** @description Source-derived character arcs keyed by the model's unrestricted character identifiers. */
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
      /** @description Named banned-term packs to scan for (see banned-terms.ts); default ['east-asian']. Reforge reuses this project's selection. */
      termPacks?: string[];
      /** @description Max repair attempts before persisting as attention (default 1). */
      maxRepairs?: number;
    };
    RebrandResponse: {
      id: string;
      status: components['schemas']['RebrandStatus'];
      directives?: null | string;
      worldNotes?: null | string;
      /** @description Settings used for this rebrand run. */
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
      /** @description Latest rebrand job, including its job-specific progress fields. */
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
    /** @description Model-reported audit entry whose fields vary by source. */
    ConversionDetailItem: {
      detail?: string;
    } & {
      [key: string]: unknown;
    };
    ManuscriptResponse: {
      markdown: string;
      /** @description Chapters that failed conversion and are missing from the markdown below. */
      failedChapters: number[];
    };
    ReforgeConfigBody: {
      instructions?: string | null;
      fidelity?: components['schemas']['ReforgeFidelity'];
      /** @description chapter = the 1:1 re-author; transform = the plan-driven structural mode, which forces fidelity: loose. */
      mode?: components['schemas']['ReforgeMode'];
      settings?: components['schemas']['ReforgeSettingsBody'];
    };
    /** @enum {string} */
    ReforgeFidelity: 'preserve' | 'close' | 'loose';
    /** @enum {string} */
    ReforgeMode: 'chapter' | 'transform';
    ReforgeSettingsBody: {
      judgeEnabled?: boolean;
      targetWords?: number;
      /** @description Transform mode: source chapters per analysis window (default 15). */
      analysisWindow?: number;
      /** @description Transform mode: whole-novel length ratio the plan drafter aims for — a hint, never a per-span rule. */
      targetCompression?: number;
      /** @description Transform mode: shortest span the plan may contain (default 1). */
      minSpanChapters?: number;
      /** @description Transform mode: source chapters one output chapter may be written from (default 6). */
      maxSpanSourceChapters?: number;
      /** @description Chapter mode: max repair attempts before persisting as attention (default 1). */
      maxRepairs?: number;
    };
    ReforgeResponse: {
      id: string;
      status: components['schemas']['ReforgeStatus'];
      instructions?: null | string;
      fidelity: components['schemas']['ReforgeFidelity'];
      mode: components['schemas']['ReforgeMode'];
      /** @description Settings used for this reforge run. */
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
      /** @description Latest reforge job, including its job-specific progress fields. */
      job?: null | {
        [key: string]: unknown;
      };
      /** @description Present only in transform mode — the plan, its outputs, and its cut ledger. */
      transform?: components['schemas']['ReforgeTransformStatusResponse'];
    };
    ReforgeCountsResponse: {
      reforged: number;
      attention: number;
      failed: number;
    };
    ReforgeTransformStatusResponse: {
      /** @description The newest plan revision; outputs under an older one are stale. */
      plan?: components['schemas']['ReforgePlanHeaderResponse'];
      counts: components['schemas']['ReforgeOutputCountsResponse'];
      cuts: number;
    };
    ReforgePlanHeaderResponse: {
      id: string;
      revision: number;
      status: components['schemas']['ReforgePlanStatus'];
      sourceChapterCount: number;
      outputChapterCount: number;
      /** Format: date-time */
      approvedAt?: null | string;
      promotedProjectId?: null | string;
    };
    /** @enum {string} */
    ReforgePlanStatus: 'draft' | 'pending' | 'approved' | 'superseded';
    ReforgeOutputCountsResponse: {
      written: number;
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
      /** @description Faithful outline used by the reforge writer. */
      sourceBeats?: null | {
        [key: string]: unknown;
      };
      /** @description Changes applied by the reforge writer. */
      changes?: null | {
        [key: string]: unknown;
      };
      /** @description Fidelity assessment for the reforge output. */
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
    /** @description Model-reported audit issue whose fields vary by source. */
    ReforgeDetailItem: {
      detail?: string;
    } & {
      [key: string]: unknown;
    };
    ReforgeAnalysisStatusResponse: {
      analysis: components['schemas']['ReforgeAnalysisResponse'];
      /** @description Finding count per finding type. */
      findingCounts: {
        [key: string]: unknown;
      };
    };
    ReforgeAnalysisResponse: {
      id: string;
      status: components['schemas']['ReforgeAnalysisStatus'];
      windowSize: number;
      chaptersAnalyzed: number;
      /** @description Windows that failed and were flagged rather than aborting the run. */
      windowsFailed: number;
      metrics?: components['schemas']['ReforgeAnalysisMetricsResponse'];
      lastError?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ReforgeAnalysisStatus: 'pending' | 'signals' | 'analyzing' | 'synthesizing' | 'done' | 'failed';
    ReforgeAnalysisMetricsResponse: {
      /** @description Share of source chapters that reuse scene material found elsewhere in the novel. */
      repetitionRatio: number;
      /** @description Share of source chapters the reading pass rated as not moving the story. */
      stallRatio: number;
      medianWords: number;
      arcCount: number;
      deadThreadCount: number;
    };
    ReforgeReportResponse: {
      markdown: string;
    };
    /** @enum {string} */
    ReforgeFindingType: 'filler' | 'repetition' | 'pacing_stall' | 'dead_subplot' | 'dropped_thread' | 'arc_boundary' | 'quality_outlier' | 'window_failed';
    ListReforgeFindingsResponse: {
      items: components['schemas']['ReforgeFindingResponse'][];
      total: number;
    };
    ReforgeFindingResponse: {
      id: string;
      type: components['schemas']['ReforgeFindingType'];
      fromChapter: number;
      toChapter: number;
      severity: number;
      confidence: number;
      /** @description signal = mechanical only, model = reading pass only, both = the reading pass confirmed a signal. */
      detectedBy: components['schemas']['ReforgeFindingSource'];
      label: string;
      detail?: null | string;
      /** @description Detector evidence behind the finding. */
      evidence?: null | {
        [key: string]: unknown;
      };
    };
    /** @enum {string} */
    ReforgeFindingSource: 'signal' | 'model' | 'both';
    ReforgePlanDetailResponse: {
      plan: components['schemas']['ReforgePlanResponse'];
      spans: components['schemas']['ReforgePlanSpanResponse'][];
      /** @description Derived from the running sum of targetChapters — never authored. */
      outputChapterCount: number;
    };
    ReforgePlanResponse: {
      id: string;
      revision: number;
      status: components['schemas']['ReforgePlanStatus'];
      summary?: null | string;
      sourceChapterCount: number;
      outputChapterCount: number;
      promotedProjectId?: null | string;
      /** Format: date-time */
      approvedAt?: null | string;
      /** Format: date-time */
      updatedAt: string;
    };
    ReforgePlanSpanResponse: {
      ordinal: number;
      fromChapter: number;
      toChapter: number;
      action: components['schemas']['ReforgeSpanAction'];
      /** @description Output chapters this span produces; 0 only for a drop. */
      targetChapters: number;
      arcLabel?: null | string;
      rationale?: null | string;
      /** @description Beats every output chapter of this span owes — the judge’s contract. */
      keptBeats?: null | string[];
      /** @description Threads this span removes; each seeds a cut-ledger entry at approval. */
      cutThreads?: null | string[];
      /** @description Required on a span that follows a dropped span — the bridge across the seam. */
      continuityNotes?: null | string;
      findingIds?: null | string[];
      /** @description Stable across revisions that leave the span’s bounds, action, and target untouched. */
      spanKey: string;
      /** @description First output chapter this span produces; null for a drop. */
      firstOutputChapter?: null | number;
      lastOutputChapter?: null | number;
    };
    /** @enum {string} */
    ReforgeSpanAction: 'keep' | 'condense' | 'merge' | 'drop';
    ReforgePlanSpansBody: {
      spans: components['schemas']['ReforgePlanSpanBody'][];
      /** @description The plan revision this edit was made against; a mismatch 409s rather than overwriting a newer one. */
      baseRevision?: number;
    };
    ReforgePlanSpanBody: {
      ordinal: number;
      fromChapter: number;
      toChapter: number;
      action: components['schemas']['ReforgeSpanAction'];
      /** @description Output chapters this span produces; 0 only for a drop. */
      targetChapters: number;
      arcLabel?: string | null;
      rationale?: string | null;
      /** @description Beats every output chapter of this span owes — the judge’s contract. */
      keptBeats?: string[] | null;
      /** @description Threads this span removes; each seeds a cut-ledger entry at approval. */
      cutThreads?: string[] | null;
      /** @description Required on a span that follows a dropped span — the bridge across the seam. */
      continuityNotes?: string | null;
      findingIds?: string[] | null;
    };
    ReforgePlanApproveBody: {
      /** @description The plan revision being approved; a mismatch 409s rather than approving a plan the author never read. */
      baseRevision?: number;
    };
    ReforgeTransformStartBody: {
      /** @description Output chapters to write; omitted means every output the plan derives that is not written yet. */
      outputs?: number[];
      /** @description Rewrite outputs that already landed instead of only the missing ones. */
      force?: boolean;
      /** @description Cap on outputs written in this run — a trial before committing the book. */
      limit?: number;
    };
    ListReforgeOutputsResponse: {
      items: components['schemas']['ReforgeOutputSummaryResponse'][];
    };
    ReforgeOutputSummaryResponse: {
      outputChapter: number;
      spanOrdinal: number;
      fromChapter: number;
      toChapter: number;
      /** @description 0-based slice of a condensed span. */
      indexInSpan: number;
      title?: null | string;
      status: components['schemas']['ReforgeOutputStatus'];
      issueCount: number;
      wordCount?: null | number;
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ReforgeOutputStatus: 'written' | 'attention' | 'failed';
    ReforgeOutputResponse: {
      outputChapter: number;
      spanOrdinal: number;
      fromChapter: number;
      toChapter: number;
      indexInSpan: number;
      title?: null | string;
      status: components['schemas']['ReforgeOutputStatus'];
      wordCount?: null | number;
      revision: number;
      /** Format: date-time */
      updatedAt: string;
      body: string;
      summary?: null | string;
      /** @description The kept beats this chapter owed — the judge’s contract. */
      planBeats?: null | string[];
      /** @description Changes the transform writer reported. */
      changes?: null | {
        [key: string]: unknown;
      };
      /** @description Plan-contract assessment from the transform judge. */
      fidelity?: null | {
        [key: string]: unknown;
      };
      issues?: null | components['schemas']['ReforgeDetailItem'][];
    };
    ReforgePromoteBody: {
      /** @description Title of the promoted project; defaults to the source project’s. */
      title?: string;
      /** @description Write the plan’s arc boundaries as volumes so the promoted project is immediately plannable. */
      seedVolumes?: boolean;
    };
    ListReforgeCutsResponse: {
      items: components['schemas']['ReforgeCutResponse'][];
    };
    ReforgeCutResponse: {
      cutKey: string;
      kind: components['schemas']['ReforgeCutKind'];
      label: string;
      aliases?: null | string[];
      detail?: null | string;
      disposition: components['schemas']['ReforgeCutDisposition'];
      replacementNote?: null | string;
      originSpanOrdinal: number;
      firstSourceChapter: number;
      lastSourceChapter: number;
      /** @description The cut never resurfaces at or after this output chapter. */
      effectiveFromOutput: number;
    };
    /** @enum {string} */
    ReforgeCutKind: 'subplot' | 'thread' | 'entity' | 'arc' | 'running_gag' | 'scene_pattern';
    /** @enum {string} */
    ReforgeCutDisposition: 'cut' | 'condensed' | 'resolved_early';
    ReforgeManuscriptResponse: {
      markdown: string;
      /** @description Chapters that failed reforging and are missing from the markdown below. Always empty in transform mode. */
      failedChapters: number[];
    };
    PublishNovelBody: {
      /** @description Reader URL slug; omission derives it from the title. A slug another project holds is rejected. A different one on a later publish renames the novel: the next converge moves it, chapters and all, and the old reader URL stops resolving. */
      novelSlug?: string;
      title?: string;
      /** @description The work’s own author, shown to readers alongside the title; null clears it, omission keeps the stored one and otherwise adopts the project’s. Setting a non-null value requires the novel-forge:curate permission — the forge only attributes work it did not write. */
      originalAuthor?: string | null;
      blurb?: string | null;
      coverPath?: string | null;
      /** @description Reader catalog genres; null clears them, omission keeps the stored ones. */
      genres?: components['schemas']['NovelGenre'][] | null;
      /** @description Reader catalog tags; null clears them, omission keeps the stored ones. */
      tags?: components['schemas']['NovelTag'][] | null;
      /** @description Content rating level; null clears it back to unrated, omission keeps the stored level. No level means unrated — never send "none" to say it. */
      sexualContent?: components['schemas']['SexualContentRating'] | null;
      /** @description Content rating level; null clears it back to unrated, omission keeps the stored level. No level means unrated — never send "none" to say it. */
      violence?: components['schemas']['ViolenceRating'] | null;
      /** @description Content rating level; null clears it back to unrated, omission keeps the stored level. No level means unrated — never send "none" to say it. */
      darkContent?: components['schemas']['DarkContentRating'] | null;
      /**
       * @description Publication status; omission defaults to 'live'.
       * @enum {string}
       */
      status?: 'live' | 'retired';
    };
    PublicationResponse: {
      id: string;
      novelSlug: string;
      title: string;
      originalAuthor?: null | string;
      blurb?: null | string;
      coverPath?: null | string;
      genres?: null | components['schemas']['NovelGenre'][];
      tags?: null | components['schemas']['NovelTag'][];
      sexualContent?: components['schemas']['SexualContentRating'] | null;
      violence?: components['schemas']['ViolenceRating'] | null;
      darkContent?: components['schemas']['DarkContentRating'] | null;
      status: components['schemas']['PublicationStatus'];
      revision: number;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    PublicationStatus: 'draft' | 'live' | 'retired';
    PublishChapterBody: {
      /** @description ISO 8601 release time; omission publishes immediately. */
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
      /** @description Verified account subject; absent addresses convey no access and are not pushed to the reader. */
      subjectId?: null | string;
      state: components['schemas']['PublicationGrantState'];
    };
    /** @enum {string} */
    PublicationGrantState: 'resolved' | 'pending';
    /** @description Full replacement for a publication access policy and its restricted-tier grants. */
    PublicationAccessBody: {
      visibility: components['schemas']['PublicationVisibility'];
      grants?: components['schemas']['AccessGrantInput'][];
    };
    AccessGrantInput: {
      email: string;
    };
    PublicationsLedgerResponse: {
      /** @description Publication details; omitted until the project is first published. */
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
      /** @description Reader chapter ordinals absent from the ledger; reported but never automatically deleted. */
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
      /** @description Reader wiki entries absent from the ledger; reported but never automatically deleted. */
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
      /** @description Canon facts used to populate the character-knowledge ledger. */
      facts?: components['schemas']['PlanBundleFact'][];
      volumes?: components['schemas']['PlanBundleVolume'][];
      arcs?: components['schemas']['PlanBundleArc'][];
      briefs?: components['schemas']['PlanBundleBrief'][];
    };
    PlanBundleBibleDoc: {
      section: components['schemas']['PlanBundleSection'];
      slug: string;
      /** @description Arbitrary key/value frontmatter for the Bible document. */
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
      /** @description Number of chapters in this volume; approval derives chapter ranges cumulatively. */
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
      /** @description Required pacing and ending constraints for the chapter. */
      endingContract: components['schemas']['EndingContractSchema'];
      /** @description Optional character-knowledge constraints; omission leaves the chapter unfiltered. */
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
    HookType: 'cliffhanger' | 'revelation' | 'quiet_dread' | 'promise' | 'turn' | 'closure_with_momentum' | 'earned_rest';
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
  get_api_v1_api_keys: {
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
          'application/json': components['schemas']['ListApiKeysResponse'];
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
  post_api_v1_api_keys: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateApiKeyBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreateApiKeyResponse'];
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
  delete_api_v1_api_keys_id: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
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
  put_api_v1_ingest_novels_sourceRef: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Stable external identity of the novel at its source, e.g. `mvlempyr:1234`. It is the only key the ingest surface accepts. */
        sourceRef: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IngestNovelBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IngestNovelResponse'];
        };
      };
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IngestNovelResponse'];
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
  put_api_v1_ingest_novels_sourceRef_chapters_sourceOrdinal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Stable external identity of the novel at its source, e.g. `mvlempyr:1234`. It is the only key the ingest surface accepts. */
        sourceRef: string;
        /** @description The chapter’s position at the source, counting from 1. It never changes, even when the forge renumbers its own chapters around an inserted one. */
        sourceOrdinal: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IngestChapterBody'];
      };
    };
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
  post_api_v1_ingest_novels_sourceRef_cover: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Stable external identity of the novel at its source, e.g. `mvlempyr:1234`. It is the only key the ingest surface accepts. */
        sourceRef: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['IngestCoverBody'];
      };
    };
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
  get_api_v1_ingest_novels_sourceRef_manifest: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Stable external identity of the novel at its source, e.g. `mvlempyr:1234`. It is the only key the ingest surface accepts. */
        sourceRef: string;
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
          'application/json': components['schemas']['IngestManifestResponse'];
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
        status?: components['schemas']['ProjectStatus'];
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
  post_api_v1_projects_projectId_chapters_n_generate_unrestricted: {
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
        'application/json': components['schemas']['GenerateUnrestrictedBody'];
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
  post_api_v1_projects_projectId_chapters_n_summarize: {
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
          'application/json': components['schemas']['ChapterSummarizeResponse'];
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
  post_api_v1_projects_projectId_chapters_afterChapter_insert: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        /** @description Insert the new chapter immediately after this number; 0 inserts ahead of chapter 1. */
        afterChapter: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['InsertChapterBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InsertChapterResponse'];
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
  post_api_v1_projects_projectId_chapters_n_amend: {
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
        'application/json': components['schemas']['AmendChapterBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AmendChapterResponse'];
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
        /** @description Chat session UUID. */
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
        /** @description Chat session UUID. */
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
        /** @description Chat session UUID. */
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
        /** @description Chat session UUID. */
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
        /** @description Chat session UUID. */
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
        /** @description Chat session UUID. */
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
        /** @description Chat session UUID. */
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
        /** @description Chat session UUID. */
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
        /** @description chat scope type */
        scopeType?: 'project' | 'novel' | 'bible_document' | 'volume_plan' | 'volume' | 'arc_plan' | 'arc' | 'brief' | 'ideation';
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
  get_api_v1_seeds: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
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
          'application/json': components['schemas']['ListSeedsResponse'];
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
  post_api_v1_seeds: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSeedBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SeedResponse'];
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
  get_api_v1_projects_projectId_seed: {
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
          'application/json': components['schemas']['SeedResponse'];
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
  post_api_v1_projects_projectId_seed_stress: {
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
          'application/json': components['schemas']['SeedStressResponse'];
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
  post_api_v1_projects_projectId_seed_graduate: {
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
        'application/json': components['schemas']['GraduateSeedBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['GraduationResponse'];
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
  get_api_v1_projects_projectId_illustrations: {
    parameters: {
      query?: {
        subjectType?: components['schemas']['IllustrationSubjectType'];
        subjectKey?: string;
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
          'application/json': components['schemas']['ListIllustrationsResponse'];
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
  post_api_v1_projects_projectId_illustrations: {
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
        'application/json': components['schemas']['StartIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IllustrationResponse'];
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
  post_api_v1_projects_projectId_illustrations_id_refine: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        id: string;
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
          'application/json': components['schemas']['IllustrationResponse'];
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
  post_api_v1_projects_projectId_illustrations_id_select: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SelectIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IllustrationResponse'];
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
  post_api_v1_projects_projectId_illustrations_id_save: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        id: string;
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
          'application/json': components['schemas']['IllustrationResponse'];
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
  post_api_v1_projects_projectId_illustrations_id_discard: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        id: string;
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
          'application/json': components['schemas']['IllustrationResponse'];
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
        'application/json': components['schemas']['LegacyStartIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LegacyStartIllustrationResponse'];
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
        'application/json': components['schemas']['LegacyRefineIllustrationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LegacyRefineIllustrationResponse'];
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
        'application/json': components['schemas']['LegacySessionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LegacySaveIllustrationResponse'];
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
        'application/json': components['schemas']['LegacySessionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LegacyCancelIllustrationResponse'];
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
  post_api_v1_projects_projectId_reforge_analyze: {
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
  get_api_v1_projects_projectId_reforge_analysis: {
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
          'application/json': components['schemas']['ReforgeAnalysisStatusResponse'];
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
  get_api_v1_projects_projectId_reforge_analysis_report: {
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
          'application/json': components['schemas']['ReforgeReportResponse'];
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
  get_api_v1_projects_projectId_reforge_analysis_findings: {
    parameters: {
      query?: {
        type?: components['schemas']['ReforgeFindingType'];
        minSeverity?: number | string;
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
          'application/json': components['schemas']['ListReforgeFindingsResponse'];
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
  get_api_v1_projects_projectId_reforge_plan: {
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
          'application/json': components['schemas']['ReforgePlanDetailResponse'];
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
  post_api_v1_projects_projectId_reforge_plan: {
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
  put_api_v1_projects_projectId_reforge_plan_spans: {
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
        'application/json': components['schemas']['ReforgePlanSpansBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReforgePlanDetailResponse'];
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
  post_api_v1_projects_projectId_reforge_plan_approve: {
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
        'application/json': components['schemas']['ReforgePlanApproveBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReforgePlanDetailResponse'];
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
  post_api_v1_projects_projectId_reforge_transform: {
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
        'application/json': components['schemas']['ReforgeTransformStartBody'];
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
  get_api_v1_projects_projectId_reforge_outputs: {
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
          'application/json': components['schemas']['ListReforgeOutputsResponse'];
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
  get_api_v1_projects_projectId_reforge_outputs_outputChapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        outputChapter: number;
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
          'application/json': components['schemas']['ReforgeOutputResponse'];
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
  post_api_v1_projects_projectId_reforge_outputs_outputChapter: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        outputChapter: number;
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
  post_api_v1_projects_projectId_reforge_promote: {
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
        'application/json': components['schemas']['ReforgePromoteBody'];
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
  get_api_v1_projects_projectId_reforge_cuts: {
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
          'application/json': components['schemas']['ListReforgeCutsResponse'];
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
export type CreateApiKeyBody = components['schemas']['CreateApiKeyBody'];
export type CreateApiKeyResponse = components['schemas']['CreateApiKeyResponse'];
export type ListApiKeysResponse = components['schemas']['ListApiKeysResponse'];
export type ApiKeyResponse = components['schemas']['ApiKeyResponse'];
export type IngestNovelBody = components['schemas']['IngestNovelBody'];
export type NovelGenre = components['schemas']['NovelGenre'];
export type NovelTag = components['schemas']['NovelTag'];
export type SexualContentRating = components['schemas']['SexualContentRating'];
export type ViolenceRating = components['schemas']['ViolenceRating'];
export type DarkContentRating = components['schemas']['DarkContentRating'];
export type IngestNovelResponse = components['schemas']['IngestNovelResponse'];
export type IngestChapterBody = components['schemas']['IngestChapterBody'];
export type IngestCoverBody = components['schemas']['IngestCoverBody'];
export type IngestManifestResponse = components['schemas']['IngestManifestResponse'];
export type IngestManifestChapter = components['schemas']['IngestManifestChapter'];
export type CreateProjectBody = components['schemas']['CreateProjectBody'];
export type ProjectKind = components['schemas']['ProjectKind'];
export type ContentMode = components['schemas']['ContentMode'];
export type ProjectResponse = components['schemas']['ProjectResponse'];
export type ProjectStatus = components['schemas']['ProjectStatus'];
export type ProjectConfig = components['schemas']['ProjectConfig'];
export type ProjectModelOverrides = components['schemas']['ProjectModelOverrides'];
export type ProjectModelRef = components['schemas']['ProjectModelRef'];
export type SortOrder = components['schemas']['SortOrder'];
export type SortByTime = components['schemas']['SortByTime'];
export type ListProjectResponse = components['schemas']['ListProjectResponse'];
export type ProjectStatusResponse = components['schemas']['ProjectStatusResponse'];
export type UpdateProjectBody = components['schemas']['UpdateProjectBody'];
export type CloneProjectBody = components['schemas']['CloneProjectBody'];
export type ResetBody = components['schemas']['ResetBody'];
export type ResetResponse = components['schemas']['ResetResponse'];
export type CostResponse = components['schemas']['CostResponse'];
export type UploadImageBody = components['schemas']['UploadImageBody'];
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
export type BriefWriteMode = components['schemas']['BriefWriteMode'];
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
export type ContentRatingInput = components['schemas']['ContentRatingInput'];
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
export type GenerateUnrestrictedBody = components['schemas']['GenerateUnrestrictedBody'];
export type ChapterSummarizeResponse = components['schemas']['ChapterSummarizeResponse'];
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
export type InsertChapterBody = components['schemas']['InsertChapterBody'];
export type InsertChapterResponse = components['schemas']['InsertChapterResponse'];
export type AmendChapterBody = components['schemas']['AmendChapterBody'];
export type AmendChapterResponse = components['schemas']['AmendChapterResponse'];
export type JobResponse = components['schemas']['JobResponse'];
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
export type SeedResponse = components['schemas']['SeedResponse'];
export type SeedFieldsResponse = components['schemas']['SeedFieldsResponse'];
export type SeedProvenanceResponse = components['schemas']['SeedProvenanceResponse'];
export type FieldProvenanceResponse = components['schemas']['FieldProvenanceResponse'];
export type SeedConstraintResponse = components['schemas']['SeedConstraintResponse'];
export type TasteAnchorsResponse = components['schemas']['TasteAnchorsResponse'];
export type ConceptCardResponse = components['schemas']['ConceptCardResponse'];
export type ReadinessEntryResponse = components['schemas']['ReadinessEntryResponse'];
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
export type OmittedSectionPreview = components['schemas']['OmittedSectionPreview'];
export type CreateEntityBody = components['schemas']['CreateEntityBody'];
export type EntityType = components['schemas']['EntityType'];
export type EntitySignificance = components['schemas']['EntitySignificance'];
export type EntityOrigin = components['schemas']['EntityOrigin'];
export type EntityResponse = components['schemas']['EntityResponse'];
export type EntityImageResponse = components['schemas']['EntityImageResponse'];
export type ListEntityResponse = components['schemas']['ListEntityResponse'];
export type UpdateEntityBody = components['schemas']['UpdateEntityBody'];
export type UploadImageBody1 = components['schemas']['UploadImageBody1'];
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
export type CreateSeedBody = components['schemas']['CreateSeedBody'];
export type ListSeedsResponse = components['schemas']['ListSeedsResponse'];
export type SeedSummaryResponse = components['schemas']['SeedSummaryResponse'];
export type SeedStressResponse = components['schemas']['SeedStressResponse'];
export type GraduateSeedBody = components['schemas']['GraduateSeedBody'];
export type GraduationResponse = components['schemas']['GraduationResponse'];
export type GraduatedProjectResponse = components['schemas']['GraduatedProjectResponse'];
export type ProvenanceSummaryResponse = components['schemas']['ProvenanceSummaryResponse'];
export type ProvenanceFieldResponse = components['schemas']['ProvenanceFieldResponse'];
export type StartIllustrationBody = components['schemas']['StartIllustrationBody'];
export type IllustrationSubjectType = components['schemas']['IllustrationSubjectType'];
export type IllustrationResponse = components['schemas']['IllustrationResponse'];
export type IllustrationStatus = components['schemas']['IllustrationStatus'];
export type IllustrationCandidateResponse = components['schemas']['IllustrationCandidateResponse'];
export type ListIllustrationsResponse = components['schemas']['ListIllustrationsResponse'];
export type RefineIllustrationBody = components['schemas']['RefineIllustrationBody'];
export type ReplaceInstruction = components['schemas']['ReplaceInstruction'];
export type SelectIllustrationBody = components['schemas']['SelectIllustrationBody'];
export type SaveIllustrationBody = components['schemas']['SaveIllustrationBody'];
export type IllustrationSaveTarget = components['schemas']['IllustrationSaveTarget'];
export type LegacyStartIllustrationBody = components['schemas']['LegacyStartIllustrationBody'];
export type LegacyStartIllustrationResponse = components['schemas']['LegacyStartIllustrationResponse'];
export type LegacyRefineIllustrationBody = components['schemas']['LegacyRefineIllustrationBody'];
export type LegacyRefineIllustrationResponse = components['schemas']['LegacyRefineIllustrationResponse'];
export type LegacySessionBody = components['schemas']['LegacySessionBody'];
export type LegacySaveIllustrationResponse = components['schemas']['LegacySaveIllustrationResponse'];
export type LegacyCancelIllustrationResponse = components['schemas']['LegacyCancelIllustrationResponse'];
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
export type ReforgeMode = components['schemas']['ReforgeMode'];
export type ReforgeSettingsBody = components['schemas']['ReforgeSettingsBody'];
export type ReforgeResponse = components['schemas']['ReforgeResponse'];
export type ReforgeStatus = components['schemas']['ReforgeStatus'];
export type ReforgeStartBody = components['schemas']['ReforgeStartBody'];
export type ReforgeStatusResponse = components['schemas']['ReforgeStatusResponse'];
export type ReforgeCountsResponse = components['schemas']['ReforgeCountsResponse'];
export type ReforgeTransformStatusResponse = components['schemas']['ReforgeTransformStatusResponse'];
export type ReforgePlanHeaderResponse = components['schemas']['ReforgePlanHeaderResponse'];
export type ReforgePlanStatus = components['schemas']['ReforgePlanStatus'];
export type ReforgeOutputCountsResponse = components['schemas']['ReforgeOutputCountsResponse'];
export type ListReforgesResponse = components['schemas']['ListReforgesResponse'];
export type ReforgeSummaryResponse = components['schemas']['ReforgeSummaryResponse'];
export type ReforgeChapterStatus = components['schemas']['ReforgeChapterStatus'];
export type ReforgeChapterResponse = components['schemas']['ReforgeChapterResponse'];
export type ReforgeDetailItem = components['schemas']['ReforgeDetailItem'];
export type ReforgeAnalysisStatusResponse = components['schemas']['ReforgeAnalysisStatusResponse'];
export type ReforgeAnalysisResponse = components['schemas']['ReforgeAnalysisResponse'];
export type ReforgeAnalysisStatus = components['schemas']['ReforgeAnalysisStatus'];
export type ReforgeAnalysisMetricsResponse = components['schemas']['ReforgeAnalysisMetricsResponse'];
export type ReforgeReportResponse = components['schemas']['ReforgeReportResponse'];
export type ReforgeFindingType = components['schemas']['ReforgeFindingType'];
export type ListReforgeFindingsResponse = components['schemas']['ListReforgeFindingsResponse'];
export type ReforgeFindingResponse = components['schemas']['ReforgeFindingResponse'];
export type ReforgeFindingSource = components['schemas']['ReforgeFindingSource'];
export type ReforgePlanDetailResponse = components['schemas']['ReforgePlanDetailResponse'];
export type ReforgePlanResponse = components['schemas']['ReforgePlanResponse'];
export type ReforgePlanSpanResponse = components['schemas']['ReforgePlanSpanResponse'];
export type ReforgeSpanAction = components['schemas']['ReforgeSpanAction'];
export type ReforgePlanSpansBody = components['schemas']['ReforgePlanSpansBody'];
export type ReforgePlanSpanBody = components['schemas']['ReforgePlanSpanBody'];
export type ReforgePlanApproveBody = components['schemas']['ReforgePlanApproveBody'];
export type ReforgeTransformStartBody = components['schemas']['ReforgeTransformStartBody'];
export type ListReforgeOutputsResponse = components['schemas']['ListReforgeOutputsResponse'];
export type ReforgeOutputSummaryResponse = components['schemas']['ReforgeOutputSummaryResponse'];
export type ReforgeOutputStatus = components['schemas']['ReforgeOutputStatus'];
export type ReforgeOutputResponse = components['schemas']['ReforgeOutputResponse'];
export type ReforgePromoteBody = components['schemas']['ReforgePromoteBody'];
export type ListReforgeCutsResponse = components['schemas']['ListReforgeCutsResponse'];
export type ReforgeCutResponse = components['schemas']['ReforgeCutResponse'];
export type ReforgeCutKind = components['schemas']['ReforgeCutKind'];
export type ReforgeCutDisposition = components['schemas']['ReforgeCutDisposition'];
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
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
export type GetManifestPathParams = Exclude<paths['/api/v1/ingest/novels/{sourceRef}/manifest']['get']['parameters']['path'], undefined>;
export type ListProjectsQueryParams = Exclude<paths['/api/v1/projects']['get']['parameters']['query'], undefined>;
export type GetProjectPathParams = Exclude<paths['/api/v1/projects/{projectId}']['get']['parameters']['path'], undefined>;
export type GetProjectStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/status']['get']['parameters']['path'], undefined>;
export type GetProjectCostPathParams = Exclude<paths['/api/v1/projects/{projectId}/cost']['get']['parameters']['path'], undefined>;
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
export type ListSeedsQueryParams = Exclude<paths['/api/v1/seeds']['get']['parameters']['query'], undefined>;
export type GetSeedPathParams = Exclude<paths['/api/v1/projects/{projectId}/seed']['get']['parameters']['path'], undefined>;
export type ListIllustrationsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations']['get']['parameters']['query'], undefined>;
export type ListIllustrationsPathParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations']['get']['parameters']['path'], undefined>;
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
export type GetAnalysisPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/analysis']['get']['parameters']['path'], undefined>;
export type GetAnalysisReportPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/analysis/report']['get']['parameters']['path'], undefined>;
export type ListFindingsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/analysis/findings']['get']['parameters']['query'], undefined>;
export type ListFindingsPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/analysis/findings']['get']['parameters']['path'], undefined>;
export type GetPlanPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/plan']['get']['parameters']['path'], undefined>;
export type ListOutputsPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/outputs']['get']['parameters']['path'], undefined>;
export type GetOutputPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/outputs/{outputChapter}']['get']['parameters']['path'], undefined>;
export type ListCutsPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/cuts']['get']['parameters']['path'], undefined>;
export type GetReforgeManuscriptPathParams = Exclude<paths['/api/v1/projects/{projectId}/reforge/manuscript']['get']['parameters']['path'], undefined>;
export type GetAccessPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications/access']['get']['parameters']['path'], undefined>;
export type ListPublicationsPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications']['get']['parameters']['path'], undefined>;
