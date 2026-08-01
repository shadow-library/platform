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
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Health */
    get: operations['get_health'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health/ready': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Ready */
    get: operations['get_health_ready'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Upsert Novel */
    put: operations['put_internal_novels_slug'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}/chapters/{ordinal}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Upsert Chapter */
    put: operations['put_internal_novels_slug_chapters_ordinal'];
    post?: never;
    /** Unpublish Chapter */
    delete: operations['delete_internal_novels_slug_chapters_ordinal'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/internal/novels/{slug}/manifest': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Manifest */
    get: operations['get_internal_novels_slug_manifest'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Novels */
    get: operations['get_api_novels'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Novel */
    get: operations['get_api_novels_slug'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/chapters': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Chapters */
    get: operations['get_api_novels_slug_chapters'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/chapters/{ordinal}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Chapter */
    get: operations['get_api_novels_slug_chapters_ordinal'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/me/progress': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Progress */
    get: operations['get_api_me_progress'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/novels/{slug}/progress': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Progress */
    get: operations['get_api_novels_slug_progress'];
    /** Save Progress */
    put: operations['put_api_novels_slug_progress'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/library': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Library */
    get: operations['get_api_library'];
    put?: never;
    /** Add To Library */
    post: operations['post_api_library'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/library/{slug}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove From Library */
    delete: operations['delete_api_library_slug'];
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
    HealthResponse: {
      /** @enum {string} */
      status: 'ok';
    };
    ReadyResponse: {
      /** @enum {string} */
      status: 'ok' | 'degraded';
      dependencies: components['schemas']['HealthDependencies'];
    };
    HealthDependencies: {
      /** @enum {string} */
      postgres: 'up' | 'down';
    };
    NovelUpsertBody: {
      title: string;
      blurb?: string;
      coverPath?: string;
      genres?: string[];
      /** @enum {string} */
      status?: 'live' | 'retired';
      revision: number;
    };
    PublishResultResponse: {
      slug: string;
      /** @enum {string} */
      outcome: 'applied';
      revision: number;
    };
    ChapterUpsertBody: {
      title: string;
      content: string;
      authorNote?: string;
      contentHash: string;
      revision: number;
      wordCount?: number;
      publishedAt?: string;
    };
    ManifestItem: components['schemas']['ManifestItem1'][];
    ManifestItem1: {
      ordinal: number;
      contentHash: string;
      revision: number;
    };
    /** @enum {string} */
    SortOrder: 'asc' | 'desc';
    /** @enum {string} */
    NovelSortBy: 'updatedAt' | 'createdAt' | 'title';
    NovelCatalogResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['NovelSummary'][];
    };
    NovelSummary: {
      slug: string;
      title: string;
      blurb?: string;
      coverPath?: string;
      genres: string[];
      /** @enum {string} */
      status: 'live' | 'retired';
      chapterCount: number;
      updatedAt: string;
    };
    NovelDetailResponse: {
      slug: string;
      title: string;
      blurb?: string;
      coverPath?: string;
      genres: string[];
      /** @enum {string} */
      status: 'live' | 'retired';
      chapterCount: number;
      updatedAt: string;
      createdAt: string;
    };
    ChapterListResponse: {
      items: components['schemas']['ChapterMetaItem'][];
    };
    ChapterMetaItem: {
      ordinal: number;
      title: string;
      wordCount?: number;
      publishedAt?: string;
    };
    ChapterContentResponse: {
      novelSlug: string;
      ordinal: number;
      title: string;
      content: string;
      authorNote?: string;
      wordCount?: number;
      revision: number;
      publishedAt?: string;
    };
    ProgressListResponse: {
      items: components['schemas']['ProgressListItem'][];
    };
    ProgressListItem: {
      ordinal: number;
      position: number;
      updatedAt: string;
      novelSlug: string;
    };
    ProgressResponse: {
      ordinal: number;
      position: number;
      updatedAt: string;
    };
    ProgressBody: {
      ordinal: number;
      position: number;
    };
    LibraryListResponse: {
      items: components['schemas']['LibraryItem'][];
    };
    LibraryItem: {
      slug: string;
      title: string;
      coverPath?: string;
      genres: string[];
      /** @enum {string} */
      status: 'live' | 'retired';
      addedAt: string;
    };
    LibraryAddBody: {
      slug: string;
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
  get_health: {
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
          'application/json': components['schemas']['HealthResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_health_ready: {
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
          'application/json': components['schemas']['ReadyResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_internal_novels_slug: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['NovelUpsertBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublishResultResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_internal_novels_slug_chapters_ordinal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        ordinal: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ChapterUpsertBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PublishResultResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_internal_novels_slug_chapters_ordinal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        ordinal: string;
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
  get_internal_novels_slug_manifest: {
    parameters: {
      query?: never;
      header?: never;
      path: {
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
          'application/json': components['schemas']['ManifestItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_novels: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['NovelSortBy'];
        search?: string;
        genre?: string;
        status?: 'live' | 'retired';
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
          'application/json': components['schemas']['NovelCatalogResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_novels_slug: {
    parameters: {
      query?: never;
      header?: never;
      path: {
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
          'application/json': components['schemas']['NovelDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_novels_slug_chapters: {
    parameters: {
      query?: never;
      header?: never;
      path: {
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
          'application/json': components['schemas']['ChapterListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_novels_slug_chapters_ordinal: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
        ordinal: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChapterContentResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_me_progress: {
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
          'application/json': components['schemas']['ProgressListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_novels_slug_progress: {
    parameters: {
      query?: never;
      header?: never;
      path: {
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
  put_api_novels_slug_progress: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['ProgressBody'];
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
  get_api_library: {
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
          'application/json': components['schemas']['LibraryListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_library: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['LibraryAddBody'];
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
  delete_api_library_slug: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        slug: string;
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
}
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type AuthLogoutResponse = components['schemas']['AuthLogoutResponse'];
export type AuthSessionResponse = components['schemas']['AuthSessionResponse'];
export type AuthOrganisationsResponse = components['schemas']['AuthOrganisationsResponse'];
export type AuthOrganisationItem = components['schemas']['AuthOrganisationItem'];
export type SwitchOrganisationBody = components['schemas']['SwitchOrganisationBody'];
export type SwitchOrganisationResponse = components['schemas']['SwitchOrganisationResponse'];
export type HealthResponse = components['schemas']['HealthResponse'];
export type ReadyResponse = components['schemas']['ReadyResponse'];
export type HealthDependencies = components['schemas']['HealthDependencies'];
export type NovelUpsertBody = components['schemas']['NovelUpsertBody'];
export type PublishResultResponse = components['schemas']['PublishResultResponse'];
export type ChapterUpsertBody = components['schemas']['ChapterUpsertBody'];
export type ManifestItem = components['schemas']['ManifestItem'];
export type ManifestItem1 = components['schemas']['ManifestItem1'];
export type SortOrder = components['schemas']['SortOrder'];
export type NovelSortBy = components['schemas']['NovelSortBy'];
export type NovelCatalogResponse = components['schemas']['NovelCatalogResponse'];
export type NovelSummary = components['schemas']['NovelSummary'];
export type NovelDetailResponse = components['schemas']['NovelDetailResponse'];
export type ChapterListResponse = components['schemas']['ChapterListResponse'];
export type ChapterMetaItem = components['schemas']['ChapterMetaItem'];
export type ChapterContentResponse = components['schemas']['ChapterContentResponse'];
export type ProgressListResponse = components['schemas']['ProgressListResponse'];
export type ProgressListItem = components['schemas']['ProgressListItem'];
export type ProgressResponse = components['schemas']['ProgressResponse'];
export type ProgressBody = components['schemas']['ProgressBody'];
export type LibraryListResponse = components['schemas']['LibraryListResponse'];
export type LibraryItem = components['schemas']['LibraryItem'];
export type LibraryAddBody = components['schemas']['LibraryAddBody'];
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
export type GetManifestPathParams = Exclude<paths['/internal/novels/{slug}/manifest']['get']['parameters']['path'], undefined>;
export type ListNovelsQueryParams = Exclude<paths['/api/novels']['get']['parameters']['query'], undefined>;
export type GetNovelPathParams = Exclude<paths['/api/novels/{slug}']['get']['parameters']['path'], undefined>;
export type ListChaptersPathParams = Exclude<paths['/api/novels/{slug}/chapters']['get']['parameters']['path'], undefined>;
export type GetChapterPathParams = Exclude<paths['/api/novels/{slug}/chapters/{ordinal}']['get']['parameters']['path'], undefined>;
export type GetProgressPathParams = Exclude<paths['/api/novels/{slug}/progress']['get']['parameters']['path'], undefined>;
