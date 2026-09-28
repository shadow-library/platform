import { describe, expect, it } from 'bun:test';

import { ClassSchema, type JSONSchema, type ParsedSchema, type SchemaClass, TransformerFactory } from '@shadow-library/class-schema';

import { CreateNotificationBody, ListNotificationMessagesQuery } from '@modules/notification/notifications.dto';
import { PreviewBody } from '@modules/template/template-version.dto';

const RECIPIENTS = { email: 'jane.doe@example.com', phone: '+14155550123', push: 'fcm:device-token-xy' };
const PAYLOAD = { name: 'Ada Lovelace', resetLink: 'https://shadow.app/reset/abc123', ipAddress: '203.0.113.7' };

/** Mirrors the router's request logger: the compiled mask replaces each `@Sensitive` field with what the mask callback returns. */
function logMask(dto: SchemaClass, value: Record<string, unknown>): Record<string, unknown> {
  const mask = new TransformerFactory(schema => schema['x-fastify']?.sensitive === true).maybeCompile(ClassSchema.generate(dto) as ParsedSchema);
  if (!mask) return value;
  const tag = (_value: unknown, schema: JSONSchema): string => `<masked:${String(schema['x-fastify']?.type ?? 'custom')}>`;
  return mask(structuredClone(value), tag) as Record<string, unknown>;
}

describe('notification DTO log masks', () => {
  it('should mask every recipient and the whole payload of a send body, leaving the template key readable', () => {
    const masked = logMask(CreateNotificationBody, { templateKey: 'sign-up', recipients: RECIPIENTS, payload: PAYLOAD, locale: 'en-US', service: 'auth' });

    expect(masked).toEqual({
      templateKey: 'sign-up',
      recipients: { email: '<masked:email>', phone: '<masked:number>', push: '<masked:secret>' },
      payload: '<masked:secret>',
      locale: 'en-US',
      service: 'auth',
    });
  });

  it('should mask the recipient filter of the message-log query', () => {
    expect(logMask(ListNotificationMessagesQuery, { recipient: RECIPIENTS.email })).toMatchObject({ recipient: '<masked:secret>' });
  });

  it('should mask the sample data of a template preview', () => {
    expect(logMask(PreviewBody, { channel: 'EMAIL', data: PAYLOAD })).toEqual({ channel: 'EMAIL', data: '<masked:secret>' });
  });
});
