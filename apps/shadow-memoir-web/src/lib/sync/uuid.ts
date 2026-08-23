const HEX = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

/**
 * UUIDv7 — a 48-bit millisecond timestamp followed by randomness, so a batch of outbox ids sorts into the
 * order the owner performed them even after a restart shuffles insertion order. The platform ships no
 * generator (`crypto.randomUUID` is v4, which is unordered), and ADR-0006 specifies v7 for command ids.
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const timestamp = BigInt(now);
  for (let index = 0; index < 6; index += 1) bytes[index] = Number((timestamp >> BigInt(8 * (5 - index))) & 0xffn);

  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => HEX[byte] as string);
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
