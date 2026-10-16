export interface paths {
  '/api/v1/chat/completions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Chat Completions */
    post: operations['post_api_v1_chat_completions'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/embeddings': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Embeddings */
    post: operations['post_api_v1_embeddings'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/images/generations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Image Generations */
    post: operations['post_api_v1_images_generations'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Access */
    get: operations['get_api_v1_admin_access'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/catalog': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Catalog */
    get: operations['get_api_v1_catalog'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/versions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Versions */
    get: operations['get_api_v1_admin_catalog_versions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/versions/{version}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Version */
    get: operations['get_api_v1_admin_catalog_versions_version'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/draft': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Draft */
    get: operations['get_api_v1_admin_catalog_draft'];
    /** Save Draft */
    put: operations['put_api_v1_admin_catalog_draft'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/draft/validate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Validate Draft */
    post: operations['post_api_v1_admin_catalog_draft_validate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/draft/diff': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Diff Draft */
    get: operations['get_api_v1_admin_catalog_draft_diff'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/draft/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Publish */
    post: operations['post_api_v1_admin_catalog_draft_publish'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/versions/{version}/rollback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Rollback */
    post: operations['post_api_v1_admin_catalog_versions_version_rollback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/catalog/aliases/{key}/impact': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Alias Impact */
    get: operations['get_api_v1_admin_catalog_aliases_key_impact'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/usage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Usage */
    get: operations['get_api_v1_admin_usage'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/providers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Providers */
    get: operations['get_api_v1_admin_providers'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/auth/access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Access */
    get: operations['get_api_auth_access'];
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
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    ChatCompletionBody: {
      /** @description The task id, `<app>.<name>` */
      model: string;
      messages: components['schemas']['JsonObjectBody'][];
      tools?: components['schemas']['JsonObjectBody'][];
      stream?: boolean;
      stream_options?: components['schemas']['JsonObjectBody'];
      response_format?: components['schemas']['JsonObjectBody'];
      temperature?: number;
      top_p?: number;
      max_tokens?: number;
      max_completion_tokens?: number;
      seed?: number;
      synapse: components['schemas']['SynapseEnvelopeBody'];
    } & {
      [key: string]: unknown;
    };
    JsonObjectBody: {
      [key: string]: unknown;
    };
    SynapseEnvelopeBody: {
      /** @description Caller generated and unique across every call: a reused id is refused with SYN_DUPLICATE_REQUEST */
      request_id: string;
      /** @description Whom the call is made for; per-subject budgets count against it */
      subject: components['schemas']['SubjectBody'];
      /** @description Values the task's routes and alias availability match on */
      selectors?: components['schemas']['SelectorsBody'];
      /** @description An alias the task accepts; a retired one falls back to the task's routes */
      alias?: string;
      /**
       * @description Clamped to the task's range, then sent only where the model supports it
       * @enum {string}
       */
      effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
      /** @description Continues a provider-side conversation where the provider keeps sessions; ignored elsewhere */
      session?: string;
      web_search?: boolean;
    };
    SubjectBody: {
      /** @enum {string} */
      type: 'owner' | 'user' | 'app';
      id: string;
    };
    SelectorsBody: {
      [key: string]: string;
    };
    ChatCompletionResponse: {
      id?: string;
      object?: string;
      created?: number;
      model: string;
      choices: components['schemas']['JsonObjectBody'][];
      usage?: components['schemas']['ChatUsageResponse'];
      synapse: components['schemas']['SynapseBlockResponse'];
    } & {
      [key: string]: unknown;
    };
    ChatUsageResponse: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      prompt_tokens_details: components['schemas']['PromptTokensDetails'];
      completion_tokens_details: components['schemas']['CompletionTokensDetails'];
    };
    PromptTokensDetails: {
      cached_tokens: number;
    };
    CompletionTokensDetails: {
      reasoning_tokens: number;
    };
    SynapseBlockResponse: {
      request_id: string;
      task: string;
      alias: string | null;
      label: string;
      model: string;
      provider: string;
      /** @description The effort sent to the model, or null when no reasoning control was sent */
      effort: string | null;
      /** @description Deployments tried, including the one that answered */
      attempts: number;
      catalog_version: number;
      cost: components['schemas']['SynapseCostResponse'];
      /** @description Present when web search was requested: whether the serving deployment ran it */
      web_search?: boolean;
      /** @description Embeddings only */
      dimensions?: number;
    };
    SynapseCostResponse: {
      /** @description At catalog list price, whoever served the call; budgets count this */
      list_usd: number;
      /** @description What the provider charges: zero on a subscription or local deployment */
      billed_usd: number;
    };
    SynapseErrorResponse: {
      error: components['schemas']['SynapseErrorDetail'];
    };
    SynapseErrorDetail: {
      message: string;
      /** @enum {string} */
      type: 'invalid_request_error' | 'authentication_error' | 'rate_limit_error' | 'server_error';
      /** @description A `SYN_*` code, or the auth guard or request validation code on the same route */
      code: string;
      /** @description The request member at fault */
      param?: string;
    };
    EmbeddingsBody: {
      /** @description The task id, `<app>.<name>` */
      model: string;
      /** @description A string, or a list of strings */
      input: string | string[];
      synapse: components['schemas']['SynapseEnvelopeBody'];
    } & {
      [key: string]: unknown;
    };
    EmbeddingsResponse: {
      object?: string;
      data: components['schemas']['JsonObjectBody'][];
      model: string;
      usage?: components['schemas']['EmbeddingUsageResponse'];
      synapse: components['schemas']['SynapseBlockResponse'];
    } & {
      [key: string]: unknown;
    };
    EmbeddingUsageResponse: {
      prompt_tokens: number;
      total_tokens: number;
    };
    ImageGenerationBody: {
      /** @description The task id, `<app>.<name>` */
      model: string;
      prompt: string;
      n?: number;
      /** @description Data URLs or https URLs of images to work from */
      reference_images?: string[];
      synapse: components['schemas']['SynapseEnvelopeBody'];
    };
    ImageGenerationResponse: {
      data: components['schemas']['GeneratedImageResponse'][];
      usage: components['schemas']['ImageUsageResponse'];
      synapse: components['schemas']['SynapseBlockResponse'];
    };
    GeneratedImageResponse: {
      b64_json: string;
      media_type: string;
    };
    ImageUsageResponse: {
      /** @description What the call was billed, in USD */
      cost?: number;
    };
    AdminAccessResponse: {
      /** @description The Synapse user permissions the caller holds in the active organisation; empty when it holds none */
      permissions: string[];
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
    /** @description One task when `task` is given (`task` and the task view at the top level), else every task of the calling app under `tasks` */
    CatalogResponseDto: {
      catalog_version: number;
      task?: string;
      default?: components['schemas']['CatalogModelView'];
      aliases?: components['schemas']['CatalogAliasView'][];
      native_web_search?: boolean;
      /** @description Task views keyed by task key, each shaped as CatalogTaskView */
      tasks?: {
        [key: string]: unknown;
      };
    };
    CatalogModelView: {
      model: string;
      label: string;
      price: components['schemas']['CatalogPriceView'];
      capabilities: components['schemas']['CatalogCapabilitiesView'];
    };
    CatalogPriceView: {
      /** @description List price per million input tokens, in USD */
      input: number;
      /** @description List price per million cached input tokens, in USD */
      cachedInput?: number;
      /** @description List price per million output tokens, in USD */
      output: number;
      /** @description List price per generated image, in USD */
      perImage?: number;
    };
    CatalogCapabilitiesView: {
      tools: boolean;
      /** @enum {string} */
      structuredOutput: 'native' | 'prompt';
      vision: boolean;
      imageOutput?: boolean;
      embedding?: components['schemas']['CatalogEmbeddingView'];
      /** @description Context window in tokens */
      context?: number;
      /** @enum {string} */
      reasoning: 'none' | 'optional' | 'mandatory';
      /** @description Reasoning efforts the model accepts, e.g. low, medium, high */
      efforts?: string[];
      /** @enum {string} */
      promptCache: 'anthropic' | 'none';
      sampling: boolean;
    };
    CatalogEmbeddingView: {
      dimensions: number;
    };
    CatalogAliasView: {
      key: string;
      /** @description Includes the model version only when the alias opts in to showing it */
      label: string;
      description?: string;
      price: components['schemas']['CatalogPriceView'];
      capabilities: components['schemas']['CatalogCapabilitiesView'];
      /** @enum {string} */
      state: 'active' | 'hidden' | 'retired';
    };
    CatalogVersionListResponse: {
      /** @description Published and archived versions, newest first */
      items: components['schemas']['CatalogVersionSummaryResponse'][];
    };
    CatalogVersionSummaryResponse: {
      /** @description Zero for the draft, which has no version until it is published */
      version: number;
      /** @enum {string} */
      state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      note?: string;
      /** @description Subject of the admin who last saved or published it */
      createdBy?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      publishedAt?: string;
    };
    CatalogVersionDetailResponse: {
      /** @description Zero for the draft, which has no version until it is published */
      version: number;
      /** @enum {string} */
      state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
      note?: string;
      /** @description Subject of the admin who last saved or published it */
      createdBy?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      publishedAt?: string;
      /** @description The catalog document: providers, models, aliases, tasks and budgets */
      document: {
        [key: string]: unknown;
      };
    };
    DraftResponse: {
      draft: components['schemas']['CatalogVersionDetailResponse'];
      /** @description Content hash of the draft; publishing must present it to prove the draft was seen */
      fingerprint: string;
    };
    SaveDraftBody: {
      /** @description The whole catalog document. It is saved as sent, even when invalid, so work in progress survives */
      document: {
        [key: string]: unknown;
      };
      /** @description Free-text note stored with the draft */
      note?: string;
      /** @description Fingerprint of the draft this save replaces; the save is refused with 409 when the draft has changed since */
      expectedFingerprint?: string;
      /** @description The save starts a new draft; it is refused with 409 when a draft already exists */
      expectNoDraft?: boolean;
    };
    SaveDraftResponse: {
      draft: components['schemas']['CatalogVersionDetailResponse'];
      /** @description Content hash of the draft; publishing must present it to prove the draft was seen */
      fingerprint: string;
      /** @description What would block publishing this draft; empty when it is publishable */
      issues: components['schemas']['CatalogIssueResponse'][];
    };
    CatalogIssueResponse: {
      /** @description Location in the document, e.g. `tasks.novel-forge.chat.routes[1].model`; empty for the document itself */
      path: string;
      /** @description Machine-readable rule that failed, e.g. unknown_model or pinned_changed */
      code: string;
      message: string;
    };
    ErrorResponseDto: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
    };
    /** @description The `SYN_CATALOG_INVALID` error body, with the issues the generic error shape does not carry */
    CatalogInvalidResponse: {
      code: string;
      message: string;
      issues: components['schemas']['CatalogIssueResponse'][];
    };
    ValidateDraftResponse: {
      valid: boolean;
      issues: components['schemas']['CatalogIssueResponse'][];
    };
    DraftDiffResponse: {
      /** @description Fingerprint of the draft this diff was computed from; publish with it */
      fingerprint: string;
      /** @description Paths present in the draft only */
      added: string[];
      /** @description Paths present in the active catalog only */
      removed: string[];
      /** @description Paths whose values differ */
      changed: string[];
    };
    PublishBody: {
      /** @description Fingerprint of the draft being published, as returned when it was read or saved */
      fingerprint: string;
    };
    AliasImpactResponse: {
      alias: string;
      /** @description Model the alias targets in the active catalog */
      model: string;
      windowDays: number;
      /** Format: date-time */
      since: string;
      totalCalls: number;
      rows: components['schemas']['AliasImpactRowResponse'][];
      /** @description Present only when `model` was given */
      retarget?: components['schemas']['AliasRetargetResponse'];
    };
    AliasImpactRowResponse: {
      app: string;
      task: string;
      calls: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      /** @description Change in list cost over the window if this traffic had gone to the target model; negative is cheaper */
      deltaUsd?: number;
    };
    AliasRetargetResponse: {
      fromModel: string;
      toModel: string;
      /** @description List cost of the window's tokens at the current target model's prices */
      currentUsd: number;
      /** @description List cost of the same tokens at the proposed model's prices. Image output is not included */
      proposedUsd: number;
      deltaUsd: number;
    };
    UsageResponse: {
      /** Format: date-time */
      from: string;
      /** Format: date-time */
      to: string;
      groupBy: string;
      rows: components['schemas']['UsageRowResponse'][];
      totals: components['schemas']['UsageTotalsResponse'];
    };
    UsageRowResponse: {
      /** @description Settled requests: every outcome except those still in flight */
      calls: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      /** @description Cost at catalog list prices, in USD */
      listCostUsd: number;
      /** @description Cost actually charged, in USD; zero for free providers */
      billedCostUsd: number;
      /** @description The group value; null for requests that never named an alias, model or provider */
      key: string | null;
    };
    UsageTotalsResponse: {
      /** @description Settled requests: every outcome except those still in flight */
      calls: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      /** @description Cost at catalog list prices, in USD */
      listCostUsd: number;
      /** @description Cost actually charged, in USD; zero for free providers */
      billedCostUsd: number;
    };
    ProvidersResponse: {
      /** @description Version of the active catalog the providers come from */
      catalogVersion: number;
      /** @description Length of the window `calls`, `errors` and `errorRate` cover */
      windowHours: number;
      providers: components['schemas']['ProviderResponse'][];
    };
    ProviderResponse: {
      /** @description Key of the provider in the catalog */
      key: string;
      kind: string;
      flavor?: string;
      /** @description Endpoint URL with any embedded credentials removed */
      url: string;
      locality: string;
      cost: string;
      features: string[];
      maxInflightPerReplica?: number;
      /** @description Whether the Config key naming the provider's API key holds a value. The value itself is never returned */
      apiKeyConfigured?: boolean;
      /** @description Requests this provider answered in the window, successfully or with an error. Refused and cancelled requests, and failovers to other providers, are not counted */
      calls: number;
      errors: number;
      /** @description errors / calls; absent when there were no calls */
      errorRate?: number;
    };
    AuthAccessResponse: {
      /**
       * @description Whether this application serves anyone without a session. 'private' means every page needs a signed-in user, so a client sends an anonymous visitor to login before rendering.
       * @enum {string}
       */
      mode: 'public' | 'private';
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
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  post_api_v1_chat_completions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ChatCompletionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChatCompletionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SynapseErrorResponse'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SynapseErrorResponse'];
        };
      };
    };
  };
  post_api_v1_embeddings: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['EmbeddingsBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['EmbeddingsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SynapseErrorResponse'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SynapseErrorResponse'];
        };
      };
    };
  };
  post_api_v1_images_generations: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ImageGenerationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ImageGenerationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SynapseErrorResponse'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SynapseErrorResponse'];
        };
      };
    };
  };
  get_api_v1_admin_access: {
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
          'application/json': components['schemas']['AdminAccessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_catalog: {
    parameters: {
      query?: {
        /** @description Task key `<app>.<name>`. Omit it to receive every task of the calling app */
        task?: string;
        /** @description Routing selectors as `key:value` pairs separated by commas, e.g. `tier:performant,content_mode:standard` */
        selectors?: string;
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
          'application/json': components['schemas']['CatalogResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_catalog_versions: {
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
          'application/json': components['schemas']['CatalogVersionListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_catalog_versions_version: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        version: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogVersionDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_catalog_draft: {
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
  put_api_v1_admin_catalog_draft: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaveDraftBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SaveDraftResponse'];
        };
      };
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponseDto'];
        };
      };
      /** @description Default Response */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogInvalidResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_catalog_draft_validate: {
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
          'application/json': components['schemas']['ValidateDraftResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_catalog_draft_diff: {
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
          'application/json': components['schemas']['DraftDiffResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_catalog_draft_publish: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogVersionSummaryResponse'];
        };
      };
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ErrorResponseDto'];
        };
      };
      /** @description Default Response */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogInvalidResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_catalog_versions_version_rollback: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        version: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogVersionSummaryResponse'];
        };
      };
      /** @description Default Response */
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogInvalidResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_catalog_aliases_key_impact: {
    parameters: {
      query?: {
        /** @description Model key the alias would be retargeted to; adds the list-price delta to the answer */
        model?: string;
      };
      header?: never;
      path: {
        key: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AliasImpactResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_usage: {
    parameters: {
      query?: {
        /** @description Start of the range, inclusive: an ISO date (UTC midnight) or a date-time with an offset. Defaults to 30 days before `to` */
        from?: string;
        /** @description End of the range, exclusive, in the same formats. Defaults to now. The range cannot exceed 400 days */
        to?: string;
        /** @description One of app, task, alias, model, provider, day. Defaults to app */
        groupBy?: string;
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
          'application/json': components['schemas']['UsageResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_providers: {
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
          'application/json': components['schemas']['ProvidersResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_auth_access: {
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
          'application/json': components['schemas']['AuthAccessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
}
export type ChatCompletionBody = components['schemas']['ChatCompletionBody'];
export type JsonObjectBody = components['schemas']['JsonObjectBody'];
export type SynapseEnvelopeBody = components['schemas']['SynapseEnvelopeBody'];
export type SubjectBody = components['schemas']['SubjectBody'];
export type SelectorsBody = components['schemas']['SelectorsBody'];
export type ChatCompletionResponse = components['schemas']['ChatCompletionResponse'];
export type ChatUsageResponse = components['schemas']['ChatUsageResponse'];
export type PromptTokensDetails = components['schemas']['PromptTokensDetails'];
export type CompletionTokensDetails = components['schemas']['CompletionTokensDetails'];
export type SynapseBlockResponse = components['schemas']['SynapseBlockResponse'];
export type SynapseCostResponse = components['schemas']['SynapseCostResponse'];
export type SynapseErrorResponse = components['schemas']['SynapseErrorResponse'];
export type SynapseErrorDetail = components['schemas']['SynapseErrorDetail'];
export type EmbeddingsBody = components['schemas']['EmbeddingsBody'];
export type EmbeddingsResponse = components['schemas']['EmbeddingsResponse'];
export type EmbeddingUsageResponse = components['schemas']['EmbeddingUsageResponse'];
export type ImageGenerationBody = components['schemas']['ImageGenerationBody'];
export type ImageGenerationResponse = components['schemas']['ImageGenerationResponse'];
export type GeneratedImageResponse = components['schemas']['GeneratedImageResponse'];
export type ImageUsageResponse = components['schemas']['ImageUsageResponse'];
export type AdminAccessResponse = components['schemas']['AdminAccessResponse'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type CatalogResponseDto = components['schemas']['CatalogResponseDto'];
export type CatalogModelView = components['schemas']['CatalogModelView'];
export type CatalogPriceView = components['schemas']['CatalogPriceView'];
export type CatalogCapabilitiesView = components['schemas']['CatalogCapabilitiesView'];
export type CatalogEmbeddingView = components['schemas']['CatalogEmbeddingView'];
export type CatalogAliasView = components['schemas']['CatalogAliasView'];
export type CatalogVersionListResponse = components['schemas']['CatalogVersionListResponse'];
export type CatalogVersionSummaryResponse = components['schemas']['CatalogVersionSummaryResponse'];
export type CatalogVersionDetailResponse = components['schemas']['CatalogVersionDetailResponse'];
export type DraftResponse = components['schemas']['DraftResponse'];
export type SaveDraftBody = components['schemas']['SaveDraftBody'];
export type SaveDraftResponse = components['schemas']['SaveDraftResponse'];
export type CatalogIssueResponse = components['schemas']['CatalogIssueResponse'];
export type ErrorResponseDto = components['schemas']['ErrorResponseDto'];
export type CatalogInvalidResponse = components['schemas']['CatalogInvalidResponse'];
export type ValidateDraftResponse = components['schemas']['ValidateDraftResponse'];
export type DraftDiffResponse = components['schemas']['DraftDiffResponse'];
export type PublishBody = components['schemas']['PublishBody'];
export type AliasImpactResponse = components['schemas']['AliasImpactResponse'];
export type AliasImpactRowResponse = components['schemas']['AliasImpactRowResponse'];
export type AliasRetargetResponse = components['schemas']['AliasRetargetResponse'];
export type UsageResponse = components['schemas']['UsageResponse'];
export type UsageRowResponse = components['schemas']['UsageRowResponse'];
export type UsageTotalsResponse = components['schemas']['UsageTotalsResponse'];
export type ProvidersResponse = components['schemas']['ProvidersResponse'];
export type ProviderResponse = components['schemas']['ProviderResponse'];
export type AuthAccessResponse = components['schemas']['AuthAccessResponse'];
export type AuthLogoutResponse = components['schemas']['AuthLogoutResponse'];
export type AuthSessionResponse = components['schemas']['AuthSessionResponse'];
export type AuthUserInfoResponse = components['schemas']['AuthUserInfoResponse'];
export type AuthOrganisationsResponse = components['schemas']['AuthOrganisationsResponse'];
export type AuthOrganisationItem = components['schemas']['AuthOrganisationItem'];
export type SwitchOrganisationBody = components['schemas']['SwitchOrganisationBody'];
export type SwitchOrganisationResponse = components['schemas']['SwitchOrganisationResponse'];
export type GetCatalogQueryParams = Exclude<paths['/api/v1/catalog']['get']['parameters']['query'], undefined>;
export type GetVersionPathParams = Exclude<paths['/api/v1/admin/catalog/versions/{version}']['get']['parameters']['path'], undefined>;
export type AliasImpactQueryParams = Exclude<paths['/api/v1/admin/catalog/aliases/{key}/impact']['get']['parameters']['query'], undefined>;
export type AliasImpactPathParams = Exclude<paths['/api/v1/admin/catalog/aliases/{key}/impact']['get']['parameters']['path'], undefined>;
export type GetUsageQueryParams = Exclude<paths['/api/v1/admin/usage']['get']['parameters']['query'], undefined>;
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
