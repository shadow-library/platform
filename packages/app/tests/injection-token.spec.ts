/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { Inject, Injectable, InjectionToken, Module, ShadowFactory } from '@shadow-library/app';

/**
 * Defining types
 */

interface AppConfig {
  name: string;
  port: number;
}

/**
 * Declaring the constants
 */

describe('InjectionToken', () => {
  it('should expose its description', () => {
    const token = new InjectionToken('CONFIG');
    expect(token.description).toBe('CONFIG');
  });

  it('should stringify to a readable label', () => {
    const token = new InjectionToken('CONFIG');
    expect(token.toString()).toBe('InjectionToken(CONFIG)');
    expect(`${token}`).toBe('InjectionToken(CONFIG)');
  });

  it('should resolve providers keyed by a typed token', async () => {
    const CONFIG = new InjectionToken<AppConfig>('CONFIG');

    @Injectable()
    class ConfigConsumer {
      constructor(@Inject(CONFIG) readonly config: AppConfig) {}
    }

    @Module({
      providers: [ConfigConsumer, { token: CONFIG, useValue: { name: 'app', port: 80 } }],
      exports: [ConfigConsumer, CONFIG],
    })
    class AppModule {}

    const app = await ShadowFactory.create(AppModule);

    expect(app.get(CONFIG)).toEqual({ name: 'app', port: 80 });
    expect(app.get(ConfigConsumer).config).toEqual({ name: 'app', port: 80 });
  });
});
