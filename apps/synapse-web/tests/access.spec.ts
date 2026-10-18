import { describe, expect, it } from 'bun:test';

import { accessStatusOf, capabilitiesOf, SYNAPSE_PERMISSIONS } from '../src/lib/access';

describe('capabilitiesOf', () => {
  it('should grant a viewer reading only', () => {
    expect(capabilitiesOf([SYNAPSE_PERMISSIONS.catalogRead, SYNAPSE_PERMISSIONS.usageRead])).toEqual({
      readCatalog: true,
      writeDraft: false,
      publish: false,
      writeProviders: false,
      manageCredentials: false,
      writeBudgets: false,
      readUsage: true,
    });
  });

  it('should let an operator edit the draft but not publish it', () => {
    const capabilities = capabilitiesOf([SYNAPSE_PERMISSIONS.catalogRead, SYNAPSE_PERMISSIONS.catalogWrite, SYNAPSE_PERMISSIONS.usageRead]);
    expect(capabilities.writeDraft).toBe(true);
    expect(capabilities.publish).toBe(false);
  });

  it('should grant credential management on its own permission, not on the provider write permission', () => {
    expect(capabilitiesOf([SYNAPSE_PERMISSIONS.providersWrite]).manageCredentials).toBe(false);
    expect(capabilitiesOf([SYNAPSE_PERMISSIONS.credentialsManage]).manageCredentials).toBe(true);
  });

  it('should grant nothing for permissions of another application', () => {
    expect(Object.values(capabilitiesOf(['pulse:templates:read', 'synapse:infer'])).every(granted => !granted)).toBe(true);
  });
});

describe('accessStatusOf', () => {
  it('should read a failed check with no earlier answer as unavailable, not as a denial', () => {
    expect(accessStatusOf({ data: undefined, isError: true })).toBe('unavailable');
  });

  it('should keep an earlier answer when a later refetch fails', () => {
    expect(accessStatusOf({ data: { permissions: [] }, isError: true })).toBe('known');
  });

  it('should be pending while the first answer is in flight', () => {
    expect(accessStatusOf({ data: undefined, isError: false })).toBe('pending');
  });

  it('should treat an answer holding no permissions as known', () => {
    expect(accessStatusOf({ data: { permissions: [] }, isError: false })).toBe('known');
  });
});
