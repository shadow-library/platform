export interface paths {
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Health */
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
    /** Get Readiness */
    get: operations['get_health_ready'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/.well-known/jwks.json': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Jwks */
    get: operations['get_well_known_jwks_json'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/.well-known/openid-configuration': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Openid Configuration */
    get: operations['get_well_known_openid_configuration'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/oauth2/authorize': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Authorize */
    get: operations['get_oauth2_authorize'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/oauth2/token': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Exchange Token */
    post: operations['post_oauth2_token'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/oauth2/userinfo': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get User Info */
    get: operations['get_oauth2_userinfo'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/oauth2/revoke': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Revoke Token */
    post: operations['post_oauth2_revoke'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/oauth2/introspect': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Introspect Token */
    post: operations['post_oauth2_introspect'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/consent': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Consent Prompt */
    get: operations['get_api_v1_auth_consent'];
    put?: never;
    /** Submit Consent Decision */
    post: operations['post_api_v1_auth_consent'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/consents': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List My Consents */
    get: operations['get_api_v1_me_consents'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/consents/{clientId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Revoke My Consent */
    delete: operations['delete_api_v1_me_consents_clientId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Current User */
    get: operations['get_api_v1_me'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/profile': {
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
    /** Update Current User Profile */
    patch: operations['patch_api_v1_me_profile'];
    trace?: never;
  };
  '/api/v1/me/applications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List My Applications */
    get: operations['get_api_v1_me_applications'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create Organisation */
    post: operations['post_api_v1_organisations'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Organisation Details */
    get: operations['get_api_v1_organisations_organisationId'];
    put?: never;
    post?: never;
    /** Delete Organisation */
    delete: operations['delete_api_v1_organisations_organisationId'];
    options?: never;
    head?: never;
    /** Rename Organisation */
    patch: operations['patch_api_v1_organisations_organisationId'];
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/members': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Organisation Members */
    get: operations['get_api_v1_organisations_organisationId_members'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/members/{userId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove Organisation Member */
    delete: operations['delete_api_v1_organisations_organisationId_members_userId'];
    options?: never;
    head?: never;
    /** Change Organisation Member Role */
    patch: operations['patch_api_v1_organisations_organisationId_members_userId'];
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/invitations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Organisation Invitations */
    get: operations['get_api_v1_organisations_organisationId_invitations'];
    put?: never;
    /** Invite Organisation Member */
    post: operations['post_api_v1_organisations_organisationId_invitations'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/invitations/{invitationId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Revoke Organisation Invitation */
    delete: operations['delete_api_v1_organisations_organisationId_invitations_invitationId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/organisations': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List My Organisations */
    get: operations['get_api_v1_me_organisations'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/organisations/{organisationId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Leave Organisation */
    delete: operations['delete_api_v1_me_organisations_organisationId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/invitations/accept': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Accept Organisation Invitation */
    post: operations['post_api_v1_me_invitations_accept'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/invitations/decline': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Decline Organisation Invitation */
    post: operations['post_api_v1_me_invitations_decline'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/domains': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Domains */
    get: operations['get_api_v1_organisations_organisationId_domains'];
    put?: never;
    /** Register Domain */
    post: operations['post_api_v1_organisations_organisationId_domains'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/domains/{domainId}/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Verify Domain */
    post: operations['post_api_v1_organisations_organisationId_domains_domainId_verify'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/domains/{domainId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove Domain */
    delete: operations['delete_api_v1_organisations_organisationId_domains_domainId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authz/check': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Check Access */
    post: operations['post_api_v1_authz_check'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authz/catalog': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /** Sync Catalog */
    put: operations['put_api_v1_authz_catalog'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/authz/service-access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Service Access */
    get: operations['get_api_v1_authz_service_access'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/saml2/metadata': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Saml Metadata */
    get: operations['get_saml2_metadata'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/saml2/sso': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Handle Saml Sso */
    get: operations['get_saml2_sso'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/saml2/sso/resume': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Resume Saml Sso */
    get: operations['get_saml2_sso_resume'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/login/init': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Login Init */
    post: operations['post_api_v1_auth_login_init'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/register/init': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Register Init */
    post: operations['post_api_v1_auth_register_init'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/register/demographics': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Register Demographics */
    post: operations['post_api_v1_auth_register_demographics'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/register/profile': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Register Profile */
    post: operations['post_api_v1_auth_register_profile'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/register/password': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Register Password */
    post: operations['post_api_v1_auth_register_password'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/recover/init': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Recover Init */
    post: operations['post_api_v1_auth_recover_init'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/recover/reset': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Recover Reset */
    post: operations['post_api_v1_auth_recover_reset'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/challenge/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Challenge Verify */
    post: operations['post_api_v1_auth_challenge_verify'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/challenge/methods': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Challenge Methods */
    get: operations['get_api_v1_auth_challenge_methods'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/challenge/change': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Challenge Change */
    post: operations['post_api_v1_auth_challenge_change'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/challenge/resend': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Challenge Resend */
    post: operations['post_api_v1_auth_challenge_resend'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/cancel': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Cancel Flow */
    post: operations['post_api_v1_auth_cancel'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/signout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Signout */
    post: operations['post_api_v1_auth_signout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/webauthn/options': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Webauthn Options */
    post: operations['post_api_v1_auth_webauthn_options'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List My Sessions */
    get: operations['get_api_v1_me_sessions'];
    put?: never;
    post?: never;
    /** Revoke My Other Sessions */
    delete: operations['delete_api_v1_me_sessions'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Revoke My Session */
    delete: operations['delete_api_v1_me_sessions_sessionId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/auth/federated/callback': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Handle Federated Callback */
    get: operations['get_api_v1_auth_federated_callback'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/mfa': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Mfa Enrollments */
    get: operations['get_api_v1_me_mfa'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/mfa/totp/enroll': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Enroll Totp */
    post: operations['post_api_v1_me_mfa_totp_enroll'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/mfa/totp/activate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Activate Totp */
    post: operations['post_api_v1_me_mfa_totp_activate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/mfa/recovery-codes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Regenerate Recovery Codes */
    post: operations['post_api_v1_me_mfa_recovery_codes'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/mfa/totp': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Disable Totp */
    delete: operations['delete_api_v1_me_mfa_totp'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/mfa/step-up': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Step Up */
    post: operations['post_api_v1_me_mfa_step_up'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/webauthn/register/options': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Get Webauthn Registration Options */
    post: operations['post_api_v1_me_webauthn_register_options'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/webauthn/register/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Verify Webauthn Registration */
    post: operations['post_api_v1_me_webauthn_register_verify'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/webauthn/{credentialId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove Webauthn Credential */
    delete: operations['delete_api_v1_me_webauthn_credentialId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/identity-providers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Identity Providers */
    get: operations['get_api_v1_organisations_organisationId_identity_providers'];
    put?: never;
    /** Create Identity Provider */
    post: operations['post_api_v1_organisations_organisationId_identity_providers'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/organisations/{organisationId}/identity-providers/{identityProviderId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove Identity Provider */
    delete: operations['delete_api_v1_organisations_organisationId_identity_providers_identityProviderId'];
    options?: never;
    head?: never;
    /** Update Identity Provider */
    patch: operations['patch_api_v1_organisations_organisationId_identity_providers_identityProviderId'];
    trace?: never;
  };
  '/api/v1/me/emails': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Emails */
    get: operations['get_api_v1_me_emails'];
    put?: never;
    /** Add Email */
    post: operations['post_api_v1_me_emails'];
    /** Remove Email */
    delete: operations['delete_api_v1_me_emails'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/emails/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Verify Email */
    post: operations['post_api_v1_me_emails_verify'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/emails/primary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Set Primary Email */
    post: operations['post_api_v1_me_emails_primary'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/phones': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Phones */
    get: operations['get_api_v1_me_phones'];
    put?: never;
    /** Add Phone */
    post: operations['post_api_v1_me_phones'];
    /** Remove Phone */
    delete: operations['delete_api_v1_me_phones'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/phones/verify': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Verify Phone */
    post: operations['post_api_v1_me_phones_verify'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/me/phones/primary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Set Primary Phone */
    post: operations['post_api_v1_me_phones_primary'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/context': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Admin Context */
    get: operations['get_api_v1_admin_context'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Search Users */
    get: operations['get_api_v1_admin_users'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get User Detail */
    get: operations['get_api_v1_admin_users_userId'];
    put?: never;
    post?: never;
    /** Delete User */
    delete: operations['delete_api_v1_admin_users_userId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}/lock': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Lock User */
    post: operations['post_api_v1_admin_users_userId_lock'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}/unlock': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Unlock User */
    post: operations['post_api_v1_admin_users_userId_unlock'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}/force-password-reset': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Force User Password Reset */
    post: operations['post_api_v1_admin_users_userId_force_password_reset'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}/sessions/terminate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Terminate User Sessions */
    post: operations['post_api_v1_admin_users_userId_sessions_terminate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}/deactivate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Deactivate User */
    post: operations['post_api_v1_admin_users_userId_deactivate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}/reactivate': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Reactivate User */
    post: operations['post_api_v1_admin_users_userId_reactivate'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/users/{userId}/audit': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get User Audit Trail */
    get: operations['get_api_v1_admin_users_userId_audit'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/applications': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Applications */
    get: operations['get_api_v1_admin_applications'];
    put?: never;
    /** Create Application */
    post: operations['post_api_v1_admin_applications'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/applications/{applicationId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Application Details */
    get: operations['get_api_v1_admin_applications_applicationId'];
    put?: never;
    post?: never;
    /** Delete Application */
    delete: operations['delete_api_v1_admin_applications_applicationId'];
    options?: never;
    head?: never;
    /** Update Application */
    patch: operations['patch_api_v1_admin_applications_applicationId'];
    trace?: never;
  };
  '/api/v1/admin/applications/{applicationId}/members': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Application Members */
    get: operations['get_api_v1_admin_applications_applicationId_members'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/applications/{applicationId}/members/{userId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Remove Application Member */
    delete: operations['delete_api_v1_admin_applications_applicationId_members_userId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/clients': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Clients */
    get: operations['get_api_v1_admin_clients'];
    put?: never;
    /** Register Client */
    post: operations['post_api_v1_admin_clients'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/clients/{clientId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Client Details */
    get: operations['get_api_v1_admin_clients_clientId'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /** Update Client */
    patch: operations['patch_api_v1_admin_clients_clientId'];
    trace?: never;
  };
  '/api/v1/admin/clients/{clientId}/rotate-secret': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Rotate Client Secret */
    post: operations['post_api_v1_admin_clients_clientId_rotate_secret'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/clients/{clientId}/scopes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Grant Client Scope */
    post: operations['post_api_v1_admin_clients_clientId_scopes'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/clients/{clientId}/scopes/{scopeId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Revoke Client Scope */
    delete: operations['delete_api_v1_admin_clients_clientId_scopes_scopeId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/resources': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Resources */
    get: operations['get_api_v1_admin_resources'];
    put?: never;
    /** Create Resource */
    post: operations['post_api_v1_admin_resources'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/resources/{resourceId}/scopes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Create Resource Scope */
    post: operations['post_api_v1_admin_resources_resourceId_scopes'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/permissions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Application Permissions */
    get: operations['get_api_v1_admin_permissions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/role-assignments': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Role Assignments */
    get: operations['get_api_v1_admin_role_assignments'];
    put?: never;
    /** Assign Role */
    post: operations['post_api_v1_admin_role_assignments'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/role-assignments/revoke': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Revoke Role Assignment */
    post: operations['post_api_v1_admin_role_assignments_revoke'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/saml/service-providers': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Saml Service Providers */
    get: operations['get_api_v1_admin_saml_service_providers'];
    put?: never;
    /** Create Saml Service Provider */
    post: operations['post_api_v1_admin_saml_service_providers'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/saml/service-providers/{serviceProviderId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Saml Service Provider */
    get: operations['get_api_v1_admin_saml_service_providers_serviceProviderId'];
    put?: never;
    post?: never;
    /** Delete Saml Service Provider */
    delete: operations['delete_api_v1_admin_saml_service_providers_serviceProviderId'];
    options?: never;
    head?: never;
    /** Update Saml Service Provider */
    patch: operations['patch_api_v1_admin_saml_service_providers_serviceProviderId'];
    trace?: never;
  };
  '/api/v1/admin/service-access': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Service Access Rules */
    get: operations['get_api_v1_admin_service_access'];
    put?: never;
    /** Create Service Access Rule */
    post: operations['post_api_v1_admin_service_access'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/service-access/{ruleId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /** Delete Service Access Rule */
    delete: operations['delete_api_v1_admin_service_access_ruleId'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/webhooks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Webhooks */
    get: operations['get_api_v1_admin_webhooks'];
    put?: never;
    /** Create Webhook */
    post: operations['post_api_v1_admin_webhooks'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/webhooks/{webhookId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Webhook */
    get: operations['get_api_v1_admin_webhooks_webhookId'];
    put?: never;
    post?: never;
    /** Delete Webhook */
    delete: operations['delete_api_v1_admin_webhooks_webhookId'];
    options?: never;
    head?: never;
    /** Update Webhook */
    patch: operations['patch_api_v1_admin_webhooks_webhookId'];
    trace?: never;
  };
  '/api/v1/admin/webhooks/{webhookId}/rotate-secret': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Rotate Webhook Secret */
    post: operations['post_api_v1_admin_webhooks_webhookId_rotate_secret'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/webhooks/{webhookId}/deliveries': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Webhook Deliveries */
    get: operations['get_api_v1_admin_webhooks_webhookId_deliveries'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/api/v1/admin/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /** Redeliver Webhook Delivery */
    post: operations['post_api_v1_admin_webhooks_webhookId_deliveries_deliveryId_redeliver'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/scim/v2/Users': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Users */
    get: operations['get_scim_v2_Users'];
    put?: never;
    /** Create User */
    post: operations['post_scim_v2_Users'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/scim/v2/Users/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get User */
    get: operations['get_scim_v2_Users_id'];
    /** Replace User */
    put: operations['put_scim_v2_Users_id'];
    post?: never;
    /** Delete User */
    delete: operations['delete_scim_v2_Users_id'];
    options?: never;
    head?: never;
    /** Patch User */
    patch: operations['patch_scim_v2_Users_id'];
    trace?: never;
  };
  '/scim/v2/Groups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** List Groups */
    get: operations['get_scim_v2_Groups'];
    put?: never;
    /** Create Group */
    post: operations['post_scim_v2_Groups'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/scim/v2/Groups/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Get Group */
    get: operations['get_scim_v2_Groups_id'];
    /** Replace Group */
    put: operations['put_scim_v2_Groups_id'];
    post?: never;
    /** Delete Group */
    delete: operations['delete_scim_v2_Groups_id'];
    options?: never;
    head?: never;
    /** Patch Group */
    patch: operations['patch_scim_v2_Groups_id'];
    trace?: never;
  };
  '/scim/v2/ServiceProviderConfig': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Service Provider Config */
    get: operations['get_scim_v2_ServiceProviderConfig'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/scim/v2/ResourceTypes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Resource Types */
    get: operations['get_scim_v2_ResourceTypes'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/scim/v2/Schemas': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /** Schemas */
    get: operations['get_scim_v2_Schemas'];
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
    HealthResponse: {
      /** @enum {string} */
      status: 'ok' | 'degraded';
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
    ReadinessResponse: {
      /** @enum {string} */
      status: 'ok' | 'degraded';
      dependencies: components['schemas']['ReadinessDependencies'];
    };
    ReadinessDependencies: {
      /** @enum {string} */
      postgres: 'up' | 'down';
      /** @enum {string} */
      redis: 'up' | 'down';
    };
    JwksResponse: {
      keys: components['schemas']['JwkDto'][];
    };
    JwkDto: {
      kty: string;
      crv: string;
      x: string;
      kid: string;
      use: string;
      alg: string;
    };
    DiscoveryResponse: {
      issuer: string;
      authorization_endpoint: string;
      token_endpoint: string;
      userinfo_endpoint: string;
      jwks_uri: string;
      response_types_supported: string[];
      grant_types_supported: string[];
      subject_types_supported: string[];
      id_token_signing_alg_values_supported: string[];
      code_challenge_methods_supported: string[];
      backchannel_logout_supported: boolean;
      backchannel_logout_session_supported: boolean;
    };
    TokenRequestBody: {
      grant_type: string;
      code?: string;
      redirect_uri?: string;
      code_verifier?: string;
      refresh_token?: string;
      scope?: string;
      resource?: string;
      client_id?: string;
      client_secret?: string;
      client_assertion_type?: string;
      client_assertion?: string;
    };
    TokenResponse: {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
      id_token?: string;
      refresh_token?: string;
    };
    UserInfoResponse: {
      sub: string;
      email?: string;
      email_verified?: boolean;
    };
    TokenActionBody: {
      token: string;
      client_id?: string;
      client_secret?: string;
    };
    RevocationResponse: {
      revoked: boolean;
    };
    IntrospectionResponseDto: {
      active: boolean;
      sub?: string;
      scope?: string;
      aud?: string;
      exp?: number;
      client_id?: string;
      token_type?: string;
    };
    ConsentPromptResponse: {
      clientName: string;
      isFirstParty: boolean;
      alreadyGranted: boolean;
      scopes: components['schemas']['ConsentScopeDto'][];
    };
    ConsentScopeDto: {
      name: string;
      description?: string;
      isSensitive: boolean;
    };
    ConsentDecisionBody: {
      clientId: string;
      scopeNames: string[];
      /** @enum {string} */
      decision: 'APPROVE' | 'DENY';
      redirectUri?: string;
      state?: string;
    };
    ConsentDecisionResponse: {
      /** @enum {string} */
      decision: 'APPROVE' | 'DENY';
      redirectTo?: string;
    };
    ConsentRecordsResponse: {
      items: components['schemas']['ConsentRecordDto'][];
    };
    ConsentRecordDto: {
      clientId: string;
      clientName: string;
      /** User-facing name of the application the client belongs to — what the connected-apps surface shows. */
      applicationName: string;
      scopeNames: string[];
      /** @enum {string} */
      source: 'USER' | 'FIRST_PARTY_POLICY' | 'ADMIN';
      grantedAt: string;
    };
    ConsentOperationResponse: {
      success: boolean;
    };
    MeResponse: {
      userId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      /** @enum {string} */
      aal: 'AAL1' | 'AAL2';
      elevated: boolean;
      elevatedUntil?: string;
    };
    UpdateProfileBody: {
      firstName?: string;
      lastName?: string;
    };
    MyApplicationsResponse: {
      applications: components['schemas']['MyApplicationItem'][];
    };
    MyApplicationItem: {
      id: number;
      name: string;
      displayName?: string;
      subDomain: string;
      isActive: boolean;
      firstUsedAt: string;
      lastUsedAt: string;
    };
    CreateOrganisationBody: {
      name: string;
      slug?: string;
    };
    OrganisationResponse: {
      id: string;
      slug: string;
      name: string;
      /** @enum {string} */
      type: 'PERSONAL' | 'TEAM';
      /** @enum {string} */
      status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
      createdAt: string;
    };
    RenameOrganisationBody: {
      name: string;
    };
    OrganisationActionResponse: {
      success: boolean;
    };
    MembersResponse: {
      members: components['schemas']['MemberItem'][];
    };
    MemberItem: {
      userId: string;
      /** @enum {string} */
      role: 'OWNER' | 'ADMIN' | 'MEMBER';
      email?: string;
      joinedAt: string;
    };
    UpdateMemberRoleBody: {
      /** @enum {string} */
      role: 'OWNER' | 'ADMIN' | 'MEMBER';
    };
    InvitationsResponse: {
      invitations: components['schemas']['InvitationItem'][];
    };
    InvitationItem: {
      id: string;
      email: string;
      /** @enum {string} */
      role: 'OWNER' | 'ADMIN' | 'MEMBER';
      expiresAt: string;
      createdAt: string;
    };
    InviteMemberBody: {
      email: string;
      /** @enum {string} */
      role: 'ADMIN' | 'MEMBER';
    };
    MyOrganisationsResponse: {
      organisations: components['schemas']['MyOrganisationItem'][];
    };
    MyOrganisationItem: {
      id: string;
      slug: string;
      name: string;
      /** @enum {string} */
      type: 'PERSONAL' | 'TEAM';
      /** @enum {string} */
      status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
      /** @enum {string} */
      role: 'OWNER' | 'ADMIN' | 'MEMBER';
      isDefault: boolean;
      joinedAt: string;
    };
    InvitationTokenBody: {
      token: string;
    };
    DomainsResponse: {
      domains: components['schemas']['DomainItem'][];
    };
    DomainItem: {
      id: string;
      domain: string;
      /** @enum {string} */
      status: 'PENDING' | 'VERIFIED' | 'FAILED';
      txtRecordName: string;
      txtRecordValue: string;
      verifiedAt?: string;
      lastCheckedAt?: string;
      lastCheckError?: string;
    };
    RegisterDomainBody: {
      domain: string;
    };
    CheckRequestBody: {
      /** @enum {string} */
      principalType: 'USER' | 'SERVICE_ACCOUNT';
      principalId: string;
      organisationId: string;
      action: string;
    };
    CheckResponse: {
      /** @enum {string} */
      decision: 'PERMIT' | 'DENY';
      reasons: string[];
      authzVersion: number;
    };
    CatalogSyncBody: {
      permissions: components['schemas']['CatalogPermission'][];
      roles: components['schemas']['CatalogRole'][];
    };
    CatalogPermission: {
      name: string;
      description?: string;
    };
    CatalogRole: {
      name: string;
      description?: string;
      permissions: string[];
    };
    CatalogSyncResponse: {
      permissionsUpserted: number;
      permissionsDeleted: number;
      rolesUpserted: number;
      rolesDeleted: number;
      principalsInvalidated: number;
    };
    ServiceAccessResponse: {
      rules: components['schemas']['ServiceAccessRuleDto'][];
    };
    ServiceAccessRuleDto: {
      callerClientId: string;
      method: string;
      path: string;
    };
    LoginInitBody: {
      identifier: string;
      deviceId?: string;
      returnTo?: string;
    };
    LoginInitResponse: {
      flowId: string;
      status: string;
      hasAlternativeMethods: boolean;
      federated?: components['schemas']['FederatedLoginOptionDto'];
    };
    FederatedLoginOptionDto: {
      authorizationUrl: string;
      enforced: boolean;
    };
    RegisterInitBody: {
      email: string;
      deviceId?: string;
    };
    FlowStatusResponse: {
      flowId: string;
      status: string;
      resendsLeft?: number;
      metadata?: components['schemas']['ChallengeMethodMetadata'];
    };
    ChallengeMethodMetadata: {
      maskedEmail?: string;
      maskedPhone?: string;
    };
    DemographicsBody: {
      flowId: string;
      dateOfBirth?: string;
      /** @enum {string} */
      gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
    };
    ProfileBody: {
      flowId: string;
      firstName: string;
      lastName: string;
    };
    SetPasswordBody: {
      flowId: string;
      password: string;
    };
    ChallengeVerifyResponse: {
      flowId: string;
      status: string;
      attemptsLeft?: number;
    };
    RecoverInitBody: {
      identifier: string;
      deviceId?: string;
    };
    ResetPasswordBody: {
      flowId: string;
      newPassword: string;
    };
    ChallengeVerifyBody: {
      flowId: string;
      password?: string;
      code?: string;
      recoveryCode?: string;
      webauthn?: components['schemas']['WebauthnAssertion'];
    };
    WebauthnAssertion: {
      id: string;
      rawId: string;
      /** @enum {string} */
      type: 'public-key';
      response: components['schemas']['WebauthnAssertionData'];
      authenticatorAttachment?: string;
    };
    WebauthnAssertionData: {
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    };
    ChallengeMethodsResponse: {
      flowId: string;
      methods: components['schemas']['ChallengeMethod'][];
    };
    ChallengeMethod: {
      /** @enum {string} */
      name: 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP';
      metadata?: components['schemas']['ChallengeMethodMetadata'];
    };
    ChallengeChangeBody: {
      flowId: string;
      /** @enum {string} */
      method: 'PASSWORD' | 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP';
    };
    ChallengeResendBody: {
      flowId: string;
      /** @enum {string} */
      method: 'EMAIL_OTP' | 'SMS_OTP';
    };
    ChallengeResendResponse: {
      /** @enum {string} */
      status: 'SENT' | 'LIMITED';
      resendsLeft?: number;
      retryAfterSeconds?: number;
    };
    CancelFlowBody: {
      flowId: string;
    };
    WebauthnOptionsBody: {
      flowId?: string;
      deviceId?: string;
    };
    WebauthnChallengeResponse: {
      flowId: string;
      options: components['schemas']['WebauthnAuthenticationOptions'];
    };
    WebauthnAuthenticationOptions: {
      challenge: string;
      timeout?: number;
      rpId?: string;
      allowCredentials?: components['schemas']['WebauthnCredentialDescriptor'][];
      userVerification?: string;
    };
    WebauthnCredentialDescriptor: {
      id: string;
      type: string;
      transports?: string[];
    };
    MeSessionsResponse: {
      sessions: components['schemas']['MeSessionItem'][];
    };
    MeSessionItem: {
      id: string;
      /** @enum {string} */
      aal: 'AAL1' | 'AAL2';
      createdAt: string;
      lastUsedAt: string;
      ipAddress?: string;
      ipCountry?: string;
      userAgent?: string;
      deviceName?: string;
      isCurrent: boolean;
    };
    SessionsRevokedResponse: {
      revoked: number;
    };
    MfaEnrollmentsResponse: {
      enrollments: components['schemas']['MfaEnrollmentItem'][];
      recoveryCodesRemaining: number;
    };
    MfaEnrollmentItem: {
      /** @enum {string} */
      type: 'TOTP' | 'WEBAUTHN' | 'EMAIL_OTP';
      label: string;
      createdAt: string;
      lastUsedAt?: string;
      credentialId?: string;
    };
    TotpEnrollResponse: {
      secret: string;
      uri: string;
    };
    TotpCodeBody: {
      code: string;
    };
    TotpActivateResponse: {
      success: boolean;
      recoveryCodes?: string[];
    };
    RecoveryCodesResponse: {
      recoveryCodes: string[];
    };
    OperationSuccessResponse: {
      success: boolean;
    };
    StepUpResponse: {
      /** @enum {string} */
      aal: 'AAL1' | 'AAL2';
      elevatedUntil: string;
    };
    WebauthnRegistrationOptionsResponse: {
      rp: components['schemas']['WebauthnRpEntity'];
      user: components['schemas']['WebauthnUserEntity'];
      challenge: string;
      pubKeyCredParams: components['schemas']['WebauthnCredParam'][];
      timeout?: number;
      excludeCredentials?: components['schemas']['WebauthnCredentialDescriptor'][];
      authenticatorSelection?: components['schemas']['WebauthnAuthenticatorSelection'];
      attestation?: string;
      extensions?: components['schemas']['WebauthnExtensions'];
    };
    WebauthnRpEntity: {
      name: string;
      id?: string;
    };
    WebauthnUserEntity: {
      id: string;
      name: string;
      displayName: string;
    };
    WebauthnCredParam: {
      alg: number;
      type: string;
    };
    WebauthnAuthenticatorSelection: {
      authenticatorAttachment?: string;
      residentKey?: string;
      requireResidentKey?: boolean;
      userVerification?: string;
    };
    WebauthnExtensions: {
      credProps?: boolean;
    };
    WebauthnRegisterVerifyBody: {
      id: string;
      rawId: string;
      /** @enum {string} */
      type: 'public-key';
      response: components['schemas']['WebauthnAttestationData'];
      authenticatorAttachment?: string;
      label?: string;
    };
    WebauthnAttestationData: {
      clientDataJSON: string;
      attestationObject: string;
      transports?: string[];
    };
    WebauthnRegisterResponse: {
      success: boolean;
      recoveryCodes?: string[];
    };
    IdentityProviderListResponse: {
      items: components['schemas']['IdentityProviderResponse'][];
    };
    IdentityProviderResponse: {
      id: string;
      name: string;
      issuer: string;
      clientId: string;
      scopes: string;
      enforced: boolean;
      isActive: boolean;
      createdAt: string;
    };
    CreateIdentityProviderBody: {
      name: string;
      issuer: string;
      clientId: string;
      clientSecret: string;
      scopes?: string;
      enforced?: boolean;
    };
    UpdateIdentityProviderBody: {
      name?: string;
      clientId?: string;
      clientSecret?: string;
      scopes?: string;
      enforced?: boolean;
      isActive?: boolean;
    };
    ContactListResponse: {
      items: components['schemas']['ContactItemDto'][];
    };
    ContactItemDto: {
      value: string;
      isPrimary: boolean;
      verifiedAt?: string;
    };
    AddEmailBody: {
      email: string;
    };
    AddContactResponse: {
      verificationId: string;
    };
    VerifyContactBody: {
      verificationId: string;
      code: string;
    };
    ContactOperationResponse: {
      success: boolean;
    };
    RemoveEmailBody: {
      email: string;
    };
    AddPhoneBody: {
      phone: string;
    };
    RemovePhoneBody: {
      phone: string;
    };
    AdminContextResponse: {
      permissions: string[];
    };
    /** @enum {string} */
    SortOrder: 'asc' | 'desc';
    /** @enum {string} */
    UserSortBy: 'createdAt';
    UserSearchResponse: {
      total: number;
      limit: number;
      offset: number;
      items: components['schemas']['UserSummaryItem'][];
    };
    UserSummaryItem: {
      id: string;
      username?: string;
      /** @enum {string} */
      status: 'ACTIVE' | 'INACTIVE' | 'DISABLED' | 'BLOCKED' | 'SUSPENDED' | 'CLOSED';
      /** @enum {string} */
      lockMode: 'NONE' | 'OTP_ONLY' | 'FULL';
      primaryEmail?: string;
      createdAt: string;
    };
    UserDetailResponse: {
      id: string;
      username?: string;
      /** @enum {string} */
      status: 'ACTIVE' | 'INACTIVE' | 'DISABLED' | 'BLOCKED' | 'SUSPENDED' | 'CLOSED';
      /** @enum {string} */
      lockMode: 'NONE' | 'OTP_ONLY' | 'FULL';
      lockedUntil?: string;
      passwordResetRequired: boolean;
      emails: components['schemas']['UserContactItem'][];
      phones: components['schemas']['UserContactItem'][];
      mfa: components['schemas']['UserMfaSummary'];
      activeSessionCount: number;
      createdAt: string;
    };
    UserContactItem: {
      value: string;
      isPrimary: boolean;
      verifiedAt?: string;
    };
    UserMfaSummary: {
      totp: boolean;
      webauthn: boolean;
      passkeyCount: number;
    };
    LockUserBody: {
      /** @enum {string} */
      mode: 'OTP_ONLY' | 'FULL';
      until?: string;
    };
    AdminActionResponse: {
      success: boolean;
    };
    UserAuditEventsResponse: {
      events: components['schemas']['UserAuditEventItem'][];
    };
    UserAuditEventItem: {
      id: string;
      action: string;
      outcome: string;
      occurredAt: string;
      actorId?: string;
      targetType?: string;
      ipAddress?: string;
    };
    ApplicationListResponse: {
      items: components['schemas']['ApplicationSummaryItem'][];
    };
    ApplicationSummaryItem: {
      id: number;
      name: string;
      displayName?: string;
      subDomain: string;
      isActive: boolean;
      createdAt: string;
    };
    CreateApplicationBody: {
      name: string;
      subDomain: string;
      displayName?: string;
      description?: string;
      homePageUrl?: string;
      logoUrl?: string;
      isActive?: boolean;
      publicUrls?: string[];
    };
    CreateApplicationResponse: {
      id: number;
    };
    ApplicationDetailResponse: {
      id: number;
      name: string;
      displayName?: string;
      subDomain: string;
      isActive: boolean;
      createdAt: string;
      description?: string;
      homePageUrl?: string;
      logoUrl?: string;
      roles: components['schemas']['ApplicationRoleItem'][];
      publicUrls: string[];
      updatedAt: string;
    };
    ApplicationRoleItem: {
      id: number;
      roleName: string;
      description?: string;
    };
    UpdateApplicationBody: {
      subDomain?: string;
      displayName?: string;
      description?: string;
      homePageUrl?: string;
      logoUrl?: string;
      isActive?: boolean;
      publicUrls?: string[];
    };
    ApplicationMemberListResponse: {
      items: components['schemas']['ApplicationMemberItem'][];
    };
    ApplicationMemberItem: {
      userId: string;
      username?: string;
      primaryEmail?: string;
      firstUsedAt: string;
      lastUsedAt: string;
    };
    ClientListResponse: {
      items: components['schemas']['ClientSummaryItem'][];
    };
    ClientSummaryItem: {
      id: string;
      name: string;
      /** @enum {string} */
      kind: 'WEB_CONFIDENTIAL' | 'SPA_PUBLIC' | 'NATIVE_PUBLIC' | 'SERVICE';
      isFirstParty: boolean;
      isActive: boolean;
      applicationId: number;
    };
    RegisterClientBody: {
      clientId: string;
      applicationId: number;
      name: string;
      /** @enum {string} */
      kind: 'WEB_CONFIDENTIAL' | 'SPA_PUBLIC' | 'NATIVE_PUBLIC' | 'SERVICE';
      isFirstParty?: boolean;
      redirectUris?: string[];
      grantTypes: string[];
      accessTokenTtl?: number;
      backchannelLogoutUri?: string;
      workloadSubjects?: string[];
      /** @enum {string} */
      authMethod?: 'client_secret' | 'workload_identity';
    };
    RegisterClientResponse: {
      clientId: string;
      secret?: string;
    };
    ClientDetailResponse: {
      id: string;
      name: string;
      /** @enum {string} */
      kind: 'WEB_CONFIDENTIAL' | 'SPA_PUBLIC' | 'NATIVE_PUBLIC' | 'SERVICE';
      isFirstParty: boolean;
      isActive: boolean;
      applicationId: number;
      redirectUris: string[];
      scopes: string[];
      grantTypes: string[];
      accessTokenTtl: number;
      /** @enum {string} */
      authMethod: 'none' | 'client_secret' | 'workload_identity';
      workloadSubjects?: string[];
      backchannelLogoutUri?: string;
      createdAt: string;
    };
    UpdateClientBody: {
      name?: string;
      isActive?: boolean;
      redirectUris?: string[];
      backchannelLogoutUri?: string;
      workloadSubjects?: string[];
    };
    RotateSecretResponse: {
      secret: string;
      previousSecretsExpireAt: string;
    };
    GrantScopeBody: {
      scopeId: string;
    };
    ResourceListResponse: {
      items: components['schemas']['ResourceItem'][];
    };
    ResourceItem: {
      id: string;
      identifier: string;
      displayName?: string;
      applicationId: number;
      scopes: components['schemas']['ScopeItem'][];
    };
    ScopeItem: {
      id: string;
      name: string;
      description?: string;
      isSensitive: boolean;
      /** @enum {string} */
      principalType: 'USER' | 'SERVICE' | 'BOTH';
    };
    CreateResourceBody: {
      applicationId: number;
      identifier: string;
      displayName?: string;
    };
    CreatedResponse: {
      id: string;
    };
    CreateScopeBody: {
      name: string;
      description?: string;
      isSensitive?: boolean;
      /** @enum {string} */
      principalType?: 'USER' | 'SERVICE' | 'BOTH';
    };
    PermissionListResponse: {
      items: components['schemas']['PermissionItem'][];
    };
    PermissionItem: {
      id: string;
      name: string;
      description?: string;
    };
    RoleAssignmentBody: {
      /** @enum {string} */
      principalType: 'USER' | 'SERVICE_ACCOUNT';
      principalId: string;
      roleId: number;
      organisationId: string;
    };
    AssignmentListResponse: {
      items: components['schemas']['RoleAssignmentItem'][];
    };
    RoleAssignmentItem: {
      id: string;
      /** @enum {string} */
      principalType: 'USER' | 'SERVICE_ACCOUNT';
      principalId: string;
      roleId: number;
      organisationId: string;
      grantedBy?: string;
      grantedAt: string;
    };
    ServiceProviderListResponse: {
      items: components['schemas']['ServiceProviderItem'][];
    };
    ServiceProviderItem: {
      id: string;
      entityId: string;
      name: string;
      acsUrl: string;
      /** @enum {string} */
      nameIdFormat: 'EMAIL' | 'PERSISTENT';
      releasedAttributes: string[];
      isActive: boolean;
      createdAt: string;
    };
    CreateServiceProviderBody: {
      entityId: string;
      name: string;
      acsUrl: string;
      /** @enum {string} */
      nameIdFormat?: 'EMAIL' | 'PERSISTENT';
      releasedAttributes?: string[];
      spCertificatePem?: string;
    };
    UpdateServiceProviderBody: {
      name?: string;
      acsUrl?: string;
      /** @enum {string} */
      nameIdFormat?: 'EMAIL' | 'PERSISTENT';
      releasedAttributes?: string[];
      isActive?: boolean;
    };
    ServiceAccessListResponse: {
      items: components['schemas']['ServiceAccessRuleItem'][];
    };
    ServiceAccessRuleItem: {
      id: string;
      applicationId: number;
      callerClientId: string;
      method: string;
      pathPattern: string;
      createdAt: string;
    };
    CreateServiceAccessBody: {
      applicationId: number;
      callerClientId: string;
      method: string;
      pathPattern: string;
    };
    WebhookListResponse: {
      items: components['schemas']['WebhookItem'][];
    };
    WebhookItem: {
      id: string;
      name: string;
      targetUrl: string;
      eventTypes: string[];
      isActive: boolean;
      createdAt: string;
    };
    CreateWebhookBody: {
      name: string;
      targetUrl: string;
      eventTypes: string[];
    };
    CreatedWebhookResponse: {
      webhook: components['schemas']['WebhookItem'];
      secret: string;
    };
    UpdateWebhookBody: {
      name?: string;
      targetUrl?: string;
      eventTypes?: string[];
      isActive?: boolean;
    };
    RotatedWebhookSecretResponse: {
      secret: string;
    };
    WebhookDeliveriesResponse: {
      items: components['schemas']['WebhookDeliveryItem'][];
    };
    WebhookDeliveryItem: {
      id: string;
      eventId: string;
      eventType: string;
      /** @enum {string} */
      status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'DEAD';
      attemptCount: number;
      lastError?: string;
      responseStatus?: number;
      sentAt?: string;
      createdAt: string;
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
          'application/json': components['schemas']['ReadinessResponse'];
        };
      };
      /** @description Default Response */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReadinessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_well_known_jwks_json: {
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
          'application/json': components['schemas']['JwksResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_well_known_openid_configuration: {
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
          'application/json': components['schemas']['DiscoveryResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_oauth2_authorize: {
    parameters: {
      query: {
        client_id: string;
        redirect_uri: string;
        response_type: string;
        scope?: string;
        state?: string;
        nonce?: string;
        code_challenge?: string;
        code_challenge_method?: string;
        resource?: string;
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
  post_oauth2_token: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['TokenRequestBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TokenResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_oauth2_userinfo: {
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
          'application/json': components['schemas']['UserInfoResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_oauth2_revoke: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['TokenActionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RevocationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_oauth2_introspect: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['TokenActionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IntrospectionResponseDto'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_auth_consent: {
    parameters: {
      query: {
        clientId: string;
        scope: string;
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
          'application/json': components['schemas']['ConsentPromptResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_consent: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ConsentDecisionBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConsentDecisionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_me_consents: {
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
          'application/json': components['schemas']['ConsentRecordsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_consents_clientId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        clientId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ConsentOperationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_me: {
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
          'application/json': components['schemas']['MeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_me_profile: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateProfileBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_me_applications: {
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
          'application/json': components['schemas']['MyApplicationsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_organisations: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateOrganisationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_organisations_organisationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_organisations_organisationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_organisations_organisationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RenameOrganisationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_organisations_organisationId_members: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['MembersResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_organisations_organisationId_members_userId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_organisations_organisationId_members_userId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateMemberRoleBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_organisations_organisationId_invitations: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['InvitationsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_organisations_organisationId_invitations: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['InviteMemberBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_organisations_organisationId_invitations_invitationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        invitationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_me_organisations: {
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
          'application/json': components['schemas']['MyOrganisationsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_organisations_organisationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_invitations_accept: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['InvitationTokenBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_invitations_decline: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['InvitationTokenBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_organisations_organisationId_domains: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DomainsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_organisations_organisationId_domains: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RegisterDomainBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DomainItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_organisations_organisationId_domains_domainId_verify: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        domainId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DomainItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_organisations_organisationId_domains_domainId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        domainId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OrganisationActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_authz_check: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CheckRequestBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CheckResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  put_api_v1_authz_catalog: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CatalogSyncBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CatalogSyncResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_authz_service_access: {
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
          'application/json': components['schemas']['ServiceAccessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_saml2_metadata: {
    parameters: {
      query?: never;
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
  get_saml2_sso: {
    parameters: {
      query: {
        SAMLRequest: string;
        RelayState?: string;
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
  get_saml2_sso_resume: {
    parameters: {
      query: {
        rid: string;
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
  post_api_v1_auth_login_init: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['LoginInitBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LoginInitResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_register_init: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RegisterInitBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FlowStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_register_demographics: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['DemographicsBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FlowStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_register_profile: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ProfileBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FlowStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_register_password: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['SetPasswordBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChallengeVerifyResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_recover_init: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RecoverInitBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FlowStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_recover_reset: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ResetPasswordBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChallengeVerifyResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_challenge_verify: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ChallengeVerifyBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChallengeVerifyResponse'];
        };
      };
      /** @description Default Response */
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChallengeVerifyResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_auth_challenge_methods: {
    parameters: {
      query: {
        flowId: string;
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
          'application/json': components['schemas']['ChallengeMethodsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_challenge_change: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ChallengeChangeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['FlowStatusResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_challenge_resend: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['ChallengeResendBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChallengeResendResponse'];
        };
      };
      /** @description Default Response */
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ChallengeResendResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_auth_cancel: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CancelFlowBody'];
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
  post_api_v1_auth_signout: {
    parameters: {
      query?: never;
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
  post_api_v1_auth_webauthn_options: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['WebauthnOptionsBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WebauthnChallengeResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_me_sessions: {
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
          'application/json': components['schemas']['MeSessionsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_sessions: {
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
          'application/json': components['schemas']['SessionsRevokedResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_sessions_sessionId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
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
          'application/json': components['schemas']['SessionsRevokedResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_auth_federated_callback: {
    parameters: {
      query?: {
        state?: string;
        code?: string;
        error?: string;
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
  get_api_v1_me_mfa: {
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
          'application/json': components['schemas']['MfaEnrollmentsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_mfa_totp_enroll: {
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
          'application/json': components['schemas']['TotpEnrollResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_mfa_totp_activate: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['TotpCodeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['TotpActivateResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_mfa_recovery_codes: {
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
          'application/json': components['schemas']['RecoveryCodesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_mfa_totp: {
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
          'application/json': components['schemas']['OperationSuccessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_mfa_step_up: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['TotpCodeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['StepUpResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_webauthn_register_options: {
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
          'application/json': components['schemas']['WebauthnRegistrationOptionsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_webauthn_register_verify: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['WebauthnRegisterVerifyBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WebauthnRegisterResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_webauthn_credentialId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        credentialId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['OperationSuccessResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_organisations_organisationId_identity_providers: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdentityProviderListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_organisations_organisationId_identity_providers: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateIdentityProviderBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdentityProviderResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_organisations_organisationId_identity_providers_identityProviderId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        identityProviderId: string;
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
  patch_api_v1_organisations_organisationId_identity_providers_identityProviderId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        organisationId: string;
        identityProviderId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateIdentityProviderBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['IdentityProviderResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_me_emails: {
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
          'application/json': components['schemas']['ContactListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_emails: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['AddEmailBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AddContactResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_emails: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RemoveEmailBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContactOperationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_emails_verify: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['VerifyContactBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContactOperationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_emails_primary: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['AddEmailBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContactOperationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_me_phones: {
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
          'application/json': components['schemas']['ContactListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_phones: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['AddPhoneBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AddContactResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_me_phones: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RemovePhoneBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContactOperationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_phones_verify: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['VerifyContactBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContactOperationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_me_phones_primary: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['AddPhoneBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ContactOperationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_context: {
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
          'application/json': components['schemas']['AdminContextResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_users: {
    parameters: {
      query?: {
        limit?: number | string;
        offset?: number | string;
        sortOrder?: components['schemas']['SortOrder'];
        sortBy?: components['schemas']['UserSortBy'];
        email?: string;
        status?: 'ACTIVE' | 'INACTIVE' | 'DISABLED' | 'BLOCKED' | 'SUSPENDED' | 'CLOSED';
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
          'application/json': components['schemas']['UserSearchResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_users_userId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_users_userId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_users_userId_lock: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['LockUserBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_users_userId_unlock: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_users_userId_force_password_reset: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_users_userId_sessions_terminate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_users_userId_deactivate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_users_userId_reactivate: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_users_userId_audit: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['UserAuditEventsResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_applications: {
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
          'application/json': components['schemas']['ApplicationListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_applications: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateApplicationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreateApplicationResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_applications_applicationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        applicationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ApplicationDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_applications_applicationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        applicationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_admin_applications_applicationId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        applicationId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateApplicationBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_applications_applicationId_members: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        applicationId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ApplicationMemberListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_applications_applicationId_members_userId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        applicationId: string;
        userId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_clients: {
    parameters: {
      query?: {
        applicationId?: number | string;
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
          'application/json': components['schemas']['ClientListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_clients: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RegisterClientBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RegisterClientResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_clients_clientId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        clientId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ClientDetailResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_admin_clients_clientId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        clientId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateClientBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_clients_clientId_rotate_secret: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        clientId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RotateSecretResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_clients_clientId_scopes: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        clientId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['GrantScopeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_clients_clientId_scopes_scopeId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        clientId: string;
        scopeId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_resources: {
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
          'application/json': components['schemas']['ResourceListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_resources: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateResourceBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreatedResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_resources_resourceId_scopes: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        resourceId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateScopeBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreatedResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_permissions: {
    parameters: {
      query: {
        applicationId: number | string;
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
          'application/json': components['schemas']['PermissionListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_role_assignments: {
    parameters: {
      query?: {
        principalType?: 'USER' | 'SERVICE_ACCOUNT';
        principalId?: string;
        organisationId?: string;
        roleId?: number | string;
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
          'application/json': components['schemas']['AssignmentListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_role_assignments: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RoleAssignmentBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_role_assignments_revoke: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['RoleAssignmentBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_saml_service_providers: {
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
          'application/json': components['schemas']['ServiceProviderListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_saml_service_providers: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateServiceProviderBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceProviderItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_saml_service_providers_serviceProviderId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        serviceProviderId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceProviderItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_saml_service_providers_serviceProviderId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        serviceProviderId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_admin_saml_service_providers_serviceProviderId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        serviceProviderId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateServiceProviderBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceProviderItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_service_access: {
    parameters: {
      query: {
        applicationId: number | string;
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
          'application/json': components['schemas']['ServiceAccessListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_service_access: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateServiceAccessBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ServiceAccessRuleItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_service_access_ruleId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        ruleId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_webhooks: {
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
          'application/json': components['schemas']['WebhookListResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_webhooks: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['CreateWebhookBody'];
      };
    };
    responses: {
      /** @description Default Response */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['CreatedWebhookResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_webhooks_webhookId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        webhookId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WebhookItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  delete_api_v1_admin_webhooks_webhookId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        webhookId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  patch_api_v1_admin_webhooks_webhookId: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        webhookId: string;
      };
      cookie?: never;
    };
    requestBody?: {
      content: {
        'application/json': components['schemas']['UpdateWebhookBody'];
      };
    };
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WebhookItem'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_webhooks_webhookId_rotate_secret: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        webhookId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['RotatedWebhookSecretResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_api_v1_admin_webhooks_webhookId_deliveries: {
    parameters: {
      query?: {
        status?: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'DEAD';
      };
      header?: never;
      path: {
        webhookId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['WebhookDeliveriesResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  post_api_v1_admin_webhooks_webhookId_deliveries_deliveryId_redeliver: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        webhookId: string;
        deliveryId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Default Response */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AdminActionResponse'];
        };
      };
      /** @description Default Response */
      '4XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
      /** @description Default Response */
      '5XX': {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['DevErrorResponseDto'];
        };
      };
    };
  };
  get_scim_v2_Users: {
    parameters: {
      query?: {
        filter?: string;
        startIndex?: string;
        count?: string;
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
  post_scim_v2_Users: {
    parameters: {
      query?: never;
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
  get_scim_v2_Users_id: {
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
  put_scim_v2_Users_id: {
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
  delete_scim_v2_Users_id: {
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
  patch_scim_v2_Users_id: {
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
  get_scim_v2_Groups: {
    parameters: {
      query?: {
        filter?: string;
        startIndex?: string;
        count?: string;
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
  post_scim_v2_Groups: {
    parameters: {
      query?: never;
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
  get_scim_v2_Groups_id: {
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
  put_scim_v2_Groups_id: {
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
  delete_scim_v2_Groups_id: {
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
  patch_scim_v2_Groups_id: {
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
  get_scim_v2_ServiceProviderConfig: {
    parameters: {
      query?: never;
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
  get_scim_v2_ResourceTypes: {
    parameters: {
      query?: never;
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
  get_scim_v2_Schemas: {
    parameters: {
      query?: never;
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
export type HealthResponse = components['schemas']['HealthResponse'];
export type DevErrorResponseDto = components['schemas']['DevErrorResponseDto'];
export type ErrorFieldDto = components['schemas']['ErrorFieldDto'];
export type ReadinessResponse = components['schemas']['ReadinessResponse'];
export type ReadinessDependencies = components['schemas']['ReadinessDependencies'];
export type JwksResponse = components['schemas']['JwksResponse'];
export type JwkDto = components['schemas']['JwkDto'];
export type DiscoveryResponse = components['schemas']['DiscoveryResponse'];
export type TokenRequestBody = components['schemas']['TokenRequestBody'];
export type TokenResponse = components['schemas']['TokenResponse'];
export type UserInfoResponse = components['schemas']['UserInfoResponse'];
export type TokenActionBody = components['schemas']['TokenActionBody'];
export type RevocationResponse = components['schemas']['RevocationResponse'];
export type IntrospectionResponseDto = components['schemas']['IntrospectionResponseDto'];
export type ConsentPromptResponse = components['schemas']['ConsentPromptResponse'];
export type ConsentScopeDto = components['schemas']['ConsentScopeDto'];
export type ConsentDecisionBody = components['schemas']['ConsentDecisionBody'];
export type ConsentDecisionResponse = components['schemas']['ConsentDecisionResponse'];
export type ConsentRecordsResponse = components['schemas']['ConsentRecordsResponse'];
export type ConsentRecordDto = components['schemas']['ConsentRecordDto'];
export type ConsentOperationResponse = components['schemas']['ConsentOperationResponse'];
export type MeResponse = components['schemas']['MeResponse'];
export type UpdateProfileBody = components['schemas']['UpdateProfileBody'];
export type MyApplicationsResponse = components['schemas']['MyApplicationsResponse'];
export type MyApplicationItem = components['schemas']['MyApplicationItem'];
export type CreateOrganisationBody = components['schemas']['CreateOrganisationBody'];
export type OrganisationResponse = components['schemas']['OrganisationResponse'];
export type RenameOrganisationBody = components['schemas']['RenameOrganisationBody'];
export type OrganisationActionResponse = components['schemas']['OrganisationActionResponse'];
export type MembersResponse = components['schemas']['MembersResponse'];
export type MemberItem = components['schemas']['MemberItem'];
export type UpdateMemberRoleBody = components['schemas']['UpdateMemberRoleBody'];
export type InvitationsResponse = components['schemas']['InvitationsResponse'];
export type InvitationItem = components['schemas']['InvitationItem'];
export type InviteMemberBody = components['schemas']['InviteMemberBody'];
export type MyOrganisationsResponse = components['schemas']['MyOrganisationsResponse'];
export type MyOrganisationItem = components['schemas']['MyOrganisationItem'];
export type InvitationTokenBody = components['schemas']['InvitationTokenBody'];
export type DomainsResponse = components['schemas']['DomainsResponse'];
export type DomainItem = components['schemas']['DomainItem'];
export type RegisterDomainBody = components['schemas']['RegisterDomainBody'];
export type CheckRequestBody = components['schemas']['CheckRequestBody'];
export type CheckResponse = components['schemas']['CheckResponse'];
export type CatalogSyncBody = components['schemas']['CatalogSyncBody'];
export type CatalogPermission = components['schemas']['CatalogPermission'];
export type CatalogRole = components['schemas']['CatalogRole'];
export type CatalogSyncResponse = components['schemas']['CatalogSyncResponse'];
export type ServiceAccessResponse = components['schemas']['ServiceAccessResponse'];
export type ServiceAccessRuleDto = components['schemas']['ServiceAccessRuleDto'];
export type LoginInitBody = components['schemas']['LoginInitBody'];
export type LoginInitResponse = components['schemas']['LoginInitResponse'];
export type FederatedLoginOptionDto = components['schemas']['FederatedLoginOptionDto'];
export type RegisterInitBody = components['schemas']['RegisterInitBody'];
export type FlowStatusResponse = components['schemas']['FlowStatusResponse'];
export type ChallengeMethodMetadata = components['schemas']['ChallengeMethodMetadata'];
export type DemographicsBody = components['schemas']['DemographicsBody'];
export type ProfileBody = components['schemas']['ProfileBody'];
export type SetPasswordBody = components['schemas']['SetPasswordBody'];
export type ChallengeVerifyResponse = components['schemas']['ChallengeVerifyResponse'];
export type RecoverInitBody = components['schemas']['RecoverInitBody'];
export type ResetPasswordBody = components['schemas']['ResetPasswordBody'];
export type ChallengeVerifyBody = components['schemas']['ChallengeVerifyBody'];
export type WebauthnAssertion = components['schemas']['WebauthnAssertion'];
export type WebauthnAssertionData = components['schemas']['WebauthnAssertionData'];
export type ChallengeMethodsResponse = components['schemas']['ChallengeMethodsResponse'];
export type ChallengeMethod = components['schemas']['ChallengeMethod'];
export type ChallengeChangeBody = components['schemas']['ChallengeChangeBody'];
export type ChallengeResendBody = components['schemas']['ChallengeResendBody'];
export type ChallengeResendResponse = components['schemas']['ChallengeResendResponse'];
export type CancelFlowBody = components['schemas']['CancelFlowBody'];
export type WebauthnOptionsBody = components['schemas']['WebauthnOptionsBody'];
export type WebauthnChallengeResponse = components['schemas']['WebauthnChallengeResponse'];
export type WebauthnAuthenticationOptions = components['schemas']['WebauthnAuthenticationOptions'];
export type WebauthnCredentialDescriptor = components['schemas']['WebauthnCredentialDescriptor'];
export type MeSessionsResponse = components['schemas']['MeSessionsResponse'];
export type MeSessionItem = components['schemas']['MeSessionItem'];
export type SessionsRevokedResponse = components['schemas']['SessionsRevokedResponse'];
export type MfaEnrollmentsResponse = components['schemas']['MfaEnrollmentsResponse'];
export type MfaEnrollmentItem = components['schemas']['MfaEnrollmentItem'];
export type TotpEnrollResponse = components['schemas']['TotpEnrollResponse'];
export type TotpCodeBody = components['schemas']['TotpCodeBody'];
export type TotpActivateResponse = components['schemas']['TotpActivateResponse'];
export type RecoveryCodesResponse = components['schemas']['RecoveryCodesResponse'];
export type OperationSuccessResponse = components['schemas']['OperationSuccessResponse'];
export type StepUpResponse = components['schemas']['StepUpResponse'];
export type WebauthnRegistrationOptionsResponse = components['schemas']['WebauthnRegistrationOptionsResponse'];
export type WebauthnRpEntity = components['schemas']['WebauthnRpEntity'];
export type WebauthnUserEntity = components['schemas']['WebauthnUserEntity'];
export type WebauthnCredParam = components['schemas']['WebauthnCredParam'];
export type WebauthnAuthenticatorSelection = components['schemas']['WebauthnAuthenticatorSelection'];
export type WebauthnExtensions = components['schemas']['WebauthnExtensions'];
export type WebauthnRegisterVerifyBody = components['schemas']['WebauthnRegisterVerifyBody'];
export type WebauthnAttestationData = components['schemas']['WebauthnAttestationData'];
export type WebauthnRegisterResponse = components['schemas']['WebauthnRegisterResponse'];
export type IdentityProviderListResponse = components['schemas']['IdentityProviderListResponse'];
export type IdentityProviderResponse = components['schemas']['IdentityProviderResponse'];
export type CreateIdentityProviderBody = components['schemas']['CreateIdentityProviderBody'];
export type UpdateIdentityProviderBody = components['schemas']['UpdateIdentityProviderBody'];
export type ContactListResponse = components['schemas']['ContactListResponse'];
export type ContactItemDto = components['schemas']['ContactItemDto'];
export type AddEmailBody = components['schemas']['AddEmailBody'];
export type AddContactResponse = components['schemas']['AddContactResponse'];
export type VerifyContactBody = components['schemas']['VerifyContactBody'];
export type ContactOperationResponse = components['schemas']['ContactOperationResponse'];
export type RemoveEmailBody = components['schemas']['RemoveEmailBody'];
export type AddPhoneBody = components['schemas']['AddPhoneBody'];
export type RemovePhoneBody = components['schemas']['RemovePhoneBody'];
export type AdminContextResponse = components['schemas']['AdminContextResponse'];
export type SortOrder = components['schemas']['SortOrder'];
export type UserSortBy = components['schemas']['UserSortBy'];
export type UserSearchResponse = components['schemas']['UserSearchResponse'];
export type UserSummaryItem = components['schemas']['UserSummaryItem'];
export type UserDetailResponse = components['schemas']['UserDetailResponse'];
export type UserContactItem = components['schemas']['UserContactItem'];
export type UserMfaSummary = components['schemas']['UserMfaSummary'];
export type LockUserBody = components['schemas']['LockUserBody'];
export type AdminActionResponse = components['schemas']['AdminActionResponse'];
export type UserAuditEventsResponse = components['schemas']['UserAuditEventsResponse'];
export type UserAuditEventItem = components['schemas']['UserAuditEventItem'];
export type ApplicationListResponse = components['schemas']['ApplicationListResponse'];
export type ApplicationSummaryItem = components['schemas']['ApplicationSummaryItem'];
export type CreateApplicationBody = components['schemas']['CreateApplicationBody'];
export type CreateApplicationResponse = components['schemas']['CreateApplicationResponse'];
export type ApplicationDetailResponse = components['schemas']['ApplicationDetailResponse'];
export type ApplicationRoleItem = components['schemas']['ApplicationRoleItem'];
export type UpdateApplicationBody = components['schemas']['UpdateApplicationBody'];
export type ApplicationMemberListResponse = components['schemas']['ApplicationMemberListResponse'];
export type ApplicationMemberItem = components['schemas']['ApplicationMemberItem'];
export type ClientListResponse = components['schemas']['ClientListResponse'];
export type ClientSummaryItem = components['schemas']['ClientSummaryItem'];
export type RegisterClientBody = components['schemas']['RegisterClientBody'];
export type RegisterClientResponse = components['schemas']['RegisterClientResponse'];
export type ClientDetailResponse = components['schemas']['ClientDetailResponse'];
export type UpdateClientBody = components['schemas']['UpdateClientBody'];
export type RotateSecretResponse = components['schemas']['RotateSecretResponse'];
export type GrantScopeBody = components['schemas']['GrantScopeBody'];
export type ResourceListResponse = components['schemas']['ResourceListResponse'];
export type ResourceItem = components['schemas']['ResourceItem'];
export type ScopeItem = components['schemas']['ScopeItem'];
export type CreateResourceBody = components['schemas']['CreateResourceBody'];
export type CreatedResponse = components['schemas']['CreatedResponse'];
export type CreateScopeBody = components['schemas']['CreateScopeBody'];
export type PermissionListResponse = components['schemas']['PermissionListResponse'];
export type PermissionItem = components['schemas']['PermissionItem'];
export type RoleAssignmentBody = components['schemas']['RoleAssignmentBody'];
export type AssignmentListResponse = components['schemas']['AssignmentListResponse'];
export type RoleAssignmentItem = components['schemas']['RoleAssignmentItem'];
export type ServiceProviderListResponse = components['schemas']['ServiceProviderListResponse'];
export type ServiceProviderItem = components['schemas']['ServiceProviderItem'];
export type CreateServiceProviderBody = components['schemas']['CreateServiceProviderBody'];
export type UpdateServiceProviderBody = components['schemas']['UpdateServiceProviderBody'];
export type ServiceAccessListResponse = components['schemas']['ServiceAccessListResponse'];
export type ServiceAccessRuleItem = components['schemas']['ServiceAccessRuleItem'];
export type CreateServiceAccessBody = components['schemas']['CreateServiceAccessBody'];
export type WebhookListResponse = components['schemas']['WebhookListResponse'];
export type WebhookItem = components['schemas']['WebhookItem'];
export type CreateWebhookBody = components['schemas']['CreateWebhookBody'];
export type CreatedWebhookResponse = components['schemas']['CreatedWebhookResponse'];
export type UpdateWebhookBody = components['schemas']['UpdateWebhookBody'];
export type RotatedWebhookSecretResponse = components['schemas']['RotatedWebhookSecretResponse'];
export type WebhookDeliveriesResponse = components['schemas']['WebhookDeliveriesResponse'];
export type WebhookDeliveryItem = components['schemas']['WebhookDeliveryItem'];
export type AuthorizeQueryParams = Exclude<paths['/oauth2/authorize']['get']['parameters']['query'], undefined>;
export type GetConsentPromptQueryParams = Exclude<paths['/api/v1/auth/consent']['get']['parameters']['query'], undefined>;
export type GetOrganisationDetailsPathParams = Exclude<paths['/api/v1/organisations/{organisationId}']['get']['parameters']['path'], undefined>;
export type ListOrganisationMembersPathParams = Exclude<paths['/api/v1/organisations/{organisationId}/members']['get']['parameters']['path'], undefined>;
export type ListOrganisationInvitationsPathParams = Exclude<paths['/api/v1/organisations/{organisationId}/invitations']['get']['parameters']['path'], undefined>;
export type ListDomainsPathParams = Exclude<paths['/api/v1/organisations/{organisationId}/domains']['get']['parameters']['path'], undefined>;
export type HandleSamlSsoQueryParams = Exclude<paths['/saml2/sso']['get']['parameters']['query'], undefined>;
export type ResumeSamlSsoQueryParams = Exclude<paths['/saml2/sso/resume']['get']['parameters']['query'], undefined>;
export type ChallengeMethodsQueryParams = Exclude<paths['/api/v1/auth/challenge/methods']['get']['parameters']['query'], undefined>;
export type HandleFederatedCallbackQueryParams = Exclude<paths['/api/v1/auth/federated/callback']['get']['parameters']['query'], undefined>;
export type ListIdentityProvidersPathParams = Exclude<paths['/api/v1/organisations/{organisationId}/identity-providers']['get']['parameters']['path'], undefined>;
export type SearchUsersQueryParams = Exclude<paths['/api/v1/admin/users']['get']['parameters']['query'], undefined>;
export type GetUserDetailPathParams = Exclude<paths['/api/v1/admin/users/{userId}']['get']['parameters']['path'], undefined>;
export type GetUserAuditTrailPathParams = Exclude<paths['/api/v1/admin/users/{userId}/audit']['get']['parameters']['path'], undefined>;
export type GetApplicationDetailsPathParams = Exclude<paths['/api/v1/admin/applications/{applicationId}']['get']['parameters']['path'], undefined>;
export type ListApplicationMembersPathParams = Exclude<paths['/api/v1/admin/applications/{applicationId}/members']['get']['parameters']['path'], undefined>;
export type ListClientsQueryParams = Exclude<paths['/api/v1/admin/clients']['get']['parameters']['query'], undefined>;
export type GetClientDetailsPathParams = Exclude<paths['/api/v1/admin/clients/{clientId}']['get']['parameters']['path'], undefined>;
export type ListApplicationPermissionsQueryParams = Exclude<paths['/api/v1/admin/permissions']['get']['parameters']['query'], undefined>;
export type ListRoleAssignmentsQueryParams = Exclude<paths['/api/v1/admin/role-assignments']['get']['parameters']['query'], undefined>;
export type GetSamlServiceProviderPathParams = Exclude<paths['/api/v1/admin/saml/service-providers/{serviceProviderId}']['get']['parameters']['path'], undefined>;
export type ListServiceAccessRulesQueryParams = Exclude<paths['/api/v1/admin/service-access']['get']['parameters']['query'], undefined>;
export type GetWebhookPathParams = Exclude<paths['/api/v1/admin/webhooks/{webhookId}']['get']['parameters']['path'], undefined>;
export type ListWebhookDeliveriesQueryParams = Exclude<paths['/api/v1/admin/webhooks/{webhookId}/deliveries']['get']['parameters']['query'], undefined>;
export type ListWebhookDeliveriesPathParams = Exclude<paths['/api/v1/admin/webhooks/{webhookId}/deliveries']['get']['parameters']['path'], undefined>;
export type ListUsersQueryParams = Exclude<paths['/scim/v2/Users']['get']['parameters']['query'], undefined>;
export type GetUserPathParams = Exclude<paths['/scim/v2/Users/{id}']['get']['parameters']['path'], undefined>;
export type ListGroupsQueryParams = Exclude<paths['/scim/v2/Groups']['get']['parameters']['query'], undefined>;
export type GetGroupPathParams = Exclude<paths['/scim/v2/Groups/{id}']['get']['parameters']['path'], undefined>;
