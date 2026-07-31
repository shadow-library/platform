/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppError, ErrorCode, ServiceDiscovery, ServiceDiscoveryService } from '@shadow-library/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const ENV_KEYS = ['SERVICE_URL_PULSE_SERVER', 'SERVICE_URL_IDENTITY_SERVER_IDENTITY', 'SERVICE_DISCOVERY_SCHEME'];

describe('ServiceDiscovery', () => {
  beforeEach(() => ENV_KEYS.forEach(key => delete process.env[key]));

  it('should be a singleton instance of the service', () => {
    expect(ServiceDiscovery).toBeInstanceOf(ServiceDiscoveryService);
    expect(ServiceDiscovery).toBe(ServiceDiscovery);
  });

  describe('getUrl', () => {
    it('should address a service by its own name through cluster dns', () => {
      expect(ServiceDiscovery.getUrl('pulse-server')).toBe('http://pulse-server');
    });

    it('should accept a dotted name so another namespace can be targeted', () => {
      expect(ServiceDiscovery.getUrl('identity-server.identity')).toBe('http://identity-server.identity');
    });

    /** The override key replaces dots as well as dashes, so a cross-namespace name is still addressable */
    it('should read a dotted name override from SERVICE_URL_IDENTITY_SERVER_IDENTITY', () => {
      process.env['SERVICE_URL_IDENTITY_SERVER_IDENTITY'] = 'http://localhost:8080';
      expect(ServiceDiscovery.getUrl('identity-server.identity')).toBe('http://localhost:8080');
    });

    it('should honour a SERVICE_URL_<NAME> override carrying its own scheme', () => {
      process.env['SERVICE_URL_PULSE_SERVER'] = 'https://localhost:3000';
      expect(ServiceDiscovery.getUrl('pulse-server')).toBe('https://localhost:3000');
    });

    it('should strip a trailing slash from an override', () => {
      process.env['SERVICE_URL_PULSE_SERVER'] = 'https://localhost:3000/';
      expect(ServiceDiscovery.getUrl('pulse-server')).toBe('https://localhost:3000');
    });

    it('should apply the discovery scheme to a schemeless override', () => {
      process.env['SERVICE_DISCOVERY_SCHEME'] = 'https';
      process.env['SERVICE_URL_PULSE_SERVER'] = 'localhost:3000';
      expect(ServiceDiscovery.getUrl('pulse-server')).toBe('https://localhost:3000');
    });

    it('should apply the discovery scheme to the in-cluster host too', () => {
      process.env['SERVICE_DISCOVERY_SCHEME'] = 'https';
      expect(ServiceDiscovery.getUrl('pulse-server')).toBe('https://pulse-server');
    });

    it('should reject a name that is not a dns label', () => {
      const failure = (() => {
        try {
          return ServiceDiscovery.getUrl('Pulse_Server');
        } catch (error: unknown) {
          return error;
        }
      })();
      expect(AppError.is(failure, ErrorCode.SERVICE_UNKNOWN)).toBe(true);
    });

    it('should reject an override that is not a valid url', () => {
      process.env['SERVICE_URL_PULSE_SERVER'] = 'http://';
      expect(() => ServiceDiscovery.getUrl('pulse-server')).toThrow(AppError);
    });

    /** The override is read per call, so a value set after first use still takes effect */
    it('should observe an override set after a previous resolution', () => {
      expect(ServiceDiscovery.getUrl('pulse-server')).toBe('http://pulse-server');
      process.env['SERVICE_URL_PULSE_SERVER'] = 'http://localhost:4000';
      expect(ServiceDiscovery.getUrl('pulse-server')).toBe('http://localhost:4000');
    });
  });

  describe('resolve', () => {
    it('should resolve a svc:// url and keep the path', () => {
      expect(ServiceDiscovery.resolve('svc://pulse-server/api/v1/notifications')).toBe('http://pulse-server/api/v1/notifications');
    });

    it('should resolve a svc:// url that carries no path', () => {
      expect(ServiceDiscovery.resolve('svc://pulse-server')).toBe('http://pulse-server');
    });

    it('should join an override to the path without doubling the slash', () => {
      process.env['SERVICE_URL_PULSE_SERVER'] = 'https://localhost:3000/';
      expect(ServiceDiscovery.resolve('svc://pulse-server/api/v1/notifications')).toBe('https://localhost:3000/api/v1/notifications');
    });

    it('should return any other url untouched', () => {
      expect(ServiceDiscovery.resolve('https://identity.shadow-apps.test/oauth2/token')).toBe('https://identity.shadow-apps.test/oauth2/token');
      expect(ServiceDiscovery.resolve('/api/v1/posts')).toBe('/api/v1/posts');
    });
  });
});
