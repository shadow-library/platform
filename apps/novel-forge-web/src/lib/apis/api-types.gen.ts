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
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Jobs */
    get: operations['get_api_v1_projects_projectId_chat_sessions_sessionId_jobs'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs/events': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Events */
    get: operations['get_api_v1_projects_projectId_chat_sessions_sessionId_jobs_events'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs/stream': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Stream Events */
    get: operations['get_api_v1_projects_projectId_chat_sessions_sessionId_jobs_stream'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs/{jobId}/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel Job */
    post: operations['post_api_v1_projects_projectId_chat_sessions_sessionId_jobs_jobId_cancel'];
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
  '/api/v1/ai/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Usage */
    get: operations['get_api_v1_ai_usage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ai/quota': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Quota */
    get: operations['get_api_v1_ai_quota'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/ai/models': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Models */
    get: operations['get_api_v1_projects_projectId_ai_models'];
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
  '/api/v1/projects/{projectId}/drafts/next': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Start Next Draft */
    post: operations['post_api_v1_projects_projectId_drafts_next'];
    delete?: never;
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
  '/api/v1/projects/{projectId}/drafts/{n}/finalize-readiness': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Finalize Readiness */
    get: operations['get_api_v1_projects_projectId_drafts_n_finalize_readiness'];
    put?: never;
    post?: never;
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
  '/api/v1/projects/{projectId}/chapters/{n}/summary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Update Summary */
    put: operations['put_api_v1_projects_projectId_chapters_n_summary'];
    post?: never;
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
  '/api/v1/projects/{projectId}/runs/{runId}/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Run Usage */
    get: operations['get_api_v1_projects_projectId_runs_runId_usage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/cost': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Chapter Cost */
    get: operations['get_api_v1_projects_projectId_chapters_n_cost'];
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
  '/api/v1/projects/{projectId}/proposals/{proposalId}/undo-impact': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Undo Impact */
    get: operations['get_api_v1_projects_projectId_proposals_proposalId_undo_impact'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/proposals/{proposalId}/writer-preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Writer Preview */
    get: operations['get_api_v1_projects_projectId_proposals_proposalId_writer_preview'];
    put?: never;
    post?: never;
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
  '/api/v1/projects/{projectId}/proposals/{proposalId}/ops/{opIndex}/reject': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Reject Op */
    post: operations['post_api_v1_projects_projectId_proposals_proposalId_ops_opIndex_reject'];
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
  '/api/v1/projects/{projectId}/bible/audits': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Audits */
    get: operations['get_api_v1_projects_projectId_bible_audits'];
    put?: never;
    /** Start Audit */
    post: operations['post_api_v1_projects_projectId_bible_audits'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/bible/audits/{reportId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Audit */
    get: operations['get_api_v1_projects_projectId_bible_audits_reportId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/bible/audits/{reportId}/findings/{findingId}/decision': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Decide Finding */
    post: operations['post_api_v1_projects_projectId_bible_audits_reportId_findings_findingId_decision'];
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
  '/api/v1/projects/{projectId}/source/chapters/search': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Search Chapters */
    get: operations['get_api_v1_projects_projectId_source_chapters_search'];
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
  '/api/v1/projects/{projectId}/chapters/{n}/reviews': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Reviews */
    get: operations['get_api_v1_projects_projectId_chapters_n_reviews'];
    put?: never;
    /** Run Review */
    post: operations['post_api_v1_projects_projectId_chapters_n_reviews'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/reviews/{reviewId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Review */
    get: operations['get_api_v1_projects_projectId_chapters_n_reviews_reviewId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/chapters/{n}/reviews/{reviewId}/findings/{findingId}/remedy': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Remedy Finding */
    post: operations['post_api_v1_projects_projectId_chapters_n_reviews_reviewId_findings_findingId_remedy'];
    /** Clear Remedy */
    delete: operations['delete_api_v1_projects_projectId_chapters_n_reviews_reviewId_findings_findingId_remedy'];
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
  '/api/v1/projects/{projectId}/entities/{entityKey}/timeline': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Timeline */
    get: operations['get_api_v1_projects_projectId_entities_entityKey_timeline'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
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
  '/api/v1/projects/{projectId}/volumes/{volumeKey}/goal-met': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Goal Met */
    post: operations['post_api_v1_projects_projectId_volumes_volumeKey_goal_met'];
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
  '/api/v1/projects/{projectId}/milestones': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Milestones */
    get: operations['get_api_v1_projects_projectId_milestones'];
    put?: never;
    /** Create Milestone */
    post: operations['post_api_v1_projects_projectId_milestones'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/milestones/{milestoneKey}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Delete Milestone */
    delete: operations['delete_api_v1_projects_projectId_milestones_milestoneKey'];
    options?: never;
    head?: never;
    /** Update Milestone */
    patch: operations['patch_api_v1_projects_projectId_milestones_milestoneKey'];
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
  '/api/v1/projects/new-novel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create Novel With Notes */
    post: operations['post_api_v1_projects_new_novel'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/notes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Notes */
    get: operations['get_api_v1_projects_projectId_notes'];
    /** Update Notes */
    put: operations['put_api_v1_projects_projectId_notes'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/progress': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Progress */
    get: operations['get_api_v1_projects_projectId_progress'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/progress/{key}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Set Progress Override */
    put: operations['put_api_v1_projects_projectId_progress_key'];
    post?: never;
    /** Clear Progress Override */
    delete: operations['delete_api_v1_projects_projectId_progress_key'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/projects/{projectId}/notes/from-message': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Save Message */
    post: operations['post_api_v1_projects_projectId_notes_from_message'];
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
    ListChatJobsResponse: {
      /** @description Jobs this chat started that are still running, plus those that finished within the last hour, each with its status. */
      items: components['schemas']['ChatJobResponse'][];
      /** @description The session's latest job event seq as of `items`: open the event stream after it to follow these jobs from here. */
      cursor: number;
    };
    ChatJobResponse: {
      id: string;
      kind: components['schemas']['JobKind'];
      target: string;
      status: components['schemas']['JobStatus'];
      /** @description Attempts started so far; a model or gateway timeout retries an organise or plan job once. */
      attempts: number;
      lastError?: null | string;
      /** @description Latest progress snapshot; `proposalId` names the staged card once there is one. */
      progress?: null | {
        [key: string]: unknown;
      };
      /**
       * Format: date-time
       * @description When a job waiting to retry is dispatched again.
       */
      nextAttemptAt?: null | string;
      origin: components['schemas']['ChatJobOriginResponse'];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    JobKind: 'generate' | 'finalize' | 'backfill' | 'publish' | 'import' | 'organise' | 'plan' | 'review' | 'audit';
    /** @enum {string} */
    JobStatus: 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';
    /** @description The chat card a job was started from. */
    ChatJobOriginResponse: {
      proposalId: string;
      opIndex: number;
      messageId?: null | string;
    };
    ListChatJobEventsResponse: {
      items: components['schemas']['ChatJobEventResponse'][];
    };
    /** @description One step of a job a chat started. The same shape is the `data` of each `job` event on the session’s job event stream, whose SSE id is `seq`. */
    ChatJobEventResponse: {
      /** @description The cursor: increasing within the session in the order events commit. */
      seq: number;
      jobId: string;
      kind: components['schemas']['JobKind'];
      type: components['schemas']['JobEventType'];
      /** @description `step` and `done` carry the job's progress; `started` and `retrying` the attempt; `failed` and `retrying` the error. */
      data?: null | {
        [key: string]: unknown;
      };
      /** Format: date-time */
      createdAt: string;
    };
    /** @enum {string} */
    JobEventType: 'queued' | 'started' | 'step' | 'retrying' | 'done' | 'failed' | 'cancelled';
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
    /** @description Settings that apply to every project and idea the signed-in author owns. */
    AccountSettingsResponse: {
      /** @description Your Balanced tier: used at Balanced when neither a chat pin nor the project names a model; Economy and Performant use the tier map instead. Unrestricted work only takes a default on the unrestricted allowlist. */
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
      /** @description The platform model for every cost tier × model type × author-selectable group. Balanced equals `defaults` / `unrestrictedDefaults`. */
      tiers: components['schemas']['AiTierModel'][];
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
    AiTierModel: {
      costTier: components['schemas']['CostTier'];
      contentMode: components['schemas']['ContentMode'];
      /** @description Model group: writing, planning, review, chat, helper or image. */
      group: string;
      provider: string;
      model: string;
      /** @description The product name to show an author. */
      label: string;
      /** @description USD per million input tokens; absent for image models. */
      inputPricePerMToken?: number;
      /** @description USD per million output tokens; absent for image models. */
      outputPricePerMToken?: number;
    };
    /** @enum {string} */
    CostTier: 'economy' | 'balanced' | 'performant';
    /** @enum {string} */
    ContentMode: 'standard' | 'unrestricted';
    /** @description Cost, tokens and calls across every novel the signed-in author owns — the same shaping as a single project's cost, plus a per-novel breakdown. */
    AccountUsageResponse: {
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
      /** @description By how the cost was priced — 'provider', 'gateway', or 'estimate' — highest spend first. */
      byCostSource: components['schemas']['CostBreakdownItem'][];
      /** @description By the project's cost tier at call time — 'economy', 'balanced', or 'performant' — highest spend first. */
      byTier: components['schemas']['CostBreakdownItem'][];
      /** @description By content mode at call time — 'standard' or 'unrestricted' — highest spend first. */
      byContentMode: components['schemas']['CostBreakdownItem'][];
      /** @description Spend by UTC calendar day over the last 30 days, oldest first. A day with no calls is omitted rather than zero-filled. */
      byDay: components['schemas']['DayCostItem'][];
      /** @description By novel, highest spend first. */
      byProject: components['schemas']['ProjectCostItem'][];
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
    /** @description Spend on one UTC calendar day. */
    DayCostItem: {
      /** @description UTC calendar day, YYYY-MM-DD. */
      day: string;
      calls: number;
      costUsd: number;
    };
    /** @description Spend on one of the signed-in author's novels. */
    ProjectCostItem: {
      projectId: string;
      title?: null | string;
      calls: number;
      costUsd: number;
    };
    /** @description The rolling spend window an author’s calls are throttled against. */
    AiQuotaResponse: {
      calls: number;
      costUsd: number;
      /** @description Calls allowed in the window; 0 or below means the rate dimension is disabled. */
      maxCalls: number;
      /** @description Spend allowed in the window, in USD; 0 or below means the spend dimension is disabled. */
      maxCostUsd: number;
      /** @description Width of the rolling window, in milliseconds. */
      windowMs: number;
      /**
       * Format: date-time
       * @description When the oldest call counted in the window ages out and the window first frees capacity. Null when nothing is counted in the window right now.
       */
      resetsAt?: null | string;
    };
    /** @description What each group of AI work on this novel runs on under one model type and cost tier — a chat pin is not included. */
    ProjectModelsResponse: {
      contentMode: components['schemas']['ContentMode'];
      costTier: components['schemas']['CostTier'];
      models: components['schemas']['ProjectModelRoute'][];
    };
    ProjectModelRoute: {
      /** @description Model group: writing, planning, review, chat, helper or image. */
      group: string;
      provider: string;
      model: string;
      /** @description The product name to show an author. */
      label: string;
      /**
       * @description Why this model: the project's own pick, the author's Balanced default, or the platform tier map.
       * @enum {string}
       */
      source: 'project' | 'account' | 'tier';
      inputPricePerMToken?: number;
      outputPricePerMToken?: number;
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
      /** @description The agreed direction for the chapter. */
      direction?: null | string;
      /** @description How the chapter is written; null follows the project's content mode. */
      contentMode?: components['schemas']['ContentMode'] | null;
      scenes?: null | components['schemas']['BriefSceneSchema'][];
      /** @description Milestone keys this chapter claims to reach. */
      claimedMilestones?: null | string[];
      /** @description True for the chapter planned as the ending. */
      isEnding: boolean;
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
    /** @description One scene of a chapter plan. */
    BriefSceneSchema: {
      summary: string;
      /** @description Entity key of the scene’s point-of-view character. */
      pov?: null | string;
      /** @description What the point-of-view character wants in the scene. */
      goal?: string;
      /** @description Who or what stands in the way. */
      obstacle?: string;
      /** @description How things stand differently when the scene ends. */
      turn?: string;
      /** @description The on-page beats of the scene, in order. */
      beats?: string[];
      /** @description The share of the chapter length the scene fills, in words. */
      estimatedWords?: number;
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
      /** @description The agreed direction for the chapter. Omit to leave unchanged; null or blank clears it. */
      direction?: string | null;
      /** @description How the chapter is written. Omit to leave unchanged; null follows the project's content mode. */
      contentMode?: components['schemas']['ContentMode'] | null;
      /** @description Replacement scene list. Omit to leave unchanged; null clears it. */
      scenes?: components['schemas']['BriefSceneSchema'][] | null;
      /** @description Milestone keys this chapter reaches. Omit to leave unchanged; null clears them. */
      claimedMilestones?: string[] | null;
      /** @description Marks the chapter planned as the ending. Omit to leave unchanged. */
      isEnding?: boolean;
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
    /** @description A reveal-rule refusal (PLN_001): the plan being written reveals a secret still locked at its chapter. */
    RevealRuleErrorResponse: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
      /** @description Present on PLN_001: each locked secret the plan would reveal and what it still needs. */
      details?: components['schemas']['RevealRuleDetails'];
    };
    RevealRuleDetails: {
      violations: components['schemas']['RevealRuleViolationItem'][];
    };
    /** @description A locked secret a plan would reveal, named by its title alone. */
    RevealRuleViolationItem: {
      factKey: string;
      /** @description The secret's title, never its truth. */
      label: string;
      /** @description What still has to hold before the plan may reveal it, read as words. */
      missing: string[];
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
      /** @description Present when the batch was cut short of its limit: this chapter teaches its characters something, and the AI writes the next only once it is approved. */
      stoppedAtTeachingChapter?: number;
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
      usage: components['schemas']['JobUsageResponse'];
    };
    /** @description Cost and token totals across every run this job drove — empty (zero calls) for a job kind that makes no model calls, such as publish. */
    JobUsageResponse: {
      calls: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      /** @description Recorded cost plus the list-price estimate for calls that recorded none. */
      costUsd: number;
      /** @description The part of costUsd estimated from registry list prices because the call recorded no cost. */
      estimatedCostUsd: number;
      byCostSource: components['schemas']['JobCostSourceItem'][];
    };
    /** @description Spend split by where the cost came from — 'provider', 'gateway', 'estimate', or 'error' for a call that recorded none. */
    JobCostSourceItem: {
      costSource: string;
      calls: number;
      costUsd: number;
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
      /** @description Moves on every hand save, including one folded into the current revision; send it back as `baseSaveSeq`. */
      saveSeq: number;
      /** @description The last revision the author approved. It survives later edits and finalize; a different `revision` means the text changed since that approval. */
      approvedRevision: null | number;
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
      /** @description Set by an approval: how many blocking review findings still open on the approved text the approval recorded as overridden ("approved by the author"). */
      overriddenFindings?: number;
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
    DraftConflictResponse: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
      /** @description Present on DRF_013 when the chapter still has a draft: what it holds now. */
      current?: components['schemas']['ConflictingDraftResponse'];
      /** @description Present on PLN_004, when an approval or finalize would ledger a plan that reveals a locked secret: each such secret and what it still needs. */
      details?: components['schemas']['RevealRuleDetails'];
    };
    /** @description The draft as it stands when a save was refused for being made against an older one. */
    ConflictingDraftResponse: {
      id: string;
      revision: number;
      saveSeq: number;
      title: null | string;
      body: string;
      summary: null | string;
      /** Format: date-time */
      updatedAt: string;
    };
    UpdateDraftBody: {
      /** @description The id of the draft this save was made against. The three base fields go together; omit all three only to start a chapter that has no draft. */
      baseDraftId?: string;
      /** @description The draft revision this save was made against. */
      baseRevision?: number;
      /** @description The draft `saveSeq` this save was made against. A save whose base no longer matches is refused with DRF_013 carrying the current draft; a matching autosave may fold into the revision it continues. */
      baseSaveSeq?: number;
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
      /** @description Approve a stale draft as written: its prose stays, its stale reason is cleared and the override is recorded. Needs `staleReason`; refused (DRF_017) when a reveal in its plan no longer holds. */
      keepStale?: boolean;
      /** @description With `keepStale`, the stale reason the author saw. A draft that has gone stale for another reason since is refused with DRF_013. */
      staleReason?: string;
      /** @description The draft `saveSeq` the author read; refused with DRF_013 when a save changed the revision's text since. */
      saveSeq: number;
      /** @description The id of the draft the author read; refused with DRF_013 when the chapter was deleted and started again since. */
      draftId: string;
    };
    /** @description What finalize would answer for this chapter now: ready, or every reason it would refuse, in the order it checks them. */
    FinalizeReadinessResponse: {
      ready: boolean;
      blockers: components['schemas']['FinalizeBlockerResponse'][];
    };
    FinalizeBlockerResponse: {
      /** @description The error code finalize would refuse with. */
      code: string;
      message: string;
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
      /** @description The id of the draft this save was made against. The three base fields go together; omit all three only to start a chapter that has no draft. */
      baseDraftId?: string;
      /** @description The draft revision this save was made against. */
      baseRevision?: number;
      /** @description The draft `saveSeq` this save was made against. A save whose base no longer matches is refused with DRF_013 carrying the current draft; a matching autosave may fold into the revision it continues. */
      baseSaveSeq?: number;
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
      /** @description 2-3 sentence summary of what happened in the chapter, past tense. Saved (to the draft, and to the chapter once final) for a non-isolated chapter; returned unsaved for an isolated one, for review alongside `state` before either is saved through PUT /drafts/:n. */
      summary: string;
      /** @description The saved draft’s new `saveSeq`, present only when this call persisted the summary — a non-isolated chapter. */
      saveSeq?: number;
      /** @description Continuation state the next chapter would build on. Isolated chapters only — always returned unsaved, for the author's review. */
      state: {
        [key: string]: unknown;
      };
    };
    SummaryConflictResponse: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
      /** @description Present on DRF_013 when the chapter still has a draft: what it holds now. */
      current?: components['schemas']['ConflictingDraftResponse'];
      /** @description Present on PLN_004, when an approval or finalize would ledger a plan that reveals a locked secret: each such secret and what it still needs. */
      details?: components['schemas']['RevealRuleDetails'];
      /** @description The summary computed from the prose as it stood before the conflict — re-offer it once reloaded, rather than summarising again. */
      attemptedSummary: string;
    };
    UpdateSummaryBody: {
      /** @description The id of the draft this save was made against. The three base fields go together; omit all three only to start a chapter that has no draft. */
      baseDraftId?: string;
      /** @description The draft revision this save was made against. */
      baseRevision?: number;
      /** @description The draft `saveSeq` this save was made against. A save whose base no longer matches is refused with DRF_013 carrying the current draft; a matching autosave may fold into the revision it continues. */
      baseSaveSeq?: number;
      /** @description The author's own summary for the chapter, replacing the AI-produced or previous one. Works on a final chapter too. */
      summary: string;
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
      /** @description Advisory findings from deterministic checks on the proposal, such as a removal written as a negation; a chapter plan card also carries its pooling, point-of-view and density diagnostics, judged again on every edit. None blocks the proposal. Empty when none apply. */
      warnings: string[];
      /** @description The warnings as typed findings, one per warning and in the same order; a chapter plan card's pooling and give-away findings carry what they point at. */
      diagnostics: components['schemas']['ProposalDiagnosticItem'][];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ChatScope: 'project' | 'novel' | 'bible_document' | 'volume' | 'brief';
    /** @enum {string} */
    RefinementKind: 'chat' | 'hub' | 'premise_enhance' | 'bible_audit' | 'chapter_extract' | 'plugin' | 'chapter_plan' | 'organise';
    /** @enum {string} */
    RefinementProposalStatus: 'pending' | 'applied' | 'discarded' | 'superseded' | 'conflicted' | 'reverted';
    /** @description Change-set operation whose remaining fields depend on its server-validated op value. */
    ChangeOpItem: {
      op: string;
      /** @description Stamped by the server on every content op: the same change proposed again carries the same id. Turn it down with the op rejection route. */
      ideaId?: string;
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
    /** @description One advisory finding on a proposal. Its message is the matching entry of warnings. */
    ProposalDiagnosticItem: {
      kind: components['schemas']['ProposalDiagnosticKind'];
      message: string;
      data?: components['schemas']['ProposalDiagnosticData'];
    };
    /** @enum {string} */
    ProposalDiagnosticKind: 'pooling' | 'give_away' | 'pov' | 'density' | 'other';
    /** @description What a diagnostic points at, by kind; scene indexes are zero-based. */
    ProposalDiagnosticData: {
      /** @description pooling: the points of view that know the secrets. */
      knowing?: components['schemas']['DiagnosticPovItem'][];
      /** @description pooling: the points of view that do not. */
      unaware?: components['schemas']['DiagnosticPovItem'][];
      /** @description pooling: every pooled secret, where the message lists only the first few. */
      facts?: components['schemas']['DiagnosticFactItem'][];
      /** @description pooling: the scenes told by a knowing point of view. */
      knowingScenes?: number[];
      /** @description pooling: the scenes told by an unaware one, or those before the scene that learns it. */
      unawareScenes?: number[];
      /** @description pooling: the scene whose point of view learns the secret on the page, on a learned-on-the-page finding. */
      learnedInScene?: number;
      /** @description give_away and pov: the scene the finding is about. */
      sceneIndex?: null | number;
      /** @description give_away: the scene field that names the term, such as summary or beats. */
      field?: string;
      /** @description give_away: the beat, when the term is in one. */
      beatIndex?: number;
      /** @description give_away: the locked secret the term gives away. */
      factKey?: string;
      /** @description give_away: that secret's title — never its truth. */
      label?: string;
      /** @description pov: the point of view the scene names, if any. */
      pov?: null | string;
    };
    /** @description A point-of-view character a diagnostic names. */
    DiagnosticPovItem: {
      entityKey: string;
      name: string;
    };
    /** @description A secret a diagnostic names. */
    DiagnosticFactItem: {
      factKey: string;
      /** @description The secret's title: its label, or its key read as words — never its truth. */
      label: string;
    };
    UpdateContinuityBody: {
      /** @description Continuity findings and suggested edits produced by the continuity model. */
      proposal: {
        [key: string]: unknown;
      };
    };
    ReviewQueueResponse: {
      drafts: components['schemas']['DraftResponse'][];
      proposals: components['schemas']['ContinuityProposalResponse'][];
    };
    /** @enum {string} */
    RunGraph:
      'chat-turn' | 'premise-enhance' | 'bible-audit' | 'illustration' | 'chapter-generation' | 'chapter-finalization' | 'chapter-review' | 'bible-builder' | 'novel-validation';
    ListWorkflowRunResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['WorkflowRunListItemResponse'][];
    };
    /** @description The non-admin-safe projection of a workflow run: identity, status and timing, never its input, error or context pack. */
    WorkflowRunListItemResponse: {
      id: string;
      projectId: string;
      jobId?: null | string;
      graph: string;
      target: string;
      status: components['schemas']['WorkflowRunStatus'];
      outcome?: null | string;
      /** @description Bible-builder only: stages this run left untouched because their document already had content. Empty for every other graph. */
      skippedStages: string[];
      /** Format: date-time */
      startedAt: string;
      /** Format: date-time */
      endedAt?: null | string;
      totals: components['schemas']['RunUsageResponse'];
    };
    /** @enum {string} */
    WorkflowRunStatus: 'running' | 'completed' | 'awaiting_review' | 'failed' | 'cancelled';
    /** @description A workflow run's cost, tokens and call totals — the author-facing figure, never the prompt or response bodies behind it. */
    RunUsageResponse: {
      calls: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      /** @description Recorded cost plus the list-price estimate for calls that recorded none. */
      costUsd: number;
      /** @description The part of costUsd estimated from registry list prices because the call recorded no cost. */
      estimatedCostUsd: number;
      /** @description Wall-clock milliseconds from startedAt to endedAt; null while the run is still in progress. */
      durationMs?: null | number;
      byCostSource: components['schemas']['RunCostSourceItem'][];
    };
    /** @description Spend split by where the cost came from — 'provider', 'gateway', 'estimate', or 'error' for a call that recorded none. */
    RunCostSourceItem: {
      costSource: string;
      calls: number;
      costUsd: number;
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
      totals: components['schemas']['RunUsageResponse'];
    };
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
      /** @description The share of inputTokens served from a provider cache; null when the provider reported no cache accounting. */
      cachedInputTokens?: null | number;
      outputTokens?: null | number;
      latencyMs?: null | number;
      costUsd?: null | string;
      /** @description Where costUsd came from; null on a row written before cost_source existed. */
      costSource?: components['schemas']['CostSource'] | null;
      /** @description The cost tier this call ran under; null when the call predates tier tracking. */
      tier?: components['schemas']['CostTier'] | null;
      contentMode?: components['schemas']['ContentMode'] | null;
      /** @description Reasoning effort sent with the call; null when the call sent none or predates effort tracking. */
      reasoningEffort?: null | string;
      attempt: number;
      /** Format: date-time */
      createdAt: string;
    };
    /** @enum {string} */
    CostSource: 'provider' | 'gateway' | 'estimate';
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
    /** @description A workflow run's model calls, without prompt, context or raw output — that detail stays admin-only. */
    RunUsageDetailResponse: {
      id: string;
      projectId: string;
      jobId?: null | string;
      graph: string;
      target: string;
      status: components['schemas']['WorkflowRunStatus'];
      outcome?: null | string;
      /** @description Bible-builder only: stages this run left untouched because their document already had content. Empty for every other graph. */
      skippedStages: string[];
      /** Format: date-time */
      startedAt: string;
      /** Format: date-time */
      endedAt?: null | string;
      totals: components['schemas']['RunUsageResponse'];
      calls: components['schemas']['RunModelCallResponse'][];
    };
    /** @description Every model call any action has made against one chapter — generation, judging, review, revision, continuity and extraction alike. */
    ChapterCostResponse: {
      chapter: number;
      totals: components['schemas']['RunUsageResponse'];
      /** @description By internal call role, highest spend first. */
      byRole: components['schemas']['ChapterCostBreakdownItem'][];
    };
    /** @description Spend under one internal call role ('generation', 'judge', 'review', 'revision', 'continuity', 'chapter-extract', 'chapter-summarize', …). */
    ChapterCostBreakdownItem: {
      role: string;
      calls: number;
      costUsd: number;
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
      /** @description The share of inputTokens served from a provider cache; null when the provider reported no cache accounting. */
      cachedInputTokens?: null | number;
      outputTokens?: null | number;
      latencyMs?: null | number;
      costUsd?: null | string;
      /** @description Where costUsd came from; null on a row written before cost_source existed. */
      costSource?: components['schemas']['CostSource'] | null;
      /** @description The cost tier this call ran under; null when the call predates tier tracking. */
      tier?: components['schemas']['CostTier'] | null;
      contentMode?: components['schemas']['ContentMode'] | null;
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
      /** @description The only chapter a new draft may start at — the lowest with neither a draft nor finalized prose, planned or not. Writing or filling any other unwritten chapter is refused. */
      nextWritableChapter: number;
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
      /** @description Written rows only: finalize is refused until the chapter has a summary — every chapter needs one — plus, for an isolated chapter, continuation state. */
      finalizeBlocked?: boolean;
      /** @description Written rows only: the last revision the author approved, null when none was. */
      approvedRevision?: null | number;
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
      usage: components['schemas']['JobUsageResponse'];
    };
    /** @description The proposal a plugin's canon augmentation was staged as. No body is returned when the plugin proposed nothing. */
    PluginAugmentResponse: {
      /** @description Id of the pending proposal holding the proposed canon changes, for review through the proposal surface. */
      proposalId: string;
    };
    /** @enum {string} */
    SortOrder: 'asc' | 'desc';
    /** @enum {string} */
    SortByTime: 'createdAt' | 'updatedAt';
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
      jobs: components['schemas']['AppliedActionJobItem'][];
    };
    AppliedArtifactItem: {
      artifactRef: string;
      newRevision?: null | number;
    };
    /** @description A job an applied action started — follow it on the chat's job event stream. */
    AppliedActionJobItem: {
      /** @description The action op that started it. */
      index: number;
      jobId: string;
      /** @description The workflow run it opened, when the job opens one as it is queued. */
      runId?: string;
    };
    /** @description What undoing an applied change would affect, listed before the author confirms the revert. */
    UndoImpactResponse: {
      proposalId: string;
      dependents: components['schemas']['UndoDependentItem'][];
      /** @description Finalized plans and drafts that relied only on an updated record: the undo leaves them as they are, so they are counted, not listed. */
      finalUnaffected: number;
    };
    /** @description A record that relies on something an undo would take back. */
    UndoDependentItem: {
      kind: components['schemas']['UndoDependentKind'];
      /** @description The dependent record: `chapter:<n>` for a plan, `draft:<n>` for a draft, `knowledge:<entityKey>/<factKey>` for what a character knows, `proposal:<id>` for a pending suggestion. */
      ref: string;
      /** @description The chapter the record belongs to, or where the character learned the fact. */
      chapter?: null | number;
      /** @description The undone record this one relies on, as a change-set ref. */
      because: string;
      /** @description Finalized history: undo never rewrites it, so the record stays as it is after the revert. */
      final: boolean;
    };
    /** @enum {string} */
    UndoDependentKind: 'plan' | 'draft' | 'knowledge' | 'suggestion';
    /** @description What the chapter writer would receive if a pending plan card were applied as it stands. */
    WriterPreviewResponse: {
      proposalId: string;
      chapter: number;
      /** @description The pages and records the plan cites that resolve for the writer, point of view first — cited and resolvable, before any budget cut the pack makes. */
      included: components['schemas']['WriterPreviewRefItem'][];
      /** @description Refs the plan cites that resolve to nothing. */
      unresolved: components['schemas']['WriterPreviewRefItem'][];
      kept: components['schemas']['WriterKeptItem'][];
      /** @description Secrets whose unlock condition holds with the card and not with the stored plan: a claimed milestone, the ending mark or a volume move. */
      unlocks: components['schemas']['WriterUnlockItem'][];
      /** @description Secrets whose unlock condition holds with the stored plan and no longer with the card: a dropped claim, an unmarked ending or a volume move. */
      relocks: components['schemas']['WriterUnlockItem'][];
    };
    /** @description A page or record the writer would read a section for. */
    WriterPreviewRefItem: {
      /** @description The plan's context ref, such as entity:mara or bible_doc:world/lamps. */
      ref: string;
      /** @description Scrubbed as the writer's headings are; a secret is named by its title alone. */
      label: string;
      /** @description A locked secret the plan cites: the writer reads its cover note as a writing constraint, never its truth. */
      constraint?: boolean;
    };
    /** @description Something the writer would be kept from. Only its name is given: never its text. */
    WriterKeptItem: {
      kind: components['schemas']['WriterKeptKind'];
      /** @description fact:<key> for a secret, volume:<key>, a bible_doc ref for a page, the cited ref for a refused one; ending and ending_question for those. */
      key: string;
      label: string;
      /** @description secret: its writer note as the writer's scrub leaves it — what the writer reads among its writing constraints while the secret stays locked. Null when it has none; the writer is then told nothing of it. */
      coverNote?: null | string;
    };
    /** @enum {string} */
    WriterKeptKind: 'secret' | 'ending' | 'ending_question' | 'volume' | 'planner_page' | 'ref';
    /** @description A secret whose unlock condition the card changes at its chapter, against the plan stored there now. */
    WriterUnlockItem: {
      factKey: string;
      label: string;
      /** @description The terms of the unlock condition, read as words. */
      conditions: string[];
      /** @description Whether the reveal rule lets this chapter reveal it once the card stands. The writer receives it only when the plan also has it learned; until then it stays among what is kept. */
      revealRuleAllows: boolean;
    };
    RevertProposalResponse: {
      proposal: components['schemas']['ProposalResponse'];
      reverted: components['schemas']['AppliedArtifactItem'][];
      staleMarked: string[];
    };
    RejectProposalOpBody: {
      /** @description `never`: not offered again until the author withdraws the Notebook entry. `not_now`: not offered again while the active volume stays the same. `not_this_version`: not offered again while every record the change would write is unchanged — a later edit to any of them makes the idea eligible again. */
      scope: components['schemas']['LedgerRejectionScope'];
      /** @description The author's reason, kept on the Notebook entry. */
      why?: string;
    };
    /** @enum {string} */
    LedgerRejectionScope: 'never' | 'not_now' | 'not_this_version';
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
      /** @description The suggestion this rejection turns down, by the idea id its card op carried; null for any other entry. */
      ideaId: null | string;
      /** @description How long a rejected idea stays turned down: `never` until withdrawn, `not_now` while the same volume is active, `not_this_version` while the records it would change are unchanged. */
      rejectionScope: components['schemas']['LedgerRejectionScope'] | null;
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
    BibleSection: 'project' | 'world' | 'power' | 'plot' | 'story_state' | 'ai' | 'lore';
    /** @enum {string} */
    LedgerEntryStatus: 'active' | 'superseded' | 'withdrawn';
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
      /** @description The chat's own model type; null follows the project's content mode. */
      contentMode?: components['schemas']['ContentMode'] | null;
      /** @description The chat's own cost tier; null follows the project's cost tier. */
      costTier?: components['schemas']['CostTier'] | null;
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
      /** @description The turn's suggestion cards: a pending proposal the author accepts or declines op by op. */
      proposalId?: null | string;
      /** @description The turn's changes taken from the author's own words, applied in the turn and undone by reverting this proposal. */
      appliedProposalId?: null | string;
      runId?: null | string;
      modelProvider?: null | string;
      modelId?: null | string;
      /** @description The model type the reply was written under; null on user messages and on replies older than the selection. */
      contentMode?: components['schemas']['ContentMode'] | null;
      /** @description The cost tier the reply was written at; null on user messages and on replies older than the selection. */
      costTier?: components['schemas']['CostTier'] | null;
      /** @description This reply's model cost, folding in its title and compaction runs; null on user messages and on a reply that carries no run. */
      costUsd?: null | number;
      inputTokens?: null | number;
      cachedInputTokens?: null | number;
      outputTokens?: null | number;
      /** @description A message of the author’s long enough to keep as notes, which the notes do not hold yet: offer "Save this as notes?", answered by `POST /notes/from-message`. */
      offersNotes?: boolean;
      /** @description This turn's question card, when Forge raised one; null on every other message. */
      question?: components['schemas']['ChatQuestionResponse'] | null;
      /** Format: date-time */
      createdAt: string;
    };
    /** @description An identity decision the author hasn't made yet, put to them as 2-4 concrete answers with trade-offs and a recommendation. "Undecided for now" is always an accepted answer and is not one of these cards. */
    ChatQuestionResponse: {
      question: string;
      why?: string | null;
      answers: components['schemas']['ChatQuestionAnswerResponse'][];
      /** @description The progress checklist key this question settles, when it settles one. */
      progressKey?: string | null;
    };
    /** @description One concrete example answer to a question card, with the reasoning to accept or decline it. */
    ChatQuestionAnswerResponse: {
      title: string;
      why?: null | string;
      tradeOff?: null | string;
      /** @description true on the one answer Forge recommends */
      recommended?: boolean;
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
      /** @description Just discussing: nothing the turn proposes applies — every change becomes a suggestion card for the author to accept or decline. Off by default. */
      justDiscussing?: boolean;
      /** @description Model type for this turn's reply only; omitted follows the chat, then the project. Chapters keep their own content mode. */
      contentMode?: components['schemas']['ContentMode'];
      /** @description Cost tier for this turn only; omitted follows the chat, then the project. Actions this turn starts (write, review, audit) run at it. */
      costTier?: components['schemas']['CostTier'];
    };
    ChatTurnResponse: {
      userMessage: components['schemas']['ChatMessageResponse'];
      assistantMessage: components['schemas']['ChatMessageResponse'];
      /** @description The turn's suggestion cards, pending the author's per-op accept or decline. */
      proposal?: components['schemas']['ProposalResponse'];
      /** @description The turn's changes taken from the author's own words (each op carries its quote), already applied and undoable. */
      appliedProposal?: components['schemas']['ProposalResponse'];
      /** @description present when this turn applied the changes taken from the author’s own words */
      applied?: components['schemas']['TurnAppliedResult'];
      /** @description why ops that rest on the author’s words were NOT applied (a warning to review, a conflict, a refused write) */
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
    /** @description Every field is optional: an omitted field is left as it is, `null` clears it back to the project default. */
    UpdateSessionModelBody: {
      /** @description Model provider override; clear both override fields to use the project or profile default. */
      provider?: string | null;
      /** @description Model name override; clear both override fields to use the project or profile default. */
      model?: string | null;
      /** @description This chat's default model type for its replies; chapters keep their own content mode. */
      contentMode?: components['schemas']['ContentMode'] | null;
      /** @description This chat's default cost tier; actions a turn starts run at the turn's tier. */
      costTier?: components['schemas']['CostTier'] | null;
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
    ListLedgerEntriesResponse: {
      entries: components['schemas']['LedgerEntryResponse'][];
    };
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
    ListBibleAuditsResponse: {
      /** @description Newest first, up to the most recent 50. */
      items: components['schemas']['BibleAuditReportResponse'][];
    };
    /** @description One Story Bible audit: its findings, what it checked, and the card that carries its proposed changes. */
    BibleAuditReportResponse: {
      id: string;
      /** @description What was found and what was checked, in one line; "Nothing found. Checked: …" for a clean audit. */
      summary: string;
      checked: components['schemas']['AuditCheckedResponse'];
      /** @description Contradictions first, then pages and records to add, revise and remove. */
      findings: components['schemas']['BibleAuditFindingResponse'][];
      /** @description Findings the author has neither kept nor skipped. */
      openFindings: number;
      /** @description The pending proposal that carries the changes; null when the audit proposed none. */
      proposalId?: null | string;
      proposalStatus?: components['schemas']['AuditProposalStatus'] | null;
      /** @description The card’s op indexes to apply: every op a finding not skipped still proposes. Pass as opIndexes when applying the card. */
      selection: number[];
      runId?: null | string;
      /** Format: date-time */
      createdAt: string;
    };
    /** @description Exactly what this audit read — the report never claims more. */
    AuditCheckedResponse: {
      passes: components['schemas']['AuditPassesResponse'];
      documents: components['schemas']['AuditCheckedDocumentsResponse'];
      entities: components['schemas']['AuditCheckedEntitiesResponse'];
      facts: components['schemas']['AuditCheckedFactsResponse'];
      /** @description The finalized chapters whose summaries were compared; null when none were. */
      chapters?: components['schemas']['AuditCheckedChaptersResponse'] | null;
      /** @description Finalized chapters with no summary yet, so not compared. */
      chaptersWithoutSummary: number[];
      /** @description Finalized isolated chapters, which the audit never reads, not even their summaries. */
      chaptersIsolated: number[];
      chaptersOmitted: number;
      /** @description The sentence to show, e.g. "Checked: 14 pages, 38 characters, 21 facts, chapters 1–12." */
      copy: string;
    };
    AuditPassesResponse: {
      /** @description Missing and thin pages and records against the Story Bible manifest. */
      coverage: components['schemas']['AuditPassStatus'];
      /** @description Pages, records, facts and finalized chapter summaries compared against each other. */
      contradictions: components['schemas']['AuditPassStatus'];
    };
    /** @enum {string} */
    AuditPassStatus: 'ran' | 'failed';
    AuditCheckedDocumentsResponse: {
      count: number;
      sections: string[];
      /** @description Pages too long to read whole; only their beginning was compared. */
      clipped: number;
      /** @description Pages that did not fit and were not compared. */
      omitted: number;
    };
    AuditCheckedEntitiesResponse: {
      count: number;
      /** @description Entity type → how many were read. */
      byType: {
        [key: string]: unknown;
      };
      omitted: number;
    };
    AuditCheckedFactsResponse: {
      /** @description Zero when the contradiction check did not run: only it reads the facts. */
      count: number;
      omitted: number;
    };
    AuditCheckedChaptersResponse: {
      from: number;
      to: number;
      count: number;
    };
    BibleAuditFindingResponse: {
      /** @description Stable within its report; decisions address the finding by it. */
      id: string;
      group: components['schemas']['BibleAuditGroup'];
      /** @description The page or record the finding is about. */
      ref: string;
      text: string;
      evidence: components['schemas']['AuditEvidenceResponse'][];
      /** @description The ops of the audit’s card that carry this finding’s changes; empty when it has none. */
      opIndexes: number[];
      /** @description Why a change the audit proposed for this finding was not put on the card. */
      withheld?: null | string;
      /** @description The author’s Keep or Skip, if any. */
      decision?: components['schemas']['AuditFindingDecisionResponse'] | null;
    };
    /** @enum {string} */
    BibleAuditGroup: 'add' | 'revise' | 'remove' | 'contradiction';
    AuditEvidenceResponse: {
      /** @description "doc:<section>/<slug>", "entity:<key>", "fact:<key>" or "chapter:<n>" — always something the audit read. */
      ref: string;
      /** @description Words quoted from that source, verified to appear there; null when the finding points at the source as a whole. */
      quote?: null | string;
    };
    AuditFindingDecisionResponse: {
      decision: components['schemas']['AuditFindingDecision'];
      reason?: string | null;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    AuditFindingDecision: 'kept' | 'skipped';
    /** @enum {string} */
    AuditProposalStatus: 'pending' | 'applied' | 'discarded' | 'superseded' | 'conflicted' | 'reverted';
    /** @description An audit queued as a job; its report appears in the list when the job is done. */
    BibleAuditJobResponse: {
      jobId: string;
      runId: string;
      status: components['schemas']['JobStatus'];
    };
    AuditFindingDecisionBody: {
      /** @description kept: the finding’s changes stay on the audit’s card (restaged if the card was discarded). skipped: they come off it; skipping every finding discards the card. */
      decision: components['schemas']['AuditFindingDecision'];
      /** @description Why, remembered with the decision. Optional. */
      reason?: string;
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
    SortByChapter: 'number' | 'createdAt' | 'updatedAt';
    /** @enum {string} */
    ChapterStatus: 'done' | 'failed' | 'skipped';
    ListChapterResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ChapterListResponse'][];
      page: number;
      totalPages: number;
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
      isolated: boolean;
      volumeKey?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ChapterSearchResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['ChapterSearchHit'][];
      page: number;
      totalPages: number;
    };
    ChapterSearchHit: {
      number: number;
      title?: null | string;
      /** @description A short excerpt around the first match, ellipsised at either end when truncated. */
      snippet: string;
      /** @description How many times the query occurs in this chapter, case-insensitively. */
      matchCount: number;
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
      isolated: boolean;
      volumeKey?: null | string;
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
    ListChapterReviewsResponse: {
      chapter: number;
      /** @description The draft revision the chapter is at now; null when it has no draft. */
      currentRevision?: null | number;
      /** @description The newest review of each kind. */
      latest: components['schemas']['ChapterReviewRecordResponse'][];
      /** @description Every review of this chapter, newest first, up to the most recent 50. */
      history: components['schemas']['ChapterReviewRecordResponse'][];
    };
    /** @description One review of one chapter text. It never changes the prose; the author acts on its findings. */
    ChapterReviewRecordResponse: {
      id: string;
      chapter: number;
      kind: components['schemas']['ChapterReviewKind'];
      /** @description clear renders as "No issue detected · revision N"; failed means the review could not be read and checked nothing. */
      disposition: components['schemas']['ChapterReviewDisposition'];
      /** @description The model's own verdict: consistent / contradiction / evaluation_failed for the judge, approve / revision_requested for the editor. */
      verdict?: null | string;
      /** @description The editor's overall note to the author. */
      note?: null | string;
      /** @description The draft revision that was reviewed; null for finalized prose that has no draft. */
      draftRevision?: null | number;
      /** @description True once the chapter text has changed since this review; its findings then describe an older text. */
      stale: boolean;
      /** @description The reviewed chapter is isolated or written unrestricted; its findings may quote prose a standard model must not read. */
      isolated: boolean;
      findings: components['schemas']['ReviewFindingResponse'][];
      /** @description Findings not yet dismissed or overridden. */
      openFindings: number;
      /** @description Blocking findings not yet dismissed or overridden. */
      openBlocking: number;
      /** @description What this review checked, in plain words, for the "No issue detected" line. */
      checked: string[];
      briefCompliance?: components['schemas']['ReviewComplianceResponse'] | null;
      readabilityCompliance?: components['schemas']['ReviewComplianceResponse'] | null;
      endingCompliance?: components['schemas']['ReviewComplianceResponse'] | null;
      knowledgeCompliance?: components['schemas']['ReviewComplianceResponse'] | null;
      /** @description Deterministic measurements (word count, readability averages). */
      metrics?: null | {
        [key: string]: unknown;
      };
      /** @description The run that made the model calls; its usage is readable, its prompts stay admin-only. */
      runId?: null | string;
      costTier?: components['schemas']['CostTier'] | null;
      contentMode?: components['schemas']['ContentMode'] | null;
      modelProvider?: null | string;
      model?: null | string;
      /** Format: date-time */
      createdAt: string;
    };
    /** @enum {string} */
    ChapterReviewKind: 'judge' | 'editorial' | 'mechanics' | 'readability';
    /** @enum {string} */
    ChapterReviewDisposition: 'clear' | 'issues' | 'blocking' | 'failed';
    ReviewFindingResponse: {
      /** @description Stable within its review; remedies address the finding by it. */
      id: string;
      /** @description blocking: a contradiction or must-fix; warning: worth fixing; note: for information. */
      severity: components['schemas']['ReviewFindingSeverity'];
      category: components['schemas']['ReviewFindingCategory'];
      text: string;
      /** @description The passage the finding rests on, verified to appear verbatim in the reviewed text. */
      evidence?: null | string;
      /** @description The author’s answer to this finding, if any. */
      remedy?: components['schemas']['ReviewRemedyResponse'] | null;
    };
    /** @enum {string} */
    ReviewFindingSeverity: 'blocking' | 'warning' | 'note';
    /** @enum {string} */
    ReviewFindingCategory: 'continuity' | 'brief' | 'ending' | 'knowledge' | 'readability' | 'mechanics' | 'editorial';
    ReviewRemedyResponse: {
      action: components['schemas']['ReviewRemedyAction'];
      reason?: string | null;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    ReviewRemedyAction: 'dismissed' | 'fixing_myself' | 'overridden';
    ReviewComplianceResponse: {
      compliant: boolean;
      issues: string[];
    };
    RunChapterReviewBody: {
      /** @description judge: continuity, the plan, the ending contract, kept-back secrets and readability. editorial: an editor’s read against the plan, canon and style. mechanics and readability are deterministic and make no model call. */
      kind: components['schemas']['ChapterReviewKind'];
      /** @description Runs this review at this tier instead of the one the chat turn or project would use. Ignored by mechanics and readability. */
      costTier?: components['schemas']['CostTier'];
      /** @description unrestricted routes this review to the unrestricted models. It can only raise: a chapter written unrestricted or isolated is always reviewed unrestricted. */
      contentMode?: components['schemas']['ContentMode'];
    };
    /** @description A model review queued as a job; the review appears in the chapter’s reviews when the job is done. */
    ChapterReviewJobResponse: {
      jobId: string;
      /** @description The run the review’s model calls are recorded under; its usage is readable while it runs. */
      runId: string;
      kind: components['schemas']['ChapterReviewKind'];
      status: components['schemas']['JobStatus'];
    };
    ReviewRemedyBody: {
      /** @description dismissed: the finding is wrong (needs a reason). fixing_myself: the author will change the text by hand. overridden: the contradiction is intended (blocking findings only). A dismissal or override is remembered for this text and not raised again. */
      action: components['schemas']['ReviewRemedyAction'];
      /** @description Why. Required to dismiss. */
      reason?: string;
    };
    JudgeResponse: {
      verdict: string;
      findings: components['schemas']['JudgeFindingResponse'][];
    };
    JudgeFindingResponse: {
      severity: string;
      text: string;
    };
    ChapterReviewResponse: {
      disposition: string;
      note?: null | string;
      findings?: null | components['schemas']['JudgeFindingResponse'][];
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
      page: number;
      totalPages: number;
    };
    TimelineResponse: {
      events: components['schemas']['CharacterEventResponse'][];
    };
    CharacterEventResponse: {
      id: string;
      chapter: number;
      kind: components['schemas']['CharacterEventKind'];
      /** @description Distinguishes multiple events of the same kind in one chapter, e.g. a relationship's target and kind; empty for a kind that is already one-per-chapter. */
      detailKey?: string;
      /** @description The changed field's shape before this chapter — null when this is the first record of it, or when it was backfilled and no earlier history is known. */
      before?: null | Record<string, never>;
      /** @description The changed field's shape as of this chapter. */
      after?: null | Record<string, never>;
      source: components['schemas']['CharacterEventSource'];
      /** @description Provisional events belong to an approval not yet finalized; committed ones are canon. */
      status: components['schemas']['KnowledgeStatus'];
      /** Format: date-time */
      createdAt: string;
    };
    /** @enum {string} */
    CharacterEventKind: 'state' | 'appearance' | 'relationship';
    /** @enum {string} */
    CharacterEventSource: 'continuity' | 'backfill' | 'manual';
    /** @enum {string} */
    KnowledgeStatus: 'provisional' | 'committed';
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
      /** @description Where the story stands against the volume goal. */
      state: components['schemas']['VolumeState'];
      /** @description Computed on read from the chapters that carry this volume key — never stored. */
      chapterCount: number;
      /** @description Lowest chapter number in the volume; null when it has none. */
      firstChapter?: null | number;
      /** @description Highest chapter number in the volume; null when it has none. */
      lastChapter?: null | number;
      /** @description Sum of word counts across the volume’s chapters. */
      wordCount: number;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    VolumeState: 'not_started' | 'active' | 'goal_met';
    VolumeAdvanceResponse: {
      /** @description The volume just marked goal met. */
      completed: components['schemas']['VolumeResponse'];
      /** @description The next volume, now active — null if none was waiting to start. */
      activated?: components['schemas']['VolumeResponse'] | null;
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
      /** @description The chapter writer never reads this page: a ref to it resolves to nothing in a writer pack. True of every planner-only page. */
      writerExcluded: boolean;
      /** @description Only planners read this page: it says what happens later in the book, and a chat turn that looks it up is held for review. */
      plannerOnly: boolean;
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
      /** @description The chapter writer never reads this page: a ref to it resolves to nothing in a writer pack. True of every planner-only page. */
      writerExcluded: boolean;
      /** @description Only planners read this page: it says what happens later in the book, and a chat turn that looks it up is held for review. */
      plannerOnly: boolean;
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
      /** @description When the fact may be revealed; absent when it has no condition. */
      unlock?: components['schemas']['UnlockConditionSchema'];
      /** @description The chapter whose plan currently schedules the reveal; provisional until that chapter is final. */
      plannedChapter?: null | number;
      /** @description The finalized chapter in which the reader learned the fact. */
      disclosedInChapter?: null | number;
      allowedClues?: null | string[];
      knowledge: components['schemas']['KnowledgeEntryResponse'][];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @description Unlocks once every term holds. */
    UnlockConditionSchema: {
      all: components['schemas']['UnlockTermSchema'][];
    };
    /** @description Exactly one of milestone, volume, chapter or ending. */
    UnlockTermSchema: {
      /** @description Holds once this milestone is reached. */
      milestone?: string;
      /** @description Holds once the story reaches this volume. */
      volume?: string;
      /** @description Holds from this chapter on. */
      chapter?: number;
      /** @description Always true: holds only in the chapter planned as the ending. */
      ending?: boolean;
    };
    KnowledgeEntryResponse: {
      entityKey: string;
      entityName: string;
      learnedInChapter: number;
      source: components['schemas']['FactSource'];
      note?: null | string;
      /** @description Provisional while it rests on an approved, not yet finalized draft; committed once that chapter is final. Until the knowledge lifecycle lands every row reads committed, including reveals ledgered at approval. */
      status: components['schemas']['KnowledgeStatus'];
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
      /** @description Reveal chapter: a number for a dated reveal, 1 for open canon. Omit to keep the current schedule, send null to undate the fact, which no plan may reveal until it has an unlock condition. */
      revealChapter?: number | null;
      /** @description When the fact may be revealed. Omit to keep the current condition, send null to clear it. */
      unlock?: components['schemas']['UnlockConditionSchema'] | null;
      /** @description Observable effects the writer may show while the explanation stays hidden; trimmed, blanks dropped, duplicates removed. Omit to keep, send null to clear. */
      allowedClues?: string[] | null;
    };
    RevealFactBody: {
      entityKey: string;
      chapter: number;
      note?: string;
    };
    ListMilestonesResponse: {
      milestones: components['schemas']['MilestoneResponse'][];
    };
    MilestoneResponse: {
      id: string;
      projectId: string;
      milestoneKey: string;
      label: string;
      subjectEntityKey?: null | string;
      kind: components['schemas']['MilestoneKind'];
      /** @description open until a plan claims it, planned while one does, reached once the claiming chapter is finalized. */
      state: components['schemas']['MilestoneState'];
      /** @description The chapter whose plan claims it; provisional until that chapter is final. */
      plannedChapter?: null | number;
      /** @description The finalized chapter that reached it. */
      reachedChapter?: null | number;
      /** @description The approved draft revision that chapter was finalized from. */
      boundRevision?: null | number;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    MilestoneKind: 'rank' | 'event' | 'learned_from' | 'custom';
    /** @enum {string} */
    MilestoneState: 'open' | 'planned' | 'reached';
    CreateMilestoneBody: {
      /** @description Stable key that plans claim and unlock conditions name; never changes. */
      milestoneKey: string;
      label: string;
      /** @description The character the milestone concerns. */
      subjectEntityKey?: string | null;
      /** @description Defaults to custom. */
      kind?: components['schemas']['MilestoneKind'];
    };
    UpdateMilestoneBody: {
      label?: string;
      /** @description Omit to keep, send null to clear. */
      subjectEntityKey?: string | null;
      kind?: components['schemas']['MilestoneKind'];
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
      /** @description The default cost tier AI work on this novel runs at. */
      costTier: components['schemas']['CostTier'];
      config?: components['schemas']['ProjectConfig'];
      brief?: null | string;
      /** @description The project’s additions to the built-in chapter-writing style; null when the project writes to the default alone. The writer receives the built-in style followed by these, and these win where the two conflict. */
      instructions?: null | string;
      storyCurrentChapter?: null | number;
      theme?: null | string;
      /** @description The question the story is heading to answer. */
      endingQuestion?: null | string;
      /** @description The planned ending. Only the planner reads it; the chapter writer and publishing never do. */
      ending?: null | string;
      readerPromise?: null | string;
      /** @description Entity key of the protagonist. */
      protagonistKey?: null | string;
      opposition?: null | string;
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
      /** @description The default cost tier AI work on this novel runs at. */
      costTier: components['schemas']['CostTier'];
      config?: components['schemas']['ProjectConfig'];
      brief?: null | string;
      /** @description The project’s additions to the built-in chapter-writing style; null when the project writes to the default alone. The writer receives the built-in style followed by these, and these win where the two conflict. */
      instructions?: null | string;
      storyCurrentChapter?: null | number;
      theme?: null | string;
      /** @description The question the story is heading to answer. */
      endingQuestion?: null | string;
      /** @description The planned ending. Only the planner reads it; the chapter writer and publishing never do. */
      ending?: null | string;
      readerPromise?: null | string;
      /** @description Entity key of the protagonist. */
      protagonistKey?: null | string;
      opposition?: null | string;
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
      costTier?: components['schemas']['CostTier'];
      brief?: string;
      /** @description Trimmed; omit to keep, send null or a blank string to clear. */
      theme?: string | null;
      /** @description Trimmed; omit to keep, send null or a blank string to clear. */
      endingQuestion?: string | null;
      /** @description The planned ending, read only by the planner. Trimmed; omit to keep, send null or a blank string to clear. */
      ending?: string | null;
      /** @description Trimmed; omit to keep, send null or a blank string to clear. */
      readerPromise?: string | null;
      /** @description Entity key of the protagonist. Trimmed; omit to keep, send null or a blank string to clear. */
      protagonistKey?: string | null;
      /** @description Trimmed; omit to keep, send null or a blank string to clear. */
      opposition?: string | null;
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
      /** @description By how the cost was priced — 'provider', 'gateway', or 'estimate' — highest spend first. */
      byCostSource: components['schemas']['CostBreakdownItem'][];
      /** @description By the project's cost tier at call time — 'economy', 'balanced', or 'performant' — highest spend first. */
      byTier: components['schemas']['CostBreakdownItem'][];
      /** @description By content mode at call time — 'standard' or 'unrestricted' — highest spend first. */
      byContentMode: components['schemas']['CostBreakdownItem'][];
      /** @description Spend by UTC calendar day over the last 30 days, oldest first. A day with no calls is omitted rather than zero-filled. */
      byDay: components['schemas']['DayCostItem'][];
    };
    UploadImageBody1: {
      /** @enum {string} */
      mime: 'image/png' | 'image/jpeg' | 'image/webp';
      /** @description Base64-encoded image bytes without a data URL prefix. */
      image: string;
    };
    CreateNovelWithNotesBody: {
      /** @description The working title. */
      title: string;
      /** @description The author's own words about the novel, kept verbatim and read by the chat as the author's notes. Up to 10,000 words. */
      notes?: string;
      contentMode?: components['schemas']['ContentMode'];
    };
    CreateNovelWithNotesResponse: {
      projectId: string;
      /** @description The chat session created in auto mode, ready for a pending first turn. */
      sessionId: string;
    };
    NotesResponse: {
      /** @description The author's current notes; empty when none have been stored. */
      notes: string;
      /** @description The ledger entry backing the notes; absent when there are none yet. */
      entryId?: string;
      /**
       * Format: date-time
       * @description When the current notes were last written.
       */
      updatedAt?: string;
    };
    UpdateNotesBody: {
      /** @description The author's own words about the novel, kept verbatim and read by the chat as the author's notes. Up to 10,000 words. A blank value clears them. */
      notes: string;
    };
    ProgressResponse: {
      items: components['schemas']['ProgressItemResponse'][];
    };
    ProgressItemResponse: {
      key: string;
      label: string;
      why: string;
      status: components['schemas']['ProgressItemStatus'];
      /** @description The ledger entry backing an `undecided`/`dismissed` status; present only then. */
      overrideEntryId?: string;
    };
    /** @enum {string} */
    ProgressItemStatus: 'open' | 'answered' | 'undecided' | 'dismissed';
    ProgressOverrideBody: {
      /** @description 'undecided' answers the item as settled with no value; 'dismissed' hides it from the checklist. Both persist until cleared. */
      status: components['schemas']['ProgressOverrideStatus'];
    };
    /** @enum {string} */
    ProgressOverrideStatus: 'undecided' | 'dismissed';
    /** @enum {string} */
    ProgressItemKey: 'premise' | 'protagonist' | 'opposition' | 'theme' | 'reader_promise' | 'ending' | 'first_volume_goal' | 'next_chapter_planned';
    SaveMessageAsNotesBody: {
      /** @description The chat the message was sent in. */
      sessionId: string;
      /** @description One of the author’s own messages in that chat, of at least 600 words. */
      messageId: string;
    };
    SavedNotesResponse: {
      /** @description False when the notes already held the message, so nothing changed. */
      saved: boolean;
      /** @description Paragraphs in the notes now, numbered as organising and the chat’s notes lookup number them. */
      paragraphs: number;
      words: number;
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
  get_api_v1_projects_projectId_chat_sessions_sessionId_jobs: {
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
          'application/json': components['schemas']['ListChatJobsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_chat_sessions_sessionId_jobs_events: {
    parameters: {
      query?: {
        /** @description Only events after this seq — the `cursor` of the jobs list or the `seq` of the last event read. The stream also reads `Last-Event-ID`. Without either, only the events of running jobs and how each job that settled in the last hour ended. */
        after?: string;
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
          'application/json': components['schemas']['ListChatJobEventsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_chat_sessions_sessionId_jobs_stream: {
    parameters: {
      query?: {
        /** @description Only events after this seq — the `cursor` of the jobs list or the `seq` of the last event read. The stream also reads `Last-Event-ID`. Without either, only the events of running jobs and how each job that settled in the last hour ended. */
        after?: string;
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
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_chat_sessions_sessionId_jobs_jobId_cancel: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        /** @description Chat session UUID. */
        sessionId: string;
        /** @description Job UUID. */
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
  get_api_v1_ai_usage: {
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
          'application/json': components['schemas']['AccountUsageResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_ai_quota: {
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
          'application/json': components['schemas']['AiQuotaResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_ai_models: {
    parameters: {
      query?: {
        contentMode?: components['schemas']['ContentMode'];
        costTier?: components['schemas']['CostTier'];
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
          'application/json': components['schemas']['ProjectModelsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RevealRuleErrorResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftConflictResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  post_api_v1_projects_projectId_drafts_next: {
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
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftResponse'];
        };
      };
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftConflictResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftConflictResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_drafts_n_finalize_readiness: {
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
          'application/json': components['schemas']['FinalizeReadinessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftConflictResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftConflictResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SummaryConflictResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_projects_projectId_chapters_n_summary: {
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
        'application/json': components['schemas']['UpdateSummaryBody'];
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
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DraftConflictResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      query?: {
        limit?: number | string;
        offset?: number | string;
        graph?: components['schemas']['RunGraph'];
        /** @description Only runs started at or after this ISO 8601 time. */
        from?: string;
        /** @description Only runs started at or before this ISO 8601 time. */
        to?: string;
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
  get_api_v1_projects_projectId_runs_runId_usage: {
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
          'application/json': components['schemas']['RunUsageDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_chapters_n_cost: {
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
          'application/json': components['schemas']['ChapterCostResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RevealRuleErrorResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RevealRuleErrorResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_proposals_proposalId_undo_impact: {
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
          'application/json': components['schemas']['UndoImpactResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_proposals_proposalId_writer_preview: {
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
          'application/json': components['schemas']['WriterPreviewResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RevealRuleErrorResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_proposals_proposalId_ops_opIndex_reject: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        proposalId: string;
        opIndex: number;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RejectProposalOpBody'];
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
  get_api_v1_projects_projectId_bible_audits: {
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
          'application/json': components['schemas']['ListBibleAuditsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_bible_audits: {
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
          'application/json': components['schemas']['BibleAuditJobResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_bible_audits_reportId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        reportId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BibleAuditReportResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_bible_audits_reportId_findings_findingId_decision: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        reportId: string;
        findingId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AuditFindingDecisionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BibleAuditReportResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['BibleAuditJobResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
        sortBy?: components['schemas']['SortByChapter'];
        status?: components['schemas']['ChapterStatus'];
        /** @description Only chapters in this volume. */
        volumeKey?: string;
        /** @description Only chapters whose brief's point of view (any pooled scene) is this entity key. */
        pov?: string;
        /** @description Only chapters this thread opened, closed, or was last advanced in. */
        thread?: string;
        /** @description Ignore limit/offset and return the page containing this chapter number instead. */
        goto?: number | string;
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
  get_api_v1_projects_projectId_source_chapters_search: {
    parameters: {
      query: {
        limit?: number | string;
        offset?: number | string;
        /** @description Only chapters in this volume. */
        volumeKey?: string;
        /** @description Only chapters whose brief's point of view (any pooled scene) is this entity key. */
        pov?: string;
        /** @description Only chapters this thread opened, closed, or was last advanced in. */
        thread?: string;
        /** @description Text to search for across finalized and drafted prose. */
        q: string;
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
          'application/json': components['schemas']['ChapterSearchResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_projects_projectId_chapters_n_reviews: {
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
          'application/json': components['schemas']['ListChapterReviewsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_chapters_n_reviews: {
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
        'application/json': components['schemas']['RunChapterReviewBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterReviewRecordResponse'];
        };
      };
      /** @description Default Response */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterReviewJobResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_chapters_n_reviews_reviewId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
        reviewId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterReviewRecordResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_chapters_n_reviews_reviewId_findings_findingId_remedy: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
        reviewId: string;
        findingId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ReviewRemedyBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterReviewRecordResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_projects_projectId_chapters_n_reviews_reviewId_findings_findingId_remedy: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        n: number;
        reviewId: string;
        findingId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterReviewRecordResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_projects_projectId_entities_entityKey_timeline: {
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
          'application/json': components['schemas']['TimelineResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  post_api_v1_projects_projectId_volumes_volumeKey_goal_met: {
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
          'application/json': components['schemas']['VolumeAdvanceResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_projects_projectId_milestones: {
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
          'application/json': components['schemas']['ListMilestonesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_milestones: {
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
        'application/json': components['schemas']['CreateMilestoneBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MilestoneResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_projects_projectId_milestones_milestoneKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        milestoneKey: string;
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
  patch_api_v1_projects_projectId_milestones_milestoneKey: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        milestoneKey: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateMilestoneBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MilestoneResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  post_api_v1_projects_new_novel: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateNovelWithNotesBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreateNovelWithNotesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_projects_projectId_notes: {
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
          'application/json': components['schemas']['NotesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_projects_projectId_notes: {
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
        'application/json': components['schemas']['UpdateNotesBody'];
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
  get_api_v1_projects_projectId_progress: {
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
          'application/json': components['schemas']['ProgressResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_projects_projectId_progress_key: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        key: components['schemas']['ProgressItemKey'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProgressOverrideBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProgressResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_projects_projectId_progress_key: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        projectId: string;
        key: components['schemas']['ProgressItemKey'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProgressResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_projects_projectId_notes_from_message: {
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
        'application/json': components['schemas']['SaveMessageAsNotesBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SavedNotesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
export type ListChatJobsResponse = components['schemas']['ListChatJobsResponse'];
export type ChatJobResponse = components['schemas']['ChatJobResponse'];
export type JobKind = components['schemas']['JobKind'];
export type JobStatus = components['schemas']['JobStatus'];
export type ChatJobOriginResponse = components['schemas']['ChatJobOriginResponse'];
export type ListChatJobEventsResponse = components['schemas']['ListChatJobEventsResponse'];
export type ChatJobEventResponse = components['schemas']['ChatJobEventResponse'];
export type JobEventType = components['schemas']['JobEventType'];
export type CancelJobResponse = components['schemas']['CancelJobResponse'];
export type AccountSettingsResponse = components['schemas']['AccountSettingsResponse'];
export type AccountModelDefaults = components['schemas']['AccountModelDefaults'];
export type AccountModelRef = components['schemas']['AccountModelRef'];
export type UpdateAccountSettingsBody = components['schemas']['UpdateAccountSettingsBody'];
export type AiModelsResponse = components['schemas']['AiModelsResponse'];
export type AiModelOption = components['schemas']['AiModelOption'];
export type AiRoleDefault = components['schemas']['AiRoleDefault'];
export type AiTierModel = components['schemas']['AiTierModel'];
export type CostTier = components['schemas']['CostTier'];
export type ContentMode = components['schemas']['ContentMode'];
export type AccountUsageResponse = components['schemas']['AccountUsageResponse'];
export type CostBreakdownItem = components['schemas']['CostBreakdownItem'];
export type DayCostItem = components['schemas']['DayCostItem'];
export type ProjectCostItem = components['schemas']['ProjectCostItem'];
export type AiQuotaResponse = components['schemas']['AiQuotaResponse'];
export type ProjectModelsResponse = components['schemas']['ProjectModelsResponse'];
export type ProjectModelRoute = components['schemas']['ProjectModelRoute'];
export type PluginManifestResponse = components['schemas']['PluginManifestResponse'];
export type PluginManifestResponse1 = components['schemas']['PluginManifestResponse1'];
export type DecisionPoint = components['schemas']['DecisionPoint'];
export type PluginActionResponse = components['schemas']['PluginActionResponse'];
export type PluginActionSurface = components['schemas']['PluginActionSurface'];
export type ProjectPluginResponse = components['schemas']['ProjectPluginResponse'];
export type ProjectPluginResponse1 = components['schemas']['ProjectPluginResponse1'];
export type EnablePluginBody = components['schemas']['EnablePluginBody'];
export type SeedFromBriefBody = components['schemas']['SeedFromBriefBody'];
export type WorkflowRunResponse = components['schemas']['WorkflowRunResponse'];
export type ListBriefSummaryResponse = components['schemas']['ListBriefSummaryResponse'];
export type BriefSummaryResponse = components['schemas']['BriefSummaryResponse'];
export type BriefWriteMode = components['schemas']['BriefWriteMode'];
export type BriefResponse = components['schemas']['BriefResponse'];
export type BriefSceneSchema = components['schemas']['BriefSceneSchema'];
export type UpdateBriefBody = components['schemas']['UpdateBriefBody'];
export type EndingContractSchema = components['schemas']['EndingContractSchema'];
export type HookType = components['schemas']['HookType'];
export type KnowledgeContractSchema = components['schemas']['KnowledgeContractSchema'];
export type KnowledgeRevealSchema = components['schemas']['KnowledgeRevealSchema'];
export type RevealRuleErrorResponse = components['schemas']['RevealRuleErrorResponse'];
export type RevealRuleDetails = components['schemas']['RevealRuleDetails'];
export type RevealRuleViolationItem = components['schemas']['RevealRuleViolationItem'];
export type GenerateBody = components['schemas']['GenerateBody'];
export type JobEnqueueResponse = components['schemas']['JobEnqueueResponse'];
export type ListGenerationJobResponse = components['schemas']['ListGenerationJobResponse'];
export type GenerationJobItem = components['schemas']['GenerationJobItem'];
export type JobUsageResponse = components['schemas']['JobUsageResponse'];
export type JobCostSourceItem = components['schemas']['JobCostSourceItem'];
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
export type DraftConflictResponse = components['schemas']['DraftConflictResponse'];
export type ConflictingDraftResponse = components['schemas']['ConflictingDraftResponse'];
export type UpdateDraftBody = components['schemas']['UpdateDraftBody'];
export type ReviseDraftBody = components['schemas']['ReviseDraftBody'];
export type FeedbackBody = components['schemas']['FeedbackBody'];
export type UserFeedbackDisposition = components['schemas']['UserFeedbackDisposition'];
export type UserFeedbackResponse = components['schemas']['UserFeedbackResponse'];
export type ApproveDraftBody = components['schemas']['ApproveDraftBody'];
export type FinalizeReadinessResponse = components['schemas']['FinalizeReadinessResponse'];
export type FinalizeBlockerResponse = components['schemas']['FinalizeBlockerResponse'];
export type ListDraftRevisionResponse = components['schemas']['ListDraftRevisionResponse'];
export type DraftRevisionResponse = components['schemas']['DraftRevisionResponse'];
export type DraftRevisionSource = components['schemas']['DraftRevisionSource'];
export type MarkdownResponse = components['schemas']['MarkdownResponse'];
export type ImportDraftBody = components['schemas']['ImportDraftBody'];
export type FinalizeBody = components['schemas']['FinalizeBody'];
export type GenerateUnrestrictedBody = components['schemas']['GenerateUnrestrictedBody'];
export type ChapterSummarizeResponse = components['schemas']['ChapterSummarizeResponse'];
export type SummaryConflictResponse = components['schemas']['SummaryConflictResponse'];
export type UpdateSummaryBody = components['schemas']['UpdateSummaryBody'];
export type ContinuityProposalResponse = components['schemas']['ContinuityProposalResponse'];
export type ProposalResponse = components['schemas']['ProposalResponse'];
export type ChatScope = components['schemas']['ChatScope'];
export type RefinementKind = components['schemas']['RefinementKind'];
export type RefinementProposalStatus = components['schemas']['RefinementProposalStatus'];
export type ChangeOpItem = components['schemas']['ChangeOpItem'];
export type OpResultItem = components['schemas']['OpResultItem'];
export type ProposalDiagnosticItem = components['schemas']['ProposalDiagnosticItem'];
export type ProposalDiagnosticKind = components['schemas']['ProposalDiagnosticKind'];
export type ProposalDiagnosticData = components['schemas']['ProposalDiagnosticData'];
export type DiagnosticPovItem = components['schemas']['DiagnosticPovItem'];
export type DiagnosticFactItem = components['schemas']['DiagnosticFactItem'];
export type UpdateContinuityBody = components['schemas']['UpdateContinuityBody'];
export type ReviewQueueResponse = components['schemas']['ReviewQueueResponse'];
export type RunGraph = components['schemas']['RunGraph'];
export type ListWorkflowRunResponse = components['schemas']['ListWorkflowRunResponse'];
export type WorkflowRunListItemResponse = components['schemas']['WorkflowRunListItemResponse'];
export type WorkflowRunStatus = components['schemas']['WorkflowRunStatus'];
export type RunUsageResponse = components['schemas']['RunUsageResponse'];
export type RunCostSourceItem = components['schemas']['RunCostSourceItem'];
export type WorkflowRunDetailResponse = components['schemas']['WorkflowRunDetailResponse'];
export type RunModelCallResponse = components['schemas']['RunModelCallResponse'];
export type CostSource = components['schemas']['CostSource'];
export type RunToolCallResponse = components['schemas']['RunToolCallResponse'];
export type RunContextPackResponse = components['schemas']['RunContextPackResponse'];
export type RunContextSectionItem = components['schemas']['RunContextSectionItem'];
export type RunUsageDetailResponse = components['schemas']['RunUsageDetailResponse'];
export type ChapterCostResponse = components['schemas']['ChapterCostResponse'];
export type ChapterCostBreakdownItem = components['schemas']['ChapterCostBreakdownItem'];
export type CancelRunResponse = components['schemas']['CancelRunResponse'];
export type RunContextResponse = components['schemas']['RunContextResponse'];
export type RunModelCallDetailResponse = components['schemas']['RunModelCallDetailResponse'];
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
export type SortOrder = components['schemas']['SortOrder'];
export type SortByTime = components['schemas']['SortByTime'];
export type ListProposalResponse = components['schemas']['ListProposalResponse'];
export type UpdateProposalBody = components['schemas']['UpdateProposalBody'];
export type ApplyProposalBody = components['schemas']['ApplyProposalBody'];
export type ApplyProposalResponse = components['schemas']['ApplyProposalResponse'];
export type AppliedArtifactItem = components['schemas']['AppliedArtifactItem'];
export type AppliedActionJobItem = components['schemas']['AppliedActionJobItem'];
export type UndoImpactResponse = components['schemas']['UndoImpactResponse'];
export type UndoDependentItem = components['schemas']['UndoDependentItem'];
export type UndoDependentKind = components['schemas']['UndoDependentKind'];
export type WriterPreviewResponse = components['schemas']['WriterPreviewResponse'];
export type WriterPreviewRefItem = components['schemas']['WriterPreviewRefItem'];
export type WriterKeptItem = components['schemas']['WriterKeptItem'];
export type WriterKeptKind = components['schemas']['WriterKeptKind'];
export type WriterUnlockItem = components['schemas']['WriterUnlockItem'];
export type RevertProposalResponse = components['schemas']['RevertProposalResponse'];
export type RejectProposalOpBody = components['schemas']['RejectProposalOpBody'];
export type LedgerRejectionScope = components['schemas']['LedgerRejectionScope'];
export type LedgerEntryResponse = components['schemas']['LedgerEntryResponse'];
export type LedgerEntryKind = components['schemas']['LedgerEntryKind'];
export type LedgerDecidedBy = components['schemas']['LedgerDecidedBy'];
export type LedgerLinksResponse = components['schemas']['LedgerLinksResponse'];
export type LedgerBibleDocumentLinkResponse = components['schemas']['LedgerBibleDocumentLinkResponse'];
export type BibleSection = components['schemas']['BibleSection'];
export type LedgerEntryStatus = components['schemas']['LedgerEntryStatus'];
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
export type ChatQuestionResponse = components['schemas']['ChatQuestionResponse'];
export type ChatQuestionAnswerResponse = components['schemas']['ChatQuestionAnswerResponse'];
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
export type ContextPreviewResponse = components['schemas']['ContextPreviewResponse'];
export type ContextSectionPreview = components['schemas']['ContextSectionPreview'];
export type OmittedSectionPreview = components['schemas']['OmittedSectionPreview'];
export type BibleTidyPreviewResponse = components['schemas']['BibleTidyPreviewResponse'];
export type BibleTidyItem = components['schemas']['BibleTidyItem'];
export type BibleTidyKind = components['schemas']['BibleTidyKind'];
export type EntityType = components['schemas']['EntityType'];
export type ApplyBibleTidyBody = components['schemas']['ApplyBibleTidyBody'];
export type BibleTidySelection = components['schemas']['BibleTidySelection'];
export type ListLedgerEntriesResponse = components['schemas']['ListLedgerEntriesResponse'];
export type CreateLedgerEntryBody = components['schemas']['CreateLedgerEntryBody'];
export type AuthorLedgerKind = components['schemas']['AuthorLedgerKind'];
export type SupersedeLedgerEntryBody = components['schemas']['SupersedeLedgerEntryBody'];
export type AuthorSupersedeLedgerKind = components['schemas']['AuthorSupersedeLedgerKind'];
export type WithdrawLedgerEntryBody = components['schemas']['WithdrawLedgerEntryBody'];
export type ListBibleAuditsResponse = components['schemas']['ListBibleAuditsResponse'];
export type BibleAuditReportResponse = components['schemas']['BibleAuditReportResponse'];
export type AuditCheckedResponse = components['schemas']['AuditCheckedResponse'];
export type AuditPassesResponse = components['schemas']['AuditPassesResponse'];
export type AuditPassStatus = components['schemas']['AuditPassStatus'];
export type AuditCheckedDocumentsResponse = components['schemas']['AuditCheckedDocumentsResponse'];
export type AuditCheckedEntitiesResponse = components['schemas']['AuditCheckedEntitiesResponse'];
export type AuditCheckedFactsResponse = components['schemas']['AuditCheckedFactsResponse'];
export type AuditCheckedChaptersResponse = components['schemas']['AuditCheckedChaptersResponse'];
export type BibleAuditFindingResponse = components['schemas']['BibleAuditFindingResponse'];
export type BibleAuditGroup = components['schemas']['BibleAuditGroup'];
export type AuditEvidenceResponse = components['schemas']['AuditEvidenceResponse'];
export type AuditFindingDecisionResponse = components['schemas']['AuditFindingDecisionResponse'];
export type AuditFindingDecision = components['schemas']['AuditFindingDecision'];
export type AuditProposalStatus = components['schemas']['AuditProposalStatus'];
export type BibleAuditJobResponse = components['schemas']['BibleAuditJobResponse'];
export type AuditFindingDecisionBody = components['schemas']['AuditFindingDecisionBody'];
export type BotOwnershipResponse = components['schemas']['BotOwnershipResponse'];
export type TransferOwnershipBody = components['schemas']['TransferOwnershipBody'];
export type TransferOwnershipResponse = components['schemas']['TransferOwnershipResponse'];
export type SortByChapter = components['schemas']['SortByChapter'];
export type ChapterStatus = components['schemas']['ChapterStatus'];
export type ListChapterResponse = components['schemas']['ListChapterResponse'];
export type ChapterListResponse = components['schemas']['ChapterListResponse'];
export type ChapterSearchResponse = components['schemas']['ChapterSearchResponse'];
export type ChapterSearchHit = components['schemas']['ChapterSearchHit'];
export type ChapterResponse = components['schemas']['ChapterResponse'];
export type UpdateChapterBody = components['schemas']['UpdateChapterBody'];
export type ListChapterReviewsResponse = components['schemas']['ListChapterReviewsResponse'];
export type ChapterReviewRecordResponse = components['schemas']['ChapterReviewRecordResponse'];
export type ChapterReviewKind = components['schemas']['ChapterReviewKind'];
export type ChapterReviewDisposition = components['schemas']['ChapterReviewDisposition'];
export type ReviewFindingResponse = components['schemas']['ReviewFindingResponse'];
export type ReviewFindingSeverity = components['schemas']['ReviewFindingSeverity'];
export type ReviewFindingCategory = components['schemas']['ReviewFindingCategory'];
export type ReviewRemedyResponse = components['schemas']['ReviewRemedyResponse'];
export type ReviewRemedyAction = components['schemas']['ReviewRemedyAction'];
export type ReviewComplianceResponse = components['schemas']['ReviewComplianceResponse'];
export type RunChapterReviewBody = components['schemas']['RunChapterReviewBody'];
export type ChapterReviewJobResponse = components['schemas']['ChapterReviewJobResponse'];
export type ReviewRemedyBody = components['schemas']['ReviewRemedyBody'];
export type JudgeResponse = components['schemas']['JudgeResponse'];
export type JudgeFindingResponse = components['schemas']['JudgeFindingResponse'];
export type ChapterReviewResponse = components['schemas']['ChapterReviewResponse'];
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
export type TimelineResponse = components['schemas']['TimelineResponse'];
export type CharacterEventResponse = components['schemas']['CharacterEventResponse'];
export type CharacterEventKind = components['schemas']['CharacterEventKind'];
export type CharacterEventSource = components['schemas']['CharacterEventSource'];
export type KnowledgeStatus = components['schemas']['KnowledgeStatus'];
export type UpdateEntityBody = components['schemas']['UpdateEntityBody'];
export type UploadImageBody = components['schemas']['UploadImageBody'];
export type AddEntityImageBody = components['schemas']['AddEntityImageBody'];
export type ListVolumeResponse = components['schemas']['ListVolumeResponse'];
export type VolumeResponse = components['schemas']['VolumeResponse'];
export type VolumeState = components['schemas']['VolumeState'];
export type VolumeAdvanceResponse = components['schemas']['VolumeAdvanceResponse'];
export type ListBibleDocResponse = components['schemas']['ListBibleDocResponse'];
export type BibleDocListItem = components['schemas']['BibleDocListItem'];
export type BibleDocResponse = components['schemas']['BibleDocResponse'];
export type UpsertBibleDocBody = components['schemas']['UpsertBibleDocBody'];
export type ListFactsResponse = components['schemas']['ListFactsResponse'];
export type FactResponse = components['schemas']['FactResponse'];
export type UnlockConditionSchema = components['schemas']['UnlockConditionSchema'];
export type UnlockTermSchema = components['schemas']['UnlockTermSchema'];
export type KnowledgeEntryResponse = components['schemas']['KnowledgeEntryResponse'];
export type FactSource = components['schemas']['FactSource'];
export type UpsertFactBody = components['schemas']['UpsertFactBody'];
export type RevealFactBody = components['schemas']['RevealFactBody'];
export type ListMilestonesResponse = components['schemas']['ListMilestonesResponse'];
export type MilestoneResponse = components['schemas']['MilestoneResponse'];
export type MilestoneKind = components['schemas']['MilestoneKind'];
export type MilestoneState = components['schemas']['MilestoneState'];
export type CreateMilestoneBody = components['schemas']['CreateMilestoneBody'];
export type UpdateMilestoneBody = components['schemas']['UpdateMilestoneBody'];
export type BibleReadinessResponse = components['schemas']['BibleReadinessResponse'];
export type BibleReadinessDimensionResponse = components['schemas']['BibleReadinessDimensionResponse'];
export type BibleReadinessDimension = components['schemas']['BibleReadinessDimension'];
export type BibleReadinessVerdict = components['schemas']['BibleReadinessVerdict'];
export type BibleReadinessRoleResponse = components['schemas']['BibleReadinessRoleResponse'];
export type BibleStage = components['schemas']['BibleStage'];
export type CreateProjectBody = components['schemas']['CreateProjectBody'];
export type ProjectKind = components['schemas']['ProjectKind'];
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
export type UploadImageBody1 = components['schemas']['UploadImageBody1'];
export type CreateNovelWithNotesBody = components['schemas']['CreateNovelWithNotesBody'];
export type CreateNovelWithNotesResponse = components['schemas']['CreateNovelWithNotesResponse'];
export type NotesResponse = components['schemas']['NotesResponse'];
export type UpdateNotesBody = components['schemas']['UpdateNotesBody'];
export type ProgressResponse = components['schemas']['ProgressResponse'];
export type ProgressItemResponse = components['schemas']['ProgressItemResponse'];
export type ProgressItemStatus = components['schemas']['ProgressItemStatus'];
export type ProgressOverrideBody = components['schemas']['ProgressOverrideBody'];
export type ProgressOverrideStatus = components['schemas']['ProgressOverrideStatus'];
export type ProgressItemKey = components['schemas']['ProgressItemKey'];
export type SaveMessageAsNotesBody = components['schemas']['SaveMessageAsNotesBody'];
export type SavedNotesResponse = components['schemas']['SavedNotesResponse'];
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
export type ApiV1ProjectsProjectIdChatSessionsSessionIdJobsPathParams = Exclude<
  paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs']['get']['parameters']['path'],
  undefined
>;
export type ListEventsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs/events']['get']['parameters']['query'], undefined>;
export type ListEventsPathParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs/events']['get']['parameters']['path'], undefined>;
export type StreamEventsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs/stream']['get']['parameters']['query'], undefined>;
export type ApiV1ProjectsProjectIdChatSessionsSessionIdJobsStreamPathParams = Exclude<
  paths['/api/v1/projects/{projectId}/chat/sessions/{sessionId}/jobs/stream']['get']['parameters']['path'],
  undefined
>;
export type ModelsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/ai/models']['get']['parameters']['query'], undefined>;
export type ModelsPathParams = Exclude<paths['/api/v1/projects/{projectId}/ai/models']['get']['parameters']['path'], undefined>;
export type ApiV1ProjectsProjectIdEventsPathParams = Exclude<paths['/api/v1/projects/{projectId}/events']['get']['parameters']['path'], undefined>;
export type ListProjectPluginsPathParams = Exclude<paths['/api/v1/projects/{projectId}/plugins']['get']['parameters']['path'], undefined>;
export type ListBriefsPathParams = Exclude<paths['/api/v1/projects/{projectId}/briefs']['get']['parameters']['path'], undefined>;
export type GetBriefPathParams = Exclude<paths['/api/v1/projects/{projectId}/briefs/{n}']['get']['parameters']['path'], undefined>;
export type ApiV1ProjectsProjectIdJobsPathParams = Exclude<paths['/api/v1/projects/{projectId}/jobs']['get']['parameters']['path'], undefined>;
export type ListDraftsPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts']['get']['parameters']['path'], undefined>;
export type ListDraftSummariesPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/summary']['get']['parameters']['path'], undefined>;
export type GetDraftPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}']['get']['parameters']['path'], undefined>;
export type FinalizeReadinessPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}/finalize-readiness']['get']['parameters']['path'], undefined>;
export type ListRevisionsPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}/revisions']['get']['parameters']['path'], undefined>;
export type GetRevisionPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}/revisions/{r}']['get']['parameters']['path'], undefined>;
export type GetDraftPromptPathParams = Exclude<paths['/api/v1/projects/{projectId}/drafts/{n}/prompt']['get']['parameters']['path'], undefined>;
export type GetContinuityProposalPathParams = Exclude<paths['/api/v1/projects/{projectId}/chapters/{n}/continuity-proposal']['get']['parameters']['path'], undefined>;
export type GetReviewQueuePathParams = Exclude<paths['/api/v1/projects/{projectId}/review-queue']['get']['parameters']['path'], undefined>;
export type ListRunsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/runs']['get']['parameters']['query'], undefined>;
export type ListRunsPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs']['get']['parameters']['path'], undefined>;
export type GetRunPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs/{runId}']['get']['parameters']['path'], undefined>;
export type GetRunUsagePathParams = Exclude<paths['/api/v1/projects/{projectId}/runs/{runId}/usage']['get']['parameters']['path'], undefined>;
export type GetChapterCostPathParams = Exclude<paths['/api/v1/projects/{projectId}/chapters/{n}/cost']['get']['parameters']['path'], undefined>;
export type GetRunContextPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs/{runId}/context']['get']['parameters']['path'], undefined>;
export type GetRunCallPathParams = Exclude<paths['/api/v1/projects/{projectId}/runs/{runId}/calls/{callId}']['get']['parameters']['path'], undefined>;
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
export type UndoImpactPathParams = Exclude<paths['/api/v1/projects/{projectId}/proposals/{proposalId}/undo-impact']['get']['parameters']['path'], undefined>;
export type WriterPreviewPathParams = Exclude<paths['/api/v1/projects/{projectId}/proposals/{proposalId}/writer-preview']['get']['parameters']['path'], undefined>;
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
export type ListActiveQueryParams = Exclude<paths['/api/v1/projects/{projectId}/ledger']['get']['parameters']['query'], undefined>;
export type ListActivePathParams = Exclude<paths['/api/v1/projects/{projectId}/ledger']['get']['parameters']['path'], undefined>;
export type HistoryPathParams = Exclude<paths['/api/v1/projects/{projectId}/ledger/topics/{topic}']['get']['parameters']['path'], undefined>;
export type ListAuditsPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/audits']['get']['parameters']['path'], undefined>;
export type GetAuditPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/audits/{reportId}']['get']['parameters']['path'], undefined>;
export type GetOwnershipPathParams = Exclude<paths['/internal/bots/{botId}/ownership']['get']['parameters']['path'], undefined>;
export type ListChaptersQueryParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters']['get']['parameters']['query'], undefined>;
export type ListChaptersPathParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters']['get']['parameters']['path'], undefined>;
export type SearchChaptersQueryParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters/search']['get']['parameters']['query'], undefined>;
export type SearchChaptersPathParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters/search']['get']['parameters']['path'], undefined>;
export type GetChapterPathParams = Exclude<paths['/api/v1/projects/{projectId}/source/chapters/{n}']['get']['parameters']['path'], undefined>;
export type ExportNovelPathParams = Exclude<paths['/api/v1/projects/{projectId}/export/novel']['get']['parameters']['path'], undefined>;
export type ListReviewsPathParams = Exclude<paths['/api/v1/projects/{projectId}/chapters/{n}/reviews']['get']['parameters']['path'], undefined>;
export type GetReviewPathParams = Exclude<paths['/api/v1/projects/{projectId}/chapters/{n}/reviews/{reviewId}']['get']['parameters']['path'], undefined>;
export type ListIllustrationsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations']['get']['parameters']['query'], undefined>;
export type ListIllustrationsPathParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations']['get']['parameters']['path'], undefined>;
export type ListReferenceOptionsQueryParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations/reference-options']['get']['parameters']['query'], undefined>;
export type ListReferenceOptionsPathParams = Exclude<paths['/api/v1/projects/{projectId}/illustrations/reference-options']['get']['parameters']['path'], undefined>;
export type ListEntitiesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/entities']['get']['parameters']['query'], undefined>;
export type ListEntitiesPathParams = Exclude<paths['/api/v1/projects/{projectId}/entities']['get']['parameters']['path'], undefined>;
export type GetEntityPathParams = Exclude<paths['/api/v1/projects/{projectId}/entities/{entityKey}']['get']['parameters']['path'], undefined>;
export type GetTimelinePathParams = Exclude<paths['/api/v1/projects/{projectId}/entities/{entityKey}/timeline']['get']['parameters']['path'], undefined>;
export type ListVolumesQueryParams = Exclude<paths['/api/v1/projects/{projectId}/volumes']['get']['parameters']['query'], undefined>;
export type ListVolumesPathParams = Exclude<paths['/api/v1/projects/{projectId}/volumes']['get']['parameters']['path'], undefined>;
export type GetVolumePathParams = Exclude<paths['/api/v1/projects/{projectId}/volumes/{volumeKey}']['get']['parameters']['path'], undefined>;
export type ListBibleDocsPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible']['get']['parameters']['path'], undefined>;
export type GetBibleDocPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/{section}/{slug}']['get']['parameters']['path'], undefined>;
export type ListFactsPathParams = Exclude<paths['/api/v1/projects/{projectId}/facts']['get']['parameters']['path'], undefined>;
export type GetFactPathParams = Exclude<paths['/api/v1/projects/{projectId}/facts/{factKey}']['get']['parameters']['path'], undefined>;
export type ListMilestonesPathParams = Exclude<paths['/api/v1/projects/{projectId}/milestones']['get']['parameters']['path'], undefined>;
export type ReadinessPathParams = Exclude<paths['/api/v1/projects/{projectId}/bible/readiness']['get']['parameters']['path'], undefined>;
export type ListProjectsQueryParams = Exclude<paths['/api/v1/projects']['get']['parameters']['query'], undefined>;
export type GetProjectPathParams = Exclude<paths['/api/v1/projects/{projectId}']['get']['parameters']['path'], undefined>;
export type GetProjectStatusPathParams = Exclude<paths['/api/v1/projects/{projectId}/status']['get']['parameters']['path'], undefined>;
export type GetProjectCostPathParams = Exclude<paths['/api/v1/projects/{projectId}/cost']['get']['parameters']['path'], undefined>;
export type GetNotesPathParams = Exclude<paths['/api/v1/projects/{projectId}/notes']['get']['parameters']['path'], undefined>;
export type GetProgressPathParams = Exclude<paths['/api/v1/projects/{projectId}/progress']['get']['parameters']['path'], undefined>;
export type GetAccessPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications/access']['get']['parameters']['path'], undefined>;
export type ListPublicationsPathParams = Exclude<paths['/api/v1/projects/{projectId}/publications']['get']['parameters']['path'], undefined>;
