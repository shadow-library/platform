import { describe, expect, it } from 'bun:test';

import { blueprintEnginePrompt } from '@modules/ai/prompts/blueprint-engine.prompt';
import { type BlueprintEngineOutput } from '@modules/ai/schemas/blueprint-engine.schema';
import { type EngineOptions, enginePass, engineSliceApplies, mergeEngineSlices } from '@modules/blueprint/steps/engine.step';
import { type Ledger } from '@server/database';

import { ledgerEntry } from './blueprint-fixtures';

function version(lie: string): { lie: string; wound: string; want: string; need: string; change: string; chapterOne: string } {
  return {
    lie,
    wound: 'Left at the harbour at six',
    want: 'A keeper’s licence',
    need: 'To be wanted when useless',
    change: 'From useful to chosen',
    chapterOne: `Acts on: ${lie}`,
  };
}

function output(overrides: Partial<BlueprintEngineOutput> = {}): BlueprintEngineOutput {
  return {
    protagonist: { leads: [{ name: 'Arden', descriptor: '17, lamp apprentice', versions: [version('"I am owed"'), version('"Nobody stays"'), version('"I must be useful"')] }] },
    opposition: {
      preselected: 'person',
      why: 'The promise runs on political intrigue.',
      forms: [
        {
          kind: 'person',
          name: 'Warden Sel',
          summary: 'Keeps the lamps lit by rationing oil',
          argument: 'The coast eats what it is not fed.',
          wants: 'A coast that never goes dark',
          neverWill: 'Burn her own ration',
        },
        {
          kind: 'system',
          name: 'The Lamp Office',
          summary: 'No villain, only quotas',
          faces: [
            { arc: 'arc one', face: 'A clerk' },
            { arc: 'arc two', face: 'An auditor' },
          ],
        },
        { kind: 'nature', name: 'The winter sea', summary: 'It arrives on a calendar', rhythm: 'Every spring tide' },
        { kind: 'self', name: 'Arden’s lie', summary: 'His own lie opposes him', costOfWinning: 'Every win that feeds the lie costs him a friend' },
        {
          kind: 'slice',
          name: 'The lamp house',
          summary: 'A year of keeping a small light',
          goals: ['Keep the lamp house open through winter', 'Earn the harbour’s trust'],
          rhythm: 'Seasons and market days',
          stakes: 'A friendship strained, a recipe lost',
          returnsFor: 'Comfort and small wins',
        },
      ],
    },
    world: {
      summary: 'A coast that pays for its light',
      costRules: [
        { rule: 'Every lit hour costs a named memory', why: 'It makes power personal', writerLine: 'Name the memory the lamp spends' },
        { rule: 'Every lit hour costs a year of sight', why: 'It makes power visible', writerLine: 'Show the dimming eyes' },
      ],
      rules: [
        { rule: 'A lamp lit without a paid memory burns the keeper', why: 'Keeps the cost from being skipped' },
        { rule: 'Only a licensed keeper may open a memory jar', why: 'Gives the office its grip' },
        { rule: 'A spent memory can never be paid twice', why: 'Stops the ledger inflating' },
      ],
      honoured: ['Lifespan cost'],
    },
    power: {
      rungs: [
        { name: 'Taper', buys: 'One room of light', cost: 'An hour' },
        { name: 'Beacon', buys: 'A harbour of light', cost: 'A day' },
        { name: 'Watchfire', buys: 'A coast of light', cost: 'A person you loved' },
      ],
      note: 'Arden opens at Taper',
    },
    coachMessage: 'Built the engine from the premise and the promise.',
    ...overrides,
  };
}

const round = (out: BlueprintEngineOutput, previous: EngineOptions | null = null, focus: string | null = null): EngineOptions =>
  enginePass.toRound(out, { previous, input: null, focus }).options;

function promise(drivers: string[]): Ledger.Entry[] {
  return [ledgerEntry({ kind: 'decision', phase: 'heart', topic: 'promise', stepKey: 'promise', payload: { drivers } })];
}

describe('enginePass.toRound', () => {
  it('should slice one generation into the four screens with ids unique across the whole round', () => {
    const options = round(output());

    expect(options.protagonist?.versions.map(item => item.id)).toEqual(['pv1', 'pv2', 'pv3']);
    expect(options.protagonist?.leads).toEqual([{ id: 'l1', name: 'Arden', descriptor: '17, lamp apprentice' }]);
    expect(options.opposition?.forms.map(form => form.id)).toEqual(['op_person', 'op_system', 'op_nature', 'op_self', 'op_slice']);
    expect(options.world?.rules.map(rule => rule.id)).toEqual(['wr1', 'wr2', 'wr3']);
    expect(options.power?.rungs.map(rung => rung.id)).toEqual(['rg1', 'rg2', 'rg3']);

    const ids = enginePass.describeOptions(options).map(option => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should number two leads’ versions in one run so no two versions share an id', () => {
    const two = output({
      protagonist: {
        leads: [
          { name: 'Arden', descriptor: '17, lamp apprentice', versions: [version('"a"'), version('"b"'), version('"c"')] },
          { name: 'Wren', descriptor: '19, jar runner', versions: [version('"d"'), version('"e"'), version('"f"')] },
        ],
      },
    });

    const options = round(two);

    expect(options.protagonist?.versions.map(item => item.id)).toEqual(['pv1', 'pv2', 'pv3', 'pv4', 'pv5', 'pv6']);
    expect(options.protagonist?.versions.map(item => item.leadId)).toEqual(['l1', 'l1', 'l1', 'l2', 'l2', 'l2']);
  });

  it('should keep every unfocused slice byte-identical when a round is focused on one screen', () => {
    const first = round(output());
    const reworked = output({
      world: { ...output().world!, summary: 'A coast that pays twice' },
      protagonist: { leads: [{ name: 'Nobody', descriptor: 'x', versions: [version('"z"'), version('"y"'), version('"x"')] }] },
    });

    const second = round(reworked, first, 'world');

    expect(second.world?.summary).toBe('A coast that pays twice');
    expect(second.protagonist).toEqual(first.protagonist!);
    expect(second.opposition).toEqual(first.opposition!);
    expect(second.power).toEqual(first.power!);
  });

  it('should fail a round that produced nothing rather than leave every screen empty', () => {
    expect(() => round({ coachMessage: 'Nothing at all.' })).toThrow();
  });

  it('should keep the previous slice when a focused round answers with nothing for it', () => {
    const first = round(output());
    const second = round({ coachMessage: 'Nothing changed.' }, first, 'protagonist');
    expect(second).toEqual(first);
  });

  it('should keep a slice an unfocused round left out rather than dropping it from the screen', () => {
    const first = round(output());
    const second = round({ world: output().world, coachMessage: 'Reworked the world.' }, first);

    expect(second.protagonist).toEqual(first.protagonist!);
    expect(second.world).toEqual(first.world!);
  });
});

describe('blueprintEnginePrompt.postValidate', () => {
  it('should refuse an opposition whose kinds are not each an answer of their own', () => {
    const base = output();
    const without = (kind: string, patch: Record<string, unknown>): string[] =>
      blueprintEnginePrompt.postValidate!({
        ...base,
        opposition: { ...base.opposition!, forms: base.opposition!.forms.map(form => (form.kind === kind ? { ...form, ...patch } : form)) },
      });

    expect(blueprintEnginePrompt.postValidate!(base)).toEqual([]);
    expect(without('nature', { rhythm: '' })).toEqual(['nature or fate needs the rhythm it arrives on, or it is the same card as a person with no name']);
    expect(without('self', { costOfWinning: '' })).toEqual(['the protagonist’s own lie needs what every win that feeds it costs them, or it is not an opposition at all']);
    expect(without('person', { neverWill: '' })).toEqual(['the person needs their case in their own voice, what they want, and the line they will never cross']);
  });

  it('should refuse a round that produced none of the parts the scope asked for', () => {
    expect(blueprintEnginePrompt.postValidate!({ coachMessage: 'Nothing.' })).toEqual(['the scope section names the parts to produce, and this round produced none of them']);
  });
});

describe('mergeEngineSlices', () => {
  it('should take nothing from a fresh round for a slice that is not the focused one', () => {
    const previous: EngineOptions = { world: { summary: 'kept', costRules: [], rules: [], honoured: [] } };
    const fresh: EngineOptions = { world: { summary: 'moved', costRules: [], rules: [], honoured: [] }, power: { rungs: [], note: 'moved' } };

    expect(mergeEngineSlices(previous, fresh, 'power')).toEqual({ world: previous.world!, power: fresh.power! });
  });
});

describe('engineSliceApplies', () => {
  it('should ask for the opposition unless slice of life drives the novel, and for the ladder only with progression', () => {
    expect(engineSliceApplies('opposition', promise(['mystery']))).toBe(true);
    expect(engineSliceApplies('opposition', promise(['slice_of_life']))).toBe(false);
    expect(engineSliceApplies('power', promise(['progression']))).toBe(true);
    expect(engineSliceApplies('power', promise(['mystery']))).toBe(false);
    expect(engineSliceApplies('protagonist', [])).toBe(true);
    expect(engineSliceApplies('world', [])).toBe(true);
  });
});

describe('enginePass.inputs', () => {
  const context = (ledger: Ledger.Entry[], focus: string | null, previous: EngineOptions | null = null) =>
    ({ projectId: 7n, project: { id: 7n }, ledger, db: {}, previous, focus }) as never;

  it('should tell the model how many leads this novel has, so the count only changes when the author asks', async () => {
    const two = round(output({ protagonist: { leads: [output().protagonist!.leads[0]!, { ...output().protagonist!.leads[0]!, name: 'Wren' }] } }));
    const sections = await enginePass.inputs!(context(promise(['mystery']), 'protagonist', two));

    expect(sections.find(section => section.key === 'engine_scope')?.content).toContain('This novel has two leads today');
  });

  it('should ask only for the focused screen’s part and show what it must fit', async () => {
    const previous = round(output());
    const sections = await enginePass.inputs!(context(promise(['progression']), 'world', previous));
    const scope = sections.find(section => section.key === 'engine_scope');
    const kept = sections.find(section => section.key === 'engine_so_far');

    expect(scope?.content).toContain('Produce only the world part');
    expect(scope?.required).toBe(true);
    expect(kept?.content).toContain('Arden');
    expect(kept?.content).not.toContain('A coast that pays for its light');
  });

  it('should name every applicable part on a whole-pass round and say what the promise ruled out', async () => {
    const sections = await enginePass.inputs!(context(promise(['slice_of_life']), null));
    const scope = sections.find(section => section.key === 'engine_scope')?.content ?? '';

    expect(scope).toContain('protagonist, world');
    expect(scope).not.toContain('opposition,');
    expect(scope).toContain('there is no ladder');
    expect(sections.some(section => section.key === 'engine_so_far')).toBe(false);
  });

  it('should ask for the ladder on its own when progression drives the novel', async () => {
    const sections = await enginePass.inputs!(context(promise(['progression']), null));
    const scope = sections.find(section => section.key === 'engine_scope')?.content ?? '';

    expect(scope).toContain('protagonist, opposition, world, power');
    expect(scope).toContain('the ladder is asked for on its own');
    expect(scope).toContain('This novel has one lead today');
  });
});
