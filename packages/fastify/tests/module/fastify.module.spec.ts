/**
 * Importing npm packages
 */
import { describe, expect, it, jest } from '@jest/globals';
import { Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { createFastifyInstance } from '@lib/module/fastify.utils';
import { FastifyModule } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const decorator = jest.fn();
jest.mock('@lib/module/fastify.utils', () => ({ createFastifyInstance: jest.fn() }));
jest.mock('@shadow-library/app', () => {
  const actual = jest.requireActual('@shadow-library/app') as object;
  return { ...actual, Module: jest.fn(() => decorator) };
});

describe('FastifyModule', () => {
  it('should setup the module for static config', () => {
    const module = FastifyModule.forRoot({});
    const metadata = jest.mocked(Module).mock.calls[0]?.[0] as any;
    metadata.providers[2]?.useFactory?.();
    const config = metadata.providers[1]?.useFactory?.();

    expect(module).toBe(FastifyModule);
    expect(metadata.imports).toStrictEqual([]);
    expect(metadata.providers).toHaveLength(3);
    expect(metadata.exports).toHaveLength(1);

    expect(createFastifyInstance).toBeCalled();
    expect(config.genReqId()).toHaveLength(36);
  });
});
