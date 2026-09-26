export interface paths {
  '/api/v1/access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Access */
    get: operations['get_api_v1_access'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
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
  '/api/v1/ai/settings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Settings */
    get: operations['get_api_v1_ai_settings'];
    /** Update Settings */
    put: operations['put_api_v1_ai_settings'];
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
  '/api/v1/projects/{projectId}/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Stream Events */
    get: operations['get_api_v1_projects_projectId_events'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/plugins': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Plugins */
    get: operations['get_api_v1_plugins'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/plugins': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Project Plugins */
    get: operations['get_api_v1_projects_projectId_plugins'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/plugins/{pluginId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Enable Plugin */
    put: operations['put_api_v1_projects_projectId_plugins_pluginId'];
    post?: never;
    /** Disable Plugin */
    delete: operations['delete_api_v1_projects_projectId_plugins_pluginId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/bots/{botId}/ownership': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Ownership */
    get: operations['get_internal_bots_botId_ownership'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/bots/{botId}/transfer': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Transfer Ownership */
    post: operations['post_internal_bots_botId_transfer'];
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
  '/api/v1/projects/{projectId}/jobs/{jobId}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel Job */
    post: operations['post_api_v1_projects_projectId_jobs_jobId_cancel'];
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
  '/api/v1/projects/{projectId}/drafts/summary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Draft Summaries */
    get: operations['get_api_v1_projects_projectId_drafts_summary'];
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
  '/api/v1/projects/{projectId}/chapters/{n}/regenerate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Regenerate Chapter */
    post: operations['post_api_v1_projects_projectId_chapters_n_regenerate'];
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
  '/api/v1/projects/{projectId}/runs/{runId}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel Run */
    post: operations['post_api_v1_projects_projectId_runs_runId_cancel'];
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
  '/api/v1/projects/{projectId}/chapter-rows': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Chapter Rows */
    get: operations['get_api_v1_projects_projectId_chapter_rows'];
    put?: never;
    post?: never;
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
  '/api/v1/projects/{projectId}/plugins/{pluginId}/augment': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Augment */
    post: operations['post_api_v1_projects_projectId_plugins_pluginId_augment'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
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
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/turn': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Turn Status */
    get: operations['get_api_v1_projects_projectId_chat_sessions_sessionId_turn'];
    put?: never;
    post?: never;
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
  '/api/v1/projects/{projectId}/chats/{sessionId}/turn/stream': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start Turn */
    post: operations['post_api_v1_projects_projectId_chats_sessionId_turn_stream'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/turns/{runId}/stream': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Stream Turn */
    get: operations['get_api_v1_projects_projectId_turns_runId_stream'];
    put?: never;
    post?: never;
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
  '/api/v1/projects/{projectId}/bible/tidy': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Preview Bible Tidy */
    get: operations['get_api_v1_projects_projectId_bible_tidy'];
    put?: never;
    /** Apply Bible Tidy */
    post: operations['post_api_v1_projects_projectId_bible_tidy'];
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
  '/api/v1/projects/{projectId}/illustrations/reference-options': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Reference Options */
    get: operations['get_api_v1_projects_projectId_illustrations_reference_options'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/illustrations/{id}/references': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Update Illustration References */
    put: operations['put_api_v1_projects_projectId_illustrations_id_references'];
    post?: never;
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
    post?: never;
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
  '/api/v1/projects/{projectId}/bible/readiness': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Readiness */
    get: operations['get_api_v1_projects_projectId_bible_readiness'];
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
  '/api/v1/projects/{projectId}/ledger': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Active */
    get: operations['get_api_v1_projects_projectId_ledger'];
    put?: never;
    /** Create */
    post: operations['post_api_v1_projects_projectId_ledger'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/ledger/topics/{topic}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** History */
    get: operations['get_api_v1_projects_projectId_ledger_topics_topic'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/ledger/{entryId}/supersede': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Supersede */
    post: operations['post_api_v1_projects_projectId_ledger_entryId_supersede'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/ledger/{entryId}/withdraw': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Withdraw */
    post: operations['post_api_v1_projects_projectId_ledger_entryId_withdraw'];
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
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    AccessResponse: {
      /** @description Whether the caller holds `novel-forge:admin` in the organisation the session acts in, which opens run inspection. */
      admin: boolean;
    };
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
    /** @description Settings that apply to every project and idea the signed-in author owns. */
    AccountSettingsResponse: {
      /** @description Used when neither a chat pin nor the project names a model. Unrestricted projects only take a default on the unrestricted allowlist. */
      models: components['schemas']['AccountModelDefaults'];
    };
    /** @description Your default model per group. A group left out uses the platform default. */
    AccountModelDefaults: {
      /** @description Chapter prose: drafts, revisions and repairs. */
      writing?: components['schemas']['AccountModelRef'];
      /** @description Premise, chapter plans, bible and extraction. */
      planning?: components['schemas']['AccountModelRef'];
      /** @description Continuity judge, validation and editorial review. */
      review?: components['schemas']['AccountModelRef'];
      /** @description Refinement chat on a novel. */
      chat?: components['schemas']['AccountModelRef'];
      /** @description Idea names, chapter titles and context compaction. */
      helper?: components['schemas']['AccountModelRef'];
      /** @description Cover and scene art; must name an image model. */
      image?: components['schemas']['AccountModelRef'];
    };
    AccountModelRef: {
      provider: string;
      model: string;
    };
    /** @description Replaces the signed-in author’s settings. */
    UpdateAccountSettingsBody: {
      /** @description The full set of defaults; a group left out goes back to the platform default. */
      models: components['schemas']['AccountModelDefaults'];
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
      /** @description The name to show an author — a product name on its own, never a gateway or a slug. The embedding entry, which is never offered, carries its id. */
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
    PluginManifestResponse: components['schemas']['PluginManifestResponse1'][];
    /** @description Manifest of one plugin loaded on this deploy. */
    PluginManifestResponse1: {
      /** @description Stable plugin identifier, equal to its directory name under the deployment plugin directory. */
      id: string;
      /** @description Manifest version the stored per-novel config is validated against. */
      version: string;
      title: string;
      description: string;
      /** @description Pipeline decision points this plugin answers. */
      decisionPoints: components['schemas']['DecisionPoint'][];
      /** @description Decision points claimed exclusively — a second plugin claiming one of these cannot be enabled on the same novel. */
      exclusive?: components['schemas']['DecisionPoint'][];
      /** @description Declared forms keyed by name; `settings` is the per-novel configuration form rendered from its field list. */
      forms: {
        [key: string]: unknown;
      };
      actions?: components['schemas']['PluginActionResponse'][];
    };
    /** @enum {string} */
    DecisionPoint: 'canon.augment' | 'brief.policy' | 'call.route' | 'context.contribute' | 'prompt.contribute';
    /** @description An author-triggered action the plugin surfaces in the UI. Invoking one is not yet supported. */
    PluginActionResponse: {
      id: string;
      /** @description Operation name passed back to the plugin when the action runs. */
      op: string;
      label: string;
      /** @description Where the action is offered. */
      surface: components['schemas']['PluginActionSurface'];
      /** @description Name of the manifest form collecting arguments for this action. */
      form?: string;
    };
    /** @enum {string} */
    PluginActionSurface: 'settings' | 'chapter' | 'volume' | 'novel';
    ProjectPluginResponse: components['schemas']['ProjectPluginResponse1'][];
    /** @description One plugin enabled on a novel, with the settings it was last saved with. */
    ProjectPluginResponse1: {
      pluginId: string;
      /** @description Manifest version the stored config was validated against. */
      pluginVersion: string;
      config: {
        [key: string]: unknown;
      };
      ordinal: number;
      /** @description False when the plugin is no longer on disk. The enablement is kept, but it contributes to no decision point. */
      installed: boolean;
      /** @description True when the plugin on disk reports a different version and the stored config no longer validates. It contributes nothing until the settings are saved again. */
      needsReview: boolean;
      /** Format: date-time */
      enabledAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @description Enable the plugin on this novel, or replace the settings it is already enabled with. */
    EnablePluginBody: {
      /** @description Values for the fields the manifest declares under `forms.settings`. Any other key is rejected; omitting it stores an empty config. */
      config?: {
        [key: string]: unknown;
      };
      /** @description Order this plugin contributes in relative to the other plugins enabled on the novel. Lower runs first. This request replaces the stored row, so omitting it resets the order to 0. */
      ordinal?: number;
    };
    BotOwnershipResponse: {
      projects: number;
      illustrations: number;
    };
    TransferOwnershipBody: {
      /** @description Identity user id the bot-owned rows are reassigned to. */
      toUserId: string;
    };
    TransferOwnershipResponse: {
      /** @description Projects this call reassigned; a retry of an applied transfer reports zero. */
      projects: number;
      /** @description Illustrations this call reassigned; a retry of an applied transfer reports zero. */
      illustrations: number;
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
    SeedFromBriefBody: {
      brief: string;
      force?: boolean;
    };
    WorkflowRunResponse: {
      runId: string;
      outcome: string;
      status: string;
      /** @description Bible-builder only: stages a non-force run left untouched because their document already had content. */
      skippedStages?: string[];
    };
    ListBriefSummaryResponse: {
      items: components['schemas']['BriefSummaryResponse'][];
    };
    /** @description A brief's identity and freshness without its body. */
    BriefSummaryResponse: {
      chapter: number;
      volumeKey?: null | string;
      title?: null | string;
      staleReason?: null | string;
      /** @description Set when the outliner judged the planned material too thin for the word target. */
      densityRisk?: null | string;
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
    /** @enum {string} */
    BriefWriteMode: 'standard' | 'external';
    BriefResponse: {
      id: string;
      projectId: string;
      chapter: number;
      volumeKey?: null | string;
      title?: null | string;
      body: string;
      /** @description Artifact keys for the retrieval context used to build this draft. */
      contextRefs?: null | string[];
      /** @description Entity key of the point-of-view character. */
      pov?: null | string;
      /** @description Why the chapter exists — its narrative job in the arc. */
      chapterPurpose?: null | string;
      /** @description What concretely changes for the reader in this chapter. */
      readerValue?: null | string[];
      /** @description Recent scene patterns the chapter should avoid repeating. */
      repetitionRisks?: null | string[];
      /** @description The outliner's warning that the chapter's planned material cannot fill the word target without padding, and the suggested remedy; cleared by a hand edit. */
      densityRisk?: null | string;
      /** @description How the chapter must end: hookType, emotionalBeat, openQuestion, handoffState and mustNotResolve. Older briefs may carry none. */
      endingContract?: null | {
        [key: string]: unknown;
      };
      /** @description The author's standing guidance for this chapter's writer. */
      guidance?: null | string;
      /** @description Set when the plan changed under this brief; generation refuses a stale brief. */
      staleReason?: null | string;
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
    UpdateBriefBody: {
      title?: string;
      body: string;
      /** @description Why this chapter exists in the arc. Omit to leave unchanged. */
      chapterPurpose?: string;
      /** @description Entity key of the point-of-view character. Omit to leave unchanged. */
      pov?: string;
      /** @description Author guidance for the writer. Omit to leave unchanged. */
      guidance?: string;
      /** @description Replacement ending contract; null removes it. Omit to leave unchanged. */
      endingContract?: components['schemas']['EndingContractSchema'] | null;
      /** @description Replacement knowledge contract. Omit to leave the existing contract unchanged. */
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
      /** @description Present when the batch was cut short of its limit: this chapter has neither a draft nor finalized prose, and generation continues only once it has one. */
      stoppedAtUnwrittenChapter?: number;
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
    JobKind: 'generate' | 'finalize' | 'backfill' | 'publish' | 'import';
    /** @enum {string} */
    JobStatus: 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';
    CancelJobResponse: {
      jobId: string;
      /** @description The job status as recorded right now — a `stopping` outcome still reads `in_progress` because the worker writes `cancelled` as it settles. */
      status: components['schemas']['JobStatus'];
      /**
       * @description 'cancelled': the job was still pending and was cancelled immediately, never dispatched. 'stopping': the job was in progress; cancellation was requested and the worker will settle it as cancelled at its next step boundary. 'already_settled': the job had already reached a terminal status (done, failed, or cancelled), so nothing was done.
       * @enum {string}
       */
      outcome: 'cancelled' | 'stopping' | 'already_settled';
    };
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
    /** @enum {string} */
    SexualContentRating: 'none' | 'suggestive' | 'moderate' | 'explicit';
    /** @enum {string} */
    ViolenceRating: 'none' | 'mild' | 'graphic' | 'extreme';
    /** @enum {string} */
    DarkContentRating: 'none' | 'mild' | 'heavy';
    DraftSummaryResponse: {
      items: components['schemas']['DraftSummaryItem'][];
    };
    /** @description One chapter's draft state without its prose. */
    DraftSummaryItem: {
      chapter: number;
      title?: null | string;
      status: components['schemas']['DraftStatus'];
      reviewStatus: components['schemas']['DraftReviewStatus'];
      judge?: null | string;
      isolated: boolean;
      /** @description An ancestor chapter changed since this draft was written; approval is refused until it is regenerated. */
      stale: boolean;
      /** Format: date-time */
      updatedAt: string;
      /**
       * Format: date-time
       * @description When the prose was last written (generated, revised, imported or hand-edited). Unlike updatedAt, judging and stale marks don't move it.
       */
      writtenAt: string;
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
      /** @description The draft revision the author read. The approval is refused with DRF_013 when the draft has moved past it. */
      revision: number;
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
      /** @description Review warnings found by deterministic checks on the proposed text, such as a removal written as a negation. Empty when none apply. */
      warnings: string[];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ChatScope: 'project' | 'novel' | 'bible_document' | 'volume' | 'brief';
    /** @enum {string} */
    RefinementKind: 'chat' | 'hub' | 'premise_enhance' | 'bible_audit' | 'chapter_extract' | 'plugin';
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
      /** @description Bible-builder only: stages this run left untouched because their document already had content. Empty for every other graph. */
      skippedStages: string[];
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
      /** @description Reasoning effort sent with the call; null when the call sent none or predates effort tracking. */
      reasoningEffort?: null | string;
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
    CancelRunResponse: {
      runId: string;
      /** @description The run status as recorded right now — a `stopping` outcome still reads `running` because the run itself writes `cancelled` as it unwinds. */
      status: components['schemas']['WorkflowRunStatus'];
      /**
       * @description 'stopping': a live run on this replica was just signalled to abort. 'already_settled': the run had already reached a terminal status, so nothing was done. 'not_delivered': the run is still `running` in the database but not live on this replica — cancellation is process-local, so the signal could not be delivered; the run may be owned by another replica or may have crashed.
       * @enum {string}
       */
      outcome: 'stopping' | 'already_settled' | 'not_delivered';
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
      /** @description Reasoning effort sent with the call; null when the call sent none or predates effort tracking. */
      reasoningEffort?: null | string;
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
    /** @enum {string} */
    ChapterRowFilter: 'all' | 'not_written' | 'needs_review' | 'draft' | 'final';
    /** @description One page of chapter rows, plus whole-novel figures the list needs regardless of the page shown. */
    ListChapterRowsResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ChapterRowResponse'][];
      /** @description Rows matching each filter across the whole novel. */
      counts: components['schemas']['ChapterRowCountsResponse'];
      totalWords: number;
      /** @description The lowest brief with no draft — the chapter `generate` targets next. */
      nextBriefChapter?: null | number;
      /** @description The highest planned or written chapter number, 0 when there are none. */
      lastChapter: number;
      /** @description The highest finalized chapter, 0 when none is; no chapter can be inserted below it. */
      frontier: number;
      /** @description Every planned or written chapter number, ascending. */
      chapters: number[];
      contradiction?: components['schemas']['ChapterContradictionResponse'] | null;
    };
    /** @description One chapter of the plan: a written draft, or a brief with no draft yet. Rows are always in chapter order. */
    ChapterRowResponse: {
      kind: components['schemas']['ChapterRowKind'];
      chapter: number;
      /** @description The draft's title for a written row, the brief's for a planned one. */
      title?: null | string;
      /** @description Null for a written chapter that has no brief. */
      writeMode?: components['schemas']['BriefWriteMode'] | null;
      /** @description Written rows only. */
      status?: components['schemas']['DraftStatus'];
      /** @description Written rows only. */
      reviewStatus?: components['schemas']['DraftReviewStatus'];
      /** @description Written rows only. */
      generator?: string;
      /** @description Written rows only. */
      isolated?: boolean;
      /** @description Written rows only: finalize is refused until this isolated chapter has a summary and continuation state. */
      finalizeBlocked?: boolean;
      /** @description Written rows only. */
      wordCount?: number;
    };
    /** @enum {string} */
    ChapterRowKind: 'written' | 'planned';
    ChapterRowCountsResponse: {
      all: number;
      not_written: number;
      needs_review: number;
      draft: number;
      final: number;
    };
    /** @description The first chapter the judge flagged, which blocks further generation until it is resolved. */
    ChapterContradictionResponse: {
      chapter: number;
      judgeNote?: string | null;
      /** @description How many chapters are flagged in total. */
      count: number;
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
    /** @description The proposal a plugin's canon augmentation was staged as. No body is returned when the plugin proposed nothing. */
    PluginAugmentResponse: {
      /** @description Id of the pending proposal holding the proposed canon changes, for review through the proposal surface. */
      proposalId: string;
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
      /** @description Present while a chat turn is running for this session; null otherwise. */
      pendingTurn?: components['schemas']['PendingTurnResponse'] | null;
      /** @description Present when the last turn failed or was cancelled, leaving the transcript unanswered — see its `status`. */
      failedTurn?: components['schemas']['FailedTurnResponse'] | null;
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
    /** @description The turn running right now, so a client can name the phase and count the wait instead of showing a bare spinner. */
    PendingTurnResponse: {
      runId: string;
      /** @description Workflow graph driving the turn — `chat-turn`. */
      graph: string;
      /**
       * Format: date-time
       * @description When the turn started; elapsed time is measured from here so it survives a refresh.
       */
      startedAt: string;
    };
    /** @description The turn that died or was stopped, on a transcript still ending in an unanswered user message, so a reload shows why instead of a silent thread. `status: 'cancelled'` is the author stopping the turn deliberately — terminal and not a failure, so the client must not offer the same retry affordance it offers a failure. */
    FailedTurnResponse: {
      runId: string;
      graph: string;
      /** @description Whether the run failed on its own or was cancelled by the author. */
      status: components['schemas']['ChatTurnOutcome'];
      /** Format: date-time */
      endedAt: string;
      /** @description Application error code, when the failure carried one; never present for a cancelled run. */
      code?: string | null;
      message?: string | null;
    };
    /** @enum {string} */
    ChatTurnOutcome: 'failed' | 'cancelled';
    /** @description Whether a session’s turn is still running and how far its transcript has got — cheap enough to poll while a turn runs. */
    ChatTurnStatusResponse: {
      /** @description Present while a chat turn is running for this session; null otherwise. */
      pendingTurn?: components['schemas']['PendingTurnResponse'] | null;
      /** @description Present when the last turn failed or was cancelled, leaving the transcript unanswered — see its `status`. */
      failedTurn?: components['schemas']['FailedTurnResponse'] | null;
      /** @description Ordinal of the newest message in the transcript; 0 when it is empty. */
      lastOrdinal: number;
    };
    ChatTurnBody: {
      /** @description Chat content; accepts long premises, chapters, and reference documents up to 200,000 characters. */
      content: string;
      /** @description The author's explicit permission for this turn to rewrite chapter prose (draft.update, draft.remove, action.revise_draft). Off by default: a plan edit changes the brief and the chapter is regenerated from it. */
      proseEdits?: boolean;
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
    /** @description Proposal application outcome returned as part of an automatic-mode turn. */
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
      /** @description Model provider override; clear both override fields to use the project or profile default. */
      provider?: string | null;
      /** @description Model name override; clear both override fields to use the project or profile default. */
      model?: string | null;
    };
    /** @description A turn accepted and now running. Open the run’s event stream to watch it; the turn completes and persists whether or not anyone does. */
    ChatTurnStreamResponse: {
      /** @description Workflow run driving the turn — the key of GET /api/v1/projects/:projectId/turns/:runId/stream. */
      runId: string;
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
      ref: string;
      action: string;
      finding: string;
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
    BibleTidyPreviewResponse: {
      items: components['schemas']['BibleTidyItem'][];
    };
    BibleTidyItem: {
      /** @description Pins the content the change was computed from; send it back to apply the change. */
      id: string;
      kind: components['schemas']['BibleTidyKind'];
      /** @description Section of the document the change comes from. */
      section: components['schemas']['BibleSection'];
      slug: string;
      /** @description The document title as the Story Bible shows it now. */
      docTitle: string;
      /** @description retitle: the stored title being replaced. */
      currentTitle?: string;
      /** @description retitle: the title the document would get. */
      proposedTitle?: string;
      /** @description split: key of the entity record that would be created. */
      entityKey?: string;
      /** @description split: name of the entity record that would be created. */
      entityName?: string;
      /** @description split: the suggested entity type; the author may pick another when applying. */
      entityType?: components['schemas']['EntityType'];
      /** @description split: the entity body; move_ai_notes: the note being moved. */
      text?: string;
      /** @description move_ai_notes: slug of the notes-for-the-AI document the note moves into. */
      targetSlug?: string;
    };
    /** @enum {string} */
    BibleTidyKind: 'remove_empty' | 'retitle' | 'split' | 'move_ai_notes';
    /** @enum {string} */
    BibleSection: 'project' | 'world' | 'power' | 'plot' | 'story_state' | 'ai' | 'lore';
    /** @enum {string} */
    EntityType: 'character' | 'faction' | 'location' | 'power_rule' | 'item' | 'concept';
    ApplyBibleTidyBody: {
      /** @description The preview items to apply; everything left out stays as it is. */
      items: components['schemas']['BibleTidySelection'][];
    };
    BibleTidySelection: {
      id: string;
      /** @description split only: overrides the suggested entity type. */
      entityType?: components['schemas']['EntityType'];
    };
    StartIllustrationBody: {
      subjectType: components['schemas']['IllustrationSubjectType'];
      /** @description Entity key for 'entity', the chapter number for 'chapter'; omitted for the project cover. */
      subjectKey?: string;
      /** @description Opening art direction from the author; becomes the first entry in the prompt spec instruction list. */
      instruction?: string;
      /** @description Project images to send as references, in priority order. More than the image model's capacity is refused with ILL_011. */
      references?: components['schemas']['AttachReferenceBody'][];
      /** @description Whether the auto-rules (the entity's portrait, a chapter's cast portraits) may add references. Defaults to true. */
      autoReferences?: boolean;
    };
    /** @enum {string} */
    IllustrationSubjectType: 'entity' | 'chapter' | 'cover';
    AttachReferenceBody: {
      /** @description Which kind of project image to attach. */
      source: components['schemas']['IllustrationReferenceSource'];
      /** @description Entity key for 'portrait'; the numeric id for 'gallery', 'chapter-image' and 'candidate' (an illustration id, resolving to its selected image); omitted for 'cover'. */
      sourceId?: string;
      /** @description 'likeness' pins the face, hair, build and attire of the figure it shows; 'style' lends palette, medium and rendering only. */
      role: components['schemas']['IllustrationAttachableReferenceRole'];
      /** @description Free text scoping the reference, e.g. "the armored man in the center" or "the scar only". Trimmed; blank is dropped. */
      note?: string;
    };
    /** @enum {string} */
    IllustrationReferenceSource: 'cover' | 'portrait' | 'gallery' | 'chapter-image' | 'candidate';
    /** @enum {string} */
    IllustrationAttachableReferenceRole: 'likeness' | 'style';
    IllustrationResponse: {
      id: string;
      projectId: string;
      subjectType: components['schemas']['IllustrationSubjectType'];
      subjectKey?: null | string;
      status: components['schemas']['IllustrationStatus'];
      revision: number;
      /** @description 'uploaded' when the session was opened on a cover the author supplied rather than composed from the canon; its prompt only reworks that image. */
      origin: components['schemas']['IllustrationOrigin'];
      /** @description The author instruction list, in application order — refine edits address it by index. */
      instructions: string[];
      /** @description The exact prompt text sent to the image model for the current revision. */
      prompt: string;
      candidates: components['schemas']['IllustrationCandidateResponse'][];
      /** @description Latest per image: one entry per image ever sent, carrying its most recent role and note. Per-round history lives on each candidate `references`. */
      references: components['schemas']['IllustrationReferenceResponse'][];
      /** @description The author-attached set every refinement re-resolves; change it with PUT …/references. */
      attachedReferences: components['schemas']['AttachedReferenceResponse'][];
      /** @description Whether the auto-rules may add references. */
      autoReferences: boolean;
      selectedRef?: null | string;
      selectedUrl?: null | string;
      /** @description Appearance the composer derived because the entity had none; PATCH it onto the entity to make it canon. */
      suggestedAppearance?: string;
      /** @description Set when `suggestedAppearance` was described from a likeness reference rather than derived from canon. */
      appearanceDescription?: components['schemas']['AppearanceDescriptionResponse'];
      /** @description References this request skipped, trimmed or merged. Returned by start, refine and references updates only; never stored. */
      referenceWarnings?: components['schemas']['ReferenceWarningResponse'][];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    IllustrationStatus: 'active' | 'saved' | 'discarded';
    /** @enum {string} */
    IllustrationOrigin: 'generated' | 'uploaded';
    IllustrationCandidateResponse: {
      ref: string;
      /** @description Absolute public object-storage URL resolved using the server runtime configuration. */
      imageUrl: string;
      createdAt: string;
      instructionsHash: string;
      /** @description Storage refs of the references sent with this candidate, in send order; each matches an entry in the illustration `references`. */
      referenceRefs: string[];
      /** @description The references exactly as sent with this candidate — role, note, label, origin and reason — in send order. */
      references: components['schemas']['IllustrationReferenceResponse'][];
    };
    IllustrationReferenceResponse: {
      source: components['schemas']['IllustrationReferenceSource'];
      sourceId?: string;
      /** @description Storage ref, matched by candidate `referenceRefs`. */
      ref: string;
      /** @description 'edit-source' is the image a refinement reworks; only the server assigns it. */
      role: components['schemas']['IllustrationReferenceRole'];
      origin: components['schemas']['IllustrationReferenceOrigin'];
      /** @description The auto-rule that added the reference (e.g. 'auto:entity-portrait', 'auto:chapter-cast', 'auto:edit-source') or 'attached'. */
      reason: string;
      note?: string;
      /** @description What the image showed when it was sent, as named in the reference manifest. */
      label?: string;
      /** @description Display name of the pictured entity, for portrait references. */
      name?: string;
      /** @description Absolute public object-storage URL resolved using the server runtime configuration. */
      url: string;
    };
    /** @enum {string} */
    IllustrationReferenceRole: 'likeness' | 'style' | 'edit-source';
    /** @enum {string} */
    IllustrationReferenceOrigin: 'auto' | 'attached';
    AttachedReferenceResponse: {
      source: components['schemas']['IllustrationReferenceSource'];
      sourceId?: string;
      role: components['schemas']['IllustrationAttachableReferenceRole'];
      note?: string;
    };
    AppearanceDescriptionResponse: {
      /** @description How sure the vision model was that it described the intended figure. */
      confidence: components['schemas']['AppearanceConfidenceLevel'];
      /** @description Set when the image was ambiguous, e.g. several figures and no note naming which one. */
      ambiguity?: string;
    };
    /** @enum {string} */
    AppearanceConfidenceLevel: 'high' | 'medium' | 'low';
    ReferenceWarningResponse: {
      code: components['schemas']['IllustrationReferenceWarningCode'];
      source: components['schemas']['IllustrationReferenceSource'];
      sourceId?: string;
      reason: string;
    };
    /** @enum {string} */
    IllustrationReferenceWarningCode: 'capacity-trimmed' | 'merged-with-edit-source' | 'missing-file' | 'too-large' | 'unsupported-format';
    /** @description Newest first. Setting a project cover by upload or import opens an 'uploaded' cover illustration on it. */
    ListIllustrationsResponse: {
      items: components['schemas']['IllustrationResponse'][];
    };
    ReferenceOptionsResponse: {
      /** @description How many reference images the project image model accepts per generation. */
      capacity: number;
      cover?: components['schemas']['ReferenceOptionResponse'];
      /** @description Entities with a portrait, by name. */
      portraits: components['schemas']['ReferenceOptionResponse'][];
      /** @description Entity gallery images, newest first. */
      gallery: components['schemas']['ReferenceOptionResponse'][];
      /** @description Chapter scene images, newest first. */
      chapterImages: components['schemas']['ReferenceOptionResponse'][];
      /** @description Illustrations with a selected image, newest first. */
      candidates: components['schemas']['ReferenceOptionResponse'][];
      /** @description True when any group was cut at `limit`. */
      truncated: boolean;
      /** @description What the auto-rules would attach at start for this subject, in send order, checked against storage metadata only. */
      autoPreview: components['schemas']['IllustrationReferenceResponse'][];
      /** @description Auto references the preview would skip or trim. */
      autoPreviewWarnings: components['schemas']['ReferenceWarningResponse'][];
    };
    ReferenceOptionResponse: {
      source: components['schemas']['IllustrationReferenceSource'];
      /** @description Pass back unchanged as the attach `sourceId`. */
      sourceId?: string;
      label: string;
      /** @description Absolute public object-storage URL resolved using the server runtime configuration. */
      url: string;
      entityKey?: string;
      chapter?: number;
      caption?: string;
      subjectType?: components['schemas']['IllustrationSubjectType'];
      subjectKey?: null | string;
    };
    UpdateIllustrationReferencesBody: {
      /** @description The complete attached set, replacing the stored one. Entries already attached (same source and sourceId) are kept with a warning when out of slots; new entries must fit beside the edit source the next refinement sends, or ILL_011. */
      references: components['schemas']['AttachReferenceBody'][];
      /** @description Whether the auto-rules may add references on the next refinement. Keeps the stored value when omitted. */
      autoReferences?: boolean;
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
    UploadImageBody: {
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
    ListVolumeResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['VolumeResponse'][];
    };
    VolumeResponse: {
      id: string;
      projectId: string;
      volumeKey: string;
      ordinal: number;
      title?: null | string;
      /** @description The goal the volume works towards. */
      objective?: null | string;
      revision: number;
      /** @description The author's notes on the volume. */
      body?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ListBibleDocResponse: {
      docs: components['schemas']['BibleDocListItem'][];
    };
    BibleDocListItem: {
      section: components['schemas']['BibleSection'];
      slug: string;
      /** @description frontmatter.title, else the first "# " heading, else the slug read as words. */
      title: string;
      wordCount: number;
      isEmpty: boolean;
      /** @description First prose sentence or two, omitted for an empty document. */
      excerpt?: string;
      /** Format: date-time */
      updatedAt: string;
    };
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
      writerNote?: null | string;
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
      /** @description Author-only note on what the fact protects; never shown to the chapter writer */
      constraintNote?: string;
      /** @description The only trace of the fact the chapter writer sees while it is hidden — omit to keep the current note, send an empty string to clear it and withhold the fact */
      writerNote?: string;
      terms?: string[];
      /** @description Reveal chapter: a number for a dated reveal, 1 for open canon. Omit to keep the current schedule, send null to undate the fact — hidden until a plan reveals it. */
      revealChapter?: number | null;
    };
    RevealFactBody: {
      entityKey: string;
      chapter: number;
      note?: string;
    };
    BibleReadinessResponse: {
      dimensions: components['schemas']['BibleReadinessDimensionResponse'][];
      /** @description one entry per bible role, in manifest order, explaining what the coverage dimension counted */
      roles?: components['schemas']['BibleReadinessRoleResponse'][];
      /** @description false while canon is absent or exists only as prose the Story Bible cannot read */
      readyToDraft: boolean;
      /** @description the coverage and record gaps that hold `readyToDraft` false */
      blockingGaps: string[];
    };
    BibleReadinessDimensionResponse: {
      dimension: components['schemas']['BibleReadinessDimension'];
      /** @description strong = every check passed, thin = some passed, empty = none passed */
      verdict: components['schemas']['BibleReadinessVerdict'];
      /** @description checks this dimension passed */
      satisfied: number;
      /** @description checks this dimension ran; zero means the dimension had nothing to judge and reads as strong */
      total: number;
      /** @description what to fix, phrased as an action an author can take */
      gaps: string[];
    };
    /** @enum {string} */
    BibleReadinessDimension: 'coverage' | 'records' | 'substance' | 'integrity' | 'reveal';
    /** @enum {string} */
    BibleReadinessVerdict: 'strong' | 'thin' | 'empty';
    BibleReadinessRoleResponse: {
      stage: components['schemas']['BibleStage'];
      /** @description what the role is called on the readiness banner */
      label: string;
      /** @description the canonical `section/slug` the bible builder writes this role to */
      address: string;
      /** @description true when any document or record set carries the substance this role needs, whatever it is named */
      covered: boolean;
      /** @description the documents (`section/slug`) and record summaries that cover the role; empty when it is uncovered */
      coveredBy: string[];
    };
    /** @enum {string} */
    BibleStage: 'foundation' | 'world' | 'power' | 'factionsAndLocations' | 'characters' | 'plot' | 'volumes';
    CreateProjectBody: {
      name: string;
      kind: components['schemas']['ProjectKind'];
      title?: string;
      /** @description Project additions to the built-in chapter-writing style (point of view, tone, content limits); they take precedence where the two conflict. */
      instructions?: string;
      contentMode?: components['schemas']['ContentMode'];
      /** @description Chapter scene-prose word-count target; omitted uses the application default (1,800–2,600 words). */
      wordTarget?: components['schemas']['ProjectWordTarget'];
    };
    /** @enum {string} */
    ProjectKind: 'new_novel';
    /** @enum {string} */
    ContentMode: 'standard' | 'unrestricted';
    /** @description Chapter scene-prose word-count target — the generation prompt, length checks, and the expansion pass all read this band. */
    ProjectWordTarget: {
      /** @description Minimum word count a generated chapter must reach. */
      min: number;
      /** @description Maximum word count a generated chapter should stay under; must be greater than `min`. */
      max: number;
    };
    ProjectResponse: {
      id: string;
      name: string;
      kind: components['schemas']['ProjectKind'];
      /** @description Whether the project was created by a signed-in person or an organisation bot. */
      ownerKind: components['schemas']['OwnerKind'];
      /** @description True when the project is open to every member of its owning organisation who holds the curate permission, on top of its owner. */
      sharedWithOrg: boolean;
      title?: null | string;
      /** @description Absolute public cover URL resolved by the server; absent when the project has no cover. */
      coverUrl?: null | string;
      contentMode: components['schemas']['ContentMode'];
      config?: components['schemas']['ProjectConfig'];
      brief?: null | string;
      /** @description The project’s additions to the built-in chapter-writing style; null when the project writes to the default alone. The writer receives the built-in style followed by these, and these win where the two conflict. */
      instructions?: null | string;
      storyCurrentChapter?: null | number;
      /** @description Effective chapter word-count target, when the project overrides the application default (1,800–2,600 words). */
      wordTarget?: components['schemas']['ProjectWordTarget'];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    OwnerKind: 'user' | 'bot';
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
      bible?: components['schemas']['ProjectModelRef'];
      premise?: components['schemas']['ProjectModelRef'];
      audit?: components['schemas']['ProjectModelRef'];
      chat?: components['schemas']['ProjectModelRef'];
      compact?: components['schemas']['ProjectModelRef'];
      embedding?: components['schemas']['ProjectModelRef'];
      image?: components['schemas']['ProjectModelRef'];
    };
    /** @description Provider and model reference used for a project-level AI role override. */
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
    ProjectDetailResponse: {
      id: string;
      name: string;
      kind: components['schemas']['ProjectKind'];
      /** @description Whether the project was created by a signed-in person or an organisation bot. */
      ownerKind: components['schemas']['OwnerKind'];
      /** @description True when the project is open to every member of its owning organisation who holds the curate permission, on top of its owner. */
      sharedWithOrg: boolean;
      title?: null | string;
      /** @description Absolute public cover URL resolved by the server; absent when the project has no cover. */
      coverUrl?: null | string;
      contentMode: components['schemas']['ContentMode'];
      config?: components['schemas']['ProjectConfig'];
      brief?: null | string;
      /** @description The project’s additions to the built-in chapter-writing style; null when the project writes to the default alone. The writer receives the built-in style followed by these, and these win where the two conflict. */
      instructions?: null | string;
      storyCurrentChapter?: null | number;
      /** @description Effective chapter word-count target, when the project overrides the application default (1,800–2,600 words). */
      wordTarget?: components['schemas']['ProjectWordTarget'];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
      /** @description The built-in chapter-writing style every project writes to; read-only. */
      defaultInstructions: string;
      /** @description True when the stored instructions repeated the built-in style, verbatim or as an edited copy, and those lines were dropped from `instructions`. Saving the instructions clears it. */
      defaultCopyRemoved: boolean;
    };
    ProjectStatusResponse: {
      kind: components['schemas']['ProjectKind'];
      chaptersTotal?: number;
      /** @description Chapters finalized into canon. */
      chaptersFinal?: number;
      draftsTotal?: number;
      draftsFinal?: number;
      volumesTotal?: number;
    };
    UpdateProjectBody: {
      /** @description The working title. Trimmed; a blank title clears it. */
      title?: string;
      config?: components['schemas']['ProjectConfig'];
      contentMode?: components['schemas']['ContentMode'];
      brief?: string;
      /** @description Project additions to the built-in chapter-writing style; an empty string or null removes them. A copy of the current or an earlier built-in style inside the text, verbatim or lightly edited, is dropped. */
      instructions?: string | null;
      /** @description Chapter word-count target; send `null` to restore the application default (1,800–2,600 words). */
      wordTarget?: components['schemas']['ProjectWordTarget'] | null;
    };
    CloneProjectBody: {
      name: string;
      config?: components['schemas']['ProjectConfig'];
      contentMode?: components['schemas']['ContentMode'];
      /** @description Chapter word-count target; omitted inherits the source project’s target (or the application default). */
      wordTarget?: components['schemas']['ProjectWordTarget'];
      resetDerived?: boolean;
    };
    ResetBody: {
      /** @enum {string} */
      stage: 'knowledge' | 'plan' | 'generate' | 'all';
    };
    ResetResponse: {
      stage: string;
      tablesCleared: string[];
    };
    CostResponse: {
      totalCostUsd: number;
      /** @description The part of `totalCostUsd` estimated from registry list prices because the call recorded no cost. Zero means every figure was recorded. */
      estimatedCostUsd: number;
      /** @description Spend by calls made in the last 7 days. */
      last7DaysCostUsd: number;
      /** @description Spend by calls made in the last 30 days. */
      last30DaysCostUsd: number;
      /** @description Every recorded model call, including transport-error calls that carry no tokens or cost. */
      calls: number;
      inputTokens: number;
      outputTokens: number;
      /** @description By user-facing model group, highest spend first. */
      byGroup: components['schemas']['CostBreakdownItem'][];
      /** @description By internal call role, highest spend first. */
      byRole: components['schemas']['CostBreakdownItem'][];
      /** @description By model, highest spend first. */
      byModel: components['schemas']['CostBreakdownItem'][];
    };
    /** @description Spend and token totals for one slice of a project's model calls. */
    CostBreakdownItem: {
      /** @description The model group, role, or model id this row aggregates. */
      key: string;
      /** @description Display name: the registry label for a model, otherwise the key itself. */
      label: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      /** @description Recorded cost plus the list-price estimate for calls that recorded none. */
      costUsd: number;
      /** @description The part of `costUsd` estimated from registry list prices because the call recorded no cost. */
      estimatedCostUsd: number;
    };
    UploadImageBody1: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded image bytes without a data URL prefix. */
      image: string;
    };
    ListLedgerEntriesResponse: {
      entries: components['schemas']['LedgerEntryResponse'][];
    };
    LedgerEntryResponse: {
      id: string;
      projectId: string;
      kind: components['schemas']['LedgerEntryKind'];
      topic: string;
      statement: string;
      why: null | string;
      rejectedAlternatives: string[];
      /** @description What the decision means for the chapter writer; chapter packs carry it while the decision is active. */
      writerLine: null | string;
      decidedBy: components['schemas']['LedgerDecidedBy'];
      /** @description The pass that wrote the entry, such as `organise`; null for what the author wrote directly. */
      stepKey: null | string;
      /** @description Structured detail whose fields depend on the topic. */
      payload: null | {
        [key: string]: unknown;
      };
      /** @description Content this entry produced, addressed by the keys the change-set ops use. */
      links: components['schemas']['LedgerLinksResponse'];
      supersedesId: null | string;
      /**
       * Format: date-time
       * @description Set once the entry was superseded or withdrawn; an entry is active while it is null.
       */
      supersededAt: null | string;
      /** @description The author’s reason, when the entry was withdrawn rather than superseded. */
      withdrawnReason: null | string;
      /** @description Superseded entries have a successor on the same topic; withdrawn ones do not. */
      status: components['schemas']['LedgerEntryStatus'];
      /** Format: date-time */
      createdAt: string;
    };
    /** @enum {string} */
    LedgerEntryKind: 'decision' | 'direction' | 'rejected' | 'backlog' | 'system';
    /** @enum {string} */
    LedgerDecidedBy: 'author' | 'system';
    LedgerLinksResponse: {
      bibleDocuments?: components['schemas']['LedgerBibleDocumentLinkResponse'][];
      entityKeys?: string[];
      factKeys?: string[];
      volumeKeys?: string[];
      briefChapters?: number[];
    };
    LedgerBibleDocumentLinkResponse: {
      section: components['schemas']['BibleSection'];
      slug: string;
    };
    /** @enum {string} */
    LedgerEntryStatus: 'active' | 'superseded' | 'withdrawn';
    CreateLedgerEntryBody: {
      /** @description The author writes directions, rejected ideas and backlog entries directly; a decision only ever supersedes one. */
      kind: components['schemas']['AuthorLedgerKind'];
      /** @description Stable topic key, e.g. `premise`, `world.rules`, `organise.rules`. */
      topic: string;
      statement: string;
      /** @description For a rejected entry, the reason the author gave for killing it. */
      why?: string;
      /** @description Structured detail whose fields depend on the topic. */
      payload?: {
        [key: string]: unknown;
      };
    };
    /** @enum {string} */
    AuthorLedgerKind: 'direction' | 'rejected' | 'backlog';
    SupersedeLedgerEntryBody: {
      /** @description Kind of the successor; defaults to the superseded entry’s kind (a system detail becomes a decision). Only a decision or a system detail can become a decision. */
      kind?: components['schemas']['AuthorSupersedeLedgerKind'];
      statement: string;
      /** @description Omit to keep the superseded entry’s value when the kind is kept; send an empty string to clear it. */
      why?: string;
      /** @description What the decision means for the chapter writer. Omit to keep, empty string to clear. */
      writerLine?: string;
      /** @description Omit to keep the superseded entry’s alternatives when the kind is kept. */
      rejectedAlternatives?: string[];
      /** @description Omit to keep the superseded entry’s payload when the kind is kept. */
      payload?: {
        [key: string]: unknown;
      };
    };
    /** @enum {string} */
    AuthorSupersedeLedgerKind: 'decision' | 'direction' | 'rejected' | 'backlog';
    WithdrawLedgerEntryBody: {
      /** @description Why the author withdraws the entry. It is deactivated with no successor; a withdrawn rejection is no longer a do-not-propose item. */
      reason: string;
    };
    ImportNovelBody: {
      bundle: components['schemas']['NovelBundle'];
    };
    NovelBundle: {
      /** @enum {string} */
      format: 'novel-import';
      /** @enum {integer} */
      schemaVersion: 1;
      /** @description Always `final`: the chapters land as the finished, immediately publishable novel. */
      mode: components['schemas']['NovelImportMode'];
      novel: components['schemas']['NovelImportMeta'];
      /** @description Ordered volume groups; global chapter numbers are derived by flattening them in ordinal order. */
      volumes: components['schemas']['NovelImportVolume'][];
      assets?: components['schemas']['NovelImportAsset'][];
    };
    /** @enum {string} */
    NovelImportMode: 'final';
    NovelImportMeta: {
      /** @description Novel title, limited to the project name column capacity. */
      title: string;
      /** @description Novel overview used as the project's brief and exported description. */
      synopsis: string;
      /** @description One of the platform genres, matched case-insensitively and offered as the default genre when the novel is first published; any other value is ignored with a warning. */
      genre?: string;
      /** @description Novel tags stored as project themes. */
      tags?: string[];
      /** @description Name of the bundle asset to use as the novel cover. */
      cover?: string;
      /** @description Additions to the built-in chapter-writing style; omission writes to the default alone. */
      instructions?: string;
    };
    NovelImportVolume: {
      /** @description One-based volume position; ordinals must be unique and contiguous across the bundle. */
      ordinal: number;
      /** @description Volume title, stored on the volume seeded for this group. */
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
      /** @description Bundle content the import accepted but could not store. */
      warnings: string[];
    };
    PublishNovelBody: {
      /** @description Reader URL slug; omission derives it from the title. A slug another project holds is rejected. A different one on a later publish renames the novel: the next converge moves it, chapters and all, and the old reader URL stops resolving. */
      novelSlug?: string;
      title?: string;
      /** @description The work’s own author, shown to readers alongside the title; null clears it, omission keeps the stored one. Setting a non-null value requires the novel-forge:curate permission — the forge only attributes work it did not write. */
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
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  get_api_v1_access: {
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
          'application/json': components['schemas']['AccessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
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
  get_api_v1_ai_settings: {
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
          'application/json': components['schemas']['AccountSettingsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_ai_settings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateAccountSettingsBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AccountSettingsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_projects_projectId_events: {
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
  get_api_v1_plugins: {
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
          'application/json': components['schemas']['PluginManifestResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_plugins: {
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
          'application/json': components['schemas']['ProjectPluginResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_projects_projectId_plugins_pluginId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        pluginId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EnablePluginBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProjectPluginResponse1'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_projects_projectId_plugins_pluginId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        pluginId: string;
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
  get_internal_bots_botId_ownership: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        botId: string;
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
          'application/json': components['schemas']['BotOwnershipResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_internal_bots_botId_transfer: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        botId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['TransferOwnershipBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TransferOwnershipResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  post_api_v1_projects_projectId_jobs_jobId_cancel: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
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
          'application/json': components['schemas']['CancelJobResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_projects_projectId_drafts_summary: {
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
          'application/json': components['schemas']['DraftSummaryResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  post_api_v1_projects_projectId_chapters_n_regenerate: {
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
  post_api_v1_projects_projectId_runs_runId_cancel: {
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
          'application/json': components['schemas']['CancelRunResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_projects_projectId_chapter_rows: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        filter?: components['schemas']['ChapterRowFilter'];
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
          'application/json': components['schemas']['ListChapterRowsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  post_api_v1_projects_projectId_plugins_pluginId_augment: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        pluginId: string;
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
          'application/json': components['schemas']['PluginAugmentResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
        /** @description Only proposals with at least one operation aimed at this chapter. */
        chapter?: number | string;
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
  get_api_v1_projects_projectId_chat_sessions_sessionId_turn: {
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
          'application/json': components['schemas']['ChatTurnStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  post_api_v1_projects_projectId_chats_sessionId_turn_stream: {
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
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatTurnStreamResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_turns_runId_stream: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        /** @description Workflow run UUID, as returned by the turn-stream POST. */
        runId: string;
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
  get_api_v1_projects_projectId_context_preview: {
    parameters: {
      query: {
        purpose: 'generation' | 'outline' | 'chat' | 'premise' | 'audit';
        /** @description required for generation/outline */
        chapter?: number | string;
        /** @description chat scope type */
        scopeType?: 'project' | 'novel' | 'bible_document' | 'volume' | 'brief';
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
  get_api_v1_projects_projectId_bible_tidy: {
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
          'application/json': components['schemas']['BibleTidyPreviewResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_bible_tidy: {
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
        'application/json': components['schemas']['ApplyBibleTidyBody'];
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
  get_api_v1_projects_projectId_illustrations_reference_options: {
    parameters: {
      query: {
        subjectType: components['schemas']['IllustrationSubjectType'];
        /** @description Entity key for 'entity', the chapter number for 'chapter'; omitted for the project cover. */
        subjectKey?: string;
        /** @description Maximum entries per group. Defaults to 50. */
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
          'application/json': components['schemas']['ReferenceOptionsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_projects_projectId_illustrations_id_references: {
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
        'application/json': components['schemas']['UpdateIllustrationReferencesBody'];
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
  get_api_v1_projects_projectId_volumes: {
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
  get_api_v1_projects_projectId_bible_readiness: {
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
          'application/json': components['schemas']['BibleReadinessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
          'application/json': components['schemas']['ProjectDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_projects_projectId_ledger: {
    parameters: {
      query?: {
        /** @description Comma-separated entry kinds to keep. */
        kinds?: string;
        /** @description Comma-separated topic keys to keep; a key ending in `.*` keeps every topic under that prefix. */
        topics?: string;
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
          'application/json': components['schemas']['ListLedgerEntriesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_ledger: {
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
        'application/json': components['schemas']['CreateLedgerEntryBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LedgerEntryResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_ledger_topics_topic: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        topic: string;
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
          'application/json': components['schemas']['ListLedgerEntriesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_ledger_entryId_supersede: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entryId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SupersedeLedgerEntryBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LedgerEntryResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_ledger_entryId_withdraw: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        entryId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['WithdrawLedgerEntryBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LedgerEntryResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
}
export type AccessResponse = components['schemas']['AccessResponse'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type AuthLogoutResponse = components['schemas']['AuthLogoutResponse'];
export type AuthSessionResponse = components['schemas']['AuthSessionResponse'];
export type AuthUserInfoResponse = components['schemas']['AuthUserInfoResponse'];
export type AuthOrganisationsResponse = components['schemas']['AuthOrganisationsResponse'];
export type AuthOrganisationItem = components['schemas']['AuthOrganisationItem'];
export type SwitchOrganisationBody = components['schemas']['SwitchOrganisationBody'];
export type SwitchOrganisationResponse = components['schemas']['SwitchOrganisationResponse'];
export type AccountSettingsResponse = components['schemas']['AccountSettingsResponse'];
export type AccountModelDefaults = components['schemas']['AccountModelDefaults'];
export type AccountModelRef = components['schemas']['AccountModelRef'];
export type UpdateAccountSettingsBody = components['schemas']['UpdateAccountSettingsBody'];
export type AiModelsResponse = components['schemas']['AiModelsResponse'];
export type AiModelOption = components['schemas']['AiModelOption'];
export type AiRoleDefault = components['schemas']['AiRoleDefault'];
export type PluginManifestResponse = components['schemas']['PluginManifestResponse'];
export type PluginManifestResponse1 = components['schemas']['PluginManifestResponse1'];
export type DecisionPoint = components['schemas']['DecisionPoint'];
export type PluginActionResponse = components['schemas']['PluginActionResponse'];
export type PluginActionSurface = components['schemas']['PluginActionSurface'];
export type ProjectPluginResponse = components['schemas']['ProjectPluginResponse'];
export type ProjectPluginResponse1 = components['schemas']['ProjectPluginResponse1'];
export type EnablePluginBody = components['schemas']['EnablePluginBody'];
export type BotOwnershipResponse = components['schemas']['BotOwnershipResponse'];
export type TransferOwnershipBody = components['schemas']['TransferOwnershipBody'];
export type TransferOwnershipResponse = components['schemas']['TransferOwnershipResponse'];
export type SortOrder = components['schemas']['SortOrder'];
export type SortByTime = components['schemas']['SortByTime'];
export type ChapterStatus = components['schemas']['ChapterStatus'];
export type ListChapterResponse = components['schemas']['ListChapterResponse'];
export type ChapterListResponse = components['schemas']['ChapterListResponse'];
export type ChapterResponse = components['schemas']['ChapterResponse'];
export type UpdateChapterBody = components['schemas']['UpdateChapterBody'];
export type SeedFromBriefBody = components['schemas']['SeedFromBriefBody'];
export type WorkflowRunResponse = components['schemas']['WorkflowRunResponse'];
export type ListBriefSummaryResponse = components['schemas']['ListBriefSummaryResponse'];
export type BriefSummaryResponse = components['schemas']['BriefSummaryResponse'];
export type BriefWriteMode = components['schemas']['BriefWriteMode'];
export type BriefResponse = components['schemas']['BriefResponse'];
export type UpdateBriefBody = components['schemas']['UpdateBriefBody'];
export type EndingContractSchema = components['schemas']['EndingContractSchema'];
export type HookType = components['schemas']['HookType'];
export type KnowledgeContractSchema = components['schemas']['KnowledgeContractSchema'];
export type KnowledgeRevealSchema = components['schemas']['KnowledgeRevealSchema'];
export type GenerateBody = components['schemas']['GenerateBody'];
export type JobEnqueueResponse = components['schemas']['JobEnqueueResponse'];
export type ListGenerationJobResponse = components['schemas']['ListGenerationJobResponse'];
export type GenerationJobItem = components['schemas']['GenerationJobItem'];
export type JobKind = components['schemas']['JobKind'];
export type JobStatus = components['schemas']['JobStatus'];
export type CancelJobResponse = components['schemas']['CancelJobResponse'];
export type ListDraftResponse = components['schemas']['ListDraftResponse'];
export type DraftResponse = components['schemas']['DraftResponse'];
export type DraftStatus = components['schemas']['DraftStatus'];
export type DraftReviewStatus = components['schemas']['DraftReviewStatus'];
export type ContentRatingInput = components['schemas']['ContentRatingInput'];
export type SexualContentRating = components['schemas']['SexualContentRating'];
export type ViolenceRating = components['schemas']['ViolenceRating'];
export type DarkContentRating = components['schemas']['DarkContentRating'];
export type DraftSummaryResponse = components['schemas']['DraftSummaryResponse'];
export type DraftSummaryItem = components['schemas']['DraftSummaryItem'];
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
export type CancelRunResponse = components['schemas']['CancelRunResponse'];
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
export type ChapterRowFilter = components['schemas']['ChapterRowFilter'];
export type ListChapterRowsResponse = components['schemas']['ListChapterRowsResponse'];
export type ChapterRowResponse = components['schemas']['ChapterRowResponse'];
export type ChapterRowKind = components['schemas']['ChapterRowKind'];
export type ChapterRowCountsResponse = components['schemas']['ChapterRowCountsResponse'];
export type ChapterContradictionResponse = components['schemas']['ChapterContradictionResponse'];
export type JobResponse = components['schemas']['JobResponse'];
export type PluginAugmentResponse = components['schemas']['PluginAugmentResponse'];
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
export type PendingTurnResponse = components['schemas']['PendingTurnResponse'];
export type FailedTurnResponse = components['schemas']['FailedTurnResponse'];
export type ChatTurnOutcome = components['schemas']['ChatTurnOutcome'];
export type ChatTurnStatusResponse = components['schemas']['ChatTurnStatusResponse'];
export type ChatTurnBody = components['schemas']['ChatTurnBody'];
export type ChatTurnResponse = components['schemas']['ChatTurnResponse'];
export type TurnAppliedResult = components['schemas']['TurnAppliedResult'];
export type UpdateChatSessionBody = components['schemas']['UpdateChatSessionBody'];
export type UpdateSessionModelBody = components['schemas']['UpdateSessionModelBody'];
export type ChatTurnStreamResponse = components['schemas']['ChatTurnStreamResponse'];
export type EnhancePremiseBody = components['schemas']['EnhancePremiseBody'];
export type EnhancePremiseResponse = components['schemas']['EnhancePremiseResponse'];
export type PremiseRationaleResponse = components['schemas']['PremiseRationaleResponse'];
export type AuditBibleResponse = components['schemas']['AuditBibleResponse'];
export type AuditFindingResponse = components['schemas']['AuditFindingResponse'];
export type ContextPreviewResponse = components['schemas']['ContextPreviewResponse'];
export type ContextSectionPreview = components['schemas']['ContextSectionPreview'];
export type OmittedSectionPreview = components['schemas']['OmittedSectionPreview'];
export type BibleTidyPreviewResponse = components['schemas']['BibleTidyPreviewResponse'];
export type BibleTidyItem = components['schemas']['BibleTidyItem'];
export type BibleTidyKind = components['schemas']['BibleTidyKind'];
export type BibleSection = components['schemas']['BibleSection'];
export type EntityType = components['schemas']['EntityType'];
export type ApplyBibleTidyBody = components['schemas']['ApplyBibleTidyBody'];
export type BibleTidySelection = components['schemas']['BibleTidySelection'];
export type StartIllustrationBody = components['schemas']['StartIllustrationBody'];
export type IllustrationSubjectType = components['schemas']['IllustrationSubjectType'];
export type AttachReferenceBody = components['schemas']['AttachReferenceBody'];
export type IllustrationReferenceSource = components['schemas']['IllustrationReferenceSource'];
export type IllustrationAttachableReferenceRole = components['schemas']['IllustrationAttachableReferenceRole'];
export type IllustrationResponse = components['schemas']['IllustrationResponse'];
export type IllustrationStatus = components['schemas']['IllustrationStatus'];
export type IllustrationOrigin = components['schemas']['IllustrationOrigin'];
export type IllustrationCandidateResponse = components['schemas']['IllustrationCandidateResponse'];
export type IllustrationReferenceResponse = components['schemas']['IllustrationReferenceResponse'];
export type IllustrationReferenceRole = components['schemas']['IllustrationReferenceRole'];
export type IllustrationReferenceOrigin = components['schemas']['IllustrationReferenceOrigin'];
export type AttachedReferenceResponse = components['schemas']['AttachedReferenceResponse'];
export type AppearanceDescriptionResponse = components['schemas']['AppearanceDescriptionResponse'];
export type AppearanceConfidenceLevel = components['schemas']['AppearanceConfidenceLevel'];
export type ReferenceWarningResponse = components['schemas']['ReferenceWarningResponse'];
export type IllustrationReferenceWarningCode = components['schemas']['IllustrationReferenceWarningCode'];
export type ListIllustrationsResponse = components['schemas']['ListIllustrationsResponse'];
export type ReferenceOptionsResponse = components['schemas']['ReferenceOptionsResponse'];
export type ReferenceOptionResponse = components['schemas']['ReferenceOptionResponse'];
export type UpdateIllustrationReferencesBody = components['schemas']['UpdateIllustrationReferencesBody'];
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
export type CreateEntityBody = components['schemas']['CreateEntityBody'];
export type EntitySignificance = components['schemas']['EntitySignificance'];
export type EntityOrigin = components['schemas']['EntityOrigin'];
export type EntityResponse = components['schemas']['EntityResponse'];
export type EntityImageResponse = components['schemas']['EntityImageResponse'];
export type ListEntityResponse = components['schemas']['ListEntityResponse'];
export type UpdateEntityBody = components['schemas']['UpdateEntityBody'];
export type UploadImageBody = components['schemas']['UploadImageBody'];
export type AddEntityImageBody = components['schemas']['AddEntityImageBody'];
export type ListVolumeResponse = components['schemas']['ListVolumeResponse'];
export type VolumeResponse = components['schemas']['VolumeResponse'];
export type ListBibleDocResponse = components['schemas']['ListBibleDocResponse'];
export type BibleDocListItem = components['schemas']['BibleDocListItem'];
export type BibleDocResponse = components['schemas']['BibleDocResponse'];
export type UpsertBibleDocBody = components['schemas']['UpsertBibleDocBody'];
export type ListFactsResponse = components['schemas']['ListFactsResponse'];
export type FactResponse = components['schemas']['FactResponse'];
export type KnowledgeEntryResponse = components['schemas']['KnowledgeEntryResponse'];
export type FactSource = components['schemas']['FactSource'];
export type UpsertFactBody = components['schemas']['UpsertFactBody'];
export type RevealFactBody = components['schemas']['RevealFactBody'];
export type BibleReadinessResponse = components['schemas']['BibleReadinessResponse'];
export type BibleReadinessDimensionResponse = components['schemas']['BibleReadinessDimensionResponse'];
export type BibleReadinessDimension = components['schemas']['BibleReadinessDimension'];
export type BibleReadinessVerdict = components['schemas']['BibleReadinessVerdict'];
export type BibleReadinessRoleResponse = components['schemas']['BibleReadinessRoleResponse'];
export type BibleStage = components['schemas']['BibleStage'];
export type CreateProjectBody = components['schemas']['CreateProjectBody'];
export type ProjectKind = components['schemas']['ProjectKind'];
export type ContentMode = components['schemas']['ContentMode'];
export type ProjectWordTarget = components['schemas']['ProjectWordTarget'];
export type ProjectResponse = components['schemas']['ProjectResponse'];
export type OwnerKind = components['schemas']['OwnerKind'];
export type ProjectConfig = components['schemas']['ProjectConfig'];
export type ProjectModelOverrides = components['schemas']['ProjectModelOverrides'];
export type ProjectModelRef = components['schemas']['ProjectModelRef'];
export type ListProjectResponse = components['schemas']['ListProjectResponse'];
export type ProjectDetailResponse = components['schemas']['ProjectDetailResponse'];
export type ProjectStatusResponse = components['schemas']['ProjectStatusResponse'];
export type UpdateProjectBody = components['schemas']['UpdateProjectBody'];
export type CloneProjectBody = components['schemas']['CloneProjectBody'];
export type ResetBody = components['schemas']['ResetBody'];
export type ResetResponse = components['schemas']['ResetResponse'];
export type CostResponse = components['schemas']['CostResponse'];
export type CostBreakdownItem = components['schemas']['CostBreakdownItem'];
export type UploadImageBody1 = components['schemas']['UploadImageBody1'];
export type ListLedgerEntriesResponse = components['schemas']['ListLedgerEntriesResponse'];
export type LedgerEntryResponse = components['schemas']['LedgerEntryResponse'];
export type LedgerEntryKind = components['schemas']['LedgerEntryKind'];
export type LedgerDecidedBy = components['schemas']['LedgerDecidedBy'];
export type LedgerLinksResponse = components['schemas']['LedgerLinksResponse'];
export type LedgerBibleDocumentLinkResponse = components['schemas']['LedgerBibleDocumentLinkResponse'];
export type LedgerEntryStatus = components['schemas']['LedgerEntryStatus'];
export type CreateLedgerEntryBody = components['schemas']['CreateLedgerEntryBody'];
export type AuthorLedgerKind = components['schemas']['AuthorLedgerKind'];
export type SupersedeLedgerEntryBody = components['schemas']['SupersedeLedgerEntryBody'];
export type AuthorSupersedeLedgerKind = components['schemas']['AuthorSupersedeLedgerKind'];
export type WithdrawLedgerEntryBody = components['schemas']['WithdrawLedgerEntryBody'];
export type ImportNovelBody = components['schemas']['ImportNovelBody'];
export type NovelBundle = components['schemas']['NovelBundle'];
export type NovelImportMode = components['schemas']['NovelImportMode'];
export type NovelImportMeta = components['schemas']['NovelImportMeta'];
export type NovelImportVolume = components['schemas']['NovelImportVolume'];
export type NovelImportChapter = components['schemas']['NovelImportChapter'];
export type NovelImportAsset = components['schemas']['NovelImportAsset'];
export type ImportNovelResponse = components['schemas']['ImportNovelResponse'];
export type PublishNovelBody = components['schemas']['PublishNovelBody'];
export type NovelGenre = components['schemas']['NovelGenre'];
export type NovelTag = components['schemas']['NovelTag'];
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
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
export type StreamEventsPathParams = Exclude<paths['/api/v1/projects/{projectId}/events']['get']['parameters']['path'], undefined>;
export type ListProjectPluginsPathParams = Exclude<paths['/api/v1/projects/{projectId}/plugins']['get']['parameters']['path'], undefined>;
export type GetOwnershipPathParams = Exclude<paths['/internal/bots/{botId}/ownership']['get']['parameters']['path'], undefined>;
export type ListChaptersQueryParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters']['get']['parameters']['query'], undefined>;
export type ListChaptersPathParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters']['get']['parameters']['path'], undefined>;
export type GetChapterPathParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters/{n}']['get']['parameters']['path'], undefined>;
export type ExportNovelPathParams = Exclude<paths['/api/v1/projects/{projectId}/export/novel']['get']['parameters']['path'], undefined>;
export type ListBriefsPathParams = Exclude<paths['/api/v1/projects/{projectId}/briefs']['get']['parameters']['path'], undefined>;
export type GetBriefPathParams = Exclude<paths['/api/v1/projects/{projectId}/briefs/{n}']['get']['parameters']['path'], undefined>;
export type ListJobsPathParams = Exclude<paths['/api/v1/projects/{projectId}/jobs']['get']['parameters']['path'], undefined>;
export type ListDraftsPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts']['get']['parameters']['path'], undefined>;
export type ListDraftSummariesPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/summary']['get']['parameters']['path'], undefined>;
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
export type ListChapterRowsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/chapter-rows']['get']['parameters']['query'], undefined>;
export type ListChapterRowsPathParams = Exclude<paths['/api/v1/projects/{projectId}/chapter-rows']['get']['parameters']['path'], undefined>;
export type GetJobPathParams = Exclude<paths['/api/v1/jobs/{jobId}']['get']['parameters']['path'], undefined>;
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
export type TurnStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/turn']['get']['parameters']['path'], undefined>;
export type StreamTurnPathParams = Exclude<paths['/api/v1/projects/{projectId}/turns/{runId}/stream']['get']['parameters']['path'], undefined>;
export type PreviewContextQueryParams = Exclude<paths['/api/v1/projects/{projectId}/context/preview']['get']['parameters']['query'], undefined>;
export type PreviewContextPathParams = Exclude<paths['/api/v1/projects/{projectId}/context/preview']['get']['parameters']['path'], undefined>;
export type PreviewBibleTidyPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/tidy']['get']['parameters']['path'], undefined>;
export type ListIllustrationsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations']['get']['parameters']['query'], undefined>;
export type ListIllustrationsPathParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations']['get']['parameters']['path'], undefined>;
export type ListReferenceOptionsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations/reference-options']['get']['parameters']['query'], undefined>;
export type ListReferenceOptionsPathParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations/reference-options']['get']['parameters']['path'], undefined>;
export type ListEntitiesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/entities']['get']['parameters']['query'], undefined>;
export type ListEntitiesPathParams = Exclude<paths['/api/v1/projects/{projectId}/entities']['get']['parameters']['path'], undefined>;
export type GetEntityPathParams = Exclude<paths['/api/v1/projects/{projectId}/entities/{entityKey}']['get']['parameters']['path'], undefined>;
export type ListVolumesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/volumes']['get']['parameters']['query'], undefined>;
export type ListVolumesPathParams = Exclude<paths['/api/v1/projects/{projectId}/volumes']['get']['parameters']['path'], undefined>;
export type GetVolumePathParams = Exclude<paths['/api/v1/projects/{projectId}/volumes/{volumeKey}']['get']['parameters']['path'], undefined>;
export type ListBibleDocsPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible']['get']['parameters']['path'], undefined>;
export type GetBibleDocPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/{section}/{slug}']['get']['parameters']['path'], undefined>;
export type ListFactsPathParams = Exclude<paths['/api/v1/projects/{projectId}/facts']['get']['parameters']['path'], undefined>;
export type GetFactPathParams = Exclude<paths['/api/v1/projects/{projectId}/facts/{factKey}']['get']['parameters']['path'], undefined>;
export type ReadinessPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/readiness']['get']['parameters']['path'], undefined>;
export type ListProjectsQueryParams = Exclude<paths['/api/v1/projects']['get']['parameters']['query'], undefined>;
export type GetProjectPathParams = Exclude<paths['/api/v1/projects/{projectId}']['get']['parameters']['path'], undefined>;
export type GetProjectStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/status']['get']['parameters']['path'], undefined>;
export type GetProjectCostPathParams = Exclude<paths['/api/v1/projects/{projectId}/cost']['get']['parameters']['path'], undefined>;
export type ListActiveQueryParams = Exclude<paths['/api/v1/projects/{projectId}/ledger']['get']['parameters']['query'], undefined>;
export type ListActivePathParams = Exclude<paths['/api/v1/projects/{projectId}/ledger']['get']['parameters']['path'], undefined>;
export type HistoryPathParams = Exclude<paths['/api/v1/projects/{projectId}/ledger/topics/{topic}']['get']['parameters']['path'], undefined>;
export type GetAccessPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications/access']['get']['parameters']['path'], undefined>;
export type ListPublicationsPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications']['get']['parameters']['path'], undefined>;
