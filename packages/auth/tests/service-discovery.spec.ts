/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { ServiceDiscovery } from '@shadow-library/auth';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('ServiceDiscovery', () => {
  it('should resolve a service name to its in-cluster svc domain by default', () => {
    const discovery = new ServiceDiscovery({ env: {} });
    expect(discovery.resolve('pulse')).toBe('http://pulse');
    expect(discovery.url('pulse', '/api/v1/send')).toBe('http://pulse/api/v1/send');
    expect(discovery.url('pulse', 'api/v1/send')).toBe('http://pulse/api/v1/send');
  });

  it('should apply the discovery suffix and scheme from the environment', () => {
    const discovery = new ServiceDiscovery({ env: { SERVICE_DISCOVERY_SUFFIX: '.prod.svc.cluster.local', SERVICE_DISCOVERY_SCHEME: 'https' } });
    expect(discovery.resolve('pulse')).toBe('https://pulse.prod.svc.cluster.local');
  });

  it('should prefer a per-service env override over the default svc domain', () => {
    const discovery = new ServiceDiscovery({ env: { SERVICE_URL_PULSE_SERVER: 'https://pulse.shadow-apps.com/' } });
    expect(discovery.resolve('pulse-server')).toBe('https://pulse.shadow-apps.com');
    expect(discovery.resolve('other')).toBe('http://other');
  });

  it('should reject invalid service names and malformed overrides', () => {
    const discovery = new ServiceDiscovery({ env: { SERVICE_URL_BAD: 'not a url' } });
    expect(() => discovery.resolve('Not_A_Svc')).toThrow(AppError);
    expect(() => discovery.resolve('bad')).toThrow(AppError);
  });
});
