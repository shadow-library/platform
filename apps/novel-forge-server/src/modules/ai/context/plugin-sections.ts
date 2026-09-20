import { type ForgeCallPolicy } from '../../plugins/plugin-policy.service';
import { type WriterClass } from '../../plugins/plugin.types';
import { type ContextSection, CORE_SECTION_KEYS, renderPluginSection } from './sections';
import { countTokens } from './token-budget';

const CLASS_RANK: Record<WriterClass, number> = { standard: 0, permissive: 1 };

/**
 * The `minWriterClass` guard. It is the one point at which a contribution becomes a
 * `ContextSection`, and a `ContextSection` carries no writer class — so nothing downstream of this function can
 * re-derive what to filter, and there is no ordering in which assembly precedes the guard.
 */
export function pluginContextSections(policy: ForgeCallPolicy | undefined, assembled: ContextSection[]): ContextSection[] {
  if (!policy?.contextSections.length) return [];

  const taken = new Set<string>([...CORE_SECTION_KEYS, ...assembled.map(section => section.key)]);
  const sections: ContextSection[] = [];
  for (const contribution of policy.contextSections) {
    if ((CLASS_RANK[contribution.minWriterClass] ?? 1) > (CLASS_RANK[policy.writerClass] ?? 0)) continue;
    if (taken.has(contribution.key)) continue;
    taken.add(contribution.key);
    const rendered = renderPluginSection(contribution.title, contribution.rendered);
    sections.push({
      key: contribution.key,
      tier: 'working',
      segment: contribution.segment,
      tokens: countTokens(rendered),
      truncated: false,
      sourceRefs: [],
      rendered,
      ...(contribution.required ? { required: true } : {}),
    });
  }
  return sections;
}
