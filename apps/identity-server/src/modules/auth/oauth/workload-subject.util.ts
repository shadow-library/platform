/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * A workload binding is either an exact k8s SA subject (`system:serviceaccount:<ns>:<name>`) or a
 * namespace-scoped pattern whose name segment carries a `*` wildcard (`…:<ns>:*`, `…:<ns>:web-*`).
 * The namespace segment must always be a literal label: a `*` there would grant any namespace in the
 * cluster, so it is rejected outright (D-16). Patterns only ever match when an explicit `client_id`
 * accompanies the assertion; the subject-only resolution path compares exact strings and so never
 * sees a wildcard.
 */
const SUBJECT_PREFIX = 'system:serviceaccount:';
/** A DNS-style label: lowercase alphanumeric with internal hyphens. No wildcard. */
const LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
/** A name segment: a label that may additionally contain `*` wildcards. */
const NAME_SEGMENT = /^[a-z0-9*]([-a-z0-9*]*[a-z0-9*])?$/;

interface SubjectParts {
  namespace: string;
  name: string;
}

/** Splits `system:serviceaccount:<ns>:<name>` into its namespace/name, or null when malformed. */
const parseParts = (value: string): SubjectParts | null => {
  if (!value.startsWith(SUBJECT_PREFIX)) return null;
  const segments = value.split(':');
  if (segments.length !== 4 || segments[0] !== 'system' || segments[1] !== 'serviceaccount') return null;
  return { namespace: segments[2] as string, name: segments[3] as string };
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A binding is a pattern (rather than an exact subject) when it carries a `*` wildcard. */
export const isWorkloadPattern = (binding: string): boolean => binding.includes('*');

/**
 * Validates an admin-supplied workload binding. Accepts an exact subject or a namespace-scoped
 * pattern; rejects a `*` in the namespace position (cluster-wide grants) and any malformed value.
 */
export const assertValidWorkloadBinding = (binding: string): void => {
  const parts = parseParts(binding);
  if (!parts) throw AppErrorCode.ADM_007.create();
  if (!LABEL.test(parts.namespace)) throw AppErrorCode.ADM_007.create();
  if (!NAME_SEGMENT.test(parts.name)) throw AppErrorCode.ADM_007.create();
};

/**
 * Tests whether a verified concrete subject is covered by a binding. Exact bindings compare by
 * equality; patterns match the namespace by equality and the name segment-anchored, with each `*`
 * expanding to `[a-z0-9-]*` so a wildcard never spans the `:` separator.
 */
export const matchesWorkloadBinding = (binding: string, subject: string): boolean => {
  if (!isWorkloadPattern(binding)) return binding === subject;
  const pattern = parseParts(binding);
  const target = parseParts(subject);
  if (!pattern || !target || pattern.namespace !== target.namespace) return false;
  const nameRegex = new RegExp(`^${pattern.name.split('*').map(escapeRegex).join('[a-z0-9-]*')}$`);
  return nameRegex.test(target.name);
};
