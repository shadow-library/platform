import { and, eq, inArray, lte } from 'drizzle-orm';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type WriterDisclosurePolicy, type WriterField } from '../../bible/fact/writer-disclosure-policy';
import { loadIsolationBridges } from '../../finalize-review/isolation-bridge';
import { renderEventsAsOf } from './art-context';
import { finalizePack } from './pack-finalize';
import { type PackPolicyOptions } from './pack-options';
import { asStable, datedSubjectCard, makeSection, presentSubjectCard, renderPremise, walledOff } from './pack-render';
import { type AssembledPack, type ContextSection } from './sections';

// An image prompt is a paragraph: the composer needs the subject, the look, and nothing else.
export const ILLUSTRATION_BUDGET = 6_000;
export const ILLUSTRATION_WORLD_FACTS_MAX = 30;

// The project's art direction lives in one conventional bible document; every illustration prompt is
// bound by it when it exists. Authors create it like any other bible doc — no bespoke table.
export const ART_STYLE_DOC = { section: 'project', slug: 'art-style' } as const;

export interface IllustrationPackOptions extends PackPolicyOptions {
  /** The art disclosure policy of the chapter the image is drawn as of: an entity's depicted chapter, a chapter subject's own, or the latest final one for a cover. */
  depiction?: WriterDisclosurePolicy;
}

export class IllustrationPackBuilder {
  constructor(private readonly db: PrimaryDatabase) {}

  /**
   * Pack for composing one image prompt. The art-style bible and the project premise are stable (they
   * bind every illustration in the project); the subject card and the canon that describes how the
   * subject looks are volatile. `subjectKey` is the entity key, the chapter number as text, or null
   * for the project cover. Reader-facing art reads only what the reader has by its chapter (P4-51): with `depiction`, every section passes
   * that policy's scrub, the art style and premise as copied pages, and an entity's changes stop at the chapter with its present-day status left out.
   */
  async forIllustration(
    projectId: bigint,
    subjectType: schema.Illustration.SubjectType,
    subjectKey: string | null,
    opts?: IllustrationPackOptions,
  ): Promise<AssembledPack & { id: bigint | null }> {
    const disclosure = opts?.depiction;
    const scrub = (text: string, field: WriterField): string => (disclosure ? disclosure.scrub(text, field) : text);
    const [project, artStyle] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.bibleDocuments.findFirst({
        where: and(eq(schema.bibleDocuments.projectId, projectId), eq(schema.bibleDocuments.section, ART_STYLE_DOC.section), eq(schema.bibleDocuments.slug, ART_STYLE_DOC.slug)),
      }),
    ]);

    const sections: ContextSection[] = [];
    if (artStyle?.body) sections.push(asStable(makeSection('art_style', scrub(artStyle.body, 'bible_page'), 'canonical', [`doc:${ART_STYLE_DOC.section}/${ART_STYLE_DOC.slug}`])));
    if (project) {
      const premise = [project.title ? `Title: ${project.title}` : '', renderPremise(project)].filter(Boolean).join('\n\n');
      sections.push(asStable(makeSection('premise', scrub(premise, 'reference'), 'canonical', ['premise'])));
    }

    if (subjectType === 'entity' && subjectKey) sections.push(...(await this.entitySubjectSections(projectId, subjectKey, disclosure)));
    if (subjectType === 'chapter' && subjectKey) sections.push(...(await this.chapterSubjectSections(projectId, Number(subjectKey), disclosure)));

    const chapter = subjectType === 'chapter' && subjectKey ? Number(subjectKey) : subjectType === 'entity' ? (disclosure?.chapter ?? null) : null;
    return finalizePack(this.db, projectId, 'illustration', chapter, sections, [], ILLUSTRATION_BUDGET, { policy: opts?.policy, disclosure });
  }

  private async entitySubjectSections(projectId: bigint, entityKey: string, disclosure?: WriterDisclosurePolicy): Promise<ContextSection[]> {
    const entity = await this.db.query.entities.findFirst({
      where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)),
      with: { aliases: true },
    });
    if (!entity) return [];

    const scrub = (text: string, field: WriterField): string => (disclosure ? disclosure.scrub(text, field) : text);
    const heading = `${entity.name} (${entity.type}${entity.significance ? `, ${entity.significance}` : ''})`;
    const aliases = entity.aliases.length > 0 ? `Also known as: ${entity.aliases.map(a => a.alias).join(', ')}` : '';
    const card = (disclosure ? datedSubjectCard(entity, heading, aliases, disclosure.chapter) : presentSubjectCard(entity, heading, aliases)).filter(Boolean).join('\n');

    const sections = [makeSection('subject_card', scrub(card, 'entity'), 'canonical', [`entity:${entityKey}`])];

    if (disclosure) {
      const events = await this.db.query.characterEvents.findMany({
        where: and(
          eq(schema.characterEvents.projectId, projectId),
          eq(schema.characterEvents.entityId, entity.id),
          eq(schema.characterEvents.status, 'committed'),
          lte(schema.characterEvents.chapter, disclosure.chapter),
        ),
        orderBy: [schema.characterEvents.chapter, schema.characterEvents.createdAt],
      });
      const changes = renderEventsAsOf(events, disclosure.chapter, disclosure);
      if (changes) sections.push(makeSection('subject_changes', changes, 'canonical', [`entity:${entityKey}`]));
    }

    const facts = await this.db.query.worldFacts.findMany({
      where: eq(schema.worldFacts.projectId, projectId),
      orderBy: [schema.worldFacts.category, schema.worldFacts.key],
      limit: ILLUSTRATION_WORLD_FACTS_MAX,
    });
    if (facts.length > 0) sections.push(makeSection('world_facts', scrub(facts.map(f => `${f.category}/${f.key}: ${f.value}`).join('\n'), 'reference'), 'canonical', []));

    return sections;
  }

  private async chapterSubjectSections(projectId: bigint, chapter: number, disclosure?: WriterDisclosurePolicy): Promise<ContextSection[]> {
    const scrub = (text: string, field: WriterField): string => (disclosure ? disclosure.scrub(text, field) : text);
    const [chapterRow, appearances] = await Promise.all([
      this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter)) }),
      this.db.query.entityAppearances.findMany({ where: and(eq(schema.entityAppearances.projectId, projectId), eq(schema.entityAppearances.chapter, chapter)) }),
    ]);
    if (!chapterRow) return [];
    const subject = walledOff(chapterRow, (await loadIsolationBridges(this.db, projectId, [{ chapter, isolated: chapterRow.isolated }])).get(chapter));

    const sections = [
      makeSection('subject_card', scrub([`Chapter ${chapter}: ${subject.title ?? ''}`, subject.summary ?? ''].filter(Boolean).join('\n\n'), 'reference'), 'canonical', [
        `chapter:${chapter}`,
      ]),
    ];

    const entityIds = appearances.map(a => a.entityId);
    if (entityIds.length === 0) return sections;

    const cast = await this.db.query.entities.findMany({ where: inArray(schema.entities.id, entityIds), orderBy: [schema.entities.name] });
    const rendered = cast.map(e => `${e.name} (${e.type}): ${e.appearance ?? 'no canonical appearance recorded'}`).join('\n');
    sections.push(
      makeSection(
        'cast_appearance',
        scrub(rendered, 'entity'),
        'canonical',
        cast.map(e => `entity:${e.entityKey}`),
      ),
    );

    return sections;
  }
}
