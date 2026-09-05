import { AppError } from '@shadow-library/common';

export interface BootstrapAdminPassword {
  password: string;
  generated: boolean;
}

/**
 * A generated secret must never reach the structured logger (MEDIUM-001): in a production
 * deployment there is no legitimate reader for it, so it is dropped entirely; elsewhere it is
 * still worth surfacing for local wiring, so it goes to stdout directly, bypassing the winston
 * transports that ship to aggregation.
 */
export const announceSecretOnce = (heading: string, secret: string, isProductionDeployment: boolean): void => {
  if (isProductionDeployment) return;
  process.stdout.write(`\n[bootstrap] ${heading} — shown once, copy it now:\n  ${secret}\n\n`);
};

/**
 * A production deployment cannot fall back to a generated password with no channel to disclose it
 * safely, so it must fail fast instead. Elsewhere, a missing password is generated for the caller
 * to disclose via `announceSecretOnce`.
 */
export const resolveBootstrapAdminPassword = (configuredPassword: string, isProductionDeployment: boolean, generate: () => string): BootstrapAdminPassword => {
  if (configuredPassword) return { password: configuredPassword, generated: false };
  if (isProductionDeployment) throw AppError.internal("Environment variable 'AUTH_BOOTSTRAP_ADMIN_PASSWORD' must be set in a production deployment");
  return { password: generate(), generated: true };
};
