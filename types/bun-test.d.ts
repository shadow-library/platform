import 'bun:test';

// Wired into every workspace through `tsconfig.base.json`'s `files`.
declare module 'bun:test' {
  export interface Expect {
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    <T = unknown>(actual?: T, customFailMessage?: string): Matchers<unknown>;
  }
}
