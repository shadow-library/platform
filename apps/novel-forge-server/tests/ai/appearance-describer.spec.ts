import { describe, expect, it, mock } from 'bun:test';

import { AppearanceDescriberService } from '@modules/ai/appearance-describer.service';
import { appearanceDescribePrompt } from '@modules/ai/prompts/appearance-describe.prompt';

const IMAGE = 'data:image/webp;base64,UklGRg==';

function makeDescriber(output: unknown): { describer: AppearanceDescriberService; structuredWithImage: ReturnType<typeof mock> } {
  const structuredWithImage = mock(async () => output);
  const describer = new AppearanceDescriberService({ structuredWithImage } as never);
  return { describer, structuredWithImage };
}

describe('AppearanceDescriberService', () => {
  const project = { contentMode: 'standard' };

  it('should return the parsed description with surrounding whitespace trimmed', async () => {
    const { describer } = makeDescriber({
      appearance: '  Lean, sharp-featured woman with a braided silver plait.  ',
      confidence: 'medium',
      ambiguity: '  two women; chose the taller  ',
    });

    const result = await describer.describe({ projectId: 7n, project, imageDataUrl: IMAGE, subjectLabel: 'Mira', note: 'the taller woman' });

    expect(result).toEqual({ appearance: 'Lean, sharp-featured woman with a braided silver plait.', confidence: 'medium', ambiguity: 'two women; chose the taller' });
  });

  it('should pass the image beside the prompt input rather than inside it', async () => {
    const { describer, structuredWithImage } = makeDescriber({ appearance: 'Lean, sharp-featured woman with a braided silver plait.', confidence: 'high' });

    await describer.describe({ projectId: 7n, project, imageDataUrl: IMAGE, subjectLabel: 'Mira', note: 'the taller woman', runId: 'run-1' });

    const [prompt, input, image, ctx, passedProject] = structuredWithImage.mock.calls[0] as unknown as [unknown, Record<string, unknown>, string, Record<string, unknown>, unknown];
    expect(prompt).toBe(appearanceDescribePrompt);
    expect(input).toEqual({ subjectLabel: 'Mira', note: 'the taller woman' });
    expect(JSON.stringify(input)).not.toContain('base64');
    expect(image).toBe(IMAGE);
    expect(ctx).toEqual({ projectId: 7n, runId: 'run-1', promptKey: 'appearance-describe', promptVersion: '1.0.0', role: 'vision' });
    expect(passedProject).toBe(project);
  });

  it('should tell the model to identify the subject itself when the note is missing or blank', async () => {
    const { describer, structuredWithImage } = makeDescriber({ appearance: 'Lean, sharp-featured woman with a braided silver plait.', confidence: 'high', ambiguity: '   ' });

    const result = await describer.describe({ projectId: 7n, imageDataUrl: IMAGE, subjectLabel: 'Mira', note: '   ' });

    const input = structuredWithImage.mock.calls[0]?.[1] as unknown as { note: string };
    expect(input.note).toContain('identify the subject yourself');
    expect(result).not.toHaveProperty('ambiguity');
  });

  it('should refuse a remote or malformed image URL with AI_012 before calling the model', async () => {
    const { describer, structuredWithImage } = makeDescriber({ appearance: 'unused', confidence: 'high' });

    for (const imageDataUrl of ['https://cdn.example.com/cover.png', 'data:text/plain;base64,aGk=', 'data:image/png;base64,', 'data:image/png,raw']) {
      await expect(describer.describe({ projectId: 7n, imageDataUrl, subjectLabel: 'Mira' })).rejects.toMatchObject({ code: 'AI_012' });
    }
    expect(structuredWithImage).not.toHaveBeenCalled();
  });

  it('should propagate router errors such as an image-incapable model', async () => {
    const structuredWithImage = mock(async () => {
      throw Object.assign(new Error('Model qwen3:8b does not accept image input'), { code: 'AI_011' });
    });
    const describer = new AppearanceDescriberService({ structuredWithImage } as never);

    await expect(describer.describe({ projectId: 7n, imageDataUrl: IMAGE, subjectLabel: 'Mira' })).rejects.toMatchObject({ code: 'AI_011' });
  });
});
