import { AppErrorCode } from '@server/classes';

const SUBJECT_PREFIX = 'system:serviceaccount:';
const LABEL = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const NAME_SEGMENT = /^[a-z0-9*]([-a-z0-9*]*[a-z0-9*])?$/;

interface SubjectParts {
  namespace: string;
  name: string;
}

const parseParts = (value: string): SubjectParts | null => {
  if (!value.startsWith(SUBJECT_PREFIX)) return null;
  const segments = value.split(':');
  if (segments.length !== 4 || segments[0] !== 'system' || segments[1] !== 'serviceaccount') return null;
  return { namespace: segments[2] as string, name: segments[3] as string };
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isWorkloadPattern = (binding: string): boolean => binding.includes('*');

export const assertValidWorkloadBinding = (binding: string): void => {
  const parts = parseParts(binding);
  if (!parts) throw AppErrorCode.ADM_007.create();
  if (!LABEL.test(parts.namespace)) throw AppErrorCode.ADM_007.create();
  if (!NAME_SEGMENT.test(parts.name)) throw AppErrorCode.ADM_007.create();
};

export const matchesWorkloadBinding = (binding: string, subject: string): boolean => {
  if (!isWorkloadPattern(binding)) return binding === subject;
  const pattern = parseParts(binding);
  const target = parseParts(subject);
  if (!pattern || !target || pattern.namespace !== target.namespace) return false;
  const nameRegex = new RegExp(`^${pattern.name.split('*').map(escapeRegex).join('[a-z0-9-]*')}$`);
  return nameRegex.test(target.name);
};
