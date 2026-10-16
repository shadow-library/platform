import { describe, expect, it } from 'bun:test';

import { capabilitiesOf, SYNAPSE_PERMISSIONS } from '../src/lib/access';

describe('capabilitiesOf', () => {
  it('should grant a viewer reading only', () => {
    expect(capabilitiesOf([SYNAPSE_PERMISSIONS.catalogRead, SYNAPSE_PERMISSIONS.usageRead])).toEqual({
      readCatalog: true,
      writeDraft: false,
      publish: false,
      writeProviders: false,
      writeBudgets: false,
      readUsage: true,
    });
  });

  it('should let an operator edit the draft but not publish it', () => {
    const capabilities = capabilitiesOf([SYNAPSE_PERMISSIONS.catalogRead, SYNAPSE_PERMISSIONS.catalogWrite, SYNAPSE_PERMISSIONS.usageRead]);
    expect(capabilities.writeDraft).toBe(true);
    expect(capabilities.publish).toBe(false);
  });

  it('should grant nothing for permissions of another application', () => {
    expect(Object.values(capabilitiesOf(['pulse:templates:read', 'synapse:infer'])).every(granted => !granted)).toBe(true);
  });
});
