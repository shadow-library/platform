/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { type PlanBundle, type PlanBundleArc } from './plan-import.dto';

/**
 * Defining types
 */

export interface BundleIssue {
  field: string;
  msg: string;
}

export interface VolumeRange {
  start: number;
  end: number;
}

export interface BundleValidation {
  issues: BundleIssue[];
  warnings: string[];
  /** Chapter ranges computed as cumulative targetChapterCount sums in ordinal order — the approveVolumePlan math. */
  volumeRanges: Map<string, VolumeRange>;
  /** volumeKeys that carry arcs, for the approval pass. */
  arcVolumeKeys: string[];
}

/**
 * Declaring the constants
 */

function findDuplicates(keys: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) (seen.has(key) ? duplicates : seen).add(key);
  return [...duplicates];
}

/**
 * Cross-item invariants the DTO layer cannot express: unique natural keys, contiguous volume
 * ordinals, exact arc coverage, briefs inside their covering volume/arc, knowledge contracts that
 * reveal real facts. Issues abort the import; warnings (dangling entity refs,
 * pre-generation-impossible ref prefixes) are returned but never block.
 */
export function validatePlanBundle(bundle: PlanBundle, existingEntityKeys: ReadonlySet<string>, existingFactKeys: ReadonlySet<string> = new Set()): BundleValidation {
  const issues: BundleIssue[] = [];
  const warnings: string[] = [];
  const volumes = bundle.volumes ?? [];
  const arcs = bundle.arcs ?? [];
  const briefs = bundle.briefs ?? [];
  const facts = bundle.facts ?? [];

  for (const slug of findDuplicates((bundle.bible ?? []).map(d => `${d.section}/${d.slug}`))) issues.push({ field: 'bible', msg: `duplicate document '${slug}'` });
  for (const key of findDuplicates((bundle.entities ?? []).map(e => e.entityKey))) issues.push({ field: 'entities', msg: `duplicate entityKey '${key}'` });
  for (const key of findDuplicates(facts.map(f => f.factKey))) issues.push({ field: 'facts', msg: `duplicate factKey '${key}'` });
  for (const key of findDuplicates(volumes.map(v => v.volumeKey))) issues.push({ field: 'volumes', msg: `duplicate volumeKey '${key}'` });
  for (const key of findDuplicates(arcs.map(a => a.arcKey))) issues.push({ field: 'arcs', msg: `duplicate arcKey '${key}'` });
  for (const key of findDuplicates(briefs.map(b => String(b.chapter)))) issues.push({ field: 'briefs', msg: `duplicate chapter ${key}` });
  for (const key of findDuplicates(volumes.map(v => String(v.ordinal)))) issues.push({ field: 'volumes', msg: `duplicate ordinal ${key}` });

  // Volume ranges: cumulative targetChapterCount sums in ordinal order, exactly like approveVolumePlan,
  // so a bundle that validates here always lays out and approves cleanly.
  const volumeRanges = new Map<string, VolumeRange>();
  let nextStart = 1;
  for (const volume of [...volumes].sort((a, b) => a.ordinal - b.ordinal)) {
    volumeRanges.set(volume.volumeKey, { start: nextStart, end: nextStart + volume.targetChapterCount - 1 });
    nextStart += volume.targetChapterCount;
  }

  // Arcs: known volume, then per volume (ordinal order) contiguous, non-overlapping, exact coverage.
  const arcsByVolume = new Map<string, PlanBundleArc[]>();
  for (const [index, arc] of arcs.entries()) {
    if (!volumeRanges.has(arc.volumeKey)) {
      issues.push({ field: `arcs[${index}].volumeKey`, msg: `arc '${arc.arcKey}' references unknown volume '${arc.volumeKey}' — arcs must ship with their volume` });
      continue;
    }
    const list = arcsByVolume.get(arc.volumeKey) ?? [];
    list.push(arc);
    arcsByVolume.set(arc.volumeKey, list);
  }
  for (const [volumeKey, volumeArcs] of arcsByVolume) {
    const range = volumeRanges.get(volumeKey) as VolumeRange;
    const ordered = [...volumeArcs].sort((a, b) => a.ordinal - b.ordinal);
    let expectedStart = range.start;
    let broken = false;
    for (const arc of ordered) {
      if (arc.chapterStart !== expectedStart) {
        issues.push({ field: 'arcs', msg: `arc '${arc.arcKey}' starts at chapter ${arc.chapterStart}, expected ${expectedStart} — arcs must exactly cover volume '${volumeKey}'` });
        broken = true;
        break;
      }
      if (arc.chapterEnd < arc.chapterStart) {
        issues.push({ field: 'arcs', msg: `arc '${arc.arcKey}' has chapterEnd before chapterStart` });
        broken = true;
        break;
      }
      expectedStart = arc.chapterEnd + 1;
    }
    if (!broken && expectedStart !== range.end + 1) issues.push({ field: 'arcs', msg: `arcs of volume '${volumeKey}' end at chapter ${expectedStart - 1}, expected ${range.end}` });
  }

  // Briefs: inside a covering volume; arcKey required iff the covering volume has arcs, and must match.
  const arcByKey = new Map(arcs.map(a => [a.arcKey, a]));
  for (const [index, brief] of briefs.entries()) {
    const covering = [...volumeRanges.entries()].find(([, r]) => brief.chapter >= r.start && brief.chapter <= r.end);
    if (!covering) {
      issues.push({ field: `briefs[${index}].chapter`, msg: `no bundle volume covers chapter ${brief.chapter} — briefs must ship with their volumes` });
      continue;
    }
    const [volumeKey] = covering;
    if (brief.volumeKey !== volumeKey) {
      issues.push({ field: `briefs[${index}].volumeKey`, msg: `chapter ${brief.chapter} lies in volume '${volumeKey}' but the brief claims '${brief.volumeKey}'` });
      continue;
    }
    const coveringArc = (arcsByVolume.get(volumeKey) ?? []).find(a => brief.chapter >= a.chapterStart && brief.chapter <= a.chapterEnd);
    if (coveringArc && brief.arcKey !== coveringArc.arcKey) {
      issues.push({ field: `briefs[${index}].arcKey`, msg: `chapter ${brief.chapter} lies in arc '${coveringArc.arcKey}' but the brief claims '${brief.arcKey ?? 'none'}'` });
    }
    if (!coveringArc && brief.arcKey) {
      const reason = arcByKey.has(brief.arcKey) ? `arc '${brief.arcKey}' does not cover chapter ${brief.chapter}` : `unknown arc '${brief.arcKey}'`;
      issues.push({ field: `briefs[${index}].arcKey`, msg: reason });
    }
  }

  // Knowledge contracts (character-knowledge design §3): a reveal against a fact that exists nowhere
  // can never be ledgered — that is an issue; unknown entity keys stay warnings like cast refs, since
  // the approve-time skip is logged and recoverable via the manual reveal endpoint.
  const knownEntities = new Set([...existingEntityKeys, ...(bundle.entities ?? []).map(e => e.entityKey)]);
  const knownFacts = new Set([...existingFactKeys, ...facts.map(f => f.factKey)]);
  const revealedFactKeys = new Set<string>();
  for (const [index, brief] of briefs.entries()) {
    const contract = brief.knowledgeContract;
    if (!contract) continue;
    for (const key of contract.pov) if (!knownEntities.has(key)) warnings.push(`brief ${brief.chapter} knowledgeContract.pov names unknown entity '${key}'`);
    for (const reveal of contract.learns ?? []) {
      revealedFactKeys.add(reveal.factKey);
      if (!knownFacts.has(reveal.factKey)) {
        issues.push({
          field: `briefs[${index}].knowledgeContract`,
          msg: `chapter ${brief.chapter} reveals unknown fact '${reveal.factKey}' — reveals must name a bundle or project fact`,
        });
      }
      if (!knownEntities.has(reveal.entityKey)) warnings.push(`brief ${brief.chapter} knowledgeContract reveals to unknown entity '${reveal.entityKey}'`);
    }
  }
  for (const fact of facts) {
    for (const key of fact.subjects ?? []) if (!knownEntities.has(key)) warnings.push(`fact '${fact.factKey}' subjects unknown entity '${key}'`);
    if (!revealedFactKeys.has(fact.factKey))
      warnings.push(`fact '${fact.factKey}' is never revealed by any brief in this bundle — it stays hidden until a later plan or a manual reveal`);
  }

  // Warnings: dangling entity references and ref prefixes that cannot resolve before generation.
  const warnCast = (owner: string, cast?: string[]): void => {
    for (const key of cast ?? []) if (!knownEntities.has(key)) warnings.push(`${owner} casts unknown entity '${key}'`);
  };
  for (const volume of volumes) warnCast(`volume '${volume.volumeKey}'`, volume.cast);
  for (const arc of arcs) warnCast(`arc '${arc.arcKey}'`, arc.cast);
  for (const brief of briefs) {
    for (const ref of brief.requiredContext ?? []) {
      const [prefix, value] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
      if (ref.indexOf(':') === -1 || (prefix !== 'entity' && prefix !== 'volume')) {
        warnings.push(`brief ${brief.chapter} requiredContext '${ref}' — only entity:/volume: refs resolve before generation`);
      } else if (prefix === 'entity' && !knownEntities.has(value)) {
        warnings.push(`brief ${brief.chapter} requiredContext references unknown entity '${value}'`);
      } else if (prefix === 'volume' && !volumeRanges.has(value)) {
        warnings.push(`brief ${brief.chapter} requiredContext references unknown volume '${value}'`);
      }
    }
  }

  return { issues, warnings, volumeRanges, arcVolumeKeys: [...arcsByVolume.keys()] };
}
