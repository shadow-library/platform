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
    /** Discard Draft */
    delete: operations['delete_api_v1_admin_catalog_draft'];
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
  '/api/v1/admin/catalog/budgets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Publish Budgets */
    put: operations['put_api_v1_admin_catalog_budgets'];
    post?: never;
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
  '/api/v1/admin/usage/series': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Usage Series */
    get: operations['get_api_v1_admin_usage_series'];
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
  '/api/v1/admin/credentials': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Credentials */
    get: operations['get_api_v1_admin_credentials'];
    put?: never;
    /** Create Credential */
    post: operations['post_api_v1_admin_credentials'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/credentials/status/keyring': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Keyring Status */
    get: operations['get_api_v1_admin_credentials_status_keyring'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/credentials/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Credential */
    get: operations['get_api_v1_admin_credentials_id'];
    put?: never;
    post?: never;
    /** Revoke Credential */
    delete: operations['delete_api_v1_admin_credentials_id'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/credentials/{id}/secret': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Rotate Credential */
    put: operations['put_api_v1_admin_credentials_id_secret'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/credentials/{id}/test': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Test Credential */
    post: operations['post_api_v1_admin_credentials_id_test'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/budgets/status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Status */
    get: operations['get_api_v1_admin_budgets_status'];
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
      /** @description The catalog model the alias targets, as the `model` of a response it serves */
      model: string;
      price: components['schemas']['CatalogPriceView'];
      capabilities: components['schemas']['CatalogCapabilitiesView'];
      /** @enum {string} */
      state: 'active' | 'hidden' | 'retired';
      /** @description Whether the first eligible deployment of the alias's model is served by a provider with native web search */
      native_web_search: boolean;
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
    PublishBudgetsBody: {
      /** @description The complete budget list that replaces the active one. Validated with the whole catalog, so an invalid entry is refused with 422 and its issues */
      budgets: Record<string, never>[];
      /** @description Version of the active catalog the budgets were edited against; refused with 409 when another version has been published since */
      expectedVersion: number;
      /** @description Free-text note stored with the new version; defaults to "Budgets updated" */
      note?: string;
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
    UsageSeriesResponse: {
      /** Format: date-time */
      from: string;
      /** Format: date-time */
      to: string;
      groupBy: string;
      /** @description Every UTC calendar day (YYYY-MM-DD) touched by the half-open range, in order */
      days: string[];
      /** @description Ordered by list cost, highest first, then key; the null key last */
      series: components['schemas']['UsageSeriesEntryResponse'][];
      totals: components['schemas']['UsageTotalsResponse'];
    };
    UsageSeriesEntryResponse: {
      /** @description The group value; null for requests that never named an alias, model or provider */
      key: string | null;
      /** @description Exactly one point per entry of `days`, in the same order; days without requests are zero */
      points: components['schemas']['UsageSeriesPointResponse'][];
      totals: components['schemas']['UsageTotalsResponse'];
    };
    UsageSeriesPointResponse: {
      /** @description The UTC calendar day, YYYY-MM-DD */
      day: string;
      calls: number;
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
      /** @description Id of the stored credential the provider sends; see /api/v1/admin/credentials */
      credential?: string;
      /** @description Deprecated with apiKeyConfig: whether the Config key naming the provider's API key holds a value. The value itself is never returned */
      apiKeyConfigured?: boolean;
      /** @description Requests this provider answered in the window, successfully or with an error. Refused and cancelled requests, and failovers to other providers, are not counted */
      calls: number;
      errors: number;
      /** @description errors / calls; absent when there were no calls */
      errorRate?: number;
    };
    CredentialListResponse: {
      items: components['schemas']['CredentialResponse'][];
    };
    CredentialResponse: {
      /** @description Id a catalog provider names as `credential` */
      id: string;
      name: string;
      /** @description Normalised origin the key is bound to; a provider whose URL has another origin can neither publish nor call with it */
      allowedOrigin: string;
      /** @description At most a quarter of the secret: the first six and last four characters from 40 characters up, the last four from 16, else only `…` */
      hint: string;
      /** @description Starts at 1 and moves on every rotation */
      version: number;
      /** @description The keyring key that wraps the secret */
      kid?: string;
      /** @description Subject of the admin who created it, or `import` for the key imported from the environment */
      createdBy?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      rotatedAt?: string;
      /**
       * Format: date-time
       * @description Set once revoked; a revoked credential is never used again
       */
      revokedAt?: string;
      /** @description Keys of the providers in the published catalog that name this credential */
      referencedBy: string[];
    };
    CreateCredentialBody: {
      /** @description Unique, and kept by a revoked credential */
      name: string;
      /** @description The only origin the key is ever sent to: scheme, host and optional port, e.g. `https://openrouter.ai`. Stored normalised, with the host lowercased and a default port dropped; a path is refused */
      allowedOrigin: string;
      /** @description The provider API key. Write-only: it is sealed on receipt, and no response ever carries it */
      secret: string;
    };
    KeyringStatusResponse: {
      /** @description The key new secrets are sealed under; the background rewrap moves every row onto it */
      activeKeyId: string;
      /** @description A key can leave the keyring once its count is zero */
      keys: components['schemas']['KeyringKeyResponse'][];
    };
    KeyringKeyResponse: {
      kid: string;
      /** @description Stored credentials, revoked ones included, whose secret this key wraps */
      credentials: number;
      /** @description False means every replica refuses to become ready until the key is put back */
      inKeyring: boolean;
    };
    RotateCredentialBody: {
      /** @description The provider API key. Write-only: it is sealed on receipt, and no response ever carries it */
      secret: string;
    };
    CredentialTestResponse: {
      ok: boolean;
      /**
       * @description Why the test failed; the provider’s own response is never relayed
       * @enum {string}
       */
      code?:
        | 'revoked_api_key'
        | 'credential_unreadable'
        | 'invalid_api_key'
        | 'unauthorized'
        | 'rate_limited'
        | 'not_found'
        | 'redirected'
        | 'rejected'
        | 'upstream_error'
        | 'timeout'
        | 'connect';
    };
    /** @description The `CRED_IN_USE` error body: revoking is refused while the published catalog names the credential */
    CredentialInUseResponse: {
      code: string;
      message: string;
      /** @description Keys of the providers in the published catalog that still name the credential */
      referencedBy: string[];
    };
    BudgetStatusResponse: {
      /** @description Version of the active catalog the budgets come from */
      catalogVersion: number;
      budgets: components['schemas']['BudgetStatusEntryResponse'][];
    };
    BudgetStatusEntryResponse: {
      /** @description Position of the budget in the active catalog's budgets */
      index: number;
      app: string;
      /** @enum {string} */
      per: 'subject' | 'app';
      /** @enum {string} */
      window: '1h' | '1d' | '30d';
      maxCalls?: number;
      /** @description Limit on list-price cost in USD */
      maxListCostUsd?: number;
      /**
       * Format: date-time
       * @description Start of the current window. Windows are fixed UTC buckets counted from the epoch, so 30d is not a calendar month
       */
      windowStart: string;
      /**
       * Format: date-time
       * @description When the current window ends and its counters start again from zero
       */
      windowEnd: string;
      /** @description Usage in the current window, shaped by `kind`, which matches `per`. Budgets of one app, scope and window share their counters and each reports them against its own limits */
      usage: components['schemas']['AppBudgetUsageResponse'] | components['schemas']['SubjectBudgetUsageResponse'];
    };
    AppBudgetUsageResponse: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      kind: 'app';
      /** @description Calls admitted in the window, including any still in flight; zero when the app made none */
      calls: number;
      /** @description Cost at catalog list prices in USD, which budgets count: a free subscription call still adds to it */
      listCostUsd: number;
    };
    SubjectBudgetUsageResponse: {
      /**
       * @description discriminator enum property added by openapi-typescript
       * @enum {string}
       */
      kind: 'subject';
      /** @description Subjects with at least one call in the window */
      activeSubjects: number;
      /** @description Subjects whose next call this budget refuses: calls at maxCalls or cost at maxListCostUsd, whichever are set */
      atLimit: number;
      /** @description At most 10 subjects, by cost then calls, highest first */
      top: components['schemas']['BudgetSubjectCounterResponse'][];
    };
    BudgetSubjectCounterResponse: {
      /** @description owner, user or app */
      subjectType: string;
      /** @description The calling app's opaque id for the subject */
      subjectId: string;
      /** @description Calls admitted in the window, including any still in flight */
      calls: number;
      /** @description Cost at catalog list prices in USD, which budgets count: a free subscription call still adds to it */
      listCostUsd: number;
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
  delete_api_v1_admin_catalog_draft: {
    parameters: {
      query: {
        /** @description Fingerprint of the draft being discarded; the discard is refused with 409 when the draft has changed since */
        fingerprint: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
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
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  put_api_v1_admin_catalog_budgets: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishBudgetsBody'];
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
        /** @description Only count requests from this app, matched exactly. Combines with every groupBy and with `task` */
        app?: string;
        /** @description Only count requests for this task id, matched exactly. Combines with every groupBy and with `app` */
        task?: string;
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
  get_api_v1_admin_usage_series: {
    parameters: {
      query?: {
        /** @description Start of the range, inclusive: an ISO date (UTC midnight) or a date-time with an offset. Defaults to 30 days before `to` */
        from?: string;
        /** @description End of the range, exclusive, in the same formats. Defaults to now. The range cannot exceed 400 days */
        to?: string;
        /** @description Only count requests from this app, matched exactly. Combines with every groupBy and with `task` */
        app?: string;
        /** @description Only count requests for this task id, matched exactly. Combines with every groupBy and with `app` */
        task?: string;
        /** @description One of app, task, alias, model, provider. Defaults to app. Unlike the usage report, day is not a grouping: every series already has one point per day */
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
          'application/json': components['schemas']['UsageSeriesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
  get_api_v1_admin_credentials: {
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
          'application/json': components['schemas']['CredentialListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_credentials: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateCredentialBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CredentialResponse'];
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
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_credentials_status_keyring: {
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
          'application/json': components['schemas']['KeyringStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_credentials_id: {
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
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CredentialResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_credentials_id: {
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
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CredentialResponse'];
        };
      };
      /** @description Default Response */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CredentialInUseResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_admin_credentials_id_secret: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['RotateCredentialBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CredentialResponse'];
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
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_credentials_id_test: {
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
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CredentialTestResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_budgets_status: {
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
          'application/json': components['schemas']['BudgetStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
export type PublishBudgetsBody = components['schemas']['PublishBudgetsBody'];
export type AliasImpactResponse = components['schemas']['AliasImpactResponse'];
export type AliasImpactRowResponse = components['schemas']['AliasImpactRowResponse'];
export type AliasRetargetResponse = components['schemas']['AliasRetargetResponse'];
export type UsageResponse = components['schemas']['UsageResponse'];
export type UsageRowResponse = components['schemas']['UsageRowResponse'];
export type UsageTotalsResponse = components['schemas']['UsageTotalsResponse'];
export type UsageSeriesResponse = components['schemas']['UsageSeriesResponse'];
export type UsageSeriesEntryResponse = components['schemas']['UsageSeriesEntryResponse'];
export type UsageSeriesPointResponse = components['schemas']['UsageSeriesPointResponse'];
export type ProvidersResponse = components['schemas']['ProvidersResponse'];
export type ProviderResponse = components['schemas']['ProviderResponse'];
export type CredentialListResponse = components['schemas']['CredentialListResponse'];
export type CredentialResponse = components['schemas']['CredentialResponse'];
export type CreateCredentialBody = components['schemas']['CreateCredentialBody'];
export type KeyringStatusResponse = components['schemas']['KeyringStatusResponse'];
export type KeyringKeyResponse = components['schemas']['KeyringKeyResponse'];
export type RotateCredentialBody = components['schemas']['RotateCredentialBody'];
export type CredentialTestResponse = components['schemas']['CredentialTestResponse'];
export type CredentialInUseResponse = components['schemas']['CredentialInUseResponse'];
export type BudgetStatusResponse = components['schemas']['BudgetStatusResponse'];
export type BudgetStatusEntryResponse = components['schemas']['BudgetStatusEntryResponse'];
export type AppBudgetUsageResponse = components['schemas']['AppBudgetUsageResponse'];
export type SubjectBudgetUsageResponse = components['schemas']['SubjectBudgetUsageResponse'];
export type BudgetSubjectCounterResponse = components['schemas']['BudgetSubjectCounterResponse'];
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
export type GetUsageSeriesQueryParams = Exclude<paths['/api/v1/admin/usage/series']['get']['parameters']['query'], undefined>;
export type GetCredentialPathParams = Exclude<paths['/api/v1/admin/credentials/{id}']['get']['parameters']['path'], undefined>;
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
