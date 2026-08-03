export interface paths {
  '/api/v1/sender-profiles': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Sender Profiles */
    get: operations['get_api_v1_sender_profiles'];
    put?: never;
    /** Create Sender Profile */
    post: operations['post_api_v1_sender_profiles'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/sender-profiles/{profileId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Sender Profile */
    get: operations['get_api_v1_sender_profiles_profileId'];
    put?: never;
    post?: never;
    /** Delete Sender Profile */
    delete: operations['delete_api_v1_sender_profiles_profileId'];
    options?: never;
    head?: never;
    /** Update Sender Profile */
    patch: operations['patch_api_v1_sender_profiles_profileId'];
    trace?: never;
  };
  '/api/v1/sender-profiles/{profileId}/endpoints': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Sender Endpoints */
    get: operations['get_api_v1_sender_profiles_profileId_endpoints'];
    put?: never;
    /** Create Sender Endpoint */
    post: operations['post_api_v1_sender_profiles_profileId_endpoints'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/sender-profiles/{profileId}/endpoints/{endpointId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Sender Endpoint */
    get: operations['get_api_v1_sender_profiles_profileId_endpoints_endpointId'];
    put?: never;
    post?: never;
    /** Delete Sender Endpoint */
    delete: operations['delete_api_v1_sender_profiles_profileId_endpoints_endpointId'];
    options?: never;
    head?: never;
    /** Update Sender Endpoint */
    patch: operations['patch_api_v1_sender_profiles_profileId_endpoints_endpointId'];
    trace?: never;
  };
  '/api/v1/sender-routing-rules': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Sender Routing Rules */
    get: operations['get_api_v1_sender_routing_rules'];
    put?: never;
    /** Create Sender Routing Rule */
    post: operations['post_api_v1_sender_routing_rules'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/sender-routing-rules/{routingRuleId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Sender Routing Rule */
    get: operations['get_api_v1_sender_routing_rules_routingRuleId'];
    put?: never;
    post?: never;
    /** Delete Sender Routing Rule */
    delete: operations['delete_api_v1_sender_routing_rules_routingRuleId'];
    options?: never;
    head?: never;
    /** Update Sender Routing Rule */
    patch: operations['patch_api_v1_sender_routing_rules_routingRuleId'];
    trace?: never;
  };
  '/api/v1/notifications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create Notification */
    post: operations['post_api_v1_notifications'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/notifications/messages': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Messages */
    get: operations['get_api_v1_notifications_messages'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Templates */
    get: operations['get_api_v1_templates'];
    put?: never;
    /** Create Template */
    post: operations['post_api_v1_templates'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Template */
    get: operations['get_api_v1_templates_templateId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Template */
    patch: operations['patch_api_v1_templates_templateId'];
    trace?: never;
  };
  '/api/v1/templates/{templateId}/channels/{channel}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Set Channel */
    put: operations['put_api_v1_templates_templateId_channels_channel'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Versions */
    get: operations['get_api_v1_templates_templateId_versions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions/draft': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Open Draft */
    post: operations['post_api_v1_templates_templateId_versions_draft'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions/draft/contents': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Upsert Content */
    put: operations['put_api_v1_templates_templateId_versions_draft_contents'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions/draft/contents/{channel}/{locale}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Delete Content */
    delete: operations['delete_api_v1_templates_templateId_versions_draft_contents_channel_locale'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions/draft/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Publish Draft */
    post: operations['post_api_v1_templates_templateId_versions_draft_publish'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions/preview': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Preview */
    post: operations['post_api_v1_templates_templateId_versions_preview'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions/{version}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Version */
    get: operations['get_api_v1_templates_templateId_versions_version'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/templates/{templateId}/versions/{version}/rollback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Rollback */
    post: operations['post_api_v1_templates_templateId_versions_version_rollback'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/layouts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Layouts */
    get: operations['get_api_v1_layouts'];
    put?: never;
    /** Create Layout */
    post: operations['post_api_v1_layouts'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/layouts/{layoutId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Layout */
    get: operations['get_api_v1_layouts_layoutId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Layout */
    patch: operations['patch_api_v1_layouts_layoutId'];
    trace?: never;
  };
  '/api/v1/layouts/{layoutId}/draft': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Save Draft */
    put: operations['put_api_v1_layouts_layoutId_draft'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/layouts/{layoutId}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Publish Layout */
    post: operations['post_api_v1_layouts_layoutId_publish'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/partials': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Partials */
    get: operations['get_api_v1_partials'];
    put?: never;
    /** Create Partial */
    post: operations['post_api_v1_partials'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/partials/{partialId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Partial */
    get: operations['get_api_v1_partials_partialId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Partial */
    patch: operations['patch_api_v1_partials_partialId'];
    trace?: never;
  };
  '/api/v1/partials/{partialId}/draft': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Save Draft */
    put: operations['put_api_v1_partials_partialId_draft'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/partials/{partialId}/publish': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Publish Partial */
    post: operations['post_api_v1_partials_partialId_publish'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/dashboard/stats': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Stats */
    get: operations['get_api_v1_dashboard_stats'];
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
    CreateSenderProfileBody: {
      key: string;
      displayName?: string;
      isActive?: boolean;
    };
    SenderProfileResponse: {
      key: string;
      displayName?: string;
      id: string;
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
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
    /** @enum {string} */
    SortOrder: 'asc' | 'desc';
    /** @enum {string} */
    SortByTime: 'createdAt' | 'updatedAt';
    ListSenderProfileResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['SenderProfileResponse'][];
    };
    UpdateSenderProfileBody: {
      displayName?: string;
      isActive?: boolean;
    };
    CreateSenderEndpointBody: {
      channel: components['schemas']['NotificationChannel'];
      provider: components['schemas']['NotificationServiceProvider'];
      identifier: string;
      weight?: number;
      isActive?: boolean;
    };
    /** @enum {string} */
    NotificationChannel: 'EMAIL' | 'SMS' | 'PUSH';
    /** @enum {string} */
    NotificationServiceProvider: 'DEV' | 'SENDGRID' | 'TWILIO' | 'FIREBASE' | 'AWS_SES';
    SenderEndpointResponse: {
      channel: components['schemas']['NotificationChannel'];
      provider: components['schemas']['NotificationServiceProvider'];
      identifier: string;
      id: string;
      senderProfileId: string;
      weight: number;
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ListSenderEndpointResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['SenderEndpointResponse'][];
    };
    UpdateSenderEndpointBody: {
      identifier?: string;
      weight?: number;
      isActive?: boolean;
    };
    CreateRoutingRuleBody: {
      senderProfileId: string;
      messageType?: components['schemas']['MessageType'];
      region?: string;
      service?: string;
    };
    /** @enum {string} */
    MessageType: 'OTP' | 'TRANSACTIONAL' | 'PROMOTIONAL';
    SenderRoutingRuleResponse: {
      senderProfileId: string;
      id: string;
      messageType?: components['schemas']['MessageType'];
      region?: string;
      service?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ListSenderRoutingRuleResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['SenderRoutingRuleResponse'][];
    };
    SenderRoutingRuleDetailResponse: {
      senderProfileId: string;
      id: string;
      messageType?: components['schemas']['MessageType'];
      region?: string;
      service?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
      profile: components['schemas']['SenderProfileResponse'];
    };
    UpdateSenderRoutingRuleBody: {
      senderProfileId: string;
    };
    CreateNotificationBody: {
      templateKey: string;
      recipients: components['schemas']['NotificationRecipients'];
      payload?: Record<string, never>;
      locale?: string;
      service?: string;
    };
    NotificationRecipients: {
      email?: string;
      phone?: string;
      push?: string;
    };
    CreateNotificationResponse: {
      /** @enum {string} */
      status: 'ACCEPTED' | 'PARTIAL_ACCEPTED' | 'FAILED';
      channelResults: components['schemas']['NotificationChannelResponse'][];
    };
    NotificationChannelResponse: {
      channel: components['schemas']['NotificationChannel'];
      /** @enum {string} */
      status: 'QUEUED' | 'FAILED';
      locale?: string;
      jobId?: string;
      error?: components['schemas']['ErrorResponseDto'];
    };
    ErrorResponseDto: {
      code: string;
      message: string;
      fields?: components['schemas']['ErrorFieldDto'][];
    };
    /** @enum {string} */
    SortByCreatedAt: 'createdAt';
    ListNotificationMessagesResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['NotificationMessageResponse'][];
    };
    NotificationMessageResponse: {
      id: string;
      channel: components['schemas']['NotificationChannel'];
      recipient: string;
      locale: string;
      renderedSubject?: string;
      renderedBody: string;
      payload?: {
        [key: string]: unknown;
      };
      templateKey: string;
      messageType: components['schemas']['MessageType'];
      /** Format: date-time */
      createdAt: string;
    };
    CreateTemplateBody: {
      templateKey: string;
      name: string;
      messageType: components['schemas']['MessageType'];
      priority?: components['schemas']['Priority'];
      description?: string;
      category?: string;
      variableSchema?: {
        [key: string]: unknown;
      };
      isActive?: boolean;
    };
    /** @enum {string} */
    Priority: 'LOW' | 'MEDIUM' | 'HIGH';
    TemplateResponse: {
      templateKey: string;
      name: string;
      messageType: components['schemas']['MessageType'];
      description?: string;
      category?: string;
      id: string;
      priority: components['schemas']['Priority'];
      variableSchema: {
        [key: string]: unknown;
      };
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    ListTemplateResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['TemplateResponse'][];
    };
    TemplateDetailResponse: {
      templateKey: string;
      name: string;
      messageType: components['schemas']['MessageType'];
      description?: string;
      category?: string;
      id: string;
      priority: components['schemas']['Priority'];
      variableSchema: {
        [key: string]: unknown;
      };
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
      channels: components['schemas']['ChannelSettingResponse'][];
    };
    ChannelSettingResponse: {
      templateId: string;
      channel: components['schemas']['NotificationChannel'];
      isEnabled: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    UpdateTemplateBody: {
      name?: string;
      messageType?: components['schemas']['MessageType'];
      priority?: components['schemas']['Priority'];
      description?: string;
      category?: string;
      variableSchema?: {
        [key: string]: unknown;
      };
      isActive?: boolean;
    };
    SetChannelSettingBody: {
      isEnabled: boolean;
    };
    VersionListResponse: {
      items: components['schemas']['VersionResponse'][];
    };
    VersionResponse: {
      version: number;
      status: components['schemas']['VersionStatus'];
      notes?: string;
      editedBy?: string;
      /** Format: date-time */
      publishedAt?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    VersionStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    UpsertContentBody: {
      channel: components['schemas']['NotificationChannel'];
      locale?: string;
      subject?: string;
      body: string;
      layoutKey?: string;
    };
    ContentResponse: {
      channel: components['schemas']['NotificationChannel'];
      locale: string;
      subject?: string;
      body: string;
      layoutKey?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    PublishVersionBody: {
      notes?: string;
    };
    PreviewBody: {
      channel: components['schemas']['NotificationChannel'];
      locale?: string;
      data?: {
        [key: string]: unknown;
      };
    };
    PreviewResponse: {
      subject?: string;
      body: string;
    };
    VersionDetailResponse: {
      version: number;
      status: components['schemas']['VersionStatus'];
      notes?: string;
      editedBy?: string;
      /** Format: date-time */
      publishedAt?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
      contents: components['schemas']['ContentResponse'][];
    };
    CreateLayoutBody: {
      layoutKey: string;
      name: string;
      description?: string;
      isActive?: boolean;
    };
    LayoutResponse: {
      layoutKey: string;
      name: string;
      description?: string;
      id: string;
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    LayoutListResponse: {
      items: components['schemas']['LayoutResponse'][];
    };
    LayoutDetailResponse: {
      layoutKey: string;
      name: string;
      description?: string;
      id: string;
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
      versions: components['schemas']['LayoutVersionResponse'][];
    };
    LayoutVersionResponse: {
      version: number;
      status: components['schemas']['VersionStatus'];
      body: string;
      notes?: string;
      editedBy?: string;
      /** Format: date-time */
      publishedAt?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    UpdateLayoutBody: {
      name?: string;
      description?: string;
      isActive?: boolean;
    };
    SaveLayoutDraftBody: {
      body: string;
      notes?: string;
    };
    PublishLayoutBody: {
      notes?: string;
    };
    CreatePartialBody: {
      partialKey: string;
      name: string;
      description?: string;
      isActive?: boolean;
    };
    PartialResponse: {
      partialKey: string;
      name: string;
      description?: string;
      id: string;
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    PartialListResponse: {
      items: components['schemas']['PartialResponse'][];
    };
    PartialDetailResponse: {
      partialKey: string;
      name: string;
      description?: string;
      id: string;
      isActive: boolean;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
      versions: components['schemas']['PartialVersionResponse'][];
    };
    PartialVersionResponse: {
      version: number;
      status: components['schemas']['VersionStatus'];
      body: string;
      notes?: string;
      editedBy?: string;
      /** Format: date-time */
      publishedAt?: string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    UpdatePartialBody: {
      name?: string;
      description?: string;
      isActive?: boolean;
    };
    SavePartialDraftBody: {
      body: string;
      notes?: string;
    };
    PublishPartialBody: {
      notes?: string;
    };
    DashboardStats: {
      today: components['schemas']['NotificationStats'];
      trend: components['schemas']['NotificationStatsTrend'];
    };
    NotificationStats: {
      /** Format: date */
      date: string;
      overall: components['schemas']['NotificationDeliveryStats'];
      channels: components['schemas']['NotificationChannelStats'];
    };
    NotificationDeliveryStats: {
      total: number;
      succeeded: number;
      failed: number;
      pending: number;
    };
    NotificationChannelStats: {
      email: components['schemas']['NotificationDeliveryStats'];
      sms: components['schemas']['NotificationDeliveryStats'];
      push: components['schemas']['NotificationDeliveryStats'];
    };
    NotificationStatsTrend: {
      /** Format: date */
      fromDate: string;
      /** Format: date */
      toDate: string;
      stats: components['schemas']['NotificationStatsWithDate'][];
    };
    NotificationStatsWithDate: {
      total: number;
      succeeded: number;
      failed: number;
      pending: number;
      /** Format: date */
      date: string;
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
  get_api_v1_sender_profiles: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        key?: string;
        isActive?: boolean | string;
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
          'application/json': components['schemas']['ListSenderProfileResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_sender_profiles: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSenderProfileBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderProfileResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_sender_profiles_profileId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profileId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderProfileResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_sender_profiles_profileId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profileId: string;
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
  patch_api_v1_sender_profiles_profileId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profileId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateSenderProfileBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderProfileResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_sender_profiles_profileId_endpoints: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        channel?: components['schemas']['NotificationChannel'];
        provider?: components['schemas']['NotificationServiceProvider'];
        isActive?: boolean | string;
      };
      header?: never;
      path: {
        profileId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ListSenderEndpointResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_sender_profiles_profileId_endpoints: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profileId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateSenderEndpointBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderEndpointResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_sender_profiles_profileId_endpoints_endpointId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profileId: string;
        endpointId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderEndpointResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_sender_profiles_profileId_endpoints_endpointId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profileId: string;
        endpointId: string;
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
  patch_api_v1_sender_profiles_profileId_endpoints_endpointId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        profileId: string;
        endpointId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateSenderEndpointBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderEndpointResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_sender_routing_rules: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        messageType?: components['schemas']['MessageType'];
        region?: string;
        serviceName?: string;
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
          'application/json': components['schemas']['ListSenderRoutingRuleResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_sender_routing_rules: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateRoutingRuleBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderRoutingRuleResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_sender_routing_rules_routingRuleId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routingRuleId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderRoutingRuleDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_sender_routing_rules_routingRuleId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routingRuleId: string;
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
  patch_api_v1_sender_routing_rules_routingRuleId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        routingRuleId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateSenderRoutingRuleBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SenderRoutingRuleResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_notifications: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateNotificationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreateNotificationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_notifications_messages: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByCreatedAt'];
        channel?: components['schemas']['NotificationChannel'];
        recipient?: string;
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
          'application/json': components['schemas']['ListNotificationMessagesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_templates: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['SortByTime'];
        key?: string;
        messageType?: components['schemas']['MessageType'];
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
          'application/json': components['schemas']['ListTemplateResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_templates: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateTemplateBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TemplateResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_templates_templateId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TemplateDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_templates_templateId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateTemplateBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TemplateResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_templates_templateId_channels_channel: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
        channel: components['schemas']['NotificationChannel'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SetChannelSettingBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChannelSettingResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_templates_templateId_versions: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VersionListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_templates_templateId_versions_draft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
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
          'application/json': components['schemas']['VersionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_templates_templateId_versions_draft_contents: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpsertContentBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContentResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_templates_templateId_versions_draft_contents_channel_locale: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
        channel: components['schemas']['NotificationChannel'];
        locale: string;
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
  post_api_v1_templates_templateId_versions_draft_publish: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishVersionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VersionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_templates_templateId_versions_preview: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PreviewBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PreviewResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_templates_templateId_versions_version: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
        version: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VersionDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_templates_templateId_versions_version_rollback: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        templateId: string;
        version: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishVersionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['VersionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_layouts: {
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
          'application/json': components['schemas']['LayoutListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_layouts: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreateLayoutBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LayoutResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_layouts_layoutId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        layoutId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LayoutDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_layouts_layoutId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        layoutId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdateLayoutBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LayoutResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_layouts_layoutId_draft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        layoutId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SaveLayoutDraftBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LayoutVersionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_layouts_layoutId_publish: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        layoutId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishLayoutBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LayoutVersionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_partials: {
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
          'application/json': components['schemas']['PartialListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_partials: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['CreatePartialBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PartialResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_partials_partialId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        partialId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PartialDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_partials_partialId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        partialId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['UpdatePartialBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PartialResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_partials_partialId_draft: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        partialId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SavePartialDraftBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PartialVersionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_partials_partialId_publish: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        partialId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['PublishPartialBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['PartialVersionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_dashboard_stats: {
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
          'application/json': components['schemas']['DashboardStats'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
export type CreateSenderProfileBody = components['schemas']['CreateSenderProfileBody'];
export type SenderProfileResponse = components['schemas']['SenderProfileResponse'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type SortOrder = components['schemas']['SortOrder'];
export type SortByTime = components['schemas']['SortByTime'];
export type ListSenderProfileResponse = components['schemas']['ListSenderProfileResponse'];
export type UpdateSenderProfileBody = components['schemas']['UpdateSenderProfileBody'];
export type CreateSenderEndpointBody = components['schemas']['CreateSenderEndpointBody'];
export type NotificationChannel = components['schemas']['NotificationChannel'];
export type NotificationServiceProvider = components['schemas']['NotificationServiceProvider'];
export type SenderEndpointResponse = components['schemas']['SenderEndpointResponse'];
export type ListSenderEndpointResponse = components['schemas']['ListSenderEndpointResponse'];
export type UpdateSenderEndpointBody = components['schemas']['UpdateSenderEndpointBody'];
export type CreateRoutingRuleBody = components['schemas']['CreateRoutingRuleBody'];
export type MessageType = components['schemas']['MessageType'];
export type SenderRoutingRuleResponse = components['schemas']['SenderRoutingRuleResponse'];
export type ListSenderRoutingRuleResponse = components['schemas']['ListSenderRoutingRuleResponse'];
export type SenderRoutingRuleDetailResponse = components['schemas']['SenderRoutingRuleDetailResponse'];
export type UpdateSenderRoutingRuleBody = components['schemas']['UpdateSenderRoutingRuleBody'];
export type CreateNotificationBody = components['schemas']['CreateNotificationBody'];
export type NotificationRecipients = components['schemas']['NotificationRecipients'];
export type CreateNotificationResponse = components['schemas']['CreateNotificationResponse'];
export type NotificationChannelResponse = components['schemas']['NotificationChannelResponse'];
export type ErrorResponseDto = components['schemas']['ErrorResponseDto'];
export type SortByCreatedAt = components['schemas']['SortByCreatedAt'];
export type ListNotificationMessagesResponse = components['schemas']['ListNotificationMessagesResponse'];
export type NotificationMessageResponse = components['schemas']['NotificationMessageResponse'];
export type CreateTemplateBody = components['schemas']['CreateTemplateBody'];
export type Priority = components['schemas']['Priority'];
export type TemplateResponse = components['schemas']['TemplateResponse'];
export type ListTemplateResponse = components['schemas']['ListTemplateResponse'];
export type TemplateDetailResponse = components['schemas']['TemplateDetailResponse'];
export type ChannelSettingResponse = components['schemas']['ChannelSettingResponse'];
export type UpdateTemplateBody = components['schemas']['UpdateTemplateBody'];
export type SetChannelSettingBody = components['schemas']['SetChannelSettingBody'];
export type VersionListResponse = components['schemas']['VersionListResponse'];
export type VersionResponse = components['schemas']['VersionResponse'];
export type VersionStatus = components['schemas']['VersionStatus'];
export type UpsertContentBody = components['schemas']['UpsertContentBody'];
export type ContentResponse = components['schemas']['ContentResponse'];
export type PublishVersionBody = components['schemas']['PublishVersionBody'];
export type PreviewBody = components['schemas']['PreviewBody'];
export type PreviewResponse = components['schemas']['PreviewResponse'];
export type VersionDetailResponse = components['schemas']['VersionDetailResponse'];
export type CreateLayoutBody = components['schemas']['CreateLayoutBody'];
export type LayoutResponse = components['schemas']['LayoutResponse'];
export type LayoutListResponse = components['schemas']['LayoutListResponse'];
export type LayoutDetailResponse = components['schemas']['LayoutDetailResponse'];
export type LayoutVersionResponse = components['schemas']['LayoutVersionResponse'];
export type UpdateLayoutBody = components['schemas']['UpdateLayoutBody'];
export type SaveLayoutDraftBody = components['schemas']['SaveLayoutDraftBody'];
export type PublishLayoutBody = components['schemas']['PublishLayoutBody'];
export type CreatePartialBody = components['schemas']['CreatePartialBody'];
export type PartialResponse = components['schemas']['PartialResponse'];
export type PartialListResponse = components['schemas']['PartialListResponse'];
export type PartialDetailResponse = components['schemas']['PartialDetailResponse'];
export type PartialVersionResponse = components['schemas']['PartialVersionResponse'];
export type UpdatePartialBody = components['schemas']['UpdatePartialBody'];
export type SavePartialDraftBody = components['schemas']['SavePartialDraftBody'];
export type PublishPartialBody = components['schemas']['PublishPartialBody'];
export type DashboardStats = components['schemas']['DashboardStats'];
export type NotificationStats = components['schemas']['NotificationStats'];
export type NotificationDeliveryStats = components['schemas']['NotificationDeliveryStats'];
export type NotificationChannelStats = components['schemas']['NotificationChannelStats'];
export type NotificationStatsTrend = components['schemas']['NotificationStatsTrend'];
export type NotificationStatsWithDate = components['schemas']['NotificationStatsWithDate'];
export type AuthLogoutResponse = components['schemas']['AuthLogoutResponse'];
export type AuthSessionResponse = components['schemas']['AuthSessionResponse'];
export type AuthUserInfoResponse = components['schemas']['AuthUserInfoResponse'];
export type AuthOrganisationsResponse = components['schemas']['AuthOrganisationsResponse'];
export type AuthOrganisationItem = components['schemas']['AuthOrganisationItem'];
export type SwitchOrganisationBody = components['schemas']['SwitchOrganisationBody'];
export type SwitchOrganisationResponse = components['schemas']['SwitchOrganisationResponse'];
export type ListSenderProfilesQueryParams = Exclude<paths['/api/v1/sender-profiles']['get']['parameters']['query'], undefined>;
export type GetSenderProfilePathParams = Exclude<paths['/api/v1/sender-profiles/{profileId}']['get']['parameters']['path'], undefined>;
export type ListSenderEndpointsQueryParams = Exclude<paths['/api/v1/sender-profiles/{profileId}/endpoints']['get']['parameters']['query'], undefined>;
export type ListSenderEndpointsPathParams = Exclude<paths['/api/v1/sender-profiles/{profileId}/endpoints']['get']['parameters']['path'], undefined>;
export type GetSenderEndpointPathParams = Exclude<paths['/api/v1/sender-profiles/{profileId}/endpoints/{endpointId}']['get']['parameters']['path'], undefined>;
export type ListSenderRoutingRulesQueryParams = Exclude<paths['/api/v1/sender-routing-rules']['get']['parameters']['query'], undefined>;
export type GetSenderRoutingRulePathParams = Exclude<paths['/api/v1/sender-routing-rules/{routingRuleId}']['get']['parameters']['path'], undefined>;
export type ListMessagesQueryParams = Exclude<paths['/api/v1/notifications/messages']['get']['parameters']['query'], undefined>;
export type ListTemplatesQueryParams = Exclude<paths['/api/v1/templates']['get']['parameters']['query'], undefined>;
export type GetTemplatePathParams = Exclude<paths['/api/v1/templates/{templateId}']['get']['parameters']['path'], undefined>;
export type ListVersionsPathParams = Exclude<paths['/api/v1/templates/{templateId}/versions']['get']['parameters']['path'], undefined>;
export type GetVersionPathParams = Exclude<paths['/api/v1/templates/{templateId}/versions/{version}']['get']['parameters']['path'], undefined>;
export type GetLayoutPathParams = Exclude<paths['/api/v1/layouts/{layoutId}']['get']['parameters']['path'], undefined>;
export type GetPartialPathParams = Exclude<paths['/api/v1/partials/{partialId}']['get']['parameters']['path'], undefined>;
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
