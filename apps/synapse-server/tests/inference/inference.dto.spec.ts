import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { ClassSchema, TransformerFactory } from '@shadow-library/class-schema';
import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';

import { ChatCompletionBody, EmbeddingsBody, ImageGenerationBody } from '@modules/inference/inference.dto';
import { httpServerConfig } from '@modules/http-server.config';

const SECRET = 'the plot twist nobody may read';

/** The filter and action the router compiles its request-log masks with */
const masks = new TransformerFactory(schema => schema['x-fastify']?.sensitive === true);
const logged = (Body: object, body: object): string => {
  const mask = masks.maybeCompile(ClassSchema.generate(Body as never));
  return JSON.stringify(mask ? mask(structuredClone(body), () => '****') : body);
};

let restoreConfig: RestoreConfig;
beforeAll(() => {
  restoreConfig = setConfig({ 'server.host': '0.0.0.0', 'server.port': 8080, 'synapse.server.keep-alive-timeout-ms': 5000, 'synapse.server.max-requests-per-socket': 50 });
});
afterAll(() => restoreConfig());

describe('inference request bodies in the request log', () => {
  const synapse = { request_id: 'req-1', subject: { type: 'owner', id: 'o-1' } };

  it('should carry no chat message text, in string or part content', () => {
    const body = {
      model: 'novel-forge.chat',
      messages: [
        { role: 'system', content: SECRET },
        {
          role: 'user',
          content: [
            { type: 'text', text: SECRET },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${SECRET}` } },
          ],
        },
      ],
      synapse,
    };
    const line = logged(ChatCompletionBody, body);
    expect(line).not.toContain(SECRET);
    expect(line).toContain('"messages":"****"');
    expect(line).toContain('"request_id":"req-1"');
  });

  it('should carry no embedding input, as a string or a list', () => {
    for (const input of [SECRET, [SECRET, SECRET]]) expect(logged(EmbeddingsBody, { model: 'novel-forge.embedding', input, synapse })).not.toContain(SECRET);
  });

  it('should carry no image prompt or reference image', () => {
    const line = logged(ImageGenerationBody, { model: 'novel-forge.image', prompt: SECRET, reference_images: [`https://cdn.test/${SECRET}`], synapse });
    expect(line).not.toContain(SECRET);
  });

  it('should be masked on every stage, not only in production', () => {
    expect(httpServerConfig()).toMatchObject({ maskSensitiveData: true, bodyLimit: 8 * 1024 * 1024, keepAliveTimeout: 5000, maxRequestsPerSocket: 50 });
  });
});
