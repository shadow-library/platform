export interface WrappedKey {
  kid: string;
  wrapped: Buffer;
}

/** Asynchronous so a KMS or Transit implementation fits unchanged. `context` is bound as AAD, so a wrapped key cannot move to another row. */
export interface Keyring {
  readonly activeKeyId: string;
  has(kid: string): boolean;
  wrap(dek: Buffer, context: string): Promise<WrappedKey>;
  unwrap(kid: string, wrapped: Buffer, context: string): Promise<Buffer>;
}
