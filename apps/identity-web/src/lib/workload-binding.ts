const WORKLOAD_BINDING_PATTERN = /^system:serviceaccount:[a-z0-9]([-a-z0-9]*[a-z0-9])?:[a-z0-9*]([-a-z0-9*]*[a-z0-9*])?$/;

export function isValidWorkloadBinding(value: string): boolean {
  return WORKLOAD_BINDING_PATTERN.test(value);
}
