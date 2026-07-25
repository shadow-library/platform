/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The Tier-1 baseline (architecture §13.2) every request answers to, and the per-client budget that
 * replaces it once an M2M caller has proven who it is (T-804). The client budget is the looser of
 * the two on purpose: it bounds one application rather than one network egress, so the number that
 * matters is what a single misbehaving deployment can do, not what a whole fleet needs.
 */
export const IP_GENERAL_BUCKET = 'ip-general';
export const GENERAL_LIMIT = 100;
export const GENERAL_WINDOW_SECONDS = 60;

export const M2M_CLIENT_BUCKET = 'm2m-client';
export const M2M_CLIENT_LIMIT = 600;
export const M2M_CLIENT_WINDOW_SECONDS = 60;
