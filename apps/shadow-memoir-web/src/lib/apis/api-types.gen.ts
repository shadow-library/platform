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
  '/api/v1/sync/commands': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Submit Commands */
    post: operations['post_api_v1_sync_commands'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/sync/delta': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Pull Delta */
    get: operations['get_api_v1_sync_delta'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/account/devices/{deviceId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Register */
    put: operations['put_api_v1_account_devices_deviceId'];
    post?: never;
    /** Deregister */
    delete: operations['delete_api_v1_account_devices_deviceId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/account': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get */
    get: operations['get_api_v1_account'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Patch */
    patch: operations['patch_api_v1_account'];
    trace?: never;
  };
  '/api/v1/account/onboarding': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Onboard */
    post: operations['post_api_v1_account_onboarding'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ocr/parse': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Parse */
    post: operations['post_api_v1_ocr_parse'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/ocr/quota': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Quota */
    get: operations['get_api_v1_ocr_quota'];
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
    SyncCommandBatchDto: {
      /** @description Outbox entries in the order the user performed them; the server applies them strictly in this order, each in its own transaction */
      commands: components['schemas']['CommandEnvelopeDto'][];
    };
    CommandEnvelopeDto: {
      /** @description Client-minted UUIDv7 for this action; resending it replays the recorded outcome instead of re-executing */
      commandId: string;
      /** @description Domain command name; must be one the server has a registered handler for */
      type: string;
      /**
       * @description Command-specific body, validated by the handler for this type
       * @default {}
       */
      payload: {
        [key: string]: unknown;
      };
      /** @description Claimed instant of the action for offline commands; clamped server-side and never trusted as authoritative */
      performedAt?: string;
      /** @description The action's user-local calendar date in the account's timezone */
      localDate: string;
      /** @description Registered device this command was minted on */
      deviceId?: string;
    };
    SyncCommandBatchResponseDto: {
      /** @description One outcome per command applied; a batch cut short by a failure returns fewer outcomes than it received commands */
      outcomes: components['schemas']['SyncCommandOutcomeDto'][];
    };
    SyncCommandOutcomeDto: {
      commandId: string;
      /** @description 'applied' | 'rejected' | 'superseded' from the handler, or 'failed' when the command's transaction rolled back and it must be resent */
      status: string;
      /** @description The handler result, replayed verbatim on resend; entity_ref → id mappings for offline-created entities live here (§12.4) */
      result: {
        [key: string]: unknown;
      };
      /** @description True when this outcome was read back from command_log rather than produced by running the handler again */
      replayed: boolean;
      error?: components['schemas']['SyncCommandErrorDto'];
    };
    SyncCommandErrorDto: {
      code: string;
      message: string;
    };
    SyncDeltaResponseDto: {
      /** @description Cursor to send as `since` on the next pull; it lags the newest change slightly so late-committing rows are re-served */
      cursor: string;
      /** @description True while a keyset domain still has rows past this page — pull again immediately rather than waiting for the next sync tick */
      hasMore: boolean;
      /** @description Rows per domain, keyed by domain name; each row is upserted by primary key, so redelivery is harmless */
      domains: {
        [key: string]: unknown;
      };
      /** @description Rows deleted since the cursor, to be removed from the local store */
      tombstones: components['schemas']['SyncTombstoneDto'][];
    };
    SyncTombstoneDto: {
      /** @description The domain the deleted row belonged to */
      domain: string;
      /** @description Primary key of the deleted row, stringified */
      recordId: string;
      syncSeq: string;
    };
    DeviceUpsertDto: {
      /** @description User agent as the device reports it, for the account owner to tell their own devices apart */
      userAgent?: string;
      /** @description Web Push subscription for this device; omit to leave any stored subscription untouched */
      pushSubscription?: {
        [key: string]: unknown;
      };
      /**
       * @description Whether this device wants push notifications at all
       * @default false
       */
      pushOptIn: boolean;
      /** @description Per-device reminder preferences, layered over the account-level notification prefs */
      reminderPrefs?: {
        [key: string]: unknown;
      };
    };
    DeviceResponseDto: {
      id: string;
      userAgent?: null | string;
      pushOptIn: boolean;
      pushSubscription?: null | {
        [key: string]: unknown;
      };
      reminderPrefs?: null | {
        [key: string]: unknown;
      };
      /** Format: date-time */
      lastSeenAt?: null | string;
      /** @description The delta cursor this device last acknowledged */
      lastSyncSeq?: null | string;
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    AccountResponseDto: {
      id: string;
      email?: null | string;
      displayName?: null | string;
      photoUrl?: null | string;
      authProvider: components['schemas']['AuthProvider'];
      /** @description ISO 4217 currency code; immutable once onboarding completes */
      defaultCurrency: string;
      enabledCurrencies: string[];
      /** @description IANA timezone; the day-boundary authority for this account */
      timezone: string;
      /** @description Staged by PATCH, not yet live; takes effect at the next daily rollover */
      pendingTimezone?: null | string;
      scheduleStartMin: number;
      scheduleEndMin: number;
      theme: components['schemas']['Theme'];
      weekStart: number;
      intensityMode: components['schemas']['IntensityMode'];
      /** @description Staged by PATCH, not yet live; takes effect at the next daily rollover */
      pendingIntensityMode?: components['schemas']['IntensityMode'] | null;
      returnerThresholdDays: number;
      notificationPrefs: components['schemas']['NotificationPrefsDto'];
      /**
       * Format: date-time
       * @description Null routes the client back into the forced-essentials onboarding flow
       */
      onboardingCompletedAt?: null | string;
      level: number;
      totalXp: string;
      coins: number;
      statDiscipline: number;
      statBody: number;
      statWealth: number;
      statMind: number;
      hpToday: number;
      hpStartToday: number;
      hpMax: number;
      /** Format: date */
      lastHpDate?: null | string;
      /** Format: date */
      lastActiveDate?: null | string;
      capacityBaseline?: null | number;
      warmthState: components['schemas']['WarmthState'];
      /** Format: date */
      crownPeriodStart?: null | string;
      crownRemaining?: null | number;
      crownCoinsRemaining?: null | number;
      displayedTitleId?: null | string;
      featureFlags: {
        [key: string]: unknown;
      };
      /** Format: date */
      ocrQuotaDate?: null | string;
      ocrQuotaCount: number;
      deletionState: components['schemas']['DeletionState'];
      /** Format: date-time */
      createdAt: string;
      /** Format: date-time */
      updatedAt: string;
    };
    /** @enum {string} */
    AuthProvider: 'google' | 'apple';
    /** @enum {string} */
    Theme: 'system' | 'light' | 'dark';
    /** @enum {string} */
    IntensityMode: 'standard' | 'low_intensity' | 'high_intensity';
    NotificationPrefsDto: {
      /** @description Weekly-review digest email (Sunday, day/time configurable in a later phase) */
      weeklyDigest: boolean;
      /** @description AI-result-readiness email (Phase 2) */
      aiReadiness: boolean;
      /** @description Subscription billing-reminder email */
      billingReminders: boolean;
    };
    /** @enum {string} */
    WarmthState: 'cold' | 'steady' | 'warm';
    /** @enum {string} */
    DeletionState: 'none' | 'pending' | 'blobs_deleted' | 'data_deleted' | 'identity_closed' | 'done';
    AccountPatchDto: {
      authProvider?: string;
      defaultCurrency?: string;
      createdAt?: string;
      updatedAt?: string;
      /** @description Staged, not applied immediately — see `pendingTimezone` on the GET response */
      timezone?: string;
      scheduleStartMin?: number;
      scheduleEndMin?: number;
      theme?: components['schemas']['Theme'];
      weekStart?: number;
      /** @description Staged, not applied immediately — see `pendingIntensityMode` on the GET response */
      intensityMode?: components['schemas']['IntensityMode'];
      returnerThresholdDays?: number;
      notificationPrefs?: components['schemas']['NotificationPrefsPatchDto'];
    };
    NotificationPrefsPatchDto: {
      weeklyDigest?: boolean;
      aiReadiness?: boolean;
      billingReminders?: boolean;
    };
    OnboardingDto: {
      defaultCurrency: string;
      /** @description Additional enabled currencies beyond defaultCurrency, which is always included */
      enabledCurrencies?: string[];
      /** @description IANA timezone */
      timezone: string;
      scheduleStartMin: number;
      scheduleEndMin: number;
    };
    OcrParseDto: {
      /** @description On-device-extracted receipt text (ARCHITECTURE §14.3 step 1); the server never sees the receipt image itself */
      extractedText: string;
    };
    OcrParseResponseDto: {
      amount: string;
      merchant?: null | string;
      category?: null | string;
      /** Format: date */
      date?: null | string;
      confidence: number;
      /** @description Present only when the structuring call resolved individual line items; the client still offers full/total-only/mix at confirm time */
      lineItems?: null | components['schemas']['OcrLineItemDto'][];
    };
    OcrLineItemDto: {
      label: string;
      amountText?: null | string;
      amountMinor?: null | number;
    };
    OcrQuotaResponseDto: {
      /** @description Daily scan cap (quotas.ocr-daily, tunable) */
      cap: number;
      /** @description Scans consumed so far for the account's current local day */
      used: number;
      remaining: number;
      /**
       * Format: date-time
       * @description Next local midnight in the account timezone — when the count resets
       */
      resetAt: string;
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
  post_api_v1_sync_commands: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['SyncCommandBatchDto'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SyncCommandBatchResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_sync_delta: {
    parameters: {
      query?: {
        /** @description The cursor from the previous pull; 0 requests a full initial sync */
        since?: string;
        /** @description Comma-separated domain names to restrict the pull to; every registered domain is returned when omitted */
        domains?: string;
        /** @description Rows per keyset domain in this page; defaults to the server page size */
        limit?: number | string;
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
          'application/json': components['schemas']['SyncDeltaResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_account_devices_deviceId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Client-minted UUID identifying this installation; the client keeps it across sessions */
        deviceId: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['DeviceUpsertDto'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DeviceResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_account_devices_deviceId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Client-minted UUID identifying this installation; the client keeps it across sessions */
        deviceId: string;
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
  get_api_v1_account: {
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
          'application/json': components['schemas']['AccountResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_account: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['AccountPatchDto'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AccountResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_account_onboarding: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['OnboardingDto'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AccountResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_ocr_parse: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['OcrParseDto'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OcrParseResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_ocr_quota: {
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
          'application/json': components['schemas']['OcrQuotaResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
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
export type SyncCommandBatchDto = components['schemas']['SyncCommandBatchDto'];
export type CommandEnvelopeDto = components['schemas']['CommandEnvelopeDto'];
export type SyncCommandBatchResponseDto = components['schemas']['SyncCommandBatchResponseDto'];
export type SyncCommandOutcomeDto = components['schemas']['SyncCommandOutcomeDto'];
export type SyncCommandErrorDto = components['schemas']['SyncCommandErrorDto'];
export type SyncDeltaResponseDto = components['schemas']['SyncDeltaResponseDto'];
export type SyncTombstoneDto = components['schemas']['SyncTombstoneDto'];
export type DeviceUpsertDto = components['schemas']['DeviceUpsertDto'];
export type DeviceResponseDto = components['schemas']['DeviceResponseDto'];
export type AccountResponseDto = components['schemas']['AccountResponseDto'];
export type AuthProvider = components['schemas']['AuthProvider'];
export type Theme = components['schemas']['Theme'];
export type IntensityMode = components['schemas']['IntensityMode'];
export type NotificationPrefsDto = components['schemas']['NotificationPrefsDto'];
export type WarmthState = components['schemas']['WarmthState'];
export type DeletionState = components['schemas']['DeletionState'];
export type AccountPatchDto = components['schemas']['AccountPatchDto'];
export type NotificationPrefsPatchDto = components['schemas']['NotificationPrefsPatchDto'];
export type OnboardingDto = components['schemas']['OnboardingDto'];
export type OcrParseDto = components['schemas']['OcrParseDto'];
export type OcrParseResponseDto = components['schemas']['OcrParseResponseDto'];
export type OcrLineItemDto = components['schemas']['OcrLineItemDto'];
export type OcrQuotaResponseDto = components['schemas']['OcrQuotaResponseDto'];
export type LoginQueryParams = Exclude<paths['/api/auth/login']['get']['parameters']['query'], undefined>;
export type CallbackQueryParams = Exclude<paths['/api/auth/callback']['get']['parameters']['query'], undefined>;
export type StepUpQueryParams = Exclude<paths['/api/auth/step-up']['get']['parameters']['query'], undefined>;
export type PullDeltaQueryParams = Exclude<paths['/api/v1/sync/delta']['get']['parameters']['query'], undefined>;
