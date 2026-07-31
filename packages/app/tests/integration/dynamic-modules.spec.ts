/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppModule } from '@examples/dynamic-modules/app.module';
import { AppService } from '@examples/dynamic-modules/app.service';
import { ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Dynamic Modules', () => {
  let app: ShadowApplication;

  beforeEach(async () => {
    app = await ShadowFactory.create(AppModule);
  });

  it('should load dynamic modules correctly', async () => {
    const appService = app.select(AppModule).get(AppService);
    expect(appService.getHello()).toBe('Hello there, world!');
  });
});
