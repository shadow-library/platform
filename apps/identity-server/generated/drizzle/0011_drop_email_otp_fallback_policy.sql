-- The email-OTP fallback switch left the registry: email OTP is a first-factor and recovery channel, never a second factor, so the switch gated
-- nothing. Its audit_events rows (target_type organisation_policy) are left as recorded evidence. A row an older replica writes after this runs is
-- ignored on read, as every key outside the registry is.
DELETE FROM "organisation_policies" WHERE "policy_key" = 'mfa.email_otp_fallback.enabled';
