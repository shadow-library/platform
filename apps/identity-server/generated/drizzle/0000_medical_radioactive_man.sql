CREATE TYPE "public"."audit_actor_type" AS ENUM('USER', 'SERVICE_ACCOUNT', 'SYSTEM', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('SUCCESS', 'DENIED', 'FAILURE');--> statement-breakpoint
CREATE TYPE "public"."session_aal" AS ENUM('AAL1', 'AAL2');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('ACTIVE', 'REVOKED', 'TERMINATED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."sign_in_status" AS ENUM('SUCCESS', 'INVALID_CREDENTIALS', 'MFA_FAILED', 'ACCOUNT_LOCKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."principal_type" AS ENUM('USER', 'SERVICE_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."challenge_type" AS ENUM('EMAIL_OTP', 'SMS_OTP', 'EMAIL_LINK');--> statement-breakpoint
CREATE TYPE "public"."consent_source" AS ENUM('USER', 'FIRST_PARTY_POLICY', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."mfa_method" AS ENUM('TOTP', 'WEBAUTHN', 'EMAIL_OTP');--> statement-breakpoint
CREATE TYPE "public"."signing_key_algorithm" AS ENUM('EdDSA', 'RS256');--> statement-breakpoint
CREATE TYPE "public"."signing_key_purpose" AS ENUM('OIDC', 'SAML');--> statement-breakpoint
CREATE TYPE "public"."signing_key_status" AS ENUM('PENDING', 'ACTIVE', 'RETIRING', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."logout_delivery_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."oauth_client_kind" AS ENUM('WEB_CONFIDENTIAL', 'SPA_PUBLIC', 'NATIVE_PUBLIC', 'SERVICE');--> statement-breakpoint
CREATE TYPE "public"."token_endpoint_auth_method" AS ENUM('client_secret_basic', 'none', 'private_key_jwt');--> statement-breakpoint
CREATE TYPE "public"."refresh_family_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."refresh_revoke_reason" AS ENUM('ROTATION_REUSE', 'LOGOUT', 'ADMIN', 'EXPIRY');--> statement-breakpoint
CREATE TYPE "public"."refresh_token_status" AS ENUM('ACTIVE', 'ROTATED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."saml_name_id_format" AS ENUM('EMAIL', 'PERSISTENT');--> statement-breakpoint
CREATE TYPE "public"."organisation_domain_status" AS ENUM('PENDING', 'VERIFIED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."organisation_member_role" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."organisation_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."organisation_type" AS ENUM('PERSONAL', 'TEAM');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');--> statement-breakpoint
CREATE TYPE "public"."password_algorithm" AS ENUM('BCRYPT', 'ARGON2ID');--> statement-breakpoint
CREATE TYPE "public"."user_auth_provider" AS ENUM('PASSWORD', 'OTP', 'TOTP', 'WEBAUTHN', 'RECOVERY_CODE', 'FEDERATED', 'GOOGLE', 'MICROSOFT');--> statement-breakpoint
CREATE TYPE "public"."user_lock_mode" AS ENUM('NONE', 'OTP_ONLY', 'FULL');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE', 'DISABLED', 'BLOCKED', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organisation_id" varchar(64),
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" varchar(64),
	"action" varchar(128) NOT NULL,
	"target_type" varchar(64),
	"target_id" varchar(64),
	"outcome" "audit_outcome" NOT NULL,
	"ip_address" varchar(45),
	"correlation_id" varchar(64),
	"detail" jsonb,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"fingerprint_hash" varchar(64) NOT NULL,
	"name" varchar(255),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trusted_at" timestamp with time zone,
	CONSTRAINT "devices_user_id_fingerprint_unique" UNIQUE("user_id","fingerprint_hash")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"session_hash" varchar(64) NOT NULL,
	"user_sign_in_event_id" uuid,
	"device_id" bigint,
	"status" "session_status" DEFAULT 'ACTIVE' NOT NULL,
	"aal" "session_aal" DEFAULT 'AAL1' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"terminated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"elevated_until" timestamp with time zone,
	"ip_address" varchar(45),
	"ip_country" varchar(2),
	"user_agent" text,
	CONSTRAINT "user_sessions_session_hash_unique" UNIQUE("session_hash")
);
--> statement-breakpoint
CREATE TABLE "user_sign_in_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"identifier" varchar(255) NOT NULL,
	"status" "sign_in_status" NOT NULL,
	"auth_mode_used" "user_auth_provider" NOT NULL,
	"mfa_mode_used" "user_auth_provider",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"device_id" varchar(255),
	"ip_address" varchar(45),
	"ip_country" varchar(2),
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(255),
	CONSTRAINT "permissions_application_name_unique" UNIQUE("application_id","name")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_type" "principal_type" NOT NULL,
	"principal_id" varchar(64) NOT NULL,
	"role_id" integer NOT NULL,
	"organisation_id" bigint NOT NULL,
	"granted_by" varchar(64),
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "role_assignments_unique" UNIQUE("principal_type","principal_id","role_id","organisation_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "service_route_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"caller_client_id" uuid NOT NULL,
	"method" varchar(10) NOT NULL,
	"path_pattern" varchar(512) NOT NULL,
	"created_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_route_access_unique" UNIQUE("application_id","caller_client_id","method","path_pattern")
);
--> statement-breakpoint
CREATE TABLE "verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint,
	"flow_id" varchar(128),
	"type" "challenge_type" NOT NULL,
	"target" varchar(255) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"client_id" uuid NOT NULL,
	"scope_names" text[] NOT NULL,
	"source" "consent_source" NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mfa_enrollments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"type" "mfa_method" NOT NULL,
	"secret_ciphertext" text,
	"kek_version" integer,
	"label" varchar(64) DEFAULT 'default' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_used_counter" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_enrollments_user_type_label_unique" UNIQUE("user_id","type","label")
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"code_hash" text NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"sign_count" bigint DEFAULT 0 NOT NULL,
	"transports" text,
	"aaguid" varchar(36),
	"backup_eligible" boolean DEFAULT false NOT NULL,
	"label" varchar(64) DEFAULT 'passkey' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "webauthn_credentials_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "federated_identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identity_provider_id" uuid NOT NULL,
	"user_id" bigint NOT NULL,
	"subject" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "federated_identities_provider_subject_unique" UNIQUE("identity_provider_id","subject"),
	CONSTRAINT "federated_identities_provider_user_unique" UNIQUE("identity_provider_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "identity_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ciphertext" text NOT NULL,
	"client_secret_iv" text NOT NULL,
	"client_secret_auth_tag" text NOT NULL,
	"kek_version" integer DEFAULT 1 NOT NULL,
	"scopes" varchar(255) DEFAULT 'openid email profile' NOT NULL,
	"authorization_endpoint" text NOT NULL,
	"token_endpoint" text NOT NULL,
	"jwks_uri" text NOT NULL,
	"enforced" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_providers_organisation_id_unique" UNIQUE("organisation_id")
);
--> statement-breakpoint
CREATE TABLE "signing_keys" (
	"kid" uuid PRIMARY KEY NOT NULL,
	"algorithm" "signing_key_algorithm" DEFAULT 'EdDSA' NOT NULL,
	"purpose" "signing_key_purpose" DEFAULT 'OIDC' NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"certificate_pem" text,
	"private_key_ciphertext" text NOT NULL,
	"private_key_iv" text NOT NULL,
	"private_key_auth_tag" text NOT NULL,
	"kek_version" integer DEFAULT 1 NOT NULL,
	"status" "signing_key_status" DEFAULT 'PENDING' NOT NULL,
	"not_before" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_key" varchar(128) NOT NULL,
	"recipients" jsonb NOT NULL,
	"payload" jsonb,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "api_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_resources_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_redirect_uris" (
	"client_id" uuid NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "oauth_client_redirect_uris_client_id_uri_pk" PRIMARY KEY("client_id","uri")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_scope_grants" (
	"client_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	CONSTRAINT "oauth_client_scope_grants_client_id_scope_id_pk" PRIMARY KEY("client_id","scope_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" "oauth_client_kind" NOT NULL,
	"is_first_party" boolean DEFAULT false NOT NULL,
	"token_endpoint_auth_method" "token_endpoint_auth_method" NOT NULL,
	"grant_types" text[] NOT NULL,
	"require_pkce" boolean DEFAULT true NOT NULL,
	"workload_subject" varchar(512),
	"access_token_ttl" integer DEFAULT 600 NOT NULL,
	"refresh_token_ttl" integer,
	"organisation_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"backchannel_logout_uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_workload_subject_unique" UNIQUE("workload_subject")
);
--> statement-breakpoint
CREATE TABLE "oidc_logout_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"logout_uri" text NOT NULL,
	"subject" varchar(64) NOT NULL,
	"sid" varchar(64) NOT NULL,
	"status" "logout_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_resource_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	CONSTRAINT "scopes_resource_name_unique" UNIQUE("api_resource_id","name")
);
--> statement-breakpoint
CREATE TABLE "refresh_token_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"session_id" bigint,
	"client_id" uuid,
	"scope" text,
	"audience" varchar(255),
	"organisation_id" bigint,
	"status" "refresh_family_status" DEFAULT 'ACTIVE' NOT NULL,
	"revoke_reason" "refresh_revoke_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"status" "refresh_token_status" DEFAULT 'ACTIVE' NOT NULL,
	"previous_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"ip_address" varchar(45),
	"ip_country" varchar(2),
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "saml_service_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"acs_url" text NOT NULL,
	"name_id_format" "saml_name_id_format" DEFAULT 'EMAIL' NOT NULL,
	"released_attributes" text[] NOT NULL,
	"sp_certificate_pem" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saml_service_providers_entity_id_unique" UNIQUE("entity_id")
);
--> statement-breakpoint
CREATE TABLE "scim_directory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"user_name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"managed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_group_members" (
	"group_id" uuid NOT NULL,
	"directory_id" uuid NOT NULL,
	CONSTRAINT "scim_group_members_group_id_directory_id_pk" PRIMARY KEY("group_id","directory_id")
);
--> statement-breakpoint
CREATE TABLE "scim_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" bigint NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"external_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation_domains" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organisation_id" bigint NOT NULL,
	"domain" varchar(253) NOT NULL,
	"verification_token" varchar(64) NOT NULL,
	"status" "organisation_domain_status" DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"matched_record" varchar(512),
	"last_check_error" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation_invitations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organisation_id" bigint NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "organisation_member_role" DEFAULT 'MEMBER' NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "organisation_members" (
	"organisation_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"role" "organisation_member_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisation_members_organisation_id_user_id_pk" PRIMARY KEY("organisation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "organisation_type" DEFAULT 'TEAM' NOT NULL,
	"status" "organisation_status" DEFAULT 'ACTIVE' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organisations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "application_configurations" (
	"application_id" integer NOT NULL,
	"config_name" varchar(255) NOT NULL,
	"config_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_configurations_application_id_config_name_pk" PRIMARY KEY("application_id","config_name")
);
--> statement-breakpoint
CREATE TABLE "application_members" (
	"application_id" integer NOT NULL,
	"user_id" bigint NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_members_application_id_user_id_pk" PRIMARY KEY("application_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "application_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"role_name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "application_roles_application_role_unique" UNIQUE("application_id","role_name")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sub_domain" varchar(255) NOT NULL,
	"public_urls" text[] DEFAULT '{}' NOT NULL,
	"home_page_url" text,
	"logo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "applications_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "password_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_auth_identities" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"provider" "user_auth_provider" NOT NULL,
	"provider_key" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_auth_identities_user_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "user_auth_identities_provider_key_unique" UNIQUE("provider","provider_key")
);
--> statement-breakpoint
CREATE TABLE "user_emails" (
	"user_id" bigint NOT NULL,
	"email_id" varchar(255) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_emails_user_id_email_id_pk" PRIMARY KEY("user_id","email_id")
);
--> statement-breakpoint
CREATE TABLE "user_passwords" (
	"user_auth_identity_id" bigint PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"algorithm" "password_algorithm" DEFAULT 'BCRYPT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_phones" (
	"user_id" bigint NOT NULL,
	"phone_number" varchar(15) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_phones_user_id_phone_number_pk" PRIMARY KEY("user_id","phone_number")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"first_name" varchar(64),
	"last_name" varchar(64),
	"display_name" varchar(64),
	"gender" "gender" DEFAULT 'UNSPECIFIED' NOT NULL,
	"date_of_birth" date,
	"avatar_url" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"username" varchar(32),
	"status" "user_status" DEFAULT 'INACTIVE' NOT NULL,
	"personal_organisation_id" bigint,
	"lock_mode" "user_lock_mode" DEFAULT 'NONE' NOT NULL,
	"locked_until" timestamp with time zone,
	"password_reset_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscription_id" bigint NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"payload" text NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(512),
	"response_status" integer,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"target_url" text NOT NULL,
	"event_types" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"kek_version" integer NOT NULL,
	"previous_secret_ciphertext" text,
	"previous_secret_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_sign_in_event_id_user_sign_in_events_id_fk" FOREIGN KEY ("user_sign_in_event_id") REFERENCES "public"."user_sign_in_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_application_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."application_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_application_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."application_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_route_access" ADD CONSTRAINT "service_route_access_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_route_access" ADD CONSTRAINT "service_route_access_caller_client_id_oauth_clients_id_fk" FOREIGN KEY ("caller_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_identity_provider_id_identity_providers_id_fk" FOREIGN KEY ("identity_provider_id") REFERENCES "public"."identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federated_identities" ADD CONSTRAINT "federated_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_providers" ADD CONSTRAINT "identity_providers_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_resources" ADD CONSTRAINT "api_resources_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_redirect_uris" ADD CONSTRAINT "oauth_client_redirect_uris_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_scope_grants" ADD CONSTRAINT "oauth_client_scope_grants_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_scope_grants" ADD CONSTRAINT "oauth_client_scope_grants_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_secrets" ADD CONSTRAINT "oauth_client_secrets_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_logout_deliveries" ADD CONSTRAINT "oidc_logout_deliveries_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_api_resource_id_api_resources_id_fk" FOREIGN KEY ("api_resource_id") REFERENCES "public"."api_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_refresh_token_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."refresh_token_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_directory" ADD CONSTRAINT "scim_directory_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_directory" ADD CONSTRAINT "scim_directory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_group_id_scim_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scim_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_directory_id_scim_directory_id_fk" FOREIGN KEY ("directory_id") REFERENCES "public"."scim_directory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_groups_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_domains" ADD CONSTRAINT "organisation_domains_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_configurations" ADD CONSTRAINT "application_configurations_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_members" ADD CONSTRAINT "application_members_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_members" ADD CONSTRAINT "application_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_roles" ADD CONSTRAINT "application_roles_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_auth_identities" ADD CONSTRAINT "user_auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_passwords" ADD CONSTRAINT "user_passwords_user_auth_identity_id_user_auth_identities_id_fk" FOREIGN KEY ("user_auth_identity_id") REFERENCES "public"."user_auth_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_phones" ADD CONSTRAINT "user_phones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_organisation_id_id_idx" ON "audit_events" USING btree ("organisation_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_action_id_idx" ON "audit_events" USING btree ("action","id");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_status_idx" ON "user_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "user_sign_in_events_user_id_created_at_idx" ON "user_sign_in_events" USING btree ("user_id","created_at","status");--> statement-breakpoint
CREATE INDEX "user_sign_in_events_identifier_created_at_idx" ON "user_sign_in_events" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "user_sign_in_events_ip_address_created_at_idx" ON "user_sign_in_events" USING btree ("ip_address","created_at");--> statement-breakpoint
CREATE INDEX "service_route_access_application_id_idx" ON "service_route_access" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "verification_challenges_flow_id_idx" ON "verification_challenges" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "verification_challenges_target_created_at_idx" ON "verification_challenges" USING btree ("target","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consents_user_client_active_idx" ON "consents" USING btree ("user_id","client_id") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "webauthn_credentials_user_id_idx" ON "webauthn_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "federated_identities_user_idx" ON "federated_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signing_keys_single_active_idx" ON "signing_keys" USING btree ("purpose") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "notification_outbox_status_next_attempt_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "oauth_client_secrets_client_id_idx" ON "oauth_client_secrets" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oidc_logout_deliveries_claim_idx" ON "oidc_logout_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "refresh_token_families_user_id_status_idx" ON "refresh_token_families" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "refresh_token_families_session_id_idx" ON "refresh_token_families" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_family_active_idx" ON "refresh_tokens" USING btree ("family_id") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_directory_org_user_unique" ON "scim_directory" USING btree ("organisation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scim_directory_org_user_name_unique" ON "scim_directory" USING btree ("organisation_id",lower("user_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "scim_directory_org_external_id_unique" ON "scim_directory" USING btree ("organisation_id","external_id") WHERE "scim_directory"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "scim_groups_org_display_name_unique" ON "scim_groups" USING btree ("organisation_id",lower("display_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domains_org_domain_unique" ON "organisation_domains" USING btree ("organisation_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_domains_verified_unique" ON "organisation_domains" USING btree ("domain") WHERE "organisation_domains"."status" = 'VERIFIED';--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_invitations_pending_unique" ON "organisation_invitations" USING btree ("organisation_id","email") WHERE "organisation_invitations"."accepted_at" IS NULL AND "organisation_invitations"."declined_at" IS NULL AND "organisation_invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "organisation_invitations_email_idx" ON "organisation_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "application_members_user_id_idx" ON "application_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "application_roles_application_id_idx" ON "application_roles" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_verified_email_unique" ON "user_emails" USING btree (lower("email_id")) WHERE "user_emails"."verified_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_primary_unique" ON "user_emails" USING btree ("user_id") WHERE "user_emails"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "user_phones_verified_phone_unique" ON "user_phones" USING btree ("phone_number") WHERE "user_phones"."verified_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_phones_primary_unique" ON "user_phones" USING btree ("user_id") WHERE "user_phones"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_subscription_event_unique" ON "webhook_deliveries" USING btree ("subscription_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_claim_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");