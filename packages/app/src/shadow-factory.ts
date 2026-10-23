import { Class } from 'type-fest';

import { ShadowApplication, ShadowApplicationOptions } from './shadow-application';

export class ShadowFactoryStatic {
  async create(module: Class<unknown>, options?: ShadowApplicationOptions): Promise<ShadowApplication> {
    const app = new ShadowApplication(module, options);
    return await app.init();
  }
}

export const ShadowFactory = new ShadowFactoryStatic();
